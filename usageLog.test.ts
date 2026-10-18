import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "./client";
import { logNoHits as logNoHitsTo, logUnresolved as logUnresolvedTo, resetUsageLog } from "./usageLog";

const client = httpClient("/api/guide");
const logNoHits = (logging: boolean, text: string) => logNoHitsTo(client, logging, text);
const logUnresolved = (logging: boolean, id: string, spans: string[]) => logUnresolvedTo(client, logging, id, spans);

describe("client usage log (decision 0023)", () => {
  const fetchSpy = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
  const bodies = () => (fetchSpy.mock.calls as unknown as Array<[string, RequestInit]>).map(([, init]) => JSON.parse(init.body as string));
  beforeEach(() => {
    resetUsageLog();
    fetchSpy.mockClear();
    vi.stubGlobal("fetch", fetchSpy);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends a no-hit query once per normalised query per page load, with keepalive", () => {
    logNoHits(true, "Kran ved banen");
    logNoHits(true, "  kran   VED banen ");
    logNoHits(true, "fugle");
    expect(bodies()).toEqual([
      { kind: "search_no_hits", query: "kran ved banen" },
      { kind: "search_no_hits", query: "fugle" },
    ]);
    const [url, init] = (fetchSpy.mock.calls as unknown as Array<[string, RequestInit]>)[0];
    expect(url).toBe("/api/guide/log");
    expect(init).toMatchObject({ method: "POST", keepalive: true });
  });

  it("sends each (provision, span) once per page load, in batches of at most 20", () => {
    logUnresolved(true, "a/1", ["X.1", "X.2", "X.1"]);
    logUnresolved(true, "a/1", ["X.2", "X.3"]);
    logUnresolved(true, "b/1", ["X.1"]);
    expect(bodies()).toEqual([
      { kind: "ref_unresolved", provisionId: "a/1", spans: ["X.1", "X.2"] },
      { kind: "ref_unresolved", provisionId: "a/1", spans: ["X.3"] },
      { kind: "ref_unresolved", provisionId: "b/1", spans: ["X.1"] },
    ]);
    fetchSpy.mockClear();
    logUnresolved(true, "c/1", Array.from({ length: 25 }, (_, i) => `S.${i}`));
    expect(bodies().map((b) => b.spans.length)).toEqual([20, 5]);
  });

  it("sends nothing when logging is off, and swallows a failed request", async () => {
    logNoHits(false, "kran");
    logUnresolved(false, "a/1", ["X.1"]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockImplementationOnce(() => Promise.reject(new Error("offline")));
    expect(() => logNoHits(true, "kran")).not.toThrow();
    await Promise.resolve();
  });
});
