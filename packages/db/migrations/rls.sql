-- SparkFlow Row-Level Security policies.
--
-- Apply AFTER `drizzle-kit push` has created the tables.
--
-- Policy model:
--   * Tenant isolation: rows are visible / writable only when the caller's
--     JWT `org_id` claim matches the row's `organization_id`.
--   * `users` is special: a user can see / update only their own row, keyed
--     by `auth.uid()`.
--   * `audit_logs` is read-only to the app; only the service role (which
--     bypasses RLS) may insert. We expose SELECT to org admins/owners via
--     a membership-derived check.
--   * `feature_flags` with a NULL `organization_id` are global and readable
--     by every authenticated user. Org-scoped flag rows follow the normal
--     tenant rule.
--   * `agents` with a NULL `organization_id` are platform built-ins and
--     readable by every authenticated user.
--
-- The script is idempotent: it drops policies before recreating them.

-- =============================================================
-- Helper: extract org_id from the current JWT.
-- =============================================================
-- We rely on Supabase populating `auth.jwt()`. The org_id is expected at
-- the top-level `org_id` claim set by the application at sign-in.

-- =============================================================
-- organizations
-- =============================================================
alter table organizations enable row level security;
drop policy if exists "organizations_tenant_select" on organizations;
create policy "organizations_tenant_select" on organizations
  for select using (id = (auth.jwt() ->> 'org_id')::uuid);
drop policy if exists "organizations_tenant_modify" on organizations;
create policy "organizations_tenant_modify" on organizations
  for all using (id = (auth.jwt() ->> 'org_id')::uuid)
         with check (id = (auth.jwt() ->> 'org_id')::uuid);

-- =============================================================
-- users  — self-row access, not org-scoped.
-- =============================================================
alter table users enable row level security;
drop policy if exists "users_self_select" on users;
create policy "users_self_select" on users
  for select using (id = auth.uid());
drop policy if exists "users_self_update" on users;
create policy "users_self_update" on users
  for update using (id = auth.uid())
         with check (id = auth.uid());

-- =============================================================
-- memberships — row key is (user_id, organization_id).
-- Users see their own memberships; org admins handled at app layer.
-- =============================================================
alter table memberships enable row level security;
drop policy if exists "memberships_self_select" on memberships;
create policy "memberships_self_select" on memberships
  for select using (user_id = auth.uid());
drop policy if exists "memberships_tenant_modify" on memberships;
create policy "memberships_tenant_modify" on memberships
  for all using (organization_id = (auth.jwt() ->> 'org_id')::uuid)
         with check (organization_id = (auth.jwt() ->> 'org_id')::uuid);

-- =============================================================
-- Tenant-scoped tables — identical policy shape.
-- =============================================================
do $$
declare
  t text;
  tenant_tables text[] := array[
    'conversations',
    'messages',        -- special-cased below via conversation join? No: messages has no org_id directly.
    'tasks',
    'task_steps',      -- special-cased below.
    'files',
    'file_chunks',     -- special-cased below.
    'workflows',
    'workflow_runs',   -- special-cased below.
    'subscriptions',
    'usage_records',
    'memories',
    'api_keys',
    'shared_links'
  ];
begin
  -- No-op: we enumerate explicitly below so the SQL is introspectable and
  -- CI diff-friendly. The array above is documentation only.
  raise notice 'Applying tenant RLS to % tables', array_length(tenant_tables, 1);
end $$;

-- conversations
alter table conversations enable row level security;
drop policy if exists "conversations_tenant_select" on conversations;
create policy "conversations_tenant_select" on conversations
  for select using (organization_id = (auth.jwt() ->> 'org_id')::uuid);
drop policy if exists "conversations_tenant_modify" on conversations;
create policy "conversations_tenant_modify" on conversations
  for all using (organization_id = (auth.jwt() ->> 'org_id')::uuid)
         with check (organization_id = (auth.jwt() ->> 'org_id')::uuid);

-- messages — inherits tenancy via conversation_id.
alter table messages enable row level security;
drop policy if exists "messages_tenant_select" on messages;
create policy "messages_tenant_select" on messages
  for select using (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id
        and c.organization_id = (auth.jwt() ->> 'org_id')::uuid
    )
  );
drop policy if exists "messages_tenant_modify" on messages;
create policy "messages_tenant_modify" on messages
  for all using (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id
        and c.organization_id = (auth.jwt() ->> 'org_id')::uuid
    )
  )
  with check (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id
        and c.organization_id = (auth.jwt() ->> 'org_id')::uuid
    )
  );

-- tasks
alter table tasks enable row level security;
drop policy if exists "tasks_tenant_select" on tasks;
create policy "tasks_tenant_select" on tasks
  for select using (organization_id = (auth.jwt() ->> 'org_id')::uuid);
drop policy if exists "tasks_tenant_modify" on tasks;
create policy "tasks_tenant_modify" on tasks
  for all using (organization_id = (auth.jwt() ->> 'org_id')::uuid)
         with check (organization_id = (auth.jwt() ->> 'org_id')::uuid);

-- task_steps — inherits via task_id.
alter table task_steps enable row level security;
drop policy if exists "task_steps_tenant_select" on task_steps;
create policy "task_steps_tenant_select" on task_steps
  for select using (
    exists (
      select 1 from tasks t
      where t.id = task_steps.task_id
        and t.organization_id = (auth.jwt() ->> 'org_id')::uuid
    )
  );
drop policy if exists "task_steps_tenant_modify" on task_steps;
create policy "task_steps_tenant_modify" on task_steps
  for all using (
    exists (
      select 1 from tasks t
      where t.id = task_steps.task_id
        and t.organization_id = (auth.jwt() ->> 'org_id')::uuid
    )
  )
  with check (
    exists (
      select 1 from tasks t
      where t.id = task_steps.task_id
        and t.organization_id = (auth.jwt() ->> 'org_id')::uuid
    )
  );

-- files
alter table files enable row level security;
drop policy if exists "files_tenant_select" on files;
create policy "files_tenant_select" on files
  for select using (organization_id = (auth.jwt() ->> 'org_id')::uuid);
drop policy if exists "files_tenant_modify" on files;
create policy "files_tenant_modify" on files
  for all using (organization_id = (auth.jwt() ->> 'org_id')::uuid)
         with check (organization_id = (auth.jwt() ->> 'org_id')::uuid);

-- file_chunks — inherits via file_id.
alter table file_chunks enable row level security;
drop policy if exists "file_chunks_tenant_select" on file_chunks;
create policy "file_chunks_tenant_select" on file_chunks
  for select using (
    exists (
      select 1 from files f
      where f.id = file_chunks.file_id
        and f.organization_id = (auth.jwt() ->> 'org_id')::uuid
    )
  );
drop policy if exists "file_chunks_tenant_modify" on file_chunks;
create policy "file_chunks_tenant_modify" on file_chunks
  for all using (
    exists (
      select 1 from files f
      where f.id = file_chunks.file_id
        and f.organization_id = (auth.jwt() ->> 'org_id')::uuid
    )
  )
  with check (
    exists (
      select 1 from files f
      where f.id = file_chunks.file_id
        and f.organization_id = (auth.jwt() ->> 'org_id')::uuid
    )
  );

-- agents — built-ins (organization_id IS NULL) are globally readable.
alter table agents enable row level security;
drop policy if exists "agents_select" on agents;
create policy "agents_select" on agents
  for select using (
    organization_id is null
    or organization_id = (auth.jwt() ->> 'org_id')::uuid
  );
drop policy if exists "agents_tenant_modify" on agents;
create policy "agents_tenant_modify" on agents
  for all using (organization_id = (auth.jwt() ->> 'org_id')::uuid)
         with check (organization_id = (auth.jwt() ->> 'org_id')::uuid);

-- workflows
alter table workflows enable row level security;
drop policy if exists "workflows_tenant_select" on workflows;
create policy "workflows_tenant_select" on workflows
  for select using (organization_id = (auth.jwt() ->> 'org_id')::uuid);
drop policy if exists "workflows_tenant_modify" on workflows;
create policy "workflows_tenant_modify" on workflows
  for all using (organization_id = (auth.jwt() ->> 'org_id')::uuid)
         with check (organization_id = (auth.jwt() ->> 'org_id')::uuid);

-- workflow_runs — inherits via workflow_id.
alter table workflow_runs enable row level security;
drop policy if exists "workflow_runs_tenant_select" on workflow_runs;
create policy "workflow_runs_tenant_select" on workflow_runs
  for select using (
    exists (
      select 1 from workflows w
      where w.id = workflow_runs.workflow_id
        and w.organization_id = (auth.jwt() ->> 'org_id')::uuid
    )
  );
drop policy if exists "workflow_runs_tenant_modify" on workflow_runs;
create policy "workflow_runs_tenant_modify" on workflow_runs
  for all using (
    exists (
      select 1 from workflows w
      where w.id = workflow_runs.workflow_id
        and w.organization_id = (auth.jwt() ->> 'org_id')::uuid
    )
  )
  with check (
    exists (
      select 1 from workflows w
      where w.id = workflow_runs.workflow_id
        and w.organization_id = (auth.jwt() ->> 'org_id')::uuid
    )
  );

-- subscriptions
alter table subscriptions enable row level security;
drop policy if exists "subscriptions_tenant_select" on subscriptions;
create policy "subscriptions_tenant_select" on subscriptions
  for select using (organization_id = (auth.jwt() ->> 'org_id')::uuid);
drop policy if exists "subscriptions_tenant_modify" on subscriptions;
create policy "subscriptions_tenant_modify" on subscriptions
  for all using (organization_id = (auth.jwt() ->> 'org_id')::uuid)
         with check (organization_id = (auth.jwt() ->> 'org_id')::uuid);

-- usage_records
alter table usage_records enable row level security;
drop policy if exists "usage_records_tenant_select" on usage_records;
create policy "usage_records_tenant_select" on usage_records
  for select using (organization_id = (auth.jwt() ->> 'org_id')::uuid);
drop policy if exists "usage_records_tenant_modify" on usage_records;
create policy "usage_records_tenant_modify" on usage_records
  for all using (organization_id = (auth.jwt() ->> 'org_id')::uuid)
         with check (organization_id = (auth.jwt() ->> 'org_id')::uuid);

-- memories
alter table memories enable row level security;
drop policy if exists "memories_tenant_select" on memories;
create policy "memories_tenant_select" on memories
  for select using (organization_id = (auth.jwt() ->> 'org_id')::uuid);
drop policy if exists "memories_tenant_modify" on memories;
create policy "memories_tenant_modify" on memories
  for all using (organization_id = (auth.jwt() ->> 'org_id')::uuid)
         with check (organization_id = (auth.jwt() ->> 'org_id')::uuid);

-- api_keys
alter table api_keys enable row level security;
drop policy if exists "api_keys_tenant_select" on api_keys;
create policy "api_keys_tenant_select" on api_keys
  for select using (organization_id = (auth.jwt() ->> 'org_id')::uuid);
drop policy if exists "api_keys_tenant_modify" on api_keys;
create policy "api_keys_tenant_modify" on api_keys
  for all using (organization_id = (auth.jwt() ->> 'org_id')::uuid)
         with check (organization_id = (auth.jwt() ->> 'org_id')::uuid);

-- audit_logs — read-only to admins/owners of the org. Writes must go
-- through the service role (which bypasses RLS).
alter table audit_logs enable row level security;
drop policy if exists "audit_logs_admin_select" on audit_logs;
create policy "audit_logs_admin_select" on audit_logs
  for select using (
    organization_id = (auth.jwt() ->> 'org_id')::uuid
    and exists (
      select 1 from memberships m
      where m.user_id = auth.uid()
        and m.organization_id = audit_logs.organization_id
        and m.role in ('owner', 'admin')
    )
  );
-- Deliberately no INSERT/UPDATE/DELETE policy — only service role can write.

-- feature_flags — global rows (organization_id is null) are readable by
-- everyone; org rows follow tenant rule.
alter table feature_flags enable row level security;
drop policy if exists "feature_flags_select" on feature_flags;
create policy "feature_flags_select" on feature_flags
  for select using (
    organization_id is null
    or organization_id = (auth.jwt() ->> 'org_id')::uuid
  );
drop policy if exists "feature_flags_tenant_modify" on feature_flags;
create policy "feature_flags_tenant_modify" on feature_flags
  for all using (organization_id = (auth.jwt() ->> 'org_id')::uuid)
         with check (organization_id = (auth.jwt() ->> 'org_id')::uuid);

-- shared_links
alter table shared_links enable row level security;
drop policy if exists "shared_links_tenant_select" on shared_links;
create policy "shared_links_tenant_select" on shared_links
  for select using (organization_id = (auth.jwt() ->> 'org_id')::uuid);
drop policy if exists "shared_links_tenant_modify" on shared_links;
create policy "shared_links_tenant_modify" on shared_links
  for all using (organization_id = (auth.jwt() ->> 'org_id')::uuid)
         with check (organization_id = (auth.jwt() ->> 'org_id')::uuid);
