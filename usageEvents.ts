/**
 * The two usage events Opslag logs (decision 0023): shape, limits and query normalisation, shared
 * by the client (dedupe) and POST /api/guide/log (validation). Pure: no fs, no network.
 */

export const MAX_BODY_BYTES = 2048;
export const MAX_QUERY_CHARS = 200;
export const MAX_SPANS = 20;
export const MAX_SPAN_CHARS = 200;
export const MAX_PROVISION_ID_CHARS = 120;

export type UsageEvent =
  | { kind: "search_no_hits"; query: string }
  | { kind: "ref_unresolved"; provisionId: string; spans: string[] };

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
/** ddmmyy-xxxx or ddmmyyxxxx with a plausible day and month. */
const CPR_RE = /\b(?:0[1-9]|[12]\d|3[01])(?:0[1-9]|1[0-2])\d{2}-?\d{4}\b/g;

/**
 * Trimmed, whitespace collapsed, lower-cased, e-mail addresses and CPR-shaped numbers replaced,
 * cut at 200 characters. Rule codes, act numbers and § signs stay.
 */
export function normalizeQuery(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(EMAIL_RE, "[e-mail]")
    .replace(CPR_RE, "[cpr]")
    .slice(0, MAX_QUERY_CHARS)
    .trim();
}

const isString = (v: unknown): v is string => typeof v === "string";

/** The event in a request body, or null when the shape is anything other than the two events. */
export function parseUsageEvent(body: unknown): UsageEvent | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const keys = Object.keys(b).sort().join(",");
  if (b.kind === "search_no_hits" && keys === "kind,query" && isString(b.query)) {
    const query = normalizeQuery(b.query);
    return query ? { kind: "search_no_hits", query } : null;
  }
  if (b.kind === "ref_unresolved" && keys === "kind,provisionId,spans" && isString(b.provisionId) && Array.isArray(b.spans)) {
    const { provisionId, spans } = b;
    if (!provisionId || provisionId.length > MAX_PROVISION_ID_CHARS) return null;
    if (spans.length === 0 || spans.length > MAX_SPANS) return null;
    if (!spans.every((s) => isString(s) && s.length > 0 && s.length <= MAX_SPAN_CHARS)) return null;
    return { kind: "ref_unresolved", provisionId, spans: [...new Set(spans as string[])] };
  }
  return null;
}
