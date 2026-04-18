/**
 * Minimal access-denied page. Rendered when the admin middleware
 * rejects the request.
 */
export default function ForbiddenPage() {
  return (
    <div className="mx-auto max-w-md pt-24 text-center">
      <h1 className="mb-2 text-3xl font-semibold">Access denied</h1>
      <p className="text-sm text-[hsl(var(--muted-foreground))]">
        This console is restricted to SparkFlow administrators. If you
        think you should have access, ask an owner to add your email to
        the <code className="font-mono">ADMIN_EMAILS</code> allow-list.
      </p>
    </div>
  );
}
