"use client";

import { Compass, FlaskConical, Rocket, Sparkles } from "lucide-react";
import { Button, Card, CardContent } from "@sparkflow/ui";

const STARTERS = [
  {
    icon: Rocket,
    title: "תוכנית GTM מהירה",
    prompt: "בנה לי תוכנית GTM בת 5 שלבים למוצר AI לעורכי דין.",
  },
  {
    icon: Compass,
    title: "השוואת מודלים",
    prompt: "השווה את מודלי ה-AI המובילים היום והמלץ על אחד ליזם סולו.",
  },
  {
    icon: Sparkles,
    title: "דף נחיתה",
    prompt: "כתוב דף נחיתה פרימיום למתכנן טיולים מבוסס AI.",
  },
  {
    icon: FlaskConical,
    title: "מחקר שוק",
    prompt: "חקור את שוק עוזרי ה-AI לכתיבת פתקים וסכם את התחרות.",
  },
];

export function EmptyState({
  onPick,
}: {
  onPick: (prompt: string) => void;
}) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 p-8 text-center">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.35em] text-[hsl(var(--muted-foreground))]">
          SparkFlow
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          שאל כל שאלה, תקבל תשובה עם מקורות.
        </h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Chat, חיפוש רשת, מחקר עמוק וסוכנים — בחר מצב או תן ל-planner להחליט.
        </p>
      </div>
      <div className="grid w-full gap-3 sm:grid-cols-2">
        {STARTERS.map((s) => {
          const Icon = s.icon;
          return (
            <Card
              key={s.title}
              className="cursor-pointer text-start transition hover:border-[hsl(var(--ring))]"
              onClick={() => onPick(s.prompt)}
            >
              <CardContent className="p-4">
                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                  <Icon className="h-3.5 w-3.5" />
                  {s.title}
                </div>
                <p className="text-sm text-[hsl(var(--fg))]">{s.prompt}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPick("סכם את החדשות הטכנולוגיות החשובות של השבוע.")}
        >
          סיכום חדשות
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPick("נתח מתחרים לחברת SaaS בתחום ה-AI.")}
        >
          ניתוח מתחרים
        </Button>
      </div>
    </div>
  );
}
