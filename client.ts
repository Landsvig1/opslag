import type { OpslagNode } from "./contract";
import type { UsageEvent } from "./usageEvents";

/** How the UI reaches its host. `httpClient` covers the usual case; tests and other hosts can pass their own. */
export interface OpslagClient {
  /** The serialised provision index. */
  index(): Promise<string>;
  /** Rejects with a message fit to show the reader. */
  node(id: string): Promise<OpslagNode>;
  /** Fire and forget; never throws. */
  log(event: UsageEvent): void;
}

const OFFLINE = "Bestemmelsen kunne ikke hentes. Tjek forbindelsen, og prøv igen.";

/** `GET <base>/index`, `GET <base>/node?id=`, `POST <base>/log`. */
export function httpClient(base: string): OpslagClient {
  return {
    index: () => fetch(`${base}/index`).then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status))))),
    node: (id) =>
      fetch(`${base}/node?id=${encodeURIComponent(id)}`)
        .catch(() => {
          // The browser's own message ("Failed to fetch") means nothing to a reader.
          throw new Error(OFFLINE);
        })
        .then(async (r) => {
          if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Kunne ikke hente bestemmelsen.");
          return (await r.json()) as OpslagNode;
        }),
    log: (event) => {
      try {
        fetch(`${base}/log`, { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify(event) }).catch(() => {});
      } catch {
        // Logging never gets in the reader's way.
      }
    },
  };
}
