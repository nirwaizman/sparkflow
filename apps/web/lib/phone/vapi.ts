/**
 * Thin wrapper around the Vapi API.
 *
 * Vapi ( https://vapi.ai ) exposes a JSON REST API at api.vapi.ai. We
 * keep the surface minimal — two functions — so a future provider swap
 * (e.g. Retell, Bland) is contained.
 *
 * Env:
 *  - VAPI_API_KEY — required for live calls. If unset, callers should
 *    surface "phone not configured" rather than calling `startCall`.
 *  - VAPI_PHONE_NUMBER_ID — the Vapi-hosted phone number used as the
 *    caller ID. Required by Vapi's outbound-call endpoint.
 *  - VAPI_WEBHOOK_SECRET — optional shared secret that Vapi sends in
 *    webhook requests; verified by the webhook route.
 *
 * Responses are passed through as typed-ish records; we don't model the
 * full Vapi schema to keep the wrapper stable across minor API tweaks.
 */

const VAPI_BASE = "https://api.vapi.ai";

export interface StartCallArgs {
  /** E.164 phone number, e.g. "+15551234567". */
  toNumber: string;
  /**
   * Script the AI assistant should follow. We inject it as the system
   * prompt of a minimal Vapi assistant definition.
   */
  script: string;
  /** Optional Vapi voice id. Defaults to a generic ElevenLabs voice. */
  voice?: string;
}

export interface VapiCall {
  id: string;
  status?: string;
  // Transcript may be an array of turns or a single concatenated string
  // depending on where in its lifecycle the call is.
  transcript?: unknown;
  // Timestamps come back as ISO strings in Vapi's schema.
  startedAt?: string;
  endedAt?: string;
  endedReason?: string;
  recordingUrl?: string;
  // Full raw payload for callers that want fields we don't model.
  raw?: unknown;
}

function getApiKey(): string | null {
  const k = process.env.VAPI_API_KEY;
  return k && k.length > 0 ? k : null;
}

function getPhoneNumberId(): string | null {
  const id = process.env.VAPI_PHONE_NUMBER_ID;
  return id && id.length > 0 ? id : null;
}

export function isConfigured(): boolean {
  return Boolean(getApiKey() && getPhoneNumberId());
}

async function vapiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("VAPI_API_KEY is not set");
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${apiKey}`);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return fetch(`${VAPI_BASE}${path}`, { ...init, headers });
}

/**
 * Create an outbound call. Returns the Vapi call record including its
 * `id`, which clients use to poll status via `getCall`.
 */
export async function startCall(args: StartCallArgs): Promise<VapiCall> {
  const phoneNumberId = getPhoneNumberId();
  if (!phoneNumberId) throw new Error("VAPI_PHONE_NUMBER_ID is not set");

  const body = {
    phoneNumberId,
    customer: { number: args.toNumber },
    assistant: {
      // Minimal inline assistant. The `script` becomes the system prompt.
      model: {
        provider: "openai",
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: args.script,
          },
        ],
      },
      voice: args.voice
        ? { provider: "11labs", voiceId: args.voice }
        : { provider: "11labs", voiceId: "burt" },
      firstMessage: "Hi, this is an AI assistant calling on behalf of SparkFlow.",
    },
  };

  const res = await vapiFetch("/call", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Vapi startCall failed: ${res.status} ${detail}`);
  }
  const json = (await res.json()) as Record<string, unknown>;
  return {
    id: String(json.id ?? ""),
    status: typeof json.status === "string" ? json.status : undefined,
    raw: json,
  };
}

/**
 * Fetch the current state (and transcript, if available) of a call.
 */
export async function getCall(id: string): Promise<VapiCall> {
  const res = await vapiFetch(`/call/${encodeURIComponent(id)}`, {
    method: "GET",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Vapi getCall failed: ${res.status} ${detail}`);
  }
  const json = (await res.json()) as Record<string, unknown>;
  return {
    id: String(json.id ?? id),
    status: typeof json.status === "string" ? json.status : undefined,
    transcript: json.transcript,
    startedAt: typeof json.startedAt === "string" ? json.startedAt : undefined,
    endedAt: typeof json.endedAt === "string" ? json.endedAt : undefined,
    endedReason:
      typeof json.endedReason === "string" ? json.endedReason : undefined,
    recordingUrl:
      typeof json.recordingUrl === "string" ? json.recordingUrl : undefined,
    raw: json,
  };
}
