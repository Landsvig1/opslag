"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type MiniSearch from "minisearch";
import { ArrowLeft, ArrowUp, Menu, X } from "lucide-react";
import type { OpslagLink, OpslagTopic as Topic, ProvisionDoc, SourceGroup } from "./contract";
import { OpslagProvider, useOpslag, type OpslagConfig } from "./config";
import type { SearchHits } from "./search";
import { MAX_POPUPS, Panel, Popup, placePopup, type PopupState } from "./Reader";
import { fetchNode } from "./nodeCache";
import { logNoHits } from "./usageLog";
import { displayLabel } from "./labels";

/** `partial`: asked before the law-text index loaded, so it is re-run once the index arrives. */
type Message = { id: number; kind: "q"; text: string } | { id: number; kind: "a"; hits: SearchHits; query?: string; partial?: boolean };

type MenuTab = "omraader" | "kilder" | "faser";
const ALL_TABS: Array<[MenuTab, string]> = [
  ["omraader", "Områder"],
  ["kilder", "Kilder"],
  ["faser", "Faser"],
];

interface Saved {
  messages: Message[];
  panel: string[];
  menu?: MenuTab;
}

const SHOWN_PROVISIONS = 5;
const UNDO_MS = 8000;
/** Marks the row for what the panel shows now: a 2 px accent bar, no new colour. */
const HERE = "shadow-[inset_2px_0_0_var(--accent)]";

function load(key: string): Saved | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function save(key: string, s: Saved) {
  try {
    window.localStorage.setItem(key, JSON.stringify(s));
  } catch {
    // Private window or storage blocked: the conversation just does not survive a reload.
  }
}

/** A menu group of topics, under an area or a phase. Hidden when it has none. */
function TopicGroup({ title, topics, onTopic }: { title: string; topics: Topic[]; onTopic: (t: Topic) => void }) {
  if (topics.length === 0) return null;
  return (
    <div>
      <p className="px-2 text-[13px] font-medium text-ink-muted">{title}</p>
      <ul className="mt-1">
        {topics.map((t) => (
          <li key={t.id}>
            <button type="button" onClick={() => onTopic(t)} className="w-full text-left px-2 py-2.5 xl:py-1 rounded-sm text-[13px] text-ink hover:bg-paper cursor-pointer">
              {t.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const noHits = (hits: SearchHits) => hits.topics.length === 0 && hits.provisions.length === 0;

function TopicCard({ topic, labels, current, onOpen }: { topic: Topic; labels: Record<string, { label: string; title: string }>; current: string | null; onOpen: (id: string) => void }) {
  const [all, setAll] = useState(false);
  const area = useOpslag().areas.find((a) => a.id === topic.area)?.title;
  const ids = all ? topic.provisions : topic.provisions.slice(0, SHOWN_PROVISIONS);
  const reasonId = useId();
  return (
    <div className="border border-line bg-paper rounded-sm">
      <div className="px-4 pt-3 pb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1 flex items-baseline gap-x-2 flex-wrap">
          <h3 className="text-[15px] font-medium text-ink">{topic.title}</h3>
          <span className="text-[13px] text-ink-faint">{area}</span>
        </div>
        {topic.status === "udkast" && (
          <span className="shrink-0 mt-0.5 text-[13px] text-ink-faint border border-line rounded-sm px-1.5" title="Emnet er ikke gennemgået af en fagperson endnu.">
            Udkast
          </span>
        )}
      </div>
      <p className="px-4 pb-3 text-[13px] text-ink-muted">{topic.summary}</p>
      <ul className="border-t border-line divide-y divide-line">
        {ids.map((id, i) => (
          <li key={id}>
            <button
              type="button"
              onClick={() => onOpen(id)}
              aria-current={id === current || undefined}
              aria-label={[labels[id] ? displayLabel(labels[id].label) : id, labels[id]?.title].filter(Boolean).join(", ")}
              aria-describedby={`${reasonId}-${i}`}
              className={`w-full text-left px-4 py-2.5 hover:bg-background cursor-pointer ${id === current ? HERE : ""}`}
            >
              <span className="font-mono text-[13px] text-ink">{labels[id] ? displayLabel(labels[id].label) : id}</span>
              {labels[id]?.title && <span className="text-[13px] text-ink"> · {labels[id].title}</span>}
              <span id={`${reasonId}-${i}`} className="block text-[13px] text-ink-muted">
                {topic.reasons[id]}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {topic.provisions.length > SHOWN_PROVISIONS && !all && (
        <button type="button" onClick={() => setAll(true)} className="w-full text-left px-4 py-2 border-t border-line text-[13px] text-ink-muted hover:text-ink cursor-pointer">
          Vis alle {topic.provisions.length} bestemmelser
        </button>
      )}
    </div>
  );
}

const PENDING_NOTE = "Søgningen i lovteksten indlæses stadig. Svaret opdateres, når den er klar.";

function ProvisionRow({ p, current, onOpen }: { p: SearchHits["provisions"][number]; current: string | null; onOpen: (id: string) => void }) {
  const id = useId();
  const excerptId = p.excerpt ? id : undefined;
  return (
    <button
      type="button"
      onClick={() => onOpen(p.id)}
      aria-current={p.id === current || undefined}
      aria-label={[p.label, p.title].filter(Boolean).join(", ")}
      aria-describedby={excerptId}
      className={`w-full text-left py-2 hover:bg-paper cursor-pointer ${p.id === current ? `${HERE} pl-2.5` : ""}`}
    >
      <span className="font-mono text-[13px] text-ink">{p.label}</span>
      {p.title && <span className="text-[13px] text-ink"> · {p.title}</span>}
      {p.excerpt && (
        <span id={excerptId} className="block text-[13px] text-ink-muted line-clamp-2">
          {p.excerpt}
        </span>
      )}
    </button>
  );
}

function Answer({ hits, partial, labels, current, onOpen }: { hits: SearchHits; partial?: boolean; labels: Record<string, { label: string; title: string }>; current: string | null; onOpen: (id: string) => void }) {
  const [all, setAll] = useState(false);
  const config = useOpslag();
  const topics = hits.topics.map((id) => config.topics.find((t) => t.id === id)).filter((t): t is Topic => !!t);
  // A rule code is a lookup: the rule itself comes before the topics that list it.
  const exact = hits.lookup ? hits.provisions[0] : undefined;
  const rest = exact ? hits.provisions.slice(1) : hits.provisions;
  const provisions = all ? rest : rest.slice(0, SHOWN_PROVISIONS);
  if (topics.length === 0 && hits.provisions.length === 0) {
    return <p className="text-[13px] text-ink-muted">{partial ? PENDING_NOTE : "Ingen træf. Prøv et andet ord, eller vælg et emne i menuen."}</p>;
  }
  return (
    <div className="space-y-3">
      {partial && <p className="text-[13px] text-ink-faint">{PENDING_NOTE}</p>}
      {exact && (
        <div>
          <p className="text-[13px] font-medium text-ink-muted mb-1.5">Bestemmelse</p>
          <div className="border-t border-b border-line">
            <ProvisionRow p={exact} current={current} onOpen={onOpen} />
          </div>
        </div>
      )}
      {topics.map((t) => (
        <TopicCard key={t.id} topic={t} labels={labels} current={current} onOpen={onOpen} />
      ))}
      {rest.length > 0 && (
        <div>
          <p className="text-[13px] font-medium text-ink-muted mb-1.5">{topics.length || exact ? "Også i lovteksten" : "Fundet i lovteksten"}</p>
          <ul className="divide-y divide-line border-t border-b border-line">
            {provisions.map((p) => (
              <li key={p.id}>
                <ProvisionRow p={p} current={current} onOpen={onOpen} />
              </li>
            ))}
          </ul>
          {rest.length > SHOWN_PROVISIONS && !all && (
            <button type="button" onClick={() => setAll(true)} className="mt-1.5 text-[13px] text-ink-muted hover:text-ink cursor-pointer">
              Vis {rest.length - SHOWN_PROVISIONS} flere
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AskBox({ value, onChange, onSubmit, autoFocus, placeholder }: { value: string; onChange: (v: string) => void; onSubmit: () => void; autoFocus?: boolean; placeholder: string }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      role="search"
      aria-label="Opslag"
      className="flex items-center gap-2 bg-paper border border-field rounded-sm pl-4 pr-1.5 py-1.5 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent"
    >
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label="Beskriv processen, eller søg efter en regel"
        className="flex-1 min-w-0 bg-transparent text-[16px] sm:text-[15px] text-ink placeholder:text-ink-faint focus:outline-none py-1"
      />
      <button type="submit" disabled={!value.trim()} aria-label="Send" className="p-2 rounded-sm bg-accent enabled:hover:bg-accent-hover text-white cursor-pointer disabled:bg-line disabled:text-ink-faint disabled:cursor-default">
        <ArrowUp size={16} />
      </button>
    </form>
  );
}

/** True from `px` wide and up; false on the server and the first render, so phones never flash the desktop shell. */
function useMinWidth(px: number): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const q = window.matchMedia(`(min-width: ${px}px)`);
    const update = () => setMatches(q.matches);
    update();
    q.addEventListener("change", update);
    return () => q.removeEventListener("change", update);
  }, [px]);
  return matches;
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** One line for screen readers when an answer arrives. */
function describeHits(hits: SearchHits, partial: boolean): string {
  if (hits.topics.length === 0 && hits.provisions.length === 0) return partial ? PENDING_NOTE : "Ingen træf.";
  const parts = [hits.topics.length ? count(hits.topics.length, "emne", "emner") : "", hits.provisions.length ? count(hits.provisions.length, "bestemmelse", "bestemmelser") : ""];
  return `${parts.filter(Boolean).join(" og ")} fundet.`;
}

export interface OpslagAppProps {
  config: OpslagConfig;
  /** Label and title for every id a topic lists, so answers render without a request per row. */
  labels: Record<string, { label: string; title: string }>;
  sources: SourceGroup[];
  /** Usage logging is configured on the host. */
  logging?: boolean;
}

/** The whole Opslag screen: menu, conversation, reading panel and reference popups. */
export function OpslagApp({ config, ...props }: OpslagAppProps) {
  return (
    <OpslagProvider value={config}>
      <Shell {...props} />
    </OpslagProvider>
  );
}

function Shell({ labels, sources, logging = false }: Omit<OpslagAppProps, "config">) {
  const config = useOpslag();
  const { client, search: s, storageKey } = config;
  const MENU_TABS = config.phases?.length ? ALL_TABS : ALL_TABS.filter(([k]) => k !== "faser");
  const [messages, setMessages] = useState<Message[]>([]);
  const [panel, setPanel] = useState<string[]>([]);
  const [popups, setPopups] = useState<PopupState[]>([]);
  const [menu, setMenu] = useState<MenuTab>("omraader");
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<MiniSearch<ProvisionDoc> | null>(null);
  const [indexFailed, setIndexFailed] = useState(false);
  const [restored, setRestored] = useState(false);
  const topicIndex = useMemo(() => s.buildTopicIndex(config.topics, config.areas), [s, config.topics, config.areas]);
  const nextId = useRef(1);
  // Answers to questions typed in this page load; a restored conversation never logs.
  const typedHere = useRef(new Set<number>());
  const lastQuestionRef = useRef<HTMLHeadingElement>(null);
  const [announcement, setAnnouncement] = useState("");
  const [panelFocus, setPanelFocus] = useState(0);
  // What "Ny samtale" cleared, kept for a few seconds so it can be undone.
  const [cleared, setCleared] = useState<Saved | null>(null);
  // Below 1280 px the menu is a drawer; below 1024 px the reading panel is a full-screen sheet.
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const lgUp = useMinWidth(1024);
  const xlUp = useMinWidth(1280);
  const drawer = !xlUp && menuOpen;
  const sheet = !lgUp && sheetOpen;
  const menuButton = useRef<HTMLButtonElement>(null);
  // Where focus was when the sheet opened, so closing it lands the reader back on the row they chose.
  const sheetReturn = useRef<HTMLElement | null>(null);
  // Scroll position per entry in the panel stack, so "Tilbage" returns to the same place.
  const scrollByDepth = useRef<number[]>([]);
  const panelRef = useRef(panel);
  panelRef.current = panel;
  const popupsRef = useRef(popups);
  popupsRef.current = popups;

  useEffect(() => {
    const saved = load(storageKey);
    if (saved) {
      setMessages(saved.messages);
      setPanel(saved.panel);
      if (saved.menu) setMenu(saved.menu);
      nextId.current = Math.max(0, ...saved.messages.map((m) => m.id)) + 1;
    }
    setRestored(true);
    client
      .index()
      .then((json) => setIndex(s.loadProvisionIndex(json)))
      .catch(() => setIndexFailed(true));
  }, [client, s, storageKey]);

  useEffect(() => {
    if (restored) save(storageKey, { messages, panel, menu });
  }, [messages, panel, menu, restored, storageKey]);

  // Questions asked before the index loaded get their law-text hits now.
  useEffect(() => {
    if (!index) return;
    setMessages((ms) =>
      ms.some((m) => m.kind === "a" && m.partial)
        ? ms.map((m) => (m.kind === "a" && m.partial && m.query ? { ...m, hits: s.search(m.query, topicIndex, index, 20), partial: false } : m))
        : ms
    );
  }, [index, topicIndex, s]);

  // A typed question still empty with the law-text index loaded is a search with no hits.
  useEffect(() => {
    if (!index) return;
    for (const m of messages) {
      if (m.kind === "a" && !m.partial && m.query && typedHere.current.has(m.id) && noHits(m.hits)) {
        typedHere.current.delete(m.id);
        logNoHits(client, logging, m.query);
      }
    }
  }, [messages, logging, index, client]);

  useEffect(() => {
    // The newest question at the top, so its answer reads from the start.
    lastQuestionRef.current?.scrollIntoView({ block: "start" });
  }, [messages]);

  const post = useCallback((text: string, hits: SearchHits, partial = false, typed = false) => {
    const q = nextId.current++;
    const a = nextId.current++;
    if (typed) typedHere.current.add(a);
    setMessages((m) => [...m, { id: q, kind: "q", text }, { id: a, kind: "a", hits, query: text, partial }]);
    setAnnouncement(describeHits(hits, partial));
  }, []);

  const ask = () => {
    const text = query.trim();
    if (!text) return;
    post(text, s.search(text, topicIndex, index, 20), !index && !indexFailed, true);
    setQuery("");
  };

  const showTopic = (t: Topic) => {
    if (menuOpen) closeMenu();
    post(t.title, { topics: [t.id], provisions: [] });
  };

  const openPanel = useCallback((id: string) => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && !active.closest("[data-guide-reader], [data-guide-popup]")) sheetReturn.current = active;
    setMenuOpen(false);
    setSheetOpen(true);
    setPopups([]);
    const p = panelRef.current;
    if (p[p.length - 1] !== id) {
      scrollByDepth.current[p.length] = 0;
      setPanel([...p, id]);
    }
    setPanelFocus((n) => n + 1);
  }, []);

  const closeSheet = () => {
    setSheetOpen(false);
    setPopups([]);
    // After the next paint, when the chat is no longer inert.
    requestAnimationFrame(() => sheetReturn.current?.focus());
  };

  const closeMenu = () => {
    setMenuOpen(false);
    requestAnimationFrame(() => menuButton.current?.focus());
  };

  // The drawer takes focus on its open tab.
  useEffect(() => {
    if (drawer) document.getElementById(`guide-tab-${menu}`)?.focus();
    // Only when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawer]);

  // Esc closes the drawer, then the sheet. Popups handle their own Esc first.
  useEffect(() => {
    if (!drawer && !sheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || popupsRef.current.length > 0) return;
      if (drawer) closeMenu();
      else closeSheet();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const back = () => {
    setPanel((p) => p.slice(0, -1));
    setPanelFocus((n) => n + 1);
  };

  const linkFrom = (level: number) => (link: OpslagLink, source: HTMLElement) => {
    const rect = source.getBoundingClientRect();
    setPopups((ps) => {
      const kept = ps.slice(0, Math.min(level, MAX_POPUPS - 1));
      const next: PopupState = { id: link.to, text: "", place: placePopup(rect, kept[kept.length - 1]?.place.left), source };
      return [...kept, next];
    });
  };

  /** Close the popup at `level` and every one above it, and hand focus back to the reference that opened it. */
  const closeFrom = useCallback((level: number) => {
    const source = popupsRef.current[level]?.source;
    setPopups((ps) => ps.slice(0, level));
    source?.focus();
  }, []);

  // Esc closes the top popup; a click outside every popup closes them all, and does only that.
  useEffect(() => {
    if (popups.length === 0) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeFrom(popupsRef.current.length - 1);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (t?.closest("[data-guide-popup]") || t?.closest("[data-guide-link]")) return;
      setPopups([]);
      // Swallow the click this press turns into, so dismissing never also opens what was under the pointer.
      const swallow = (ev: MouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
      };
      document.addEventListener("click", swallow, { capture: true, once: true });
      document.addEventListener("mouseup", () => setTimeout(() => document.removeEventListener("click", swallow, { capture: true }), 0), { once: true });
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [popups.length, closeFrom]);

  // The first popup follows its reference when the text under it scrolls, and closes once the
  // reference leaves its scroll area. Nested popups sit beside a fixed popup and stay put.
  useEffect(() => {
    if (popups.length === 0) return;
    const onScroll = (e: Event) => {
      const area = e.target;
      const source = popupsRef.current[0]?.source;
      if (!(area instanceof Element) || !source || !area.contains(source) || area.closest("[data-guide-popup]")) return;
      const rect = source.getBoundingClientRect();
      const box = area.getBoundingClientRect();
      if (rect.bottom < box.top || rect.top > box.bottom) {
        setPopups([]);
        source.focus({ preventScroll: true });
        return;
      }
      setPopups((ps) => (ps.length ? [{ ...ps[0], place: placePopup(rect) }, ...ps.slice(1)] : ps));
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, [popups.length]);

  const current = panel[panel.length - 1] ?? null;
  const currentInstrument = current?.split("/")[0] ?? null;
  const [trailLabels, setTrailLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    const ids = [current, ...popups.map((p) => p.id)].filter((x): x is string => !!x && !trailLabels[x]);
    if (ids.length === 0) return;
    Promise.all(ids.map((id) => fetchNode(client, id).then((n) => [id, displayLabel(n.label, n.instrument.code)] as const).catch(() => [id, id] as const))).then(
      (pairs) => live && setTrailLabels((t) => ({ ...t, ...Object.fromEntries(pairs) }))
    );
    return () => {
      live = false;
    };
  }, [client, current, popups, trailLabels]);
  const trail = [current, ...popups.map((p) => p.id)].filter((x): x is string => !!x).map((id) => trailLabels[id] ?? "...");

  useEffect(() => {
    if (!cleared) return;
    const t = setTimeout(() => setCleared(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [cleared]);

  const clearConversation = () => {
    setCleared({ messages, panel });
    setSheetOpen(false);
    setMessages([]);
    setPanel([]);
    setPopups([]);
    setAnnouncement("Samtalen er ryddet.");
  };

  const undoClear = () => {
    if (!cleared) return;
    scrollByDepth.current = [];
    setMessages(cleared.messages);
    setPanel(cleared.panel);
    setCleared(null);
    setAnnouncement("Samtalen er gendannet.");
  };

  const empty = restored && messages.length === 0;
  const indexStatus = indexFailed ? "Søgning i lovteksten er ikke tilgængelig lige nu. Emnerne virker." : index ? "" : "Indlæser søgning i lovteksten ...";
  const lastQuestionId = [...messages].reverse().find((m) => m.kind === "q")?.id;

  return (
    <>
      <div className="flex h-dvh bg-background text-ink">
        {drawer && <div aria-hidden className="xl:hidden fixed inset-0 z-30 bg-ink/20" onClick={closeMenu} />}
        <aside
          id="guide-menu"
          aria-label="Menu"
          inert={sheet || undefined}
          className={`${drawer ? "fixed inset-y-0 left-0 z-40 flex w-[min(20rem,85vw)] bg-background shadow-[4px_0_16px_rgba(28,27,26,0.10)] sheet-in" : "hidden"} xl:static xl:z-auto xl:flex xl:w-72 xl:shadow-none shrink-0 border-r border-line flex-col min-h-0`}
        >
          <div className="px-5 pt-5 pb-3 border-b border-wood">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[15px] font-medium">{config.appName}</p>
              {config.aboutHref && (
                <a href={config.aboutHref} className="ml-auto text-[13px] text-ink-muted hover:text-ink">
                  Om
                </a>
              )}
              <button type="button" onClick={closeMenu} aria-label="Luk menu" className="xl:hidden p-2 -my-2 -mr-2 text-ink-faint hover:text-ink cursor-pointer">
                <X size={16} />
              </button>
            </div>
            <div role="tablist" aria-label="Menu" className="mt-3 flex gap-1 text-[13px]">
              {MENU_TABS.map(([key, label], i) => (
                <button
                  key={key}
                  id={`guide-tab-${key}`}
                  role="tab"
                  aria-selected={menu === key}
                  aria-controls="guide-menu-panel"
                  tabIndex={menu === key ? 0 : -1}
                  type="button"
                  onClick={() => setMenu(key)}
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                    const step = e.key === "ArrowRight" ? 1 : MENU_TABS.length - 1;
                    const [other] = MENU_TABS[(i + step) % MENU_TABS.length];
                    setMenu(other);
                    document.getElementById(`guide-tab-${other}`)?.focus();
                  }}
                  className={`px-3 py-2 xl:px-2.5 xl:py-1 rounded-sm cursor-pointer ${menu === key ? "bg-accent-soft text-accent font-medium" : "text-ink-muted hover:text-ink"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <nav id="guide-menu-panel" role="tabpanel" aria-labelledby={`guide-tab-${menu}`} className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
            {menu === "omraader" &&
              config.areas.map((a) => <TopicGroup key={a.id} title={a.title} topics={config.topics.filter((t) => t.area === a.id)} onTopic={showTopic} />)}
            {menu === "faser" &&
              config.phases?.map((p) => <TopicGroup key={p.id} title={p.title} topics={config.topics.filter((t) => t.phase.includes(p.id))} onTopic={showTopic} />)}
            {menu === "kilder" &&
              sources.map((g) => (
                <div key={g.title}>
                  <p className="px-2 text-[13px] font-medium text-ink-muted">{g.title}</p>
                  <ul className="mt-1">
                    {g.instruments.map((i) => (
                      <li key={i.id}>
                        <button type="button" onClick={() => openPanel(i.id)} aria-current={i.id === currentInstrument || undefined} className={`w-full text-left px-2 py-2 xl:py-1 rounded-sm hover:bg-paper cursor-pointer ${i.id === currentInstrument ? HERE : ""}`}>
                          <span className="block text-[13px] text-ink">{i.title}</span>
                          <span className="block font-mono text-[13px] text-ink-faint">{i.code}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </nav>
        </aside>

        <main inert={drawer || sheet || undefined} className="flex-1 min-w-0 xl:min-w-[420px] flex flex-col min-h-0">
          <div className="xl:hidden flex items-center gap-1 px-2 sm:px-4 py-1.5 border-b border-wood">
            <button
              ref={menuButton}
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Menu"
              aria-expanded={drawer}
              aria-controls="guide-menu"
              className="p-2.5 text-ink-muted hover:text-ink cursor-pointer"
            >
              <Menu size={18} />
            </button>
            <p className="text-[15px] font-medium">{config.appName}</p>
            {current && (
              <button type="button" onClick={() => setSheetOpen(true)} className="lg:hidden ml-auto px-2.5 py-2 text-[13px] font-medium text-accent hover:text-accent-hover cursor-pointer">
                Til reglen
              </button>
            )}
            {config.aboutHref && (
              <a href={config.aboutHref} className={`${current ? "lg:ml-auto" : "ml-auto"} px-2.5 py-2 text-[13px] text-ink-muted hover:text-ink`}>
                Om
              </a>
            )}
          </div>
          {empty ? (
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col px-5 sm:px-10">
              <div className="m-auto w-full max-w-xl space-y-5 py-8">
                <div>
                  <h1 className="text-[28px] leading-tight font-medium tracking-tight">Hvad arbejder du med?</h1>
                  <p className="mt-1 text-[13px] text-ink-muted">Beskriv processen eller projektet med dine egne ord, eller vælg et emne.</p>
                </div>
                <div>
                  <AskBox value={query} onChange={setQuery} onSubmit={ask} autoFocus placeholder={config.placeholders.start} />
                  <p role="status" className="mt-1.5 min-h-5 text-[13px] text-ink-faint">
                    {indexStatus}
                  </p>
                  {logging && config.logNotice}
                  {cleared && (
                    <p className="mt-1 text-[13px] text-ink-muted">
                      Samtalen er ryddet.{" "}
                      <button type="button" onClick={undoClear} className="font-medium text-accent hover:text-accent-hover underline underline-offset-2 cursor-pointer">
                        Fortryd
                      </button>
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {config.suggested.map((id) => {
                    const t = config.topics.find((x) => x.id === id);
                    return (
                      t &&
                      <button key={id} type="button" onClick={() => showTopic(t)} className="px-3 py-1.5 rounded-sm border border-line-strong bg-paper text-[13px] text-ink hover:border-ink cursor-pointer">
                        {t.title}
                      </button>
                    );
                  })}
                </div>
                <div className="border-t border-wood pt-4">
                  <p className="text-[13px] font-medium text-ink-muted mb-2">Sådan virker det</p>
                  {config.howItWorks}
                </div>
              </div>
            </div>
          ) : (
            <>
              <h1 className="sr-only">Opslag</h1>
              <div className="px-4 sm:px-8 py-2 sm:py-3 border-b border-line flex items-center gap-3">
                <p role="status" className="text-[13px] text-ink-muted">
                  {indexStatus}
                </p>
                <button
                  type="button"
                  onClick={clearConversation}
                  className="ml-auto px-2.5 py-1.5 rounded-sm text-[13px] text-ink-muted hover:text-ink cursor-pointer"
                >
                  Ny samtale
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <div className="max-w-2xl mx-auto px-4 sm:px-8 py-5 sm:py-6 space-y-5">
                  <details className="group text-[13px]" data-guide-help>
                    <summary className="w-fit cursor-pointer text-ink-muted hover:text-ink">Sådan virker det</summary>
                    <div className="mt-2 border-l border-wood pl-3">
                      {config.howItWorks}
                    </div>
                  </details>
                  {messages.map((m) =>
                    m.kind === "q" ? (
                      <h2 key={m.id} ref={m.id === lastQuestionId ? lastQuestionRef : undefined} className="scroll-mt-6 ml-auto w-fit max-w-[80%] bg-accent-soft text-ink text-[15px] font-normal rounded-sm px-3 py-2">
                        {m.text}
                      </h2>
                    ) : (
                      <Answer key={m.id} hits={m.hits} partial={m.partial} labels={labels} current={current} onOpen={openPanel} />
                    )
                  )}
                </div>
              </div>
              <div className="px-4 sm:px-8 pb-4 sm:pb-6 pt-2">
                <div className="max-w-2xl mx-auto">
                  {/* Mounts when the start screen gives way, so focus is not lost with the first ask box. */}
                  <AskBox value={query} onChange={setQuery} onSubmit={ask} autoFocus placeholder={config.placeholders.followUp} />
                  {config.legend}
                  {logging && config.logNotice}
                </div>
              </div>
            </>
          )}
        </main>

        <section
          aria-label="Læsepanel"
          data-guide-reader
          inert={drawer || undefined}
          className={`${sheet ? "fixed inset-0 z-30 flex sheet-in" : "hidden"} lg:static lg:z-auto lg:flex lg:w-[44%] lg:max-w-[760px] shrink-0 lg:border-l border-line bg-paper min-h-0 flex-col`}
        >
          <div className="lg:hidden flex items-center px-2 py-1.5 border-b border-line">
            <button type="button" onClick={closeSheet} className="px-2.5 py-2 text-[13px] text-ink-muted hover:text-ink inline-flex items-center gap-1 cursor-pointer">
              <ArrowLeft size={14} /> Til samtalen
            </button>
          </div>
          <div className="flex-1 min-h-0">
          <Panel
            id={current}
            canGoBack={panel.length > 1}
            onBack={back}
            onOpen={openPanel}
            onLink={linkFrom(0)}
            focusRequest={panelFocus}
            restoreScroll={scrollByDepth.current[panel.length - 1] ?? 0}
            onScroll={(top) => {
              scrollByDepth.current[panel.length - 1] = top;
            }}
            logging={logging}
          />
          </div>
        </section>

        {popups.map((p, i) => (
          <Popup
            key={`${i}-${p.id}`}
            popup={p}
            trail={trail.slice(0, i + 2)}
            isTop={i === popups.length - 1}
            atMaxDepth={i === MAX_POPUPS - 1}
            openElsewhere={p.id === current ? "panel" : popups.slice(0, i).some((q) => q.id === p.id) ? "popup" : null}
            onLink={linkFrom(i + 1)}
            onOpen={openPanel}
            onClose={() => closeFrom(i)}
            logging={logging}
          />
        ))}
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </div>
    </>
  );
}
