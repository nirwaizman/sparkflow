"use client";

/**
 * First-login welcome.
 *
 * Three-step flow (all on one route; the step is local state so refresh
 * doesn't drop the user back to step one mid-entry):
 *
 *   1. Name  — confirm the display name we got from the identity
 *      provider, or enter one if we didn't get any.
 *   2. Role  — picks a "hat" so we can bias sample prompts.
 *   3. Sample prompts — three role-specific quick-starts that deep-link
 *      into /chat/new.
 *
 * On submit we store the seed preferences under `sf.welcome.v1` and
 * flip `sf.welcome.done` so the layout (or middleware, later) can
 * redirect future visits back to `/`.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@sparkflow/ui";

const LS_DONE_KEY = "sf.welcome.done";
const LS_PREF_KEY = "sf.welcome.v1";
const LS_START_TOUR = "sf.onboarding.start";

type Role =
  | "founder"
  | "engineer"
  | "marketer"
  | "analyst"
  | "ops"
  | "other";

type Step = "name" | "role" | "prompts";

const ROLE_OPTIONS: readonly { id: Role; label: string; blurb: string }[] = [
  {
    id: "founder",
    label: "Founder / PM",
    blurb: "Strategy, customer research, roadmap planning.",
  },
  {
    id: "engineer",
    label: "Engineer",
    blurb: "Code review, debugging, scripts, infra docs.",
  },
  {
    id: "marketer",
    label: "Marketer",
    blurb: "Campaigns, copy, positioning, competitive scans.",
  },
  {
    id: "analyst",
    label: "Analyst",
    blurb: "Data pulls, dashboards, narrative reports.",
  },
  {
    id: "ops",
    label: "Operations",
    blurb: "Process automation, vendor research, SOPs.",
  },
  {
    id: "other",
    label: "Something else",
    blurb: "Tell us in chat — we will tune the defaults.",
  },
];

const PROMPTS_BY_ROLE: Record<Role, readonly string[]> = {
  founder: [
    "Draft a one-page strategy memo for launching {product} in {market}.",
    "Research the top 5 competitors to {product} and summarize positioning.",
    "Generate a 30/60/90 day plan for a new head of product.",
  ],
  engineer: [
    "Review this TypeScript file and suggest three high-leverage refactors.",
    "Write a bash script that rotates and compresses logs older than 7 days.",
    "Draft RFC-style notes comparing Postgres vs. SQLite for {workload}.",
  ],
  marketer: [
    "Draft three landing-page headlines for {product} aimed at {ICP}.",
    "Summarize the last 10 posts from {competitor}'s blog into a brief.",
    "Build a 5-email onboarding sequence for {product}.",
  ],
  analyst: [
    "Turn this CSV into a weekly KPI dashboard with commentary.",
    "Analyze churn by cohort from the attached export and flag anomalies.",
    "Summarize the earnings call transcript into a 10-bullet brief.",
  ],
  ops: [
    "Write an SOP for onboarding a new vendor, including required docs.",
    "Research three alternatives to {tool} and compare pricing + security.",
    "Draft a renewal negotiation email for {vendor} citing {leverage}.",
  ],
  other: [
    "Summarize the attached PDF into five bullet points.",
    "Draft a polite reply declining a meeting.",
    "Plan a productive three-hour deep-work block for tomorrow.",
  ],
};

function saveAndFinish(prefs: { name: string; role: Role }): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_PREF_KEY, JSON.stringify(prefs));
    window.localStorage.setItem(LS_DONE_KEY, "1");
    window.localStorage.setItem(LS_START_TOUR, "1");
  } catch {
    // best-effort only
  }
}

export default function WelcomePage(): React.ReactElement {
  const router = useRouter();
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState<string>("");
  const [role, setRole] = useState<Role>("founder");

  const prompts = useMemo(() => PROMPTS_BY_ROLE[role], [role]);

  const goToChat = (prompt: string) => {
    saveAndFinish({ name: name.trim(), role });
    const qs = new URLSearchParams({ q: prompt });
    router.push(`/chat/new?${qs.toString()}`);
  };

  const finishToHome = () => {
    saveAndFinish({ name: name.trim(), role });
    router.push("/");
  };

  return (
    <div className="mx-auto flex min-h-[80dvh] max-w-2xl flex-col justify-center px-6 py-12">
      <div className="mb-8 text-center">
        <div className="text-xs uppercase tracking-wider opacity-60">
          SparkFlow
        </div>
        <h1 className="mt-2 text-3xl font-semibold">Let&rsquo;s get you set up</h1>
        <p className="mt-2 text-sm opacity-70">
          Takes about a minute. You can change everything later from
          Settings.
        </p>
      </div>

      {step === "name" ? (
        <div className="rounded-xl border border-white/10 bg-black/20 p-6">
          <Label htmlFor="welcome-name">What should we call you?</Label>
          <Input
            id="welcome-name"
            className="mt-2"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              onClick={() => setStep("role")}
              disabled={name.trim().length === 0}
            >
              Continue
            </Button>
          </div>
        </div>
      ) : null}

      {step === "role" ? (
        <div className="rounded-xl border border-white/10 bg-black/20 p-6">
          <div className="mb-3 text-sm font-medium">
            Which hat do you wear most of the time?
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ROLE_OPTIONS.map((opt) => {
              const active = role === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setRole(opt.id)}
                  className={[
                    "rounded-lg border p-3 text-left transition",
                    active
                      ? "border-indigo-400 bg-indigo-400/10"
                      : "border-white/10 hover:border-white/20",
                  ].join(" ")}
                >
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="mt-1 text-xs opacity-70">{opt.blurb}</div>
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep("name")}
            >
              Back
            </Button>
            <Button type="button" onClick={() => setStep("prompts")}>
              Continue
            </Button>
          </div>
        </div>
      ) : null}

      {step === "prompts" ? (
        <div className="rounded-xl border border-white/10 bg-black/20 p-6">
          <div className="mb-3 text-sm font-medium">
            Try a sample prompt — or skip to the home screen.
          </div>
          <div className="flex flex-col gap-2">
            {prompts.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => goToChat(p)}
                className="rounded-lg border border-white/10 bg-black/20 p-3 text-left text-sm hover:border-white/20"
              >
                {p}
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep("role")}
            >
              Back
            </Button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={finishToHome}>
                Skip
              </Button>
              <Link href="/chat/new" onClick={() => saveAndFinish({ name: name.trim(), role })}>
                <Button type="button">Open chat</Button>
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
