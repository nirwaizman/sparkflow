/**
 * Typed errors used by the LLM gateway and provider adapters.
 *
 * The gateway fallback chain catches these to decide whether to advance to the
 * next provider or to fail hard:
 *  - MissingApiKeyError → skip silently (not configured).
 *  - ProviderUnavailableError → try next provider (transient upstream failure).
 *  - AllProvidersFailedError → terminal: every candidate was tried.
 */

export class LlmError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "LlmError";
    if (options?.cause !== undefined) {
      // Node 16+ supports the `cause` option; TS target is ES2022 so assign directly.
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

export class MissingApiKeyError extends LlmError {
  readonly provider: string;
  constructor(provider: string, envVar: string) {
    super(`Missing API key for provider "${provider}" (env var ${envVar}).`);
    this.name = "MissingApiKeyError";
    this.provider = provider;
  }
}

export class ProviderUnavailableError extends LlmError {
  readonly provider: string;
  readonly status?: number;
  constructor(provider: string, message: string, options?: { status?: number; cause?: unknown }) {
    super(`Provider "${provider}" unavailable: ${message}`, { cause: options?.cause });
    this.name = "ProviderUnavailableError";
    this.provider = provider;
    this.status = options?.status;
  }
}

export class AllProvidersFailedError extends LlmError {
  readonly causes: unknown[];
  constructor(message: string, causes: unknown[]) {
    super(message, { cause: causes });
    this.name = "AllProvidersFailedError";
    this.causes = causes;
  }
}

/**
 * Heuristic: treat 5xx and 429 as transient failures worth falling back on.
 */
export function isTransientStatus(status: number | undefined): boolean {
  if (status === undefined) return false;
  return status === 429 || (status >= 500 && status < 600);
}
