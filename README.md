# Opslag

A chat-styled lookup for legal texts: a reader types a process in their own words or picks a curated topic, gets the provisions that apply, reads one in a side panel, and follows its references in popups. No LLM. It has no corpus of its own: a host serves the data through two endpoints and passes a config object.

Extracted from Aerolex (EASA and Danish aviation law). UI wording is Danish.

## Use it in a project

It is a source folder, not a package. Copy it into the host, for example as `src/opslag/`:

```bash
git subtree add --prefix src/opslag https://github.com/Landsvig1/opslag.git main --squash
# later
git subtree pull --prefix src/opslag https://github.com/Landsvig1/opslag.git main --squash
```

Or clone and copy the files. It imports nothing outside itself except `react` (19), `minisearch` (7) and `lucide-react`; `boundary.test.ts` fails otherwise. The tests run under Vitest with `@testing-library/react` and jsdom.

Styling is Tailwind CSS 4 utility classes on named tokens. Import `opslag.css` once after `@import "tailwindcss";` in the host's global CSS (or define the same token names yourself). Tailwind 4 finds the classes by scanning the folder.

## What the host serves

`httpClient(base)` in `client.ts` expects:

- `GET <base>/index`: a MiniSearch index of `ProvisionDoc` (`contract.ts`), serialised with `JSON.stringify`, built with `createSearch(hooks).indexOptions`. Server and browser must use the same hooks, so create the search object once in a module both import.
- `GET <base>/node?id=`: an `OpslagNode`. A provision has `body`, `links` (character spans in `body` that open a provision or an instrument card) and `unresolved` (spans that read as references but lead nowhere). A container (an instrument, chapter or section) has `children`. Both have `path` from the instrument root. On an error, JSON `{ "error": "<message for the reader>" }`.
- `POST <base>/log`, only when `logging` is on: one `UsageEvent` (`usageEvents.ts`): a search with no hits, or unresolved references shown. The host decides where it goes; `parseUsageEvent` validates the body.

The link spans are the real work on the host side: offsets into `body` for every reference the host's citation scan resolved. If the graph only stores which provision cites which, the host needs a scan that records where in the text each reference stands.

Ids are opaque to the UI except that the instrument is the part before the first `/` (`lbk-570-2025/§-57`), which marks the open instrument under »Kilder«.

## What the host configures

`OpslagConfig` (`config.ts`), passed to `<OpslagApp config labels sources logging />`:

```tsx
"use client";
import { httpClient } from "@/opslag/client";
import { OpslagApp } from "@/opslag/OpslagApp";
import type { OpslagConfig } from "@/opslag/config";
import type { SourceGroup } from "@/opslag/contract";
import { mySearch } from "@/lib/search"; // createSearch({ codes, lookup }), shared with the /index route

const CONFIG: OpslagConfig = {
  appName: "Lexgraph Opslag",
  aboutHref: "/about",
  storageKey: "lexgraph.opslag.v1",
  client: httpClient("/api/opslag"),     // module level: the node cache is kept per client
  search: mySearch,
  topics: TOPICS,                          // OpslagTopic[]: id, title, summary, area, phase, provisions, reasons, synonyms, status
  areas: AREAS,                            // { id, title }[]
  phases: PHASES,                          // optional; adds the "Faser" tab
  suggested: ["landingspligt", "logbog"],  // topic ids shown as chips on the start screen
  placeholders: { start: "F.eks. ...", followUp: "Spørg om en proces eller en regel" },
  howItWorks: <HowItWorks />,
  legend: <Legend />,                      // optional
  logNotice: <LogNotice />,                // optional, shown when logging is on
  isDanish: (id) => /^(?:lbk|bek)-/.test(id), // Danish §: no heading, "Stk. 1." added
  renderExtras: (node, onOpen) => null,    // optional sections under a provision, e.g. caselaw
};

export function Lookup(props: { labels: Record<string, { label: string; title: string }>; sources: SourceGroup[] }) {
  return <OpslagApp config={CONFIG} {...props} />;
}
```

- `labels`: label and title for every id a topic lists, so answers render without a request per row.
- `sources`: the »Kilder« menu, instruments grouped by legal form in precedence order.
- `createSearch({ codes, lookup, stopwords })` (`search.ts`): `codes(text)` returns whole codes in a text (EASA rule codes in Aerolex) so they index and match as one token; `lookup(query)` returns the provision id a query names with its act ("fiskerilovens § 55"), or null.

## Files

| File | What |
| --- | --- |
| `OpslagApp.tsx` | The screen: menu, conversation, reading panel, popups |
| `Reader.tsx` | Reading panel, reference popups and their placement |
| `LinkedText.tsx` | A provision body with its reference spans as buttons |
| `contract.ts` | What the host serves |
| `config.ts` | What the host configures |
| `client.ts` | HTTP client for the endpoints |
| `search.ts` | Topic and provision search |
| `nodeCache.ts` | One request per node |
| `labels.ts` | "kap-III-afd-IV" read as "Kapitel III, afdeling IV" |
| `usageEvents.ts`, `usageLog.ts` | The two usage events, normalised and sent once per page load |
| `opslag.css` | Design tokens and the sheet animation |

## License

MIT
