/**
 * Shared DeepSeek API client.
 * All AI routes use this instead of duplicating the fetch/parse pattern.
 */

export interface DeepSeekOptions {
  /** System prompt */
  system: string;
  /** User message content */
  user: string;
  /** Temperature (default 0.1) */
  temperature?: number;
  /** Max tokens (optional) */
  maxTokens?: number;
}

export interface DeepSeekResult<T = unknown> {
  ok: true;
  data: T;
}

export interface DeepSeekError {
  ok: false;
  error: string;
  status: number;
}

export type DeepSeekResponse<T = unknown> = DeepSeekResult<T> | DeepSeekError;

/**
 * Call DeepSeek chat API and return parsed JSON.
 * Returns a discriminated union so callers can handle errors cleanly.
 */
export async function callDeepSeek<T = unknown>(
  opts: DeepSeekOptions,
): Promise<DeepSeekResponse<T>> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "API key not configured", status: 500 };
  }

  const body: Record<string, unknown> = {
    model: "deepseek-chat",
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    temperature: opts.temperature ?? 0.1,
    response_format: { type: "json_object" },
  };

  if (opts.maxTokens) {
    body.max_tokens = opts.maxTokens;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000); // 55s to stay within Vercel's 60s limit

  let response: Response;
  try {
    response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: "AI request timed out. Please try again.", status: 504 };
    }
    return { ok: false, error: `Network error: ${err instanceof Error ? err.message : "Unknown"}`, status: 502 };
  }
  clearTimeout(timeout);

  if (!response.ok) {
    const errBody = await response.text();
    return { ok: false, error: `API error: ${errBody}`, status: 502 };
  }

  const result = await response.json();
  const text = result.choices?.[0]?.message?.content;

  try {
    const parsed = JSON.parse(text) as T;
    return { ok: true, data: parsed };
  } catch {
    return { ok: false, error: "Failed to parse AI response", status: 500 };
  }
}
