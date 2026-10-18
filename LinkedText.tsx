"use client";

import type { OpslagLink, OpslagSpan } from "./contract";

/** Called with the reference button itself, so the popup can be placed by it and hand focus back to it. */
export type OnLink = (link: OpslagLink, source: HTMLElement) => void;

/** EUR-Lex puts list markers ("1)", "a)", "iii)") on a line of their own; join them to their text. Display only. */
function tidy(chunk: string): string {
  return chunk.replace(/(^|\n)(\(?[0-9a-z]{1,4}[).])\n+/g, "$1$2 ");
}

/** A paragraph that opens with a list marker ("a) ", "1) ", "(iii) ") gets a hanging indent. */
const MARKER = /^\(?[0-9a-z]{1,4}[).] /;

/**
 * A provision body with its references as buttons. `from`/`to` render a slice (the popup shows
 * the opening only); links outside the slice are plain text. Paragraphs (blank-line separated in
 * the corpus) render as blocks with a small gap rather than a full empty line. `unresolved` spans
 * read as references that lead nowhere: dotted, not clickable. `lead` opens the first paragraph
 * ("Stk. 1. ").
 */
export function LinkedText({
  text,
  links,
  unresolved = [],
  lead = "",
  from = 0,
  to = text.length,
  suffix = "",
  onLink,
}: {
  text: string;
  links: OpslagLink[];
  unresolved?: OpslagSpan[];
  lead?: string;
  from?: number;
  to?: number;
  suffix?: string;
  onLink: OnLink;
}) {
  const paragraphs: React.ReactNode[][] = [[]];
  const pushText = (chunk: string) => {
    tidy(chunk)
      .split(/\n[ \t]*\n\s*/)
      .forEach((piece, i) => {
        if (i > 0) paragraphs.push([]);
        if (piece) paragraphs[paragraphs.length - 1].push(piece);
      });
  };
  if (lead) paragraphs[0].push(lead);
  const spans = [...links.map((l) => ({ ...l, dead: false })), ...unresolved.map((u) => ({ ...u, dead: true, kind: "provision" as const, to: "" }))].sort((a, b) => a.start - b.start);
  let at = from;
  for (const l of spans) {
    if (l.start < from || l.end > to || l.start < at) continue;
    if (l.start > at) pushText(text.slice(at, l.start));
    if (l.dead) {
      paragraphs[paragraphs.length - 1].push(
        <span key={l.start} data-guide-unresolved title="Ikke i korpus" className="underline decoration-dotted decoration-ink-faint underline-offset-2 cursor-help">
          {text.slice(l.start, l.end)}
          <span className="sr-only"> (ikke i korpus)</span>
        </span>
      );
      at = l.end;
      continue;
    }
    paragraphs[paragraphs.length - 1].push(
      <button
        key={l.start}
        type="button"
        data-guide-link
        aria-haspopup="dialog"
        onClick={(e) => onLink(l, e.currentTarget)}
        className={`text-accent underline underline-offset-2 cursor-pointer hover:bg-accent-soft rounded-[2px] focus-visible:outline-2 focus-visible:outline-accent ${
          l.kind === "instrument" ? "decoration-dotted decoration-accent/60" : "decoration-accent/40"
        }`}
      >
        {text.slice(l.start, l.end)}
      </button>
    );
    at = l.end;
  }
  if (at < to) pushText(text.slice(at, to));
  if (suffix) paragraphs[paragraphs.length - 1].push(suffix);
  return (
    <>
      {paragraphs
        .filter((parts) => parts.length > 0)
        .map((parts, i) => (
          <span key={i} className={`block whitespace-pre-line [&+&]:mt-1.5 ${typeof parts[0] === "string" && parts[0] !== lead && MARKER.test(parts[0]) ? "pl-[2.5ch] -indent-[2.5ch]" : ""}`}>
            {parts}
          </span>
        ))}
    </>
  );
}

/**
 * Where the readable body starts. EU articles and rules repeat their heading as the first line;
 * a Danish § has no heading and its "title" is the opening of the text, which must stay.
 */
export function bodyStart(body: string, title: string, danish = false): number {
  if (danish) return 0;
  if (title && body === title) return body.length;
  if (!title || !body.startsWith(title) || body[title.length] !== "\n") return 0;
  let i = title.length;
  while (i < body.length && /\s/.test(body[i])) i++;
  return i;
}

/** The title when it is a heading; a Danish § has none (its "title" is its opening words). */
export function headingOf(body: string, title: string, danish = false): string {
  if (!title || danish) return "";
  return !body.startsWith(title) || body.length === title.length || body[title.length] === "\n" ? title : "";
}

/**
 * "Stk. 1. " when a Danish § has further numbered subsections, so the first reads like the rest.
 * A § with one subsection has no number in the law, so it gets none here.
 */
export function stkLead(body: string, danish: boolean): string {
  return danish && /(^|\n)Stk\. 2\. /.test(body) && !/^Stk\. 1\. /.test(body) ? "Stk. 1. " : "";
}
