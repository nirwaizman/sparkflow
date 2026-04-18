import Link from "next/link";
import {
  Bot,
  Compass,
  Sparkles,
  Workflow,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@sparkflow/ui";

const FEATURES = [
  {
    icon: Compass,
    title: "Intelligent routing",
    description:
      "A planner decides whether to chat, search the web, launch deep research, or execute a workflow — every request, every time.",
  },
  {
    icon: Bot,
    title: "Multi-agent team",
    description:
      "Specialist agents collaborate on complex tasks — plan, retrieve, critique, and synthesize without you orchestrating the choreography.",
  },
  {
    icon: Workflow,
    title: "Workflow automation",
    description:
      "Turn any chat into a reusable workflow — scheduled, triggered, and observable end to end.",
  },
];

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[hsl(var(--bg))] text-[hsl(var(--fg))]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.2),transparent_50%),radial-gradient(ellipse_at_bottom,hsl(var(--accent)/0.15),transparent_50%)]"
      />
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
            SF
          </span>
          SparkFlow
        </div>
        <nav className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/chat/new">Start chatting</Link>
          </Button>
        </nav>
      </header>

      <section className="mx-auto max-w-4xl px-6 pb-20 pt-16 text-center">
        <Badge variant="outline" className="mx-auto mb-4 gap-1">
          <Sparkles className="h-3 w-3" /> AI workspace
        </Badge>
        <h1 className="text-balance text-5xl font-semibold leading-tight tracking-tight sm:text-6xl">
          SparkFlow — the AI workspace for{" "}
          <span className="bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--accent))] bg-clip-text text-transparent">
            search, research, agents & automation
          </span>
          .
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-pretty text-base text-[hsl(var(--muted-foreground))] sm:text-lg">
          אחד Chat אחד — מנתב אוטומטית בין שיחה, חיפוש רשת, מחקר עמוק וסוכנים.
          תשובות מגובות במקורות, סטרימינג בזמן אמת, קוד ומרקדאון מלא.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" asChild>
            <Link href="/chat/new">Start chatting</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="#features">See features</Link>
          </Button>
        </div>
      </section>

      <section
        id="features"
        className="mx-auto grid max-w-6xl gap-4 px-6 pb-24 sm:grid-cols-3"
      >
        {FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <Card
              key={f.title}
              className="border-[hsl(var(--border))] bg-[hsl(var(--card))]/60 backdrop-blur"
            >
              <CardHeader>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary))]">
                  <Icon className="h-5 w-5" />
                </div>
                <CardTitle>{f.title}</CardTitle>
                <CardDescription>{f.description}</CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          );
        })}
      </section>
    </div>
  );
}
