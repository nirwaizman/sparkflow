# Supabase production — backups & restore

SparkFlow relies on two overlapping backup strategies:

1. **Managed backups** (Supabase Pro / Team) — automatic daily snapshots with
   point-in-time recovery (PITR). This is the primary recovery mechanism.
2. **Self-managed `pg_dump`** — scheduled nightly to an off-platform S3
   bucket. This is the disaster-recovery fallback in case Supabase itself is
   unavailable.

## 1. Managed backups (primary)

### Configuration

Dashboard → Project → **Database** → **Backups**:

| Setting                  | Value        | Notes                                       |
| ------------------------ | ------------ | ------------------------------------------- |
| Daily backups            | Enabled      | Included on Pro and above.                  |
| Point-in-time recovery   | Enabled      | 7 days on Pro, 28 days on Team.             |
| Retention                | 7 days (Pro) | Upgrade to Team for 28-day PITR.            |
| Backup region            | Tokyo        | Matches project region (no egress).         |

PITR is the recommended recovery path for *any* accidental write — it can roll
the DB back to a specific second within the retention window.

### Restoring from a managed backup

1. Dashboard → **Database → Backups → Restore**.
2. Pick either a daily snapshot or enter a PITR timestamp (UTC).
3. Supabase restores into the **same project** in-place. The app will be
   unavailable for 5–30 min depending on DB size.
4. Immediately after restore, bump `SUPABASE_JWT_SECRET` in Supabase and rotate
   the service role key (see `secrets.md`) — JWTs issued before the restore
   window may reference rows that no longer exist.

## 2. Nightly `pg_dump` to S3 (fallback)

Runs as a GitHub Actions cron workflow
(`.github/workflows/supabase-backup.yml`) at 17:00 UTC (= 02:00 Tokyo) daily.

### Workflow outline

```yaml
# .github/workflows/supabase-backup.yml
name: supabase-backup
on:
  schedule:
    - cron: "0 17 * * *"   # 02:00 Asia/Tokyo
  workflow_dispatch: {}
jobs:
  dump:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4
      - name: Install pg_dump 16
        run: |
          sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt jammy-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
          curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/pgdg.gpg
          sudo apt-get update
          sudo apt-get install -y postgresql-client-16
      - name: Dump
        env:
          PGURI: ${{ secrets.SUPABASE_DB_URL_DIRECT }}
        run: |
          STAMP=$(date -u +%Y%m%dT%H%M%SZ)
          pg_dump --format=custom --no-owner --no-privileges \
                  --file="sparkflow-${STAMP}.dump" "$PGURI"
          echo "DUMP=sparkflow-${STAMP}.dump" >> $GITHUB_ENV
      - name: Upload to S3
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_BACKUP_ROLE_ARN }}
          aws-region: ap-northeast-1
      - run: aws s3 cp "$DUMP" "s3://sparkflow-backups/db/$DUMP"
      - name: Verify dump integrity
        run: pg_restore --list "$DUMP" > /dev/null
```

### S3 bucket policy

- Bucket: `s3://sparkflow-backups/db/` in `ap-northeast-1`.
- Versioning: **On**.
- Lifecycle: transition to Glacier Instant Retrieval at 14 days, delete at 365.
- Object lock: compliance mode, 7-day retention (protects against ransomware).
- Server-side encryption: `aws:kms` with a dedicated CMK
  (`arn:aws:kms:ap-northeast-1:...:key/sparkflow-backups`).

## 3. Restore from `pg_dump` (disaster recovery)

Use this only if the Supabase project is unrecoverable (region outage, account
loss). Target is a **new**, empty Supabase project.

```bash
# 1. Download dump
aws s3 cp s3://sparkflow-backups/db/sparkflow-20260419T170000Z.dump .

# 2. Prepare new project
#    Dashboard → New project → same region (ap-northeast-1).
#    Note the new DB URL (direct, port 5432).
export NEW_DB_URL="postgresql://postgres:...@db.<NEW_REF>.supabase.co:5432/postgres"

# 3. Enable extensions (see migrations.md §1)
psql "$NEW_DB_URL" -c 'create extension if not exists "vector";'
# ... and the rest.

# 4. Restore
pg_restore --no-owner --no-privileges --clean --if-exists \
           --jobs=4 --dbname="$NEW_DB_URL" \
           sparkflow-20260419T170000Z.dump

# 5. Re-apply RLS (pg_dump omits Supabase-managed auth objects)
psql "$NEW_DB_URL" -f infra/supabase-prod/rls.sql

# 6. Re-create pgvector indexes (see migrations.md §4)

# 7. Point the app at the new project: update SUPABASE_* envs on Vercel
#    (see infra/vercel/secrets.sh) and trigger a redeploy.
```

## 4. Restore drill

Run a restore to a throwaway project **quarterly** to prove the dumps are
actually usable. Log the drill in `docs/runbooks/supabase-drill.md` with
timestamp + duration. An untested backup is not a backup.
