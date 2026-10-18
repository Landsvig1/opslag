"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { ArrowLeft, ChevronRight, X } from "lucide-react";
import type { OpslagNode } from "./contract";
import { useOpslag } from "./config";
import { LinkedText, bodyStart, headingOf, stkLead, type OnLink } from "./LinkedText";
import { useNode } from "./nodeCache";
import { logUnresolved } from "./usageLog";
import { displayLabel, inSectionOrder } from "./labels";

export const MAX_POPUPS = 3;
const POPUP_CHARS = 700;
const POPUP_WIDTH = 400;
/** Below this width every popup is a bottom sheet, so the 400 px popup always fits above it. */
const PHONE = 640;
const GAP = 8;
const EDGE = 16;

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** The node is a whole instrument (its root), not a provision or a section of it. */
export function isWholeInstrument(node: OpslagNode): boolean {
  return node.kind === "container" && node.id === node.instrument.id;
}

/** A whole instrument is headed by the title its own text states; anything else by its own title. */
function headingFor(node: OpslagNode, danish: boolean): string {
  if (isWholeInstrument(node)) return node.instrument.officialTitle ?? node.title;
  return node.kind === "container" ? node.title : headingOf(node.body ?? "", node.title, danish);
}

function WholeInstrumentLine() {
  return <p className="text-[13px] font-medium text-ink-muted">Hele retsakten</p>;
}

function InstrumentLine({ node }: { node: OpslagNode }) {
  const { instrument } = node;
  // On a whole instrument the internal short title would repeat (or contradict) the official one.
  const short = isWholeInstrument(node) && instrument.officialTitle ? "" : instrument.title;
  return (
    <p className="text-[13px] text-ink-muted">
      {instrument.code}
      {short ? ` · ${short}` : ""}
      {instrument.typeLabel ? ` · ${instrument.typeLabel}` : ""}
      {instrument.consolidatedAt ? ` · konsolideret ${formatDate(instrument.consolidatedAt)}` : ""}
    </p>
  );
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="text-[13px] text-bad space-y-1.5">
      <p>{message}</p>
      <button type="button" onClick={onRetry} className="text-ink-muted hover:text-ink underline underline-offset-2 cursor-pointer">
        Prøv igen
      </button>
    </div>
  );
}

interface PanelProps {
  id: string | null;
  canGoBack: boolean;
  onBack: () => void;
  onOpen: (id: string) => void;
  onLink: OnLink;
  /** Bumped when the reader moved here on purpose; focus then follows to the rule's label. */
  focusRequest: number;
  /** Scroll position to return to, for "Tilbage". */
  restoreScroll: number;
  onScroll: (top: number) => void;
  /** Usage logging is configured (decision 0023). */
  logging?: boolean;
}

/** Logs the unresolved references of a shown provision, once per (provision, span) per page load. */
function useLogUnresolved(logging: boolean, node: OpslagNode | null) {
  const { client } = useOpslag();
  useEffect(() => {
    if (!logging || node?.kind !== "provision" || !node.unresolved?.length) return;
    const body = node.body ?? "";
    logUnresolved(client, logging, node.id, node.unresolved.map((u) => body.slice(u.start, u.end)));
  }, [client, logging, node]);
}

/** The right-hand reading panel: one provision or container, with a back button. */
export function Panel({ id, canGoBack, onBack, onOpen, onLink, focusRequest, restoreScroll, onScroll, logging = false }: PanelProps) {
  const { node, error, retry } = useNode(id);
  const { isDanish, renderExtras } = useOpslag();
  useLogUnresolved(logging, node);
  const scroller = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLParagraphElement>(null);
  const focused = useRef(0);
  const loaded = node?.id ?? null;

  useLayoutEffect(() => {
    if (loaded && scroller.current) scroller.current.scrollTop = restoreScroll;
    // Only when a rule finishes loading; later scrolling is the reader's own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  useEffect(() => {
    if (loaded && focusRequest !== focused.current) {
      focused.current = focusRequest;
      label.current?.focus({ preventScroll: true });
    }
  }, [loaded, focusRequest]);

  if (!id) {
    return <div className="h-full flex items-center justify-center px-10 text-center text-[13px] text-ink-muted">Vælg en bestemmelse for at læse den her.</div>;
  }
  return (
    // Keyed by id so a new provision opens at the top, not at the old scroll position.
    <div key={id} ref={scroller} onScroll={(e) => onScroll(e.currentTarget.scrollTop)} className="h-full overflow-y-auto">
      <div className="px-5 sm:px-8 py-5 sm:py-6 space-y-4">
        <div className="flex items-center gap-3 min-h-8">
          {canGoBack && (
            <button type="button" onClick={onBack} className="px-2 py-1.5 -ml-2 rounded-sm text-[13px] text-ink-muted hover:text-ink inline-flex items-center gap-1 cursor-pointer">
              <ArrowLeft size={14} /> Tilbage
            </button>
          )}
          {node && node.path.length > 0 && (
            <nav aria-label="Placering" className="flex flex-wrap items-center gap-1 text-[13px] text-ink-faint min-w-0">
              {node.path.map((c, i) => (
                <span key={c.id} className="inline-flex items-center gap-1">
                  {i > 0 && <ChevronRight size={12} />}
                  <button type="button" onClick={() => onOpen(c.id)} className="hover:text-ink cursor-pointer truncate max-w-56" title={c.title}>
                    {i === 0 ? c.label : c.title || displayLabel(c.label, node.instrument.code)}
                  </button>
                </span>
              ))}
            </nav>
          )}
        </div>
        {error && <LoadError message={error} onRetry={retry} />}
        {!node && !error && (
          <p role="status" className="text-[13px] text-ink-muted">
            Henter ...
          </p>
        )}
        {node && (() => {
          const danish = isDanish(node.instrument.id);
          const heading = headingFor(node, danish);
          return (
          <article className="space-y-3">
            <p ref={label} tabIndex={-1} className="font-mono text-[13px] text-ink-muted outline-none">
              {displayLabel(node.label)}
            </p>
            {isWholeInstrument(node) && <WholeInstrumentLine />}
            {heading && <h2 className="text-[20px] leading-snug font-medium text-ink">{heading}</h2>}
            <InstrumentLine node={node} />
            {node.kind === "provision" && (
              <div className="pt-2 max-w-[72ch] text-[15px] leading-relaxed text-ink">
                <LinkedText
                  text={node.body ?? ""}
                  links={node.links ?? []}
                  unresolved={node.unresolved}
                  lead={stkLead(node.body ?? "", danish)}
                  from={bodyStart(node.body ?? "", node.title, danish)}
                  onLink={onLink}
                />
              </div>
            )}
            {node.kind === "container" && (
              <ul className="pt-2 divide-y divide-line border-t border-b border-line">
                {inSectionOrder(node.children!).map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => onOpen(c.id)} className="w-full text-left py-2.5 flex gap-3 hover:bg-background cursor-pointer">
                      <span className="font-mono text-[13px] text-ink-muted shrink-0 w-28 sm:w-44 truncate" title={displayLabel(c.label, node.instrument.code)}>
                        {displayLabel(c.label, node.instrument.code)}
                      </span>
                      <span className="text-[13px] text-ink">{c.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {renderExtras?.(node, onOpen)}
          </article>
          );
        })()}
      </div>
    </div>
  );
}

export interface PopupState {
  id: string;
  /** The link text that opened it, for the path. */
  text: string;
  /** Fixed position, decided when it opens. */
  place: { left: number; style: React.CSSProperties };
  /** The reference that opened it; focus returns there when it closes. */
  source: HTMLElement | null;
}

/**
 * Where a popup opens. The first one opens under or over its reference, on the side with more
 * room. A nested one opens beside the popup it came from (left first, the panel is on the right),
 * so the text that holds the reference stays readable.
 */
export function placePopup(anchor: DOMRect, parentLeft?: number): PopupState["place"] {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // On a phone every level is a bottom sheet across the full width.
  if (vw < PHONE) return { left: 0, style: { left: 0, right: 0, bottom: 0, maxHeight: "75dvh" } };
  if (parentLeft === undefined) {
    const left = Math.max(EDGE, Math.min(anchor.left, vw - POPUP_WIDTH - EDGE));
    const roomBelow = vh - anchor.bottom - 22;
    const roomAbove = anchor.top - 22;
    const cap = vh * 0.5;
    const style: React.CSSProperties =
      roomBelow >= Math.min(cap, roomAbove)
        ? { left, top: anchor.bottom + 6, width: POPUP_WIDTH, maxHeight: Math.min(cap, roomBelow) }
        : { left, bottom: vh - anchor.top + 6, width: POPUP_WIDTH, maxHeight: Math.min(cap, roomAbove) };
    return { left, style };
  }
  const leftOf = parentLeft - POPUP_WIDTH - GAP;
  const rightOf = parentLeft + POPUP_WIDTH + GAP;
  const left = leftOf >= EDGE ? leftOf : rightOf <= vw - POPUP_WIDTH - EDGE ? rightOf : Math.max(EDGE, parentLeft - 24);
  const top = Math.max(EDGE, Math.min(anchor.top - 40, vh - EDGE - 240));
  return { left, style: { left, top, width: POPUP_WIDTH, maxHeight: Math.min(vh * 0.6, vh - top - EDGE) } };
}

/** Where the reader already has this rule open, if anywhere: a loop back is said, not silent. */
export type OpenElsewhere = "panel" | "popup" | null;

const ELSEWHERE: Record<Exclude<OpenElsewhere, null>, string> = {
  panel: "Du læser allerede denne regel i panelet.",
  popup: "Denne regel er allerede åben i et vindue bagved.",
};

/** One reference popup. Its links open the next level; "Åbn i panelet" moves it to the panel. */
export function Popup({ popup, trail, isTop, atMaxDepth, openElsewhere, onLink, onOpen, onClose, logging = false }: { popup: PopupState; trail: string[]; isTop: boolean; atMaxDepth: boolean; openElsewhere: OpenElsewhere; onLink: OnLink; onOpen: (id: string) => void; onClose: () => void; logging?: boolean }) {
  const { node, error, retry } = useNode(popup.id);
  const { isDanish } = useOpslag();
  useLogUnresolved(logging, node);
  const danish = node ? isDanish(node.instrument.id) : false;
  const start = node?.body ? bodyStart(node.body, node.title, danish) : 0;
  let end = node?.body ? Math.min(node.body.length, start + POPUP_CHARS) : 0;
  if (node?.body && end < node.body.length) end = Math.max(start, node.body.lastIndexOf(" ", end));
  const heading = node ? headingFor(node, danish) : "";
  const self = useRef<HTMLDivElement>(null);
  // Links the reader can follow from here, in the shown slice and in the whole text. Some references
  // in the text may not resolve, so "none" means none that can be followed, not none at all.
  const links = node?.kind === "provision" ? (node.links ?? []) : [];
  const shownLinks = links.filter((l) => l.start >= start && l.end <= end).length;
  const wayOn =
    node?.kind !== "provision"
      ? null
      : links.length === 0
        ? "Ingen henvisninger, der kan følges herfra."
        : shownLinks === 0
          ? "Henvisningerne står længere nede i teksten. Åbn reglen i panelet for at følge dem."
          : atMaxDepth
            ? "Højst tre vinduer: en henvisning herfra erstatter dette vindue."
            : null;

  // A popup takes focus when it opens, so the keyboard reader is where the eye is.
  useEffect(() => {
    self.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      ref={self}
      tabIndex={-1}
      data-guide-popup
      role="dialog"
      aria-label={node ? displayLabel(node.label) : "Henvisning"}
      style={popup.place.style}
      className="fixed z-50 flex flex-col bg-paper border border-line-strong rounded-sm shadow-[0_4px_16px_rgba(28,27,26,0.10)] outline-none focus-visible:outline-2 focus-visible:outline-accent"
    >
      <div className="flex items-start gap-2 px-4 pt-3 pb-2 border-b border-line">
        <div className="min-w-0 flex-1">
          {isTop && trail.length > 1 && (
            <p aria-label={`Sti: ${trail.join(", ")}`} className="text-[13px] text-ink-faint break-words">
              {trail.join(" › ")}
            </p>
          )}
          <p className="font-mono text-[13px] text-ink-muted">{node ? displayLabel(node.label) : popup.text}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Luk" className="p-2 -mr-2 -mt-1 text-ink-faint hover:text-ink cursor-pointer">
          <X size={14} />
        </button>
      </div>
      <div className="px-4 py-3 overflow-y-auto space-y-2">
        {error && <LoadError message={error} onRetry={retry} />}
        {!node && !error && <p className="text-[13px] text-ink-muted">Henter ...</p>}
        {openElsewhere && <p className="text-[13px] text-ink-muted">{ELSEWHERE[openElsewhere]}</p>}
        {node && isWholeInstrument(node) && <WholeInstrumentLine />}
        {node && heading && <p className="text-[15px] font-medium text-ink">{heading}</p>}
        {node?.kind === "provision" && (
          <div className="text-[13px] leading-relaxed text-ink">
            <LinkedText
              text={node.body ?? ""}
              links={node.links ?? []}
              unresolved={node.unresolved}
              lead={start === 0 ? stkLead(node.body ?? "", danish) : ""}
              from={start}
              to={end}
              suffix={end < (node.body?.length ?? 0) ? " ..." : ""}
              onLink={onLink}
            />
          </div>
        )}
        {node?.kind === "container" && <InstrumentLine node={node} />}
        {wayOn && <p className="text-[13px] text-ink-faint">{wayOn}</p>}
      </div>
      {node && isTop && (
        <div className="px-4 py-2.5 border-t border-line">
          <button type="button" onClick={() => onOpen(node.id)} className="text-[13px] font-medium text-accent hover:text-accent-hover cursor-pointer">
            Åbn i panelet
          </button>
        </div>
      )}
    </div>
  );
}
