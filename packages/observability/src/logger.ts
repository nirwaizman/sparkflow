/**
 * Process-wide pino logger.
 *
 * - Level is read from `LOG_LEVEL` (default `info`).
 * - In development we enable pino-pretty transport for readable colourised
 *   output. In production the logger emits structured JSON on stdout which is
 *   what Vercel / Grafana / Loki expect.
 *
 * We resolve pino dynamically at module load time. This keeps the
 * observability package typeable even when `pnpm install` has not yet
 * populated `node_modules/pino` in a fresh checkout, and matches the
 * pattern used by the langfuse / sentry / posthog helpers in this package.
 *
 * The logger is intentionally a single shared instance. Do not create child
 * loggers at module scope — use `logger.child({ req_id: ... })` at the call
 * site instead so correlation IDs are scoped per request.
 */

/**
 * Minimal pino-compatible surface. The real pino instance at runtime will
 * satisfy this. We describe only what call sites in this monorepo use.
 */
export type Logger = {
  level: string;
  child(bindings: Record<string, unknown>): Logger;
  trace(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
  fatal(obj: unknown, msg?: string): void;
};

type PinoModule = {
  (options?: Record<string, unknown>): Logger;
  stdTimeFunctions?: { isoTime: () => string };
  default?: PinoModule;
};

const level = process.env.LOG_LEVEL ?? "info";
const isDev = process.env.NODE_ENV !== "production";

function loadPino(): PinoModule | null {
  try {
    const req = eval("require") as (id: string) => unknown;
    const mod = req("pino") as PinoModule;
    return (mod?.default as PinoModule) ?? mod;
  } catch {
    return null;
  }
}

function buildLogger(): Logger {
  const pino = loadPino();
  if (!pino) return consoleFallback();

  const options: Record<string, unknown> = {
    level,
    base: {
      service: process.env.SERVICE_NAME ?? "sparkflow",
      env: process.env.NODE_ENV ?? "development",
    },
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "headers.authorization",
        "headers.cookie",
        "*.apiKey",
        "*.api_key",
        "*.password",
        "*.token",
      ],
      censor: "[REDACTED]",
    },
    timestamp: pino.stdTimeFunctions?.isoTime,
  };

  if (isDev) {
    try {
      return pino({
        ...options,
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            singleLine: false,
            translateTime: "SYS:HH:MM:ss.l",
            ignore: "pid,hostname",
          },
        },
      });
    } catch {
      return pino(options);
    }
  }
  return pino(options);
}

/**
 * Final fallback: if pino cannot be loaded we return a console-backed logger.
 * Output is JSON so log aggregators still parse it, and we honour LOG_LEVEL.
 */
function consoleFallback(): Logger {
  const levels: Record<string, number> = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    fatal: 60,
  };
  const threshold = levels[level] ?? 30;
  const emit = (lvl: string, obj: unknown, msg?: string): void => {
    const num = levels[lvl] ?? 30;
    if (num < threshold) return;
    const base =
      typeof obj === "object" && obj !== null
        ? (obj as Record<string, unknown>)
        : { value: obj };
    const line = JSON.stringify({
      level: lvl,
      time: new Date().toISOString(),
      msg: msg ?? (typeof obj === "string" ? obj : undefined),
      ...base,
    });
    if (num >= 50) console.error(line);
    else if (num >= 40) console.warn(line);
    else console.log(line);
  };

  const make = (): Logger => ({
    level,
    child: () => make(),
    trace: (o, m) => emit("trace", o, m),
    debug: (o, m) => emit("debug", o, m),
    info: (o, m) => emit("info", o, m),
    warn: (o, m) => emit("warn", o, m),
    error: (o, m) => emit("error", o, m),
    fatal: (o, m) => emit("fatal", o, m),
  });
  return make();
}

export const logger: Logger = buildLogger();
