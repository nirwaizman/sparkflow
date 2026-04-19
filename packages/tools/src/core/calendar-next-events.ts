import { z } from "zod";
import type { ToolRegistration } from "../types";

/**
 * Read the user's upcoming Google Calendar events. This is a stub that
 * errors gracefully if the user has not linked Google OAuth — once that
 * exists, the same route can be swapped in.
 */
const parameters = z.object({
  maxResults: z
    .number()
    .int()
    .positive()
    .max(50)
    .optional()
    .describe("Max events to return (default 10)"),
  timeMin: z
    .string()
    .optional()
    .describe("ISO timestamp lower bound (default = now)"),
  calendarId: z
    .string()
    .optional()
    .describe("Calendar id (default 'primary')"),
});

type Params = z.infer<typeof parameters>;

export type CalendarEvent = {
  id: string;
  summary?: string;
  start?: string;
  end?: string;
  location?: string;
  htmlLink?: string;
};

export type CalendarNextEventsResult = {
  events: CalendarEvent[];
  error?: string;
};

function baseUrl(): string {
  return (
    process.env.SPARKFLOW_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  );
}

export const calendarNextEventsTool: ToolRegistration<
  Params,
  CalendarNextEventsResult
> = {
  tool: {
    name: "calendar_next_events",
    description:
      "List upcoming Google Calendar events for the signed-in user. Errors gracefully without OAuth.",
    parameters,
    handler: async ({ maxResults, timeMin, calendarId }) => {
      const params = new URLSearchParams();
      params.set("maxResults", String(maxResults ?? 10));
      params.set("timeMin", timeMin ?? new Date().toISOString());
      params.set("calendarId", calendarId ?? "primary");
      try {
        const res = await fetch(
          `${baseUrl()}/api/integrations/google/calendar/events?${params.toString()}`,
        );
        if (res.status === 401 || res.status === 403 || res.status === 404) {
          return { events: [], error: "Google Calendar not connected" };
        }
        if (!res.ok) {
          return { events: [], error: `calendar returned ${res.status}` };
        }
        const data = (await res.json()) as CalendarNextEventsResult;
        return { events: data.events ?? [] };
      } catch (err) {
        return {
          events: [],
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  },
  category: "integrations",
  safety: {
    requiresAuth: true,
    maxInvocationsPerRequest: 6,
    allowInAutonomousMode: true,
  },
};
