/**
 * /billing — plan overview + current usage.
 *
 * Server Component. Reads:
 *   - session
 *   - current tier (entitlements.resolveTier)
 *   - current-month cost (billing.getCurrentMonthCost)
 *   - message count for the day
 *   - per-feature breakdown
 *
 * UI has two actions, both implemented as small client-component forms
 * that POST to the API routes and follow the returned URL.
 */
import { redirect } from "next/navigation";
import { getSession } from "@sparkflow/auth";
import type { Tier } from "@sparkflow/billing";
import {
  TIERS,
  getCurrentMonthCost,
  getFeatureCount,
  getUsageForPeriod,
} from "@sparkflow/billing";
import { resolveTier, ENTITLEMENTS } from "@sparkflow/entitlements";
import { CheckoutButton, PortalButton } from "./actions";

export const dynamic = "force-dynamic";

function monthBounds(now: Date): { from: Date; to: Date } {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { from, to };
}

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function fmtLimit(v: unknown): string {
  if (typeof v === "boolean") return v ? "included" : "not included";
  if (typeof v === "number") return Number.isFinite(v) ? v.toLocaleString() : "unlimited";
  return String(v);
}

export default async function BillingPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const tier: Tier = await resolveTier(session.organizationId);
  const spec = TIERS[tier];
  const limits = ENTITLEMENTS[tier];

  const now = new Date();
  const { from, to } = monthBounds(now);

  const [monthCost, messagesToday, byFeature] = await Promise.all([
    getCurrentMonthCost(session.organizationId, now),
    getFeatureCount(session.organizationId, "chat.message", 24 * 60 * 60 * 1000, now),
    getUsageForPeriod({
      organizationId: session.organizationId,
      from,
      to,
      groupBy: "feature",
    }),
  ]);

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Billing</h1>
          <p className="text-sm text-muted-foreground">
            Manage your workspace plan, payment method, and invoices.
          </p>
        </div>
      </header>

      <section className="rounded-lg border bg-card p-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Current plan
            </div>
            <div className="mt-1 text-xl font-semibold">{spec.displayName}</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {tier === "free"
                ? "No card on file."
                : `${fmtUsd(spec.monthlyPriceUsd)} / month`}
            </div>
            <ul className="mt-4 space-y-1 text-sm">
              {spec.features.map((f: string) => (
                <li key={f}>• {f}</li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-2">
            {tier === "free" ? (
              <>
                <CheckoutButton tier="pro" interval="month" label="Upgrade to Pro" />
                <CheckoutButton tier="team" interval="month" label="Upgrade to Team" />
              </>
            ) : (
              <PortalButton label="Manage billing" />
            )}
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold">Usage this month</h2>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Cost</dt>
            <dd className="mt-1 text-lg font-medium">
              {fmtUsd(monthCost)}
              <span className="ml-1 text-xs text-muted-foreground">
                / {fmtLimit(limits.monthlyCostCapUsd)}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Messages today</dt>
            <dd className="mt-1 text-lg font-medium">
              {messagesToday.toLocaleString()}
              <span className="ml-1 text-xs text-muted-foreground">
                / {fmtLimit(limits.messagesPerDay)}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Agents</dt>
            <dd className="mt-1 text-lg font-medium">{fmtLimit(limits.agentsActive)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Workflows</dt>
            <dd className="mt-1 text-lg font-medium">
              {fmtLimit(limits.workflowsActive)}
            </dd>
          </div>
        </dl>

        <h3 className="mt-8 text-sm font-semibold">By feature</h3>
        <div className="mt-2 overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Feature</th>
                <th className="px-3 py-2 font-medium">Calls</th>
                <th className="px-3 py-2 font-medium">Input tokens</th>
                <th className="px-3 py-2 font-medium">Output tokens</th>
                <th className="px-3 py-2 font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {byFeature.length === 0 ? (
                <tr>
                  <td
                    className="px-3 py-4 text-center text-muted-foreground"
                    colSpan={5}
                  >
                    No usage recorded yet this month.
                  </td>
                </tr>
              ) : (
                byFeature.map((row) => (
                  <tr key={row.key} className="border-t">
                    <td className="px-3 py-2">{row.key}</td>
                    <td className="px-3 py-2">{row.count.toLocaleString()}</td>
                    <td className="px-3 py-2">{row.inputTokens.toLocaleString()}</td>
                    <td className="px-3 py-2">{row.outputTokens.toLocaleString()}</td>
                    <td className="px-3 py-2">{fmtUsd(row.costUsd)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
