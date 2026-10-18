"use client";

import { useEffect, useState } from "react";
import type { OpslagClient } from "./client";
import type { OpslagNode } from "./contract";
import { useOpslag } from "./config";

const caches = new WeakMap<OpslagClient, Map<string, Promise<OpslagNode>>>();

/** One request per id per client; a failed request is forgotten so a retry asks again. */
export function fetchNode(client: OpslagClient, id: string): Promise<OpslagNode> {
  let cache = caches.get(client);
  if (!cache) caches.set(client, (cache = new Map()));
  let p = cache.get(id);
  if (!p) {
    p = client.node(id);
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}

export function useNode(id: string | null): { node: OpslagNode | null; error: string | null; retry: () => void } {
  const { client } = useOpslag();
  const [state, setState] = useState<{ id: string | null; node: OpslagNode | null; error: string | null }>({ id: null, node: null, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!id) return;
    setState({ id, node: null, error: null });
    let live = true;
    fetchNode(client, id).then(
      (node) => live && setState({ id, node, error: null }),
      (e: Error) => live && setState({ id, node: null, error: e.message })
    );
    return () => {
      live = false;
    };
  }, [client, id, attempt]);
  const retry = () => setAttempt((n) => n + 1);
  return state.id === id ? { node: state.node, error: state.error, retry } : { node: null, error: null, retry };
}
