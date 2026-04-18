"use client";

export const dynamic = "force-dynamic";

/**
 * /signup — Supabase doesn't distinguish signup from signin for magic
 * links; we expose this route for UX clarity. Internally it's the same
 * flow as `/login` with tweaked copy.
 */
import { ChangeEvent, FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@sparkflow/auth/client";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@sparkflow/ui";

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupInner />
    </Suspense>
  );
}

function SignupInner() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/";

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const redirectTo = typeof window !== "undefined"
    ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
    : undefined;

  async function onEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return;
    setStatus("sending");
    setErrorMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
      });
      if (error) throw error;
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Failed to send magic link.");
    }
  }

  async function onGoogle() {
    setErrorMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) throw error;
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Google sign-in failed.");
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>יצירת חשבון</CardTitle>
          <CardDescription>
            הזן את כתובת המייל שלך ונשלח קישור להתחברות ראשונה — בלי סיסמה.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {status === "sent" ? (
            <Alert variant="success">
              <AlertTitle>בדוק את תיבת הדואר</AlertTitle>
              <AlertDescription>
                שלחנו קישור יצירת חשבון לכתובת <strong>{email}</strong>.
              </AlertDescription>
            </Alert>
          ) : (
            <form className="flex flex-col gap-3" onSubmit={onEmailSubmit}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">אימייל</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  dir="ltr"
                  value={email}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <Button type="submit" disabled={status === "sending"}>
                {status === "sending" ? "שולח..." : "צור חשבון"}
              </Button>
            </form>
          )}

          {status !== "sent" ? (
            <>
              <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                <span className="h-px flex-1 bg-[hsl(var(--border))]" />
                <span>או</span>
                <span className="h-px flex-1 bg-[hsl(var(--border))]" />
              </div>
              <Button type="button" variant="outline" onClick={onGoogle}>
                הרשמה עם Google
              </Button>
            </>
          ) : null}

          {errorMessage ? (
            <Alert variant="destructive">
              <AlertTitle>שגיאה</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
        <CardFooter className="text-xs text-[hsl(var(--muted-foreground))]">
          יש לך כבר חשבון? השתמש באותו מייל ב-<code>/login</code>.
        </CardFooter>
      </Card>
    </main>
  );
}
