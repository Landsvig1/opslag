"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { OpslagClient } from "./client";
import type { OpslagGroup, OpslagNode, OpslagTopic } from "./contract";
import type { OpslagSearch } from "./search";

/**
 * Everything a host decides: where the data comes from, its topics and search hooks, and the
 * corpus-specific text. The UI's own wording is Danish and stays in the components.
 */
export interface OpslagConfig {
  /** Shown in the menu header and the phone bar: "Aerolex Opslag". */
  appName: string;
  /** "Om" link; the log notice links to its `#data`. Omitted: no link. */
  aboutHref?: string;
  /** localStorage key for the saved conversation. */
  storageKey: string;
  /** A stable object (module level), since the node cache is kept per client. */
  client: OpslagClient;
  search: OpslagSearch;
  topics: OpslagTopic[];
  areas: OpslagGroup[];
  /** The "Faser" menu tab; omitted or empty means no tab. */
  phases?: OpslagGroup[];
  /** Topic ids offered as chips on the start screen. */
  suggested: string[];
  placeholders: { start: string; followUp: string };
  /** The "Sådan virker det" help, on the start screen and folded in the conversation. */
  howItWorks: ReactNode;
  /** One line under the ask box in the conversation. */
  legend?: ReactNode;
  /** Shown under the ask box only when logging is on. */
  logNotice?: ReactNode;
  /** Danish acts and orders: a § has no heading, its title is its opening words, "Stk. 1." is added. */
  isDanish: (instrumentId: string) => boolean;
  /** Sections under a node in the reading panel (caselaw, guidance); the popup shows none. */
  renderExtras?: (node: OpslagNode, onOpen: (id: string) => void) => ReactNode;
}

const OpslagContext = createContext<OpslagConfig | null>(null);

export const OpslagProvider = OpslagContext.Provider;

export function useOpslag(): OpslagConfig {
  const c = useContext(OpslagContext);
  if (!c) throw new Error("Opslag components need an <OpslagProvider>.");
  return c;
}
