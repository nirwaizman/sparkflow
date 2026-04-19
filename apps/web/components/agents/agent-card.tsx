/**
 * AgentCard — single tile in the Agents marketplace grid.
 *
 * Server Component — no client state. Renders:
 *   - coloured icon badge (per category)
 *   - name + role
 *   - 2-line truncated objective
 *   - "Use agent" primary action (jumps to detail with run drawer open)
 *   - "Edit" for org-scoped custom agents (built-ins are read-only)
 */
import Link from "next/link";
import { Badge, Button, Card, CardContent } from "@sparkflow/ui";
import {
  categoryOf,
  colorClassesFor,
  iconForAgentId,
  type AgentCategory,
} from "./category-icon";

export type AgentCardProps = {
  id: string;
  name: string;
  role: string;
  objective: string;
  tools: string[];
  builtIn: boolean;
  version?: number;
};

export function AgentCard(props: AgentCardProps) {
  const category: AgentCategory = categoryOf({
    id: props.id,
    name: props.name,
    role: props.role,
  });
  const colors = colorClassesFor(category);
  const Icon = iconForAgentId(props.id);

  const detailHref = `/agents/${encodeURIComponent(props.id)}`;
  const useHref = `${detailHref}?run=1`;

  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${colors.badge}`}
            aria-hidden
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-semibold">{props.name}</h3>
              {props.builtIn ? (
                <Badge variant="secondary" className="shrink-0 text-[10px] uppercase tracking-wide">
                  Built-in
                </Badge>
              ) : (
                <Badge variant="outline" className="shrink-0 text-[10px] uppercase tracking-wide">
                  Custom
                  {typeof props.version === "number" ? ` · v${props.version}` : ""}
                </Badge>
              )}
            </div>
            <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">
              {props.role}
            </p>
          </div>
        </div>

        <p
          className="line-clamp-2 text-sm text-[hsl(var(--muted-foreground))]"
          title={props.objective}
        >
          {props.objective}
        </p>

        {props.tools.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {props.tools.slice(0, 5).map((t) => (
              <span
                key={t}
                className="rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 font-mono text-[10px] text-[hsl(var(--muted-foreground))]"
              >
                {t}
              </span>
            ))}
            {props.tools.length > 5 && (
              <span className="rounded px-1.5 py-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">
                +{props.tools.length - 5}
              </span>
            )}
          </div>
        )}

        <div className="mt-auto flex items-center gap-2 pt-2">
          <Button asChild size="sm" className="flex-1">
            <Link href={useHref}>Use agent</Link>
          </Button>
          {props.builtIn ? (
            <Button asChild size="sm" variant="outline">
              <Link href={detailHref}>View</Link>
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline">
              <Link href={detailHref}>Edit</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
