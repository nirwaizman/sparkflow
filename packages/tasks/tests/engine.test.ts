/**
 * Engine unit tests. We stub `@sparkflow/db`'s `getDb` with an
 * in-memory mock that records inserts and returns canned rows so the
 * tests don't require a running Postgres.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type TaskRow = {
  id: string;
  organizationId: string;
  userId: string;
  title: string;
  status: string;
  input: Record<string, unknown>;
  output: unknown;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
};

const rows: TaskRow[] = [];

function makeMockDb() {
  return {
    insert: () => ({
      values: (v: Partial<TaskRow> | Partial<TaskRow>[]) => ({
        returning: async () => {
          const arr = Array.isArray(v) ? v : [v];
          const inserted = arr.map((row) => {
            const full: TaskRow = {
              id: `task-${rows.length + 1}`,
              organizationId: row.organizationId ?? "org-x",
              userId: row.userId ?? "user-x",
              title: row.title ?? "",
              status: row.status ?? "queued",
              input: (row.input as Record<string, unknown>) ?? {},
              output: null,
              error: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              completedAt: null,
            };
            rows.push(full);
            return full;
          });
          return inserted;
        },
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: (_n: number) => Promise.resolve([...rows]),
          }),
          limit: (_n: number) => Promise.resolve([...rows]),
        }),
      }),
    }),
    update: () => ({
      set: (patch: Partial<TaskRow>) => ({
        where: () => ({
          returning: async () => {
            for (const r of rows) Object.assign(r, patch);
            return [...rows];
          },
        }),
      }),
    }),
  };
}

vi.mock("@sparkflow/db", () => {
  const mockDb = makeMockDb();
  return {
    getDb: () => mockDb,
    tasks: {
      id: "id",
      organizationId: "organizationId",
      userId: "userId",
      status: "status",
      createdAt: "createdAt",
    },
    taskSteps: {
      id: "id",
      taskId: "taskId",
      stepIndex: "stepIndex",
    },
  };
});

describe("engine", () => {
  beforeEach(() => {
    rows.length = 0;
  });

  afterEach(() => {
    rows.length = 0;
  });

  it("enqueueTask inserts a queued task with the provided goal", async () => {
    const { enqueueTask } = await import("../src/engine");
    const record = await enqueueTask({
      organizationId: "org-1",
      userId: "user-1",
      goal: "Draft the quarterly report",
    });

    expect(record.status).toBe("queued");
    expect(record.input.goal).toBe("Draft the quarterly report");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title.length).toBeLessThanOrEqual(80);
  });

  it("listTasks returns inserted rows", async () => {
    const { enqueueTask, listTasks } = await import("../src/engine");
    await enqueueTask({
      organizationId: "org-1",
      userId: "user-1",
      goal: "A",
    });
    await enqueueTask({
      organizationId: "org-1",
      userId: "user-1",
      goal: "B",
    });
    const list = await listTasks({ organizationId: "org-1" });
    expect(list.length).toBe(2);
    expect(list.map((t) => t.input.goal).sort()).toEqual(["A", "B"]);
  });
});
