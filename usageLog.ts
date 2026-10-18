import type { OpslagClient } from "./client";
import { MAX_SPANS, MAX_SPAN_CHARS, normalizeQuery } from "./usageEvents";

/**
 * Client side of Opslag's usage log. Each event is sent once per page load: the sets live as long
 * as the module, which is one page load. Callers pass `logging` from the host; off means nothing
 * is sent.
 */

const sentQueries = new Set<string>();
const sentSpans = new Set<string>();

/** A typed question that gave no topic and no provision, with the law-text index loaded. */
export function logNoHits(client: OpslagClient, logging: boolean, text: string) {
  if (!logging) return;
  const query = normalizeQuery(text);
  if (!query || sentQueries.has(query)) return;
  sentQueries.add(query);
  client.log({ kind: "search_no_hits", query });
}

/** A provision shown with references Opslag cannot follow: one event per (provision, span). */
export function logUnresolved(client: OpslagClient, logging: boolean, provisionId: string, spans: string[]) {
  if (!logging) return;
  const fresh = [...new Set(spans)].filter((s) => s && s.length <= MAX_SPAN_CHARS && !sentSpans.has(`${provisionId}\n${s}`));
  if (!fresh.length) return;
  for (const s of fresh) sentSpans.add(`${provisionId}\n${s}`);
  for (let i = 0; i < fresh.length; i += MAX_SPANS) client.log({ kind: "ref_unresolved", provisionId, spans: fresh.slice(i, i + MAX_SPANS) });
}

/** For tests: forget what this page load has sent. */
export function resetUsageLog() {
  sentQueries.clear();
  sentSpans.clear();
}
