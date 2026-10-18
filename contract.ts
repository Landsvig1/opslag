/**
 * What an Opslag host serves: the shapes behind `GET <base>/node?id=` and `GET <base>/index`, and
 * the curated topics it hands the UI. Nothing in `src/opslag/` knows which corpus is behind them.
 */

/** A span of a provision body that opens a popup: a provision, or an instrument card. */
export interface OpslagLink {
  start: number;
  end: number;
  kind: "provision" | "instrument";
  to: string;
}

/** A span that reads as a reference but leads to nothing in the corpus. */
export interface OpslagSpan {
  start: number;
  end: number;
}

export interface OpslagCrumb {
  id: string;
  label: string;
  title: string;
}

/** `GET <base>/node?id=`: one provision (body and reference spans) or one container (children). */
export interface OpslagNode {
  id: string;
  kind: "provision" | "container";
  label: string;
  title: string;
  instrument: { id: string; code: string; title: string; typeLabel: string; consolidatedAt?: string; officialTitle?: string };
  /** Ancestors from the instrument root down to the parent. */
  path: OpslagCrumb[];
  body?: string;
  links?: OpslagLink[];
  /** References that do not resolve: shown as such, not as plain text and not as links. */
  unresolved?: OpslagSpan[];
  children?: Array<OpslagCrumb & { container: boolean }>;
}

/**
 * One document of the provision index. `GET <base>/index` returns a MiniSearch index of these,
 * serialised with `JSON.stringify` and built with the host's `createSearch(...).indexOptions`.
 */
export interface ProvisionDoc {
  id: string;
  label: string;
  title: string;
  body: string;
  /** Opening of the body, for the result list. */
  excerpt: string;
}

/** A menu group: an area or a phase. */
export interface OpslagGroup {
  id: string;
  title: string;
}

/** A curated entry point: a process in the reader's words, mapped onto provision or container ids. */
export interface OpslagTopic {
  id: string;
  title: string;
  /** Two lines at most: what the topic covers, in the reader's words. */
  summary: string;
  area: string;
  phase: string[];
  /** Stable ids, in reading order. Container ids are allowed. */
  provisions: string[];
  /** One line per id: why it is part of the topic. */
  reasons: Record<string, string>;
  /** Process words that do not occur in the legal text; they feed search. */
  synonyms: string[];
  status: "udkast" | "godkendt";
}

/** The "Kilder" menu: instruments grouped by legal form, in the order the host wants them. */
export interface SourceGroup {
  title: string;
  instruments: Array<{ id: string; code: string; title: string }>;
}
