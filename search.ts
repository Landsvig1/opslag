import MiniSearch, { type Options, type SearchOptions } from "minisearch";
import type { OpslagGroup, OpslagTopic, ProvisionDoc } from "./contract";

/** Words a Danish question carries that say nothing about the subject. */
export const DANISH_STOPWORDS = new Set(
  "vi skal en et at i på og til af for med der det den de som er har om hvad hvordan hvornår hvilke hvilken jeg vores os kan må ikke fra ved når hvis så skal være blive gør gøre noget nogle".split(" ")
);

const defaultTokenize = MiniSearch.getDefault("tokenize") as (text: string) => string[];

const PROVISION_SEARCH: SearchOptions = { boost: { label: 4, title: 3 }, prefix: true, fuzzy: 0.15 };
const TOPIC_SEARCH: SearchOptions = { boost: { title: 3, synonyms: 2 }, prefix: true, fuzzy: 0.15 };

type TopicDoc = Pick<OpslagTopic, "id" | "title" | "summary"> & { synonyms: string; area: string };

export interface TopicIndex {
  ms: MiniSearch<TopicDoc>;
  topics: OpslagTopic[];
}

export interface SearchHits {
  topics: string[];
  /**
   * The query named a code, or an act and its § or article, that exists: provisions[0] is that
   * provision. Absent on answers saved before this field.
   */
  lookup?: boolean;
  provisions: Array<{ id: string; label: string; title: string; excerpt: string }>;
}

export interface SearchHooks {
  /**
   * Whole codes in a text, normalised ("ADR.OR.B.040"). They are extra index tokens, so a code
   * matches that rule and not every text sharing its prefix, and a query naming one is a lookup.
   */
  codes?: (text: string) => string[];
  /** The provision id a query names with its act ("luftfartslovens § 55"), or null. Not checked against the index. */
  lookup?: (query: string) => string | null;
  stopwords?: Set<string>;
}

export type OpslagSearch = ReturnType<typeof createSearch>;

/**
 * Search over curated topics and the provision index. The host builds the provision index on the
 * server with `indexOptions` and the browser loads it with `loadProvisionIndex`; both sides must
 * use the same hooks, so create this once in a module both import.
 */
export function createSearch({ codes = () => [], lookup = () => null, stopwords = DANISH_STOPWORDS }: SearchHooks = {}) {
  const tokenize = (text: string) => [...defaultTokenize(text), ...codes(text)];
  const processTerm = (term: string) => {
    const t = term.toLowerCase();
    return stopwords.has(t) ? null : t;
  };
  const indexOptions: Options<ProvisionDoc> = { fields: ["label", "title", "body"], storeFields: ["label", "title", "excerpt"], tokenize, processTerm };

  /** Topics are few and change by commit, so the browser indexes them on load. */
  function buildTopicIndex(topics: OpslagTopic[], areas: OpslagGroup[]): TopicIndex {
    const ms = new MiniSearch<TopicDoc>({ fields: ["title", "synonyms", "summary", "area"], tokenize, processTerm });
    ms.addAll(
      topics.map((t) => ({
        id: t.id,
        title: t.title,
        summary: t.summary,
        synonyms: t.synonyms.join(" "),
        area: areas.find((a) => a.id === t.area)?.title ?? "",
      }))
    );
    return { ms, topics };
  }

  /** Topics first, then provisions. A topic hit needs a reasonable score, so one stray prefix does not surface it. */
  function search(query: string, topics: TopicIndex, provisions: MiniSearch<ProvisionDoc> | null, limit = 8): SearchHits {
    const topicHits = topics.ms.search(query, TOPIC_SEARCH);
    const best = topicHits[0]?.score ?? 0;
    // A code, or an act with its § or article, is a lookup, not a question: that provision goes first.
    const named = provisions && lookup(query);
    const direct = named && provisions.has(named) ? [{ ...provisions.getStoredFields(named), id: named }] : [];
    const exact: Array<{ id: unknown; [field: string]: unknown }> = provisions
      ? [...direct, ...codes(query).flatMap((code) => provisions.search(code, { fields: ["label"], tokenize: (t) => [t], prefix: false, fuzzy: false }))]
      : [];
    const ranked = provisions ? [...exact, ...provisions.search(query, PROVISION_SEARCH)] : [];
    const seen = new Set<string>();
    // For a lookup, the topics are those that list the rule, not whatever its fragments match.
    const exactIds = new Set(exact.map((h) => String(h.id)));
    const topicIds = exactIds.size
      ? topics.topics.filter((t) => t.provisions.some((id) => exactIds.has(id))).map((t) => t.id)
      : topicHits.filter((h) => h.score >= best * 0.35).map((h) => String(h.id));
    return {
      topics: topicIds.slice(0, 3),
      lookup: exactIds.size > 0,
      provisions: ranked
        .filter((h) => !seen.has(String(h.id)) && seen.add(String(h.id)))
        .slice(0, limit)
        .map((h) => ({ id: String(h.id), label: String(h.label), title: String(h.title), excerpt: String(h.excerpt) })),
    };
  }

  return {
    indexOptions,
    loadProvisionIndex: (json: string) => MiniSearch.loadJSON<ProvisionDoc>(json, indexOptions),
    buildTopicIndex,
    search,
  };
}
