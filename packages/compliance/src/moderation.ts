/**
 * OpenAI Moderation API wrapper.
 *
 * `moderateText` calls `omni-moderation-latest` via the OpenAI REST API.
 * It fails open: any network or API error yields `{ flagged: false }` so
 * that moderation outages never break a user-facing flow. Call sites that
 * care about the difference between "not flagged" and "moderation unavailable"
 * should check the `error` field on the returned object.
 */

export interface ModerationResult {
  flagged: boolean;
  categories: Record<string, boolean>;
  scores: Record<string, number>;
  /** Populated on fail-open errors; absent on normal responses. */
  error?: string;
}

const OPENAI_MODERATION_URL = "https://api.openai.com/v1/moderations";
const MODEL = "omni-moderation-latest";

interface OpenAIModerationResponse {
  id?: string;
  model?: string;
  results?: Array<{
    flagged?: boolean;
    categories?: Record<string, boolean>;
    category_scores?: Record<string, number>;
  }>;
}

export async function moderateText(text: string): Promise<ModerationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      flagged: false,
      categories: {},
      scores: {},
      error: "missing_api_key",
    };
  }

  try {
    const res = await fetch(OPENAI_MODERATION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: MODEL, input: text }),
    });

    if (!res.ok) {
      return {
        flagged: false,
        categories: {},
        scores: {},
        error: `http_${res.status}`,
      };
    }

    const data = (await res.json()) as OpenAIModerationResponse;
    const first = data.results?.[0];
    if (!first) {
      return {
        flagged: false,
        categories: {},
        scores: {},
        error: "empty_response",
      };
    }

    return {
      flagged: Boolean(first.flagged),
      categories: first.categories ?? {},
      scores: first.category_scores ?? {},
    };
  } catch (err) {
    return {
      flagged: false,
      categories: {},
      scores: {},
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
