import { describe, expect, it } from "vitest";
import { normalizeQuery, parseUsageEvent } from "./usageEvents";

describe("usage event query normalisation (decision 0023)", () => {
  it("trims, collapses whitespace and lower-cases, keeping rule codes, act numbers and §", () => {
    expect(normalizeQuery("  LBK 570/2025   §\t200 \n")).toBe("lbk 570/2025 § 200");
    expect(normalizeQuery("ADR.OR.B.040 Ændring")).toBe("adr.or.b.040 ændring");
  });

  it("replaces e-mail addresses and CPR-shaped numbers", () => {
    expect(normalizeQuery("Skriv til Jens.Hansen@cph.dk om kran")).toBe("skriv til [e-mail] om kran");
    expect(normalizeQuery("cpr 010190-1234 og 0101901234")).toBe("cpr [cpr] og [cpr]");
    // Not CPR-shaped: no valid day and month, or too short.
    expect(normalizeQuery("sag 999999-1234 og 570/2025")).toBe("sag 999999-1234 og 570/2025");
  });

  it("cuts at 200 characters", () => {
    expect(normalizeQuery("a".repeat(500))).toHaveLength(200);
  });
});

describe("usage event shape", () => {
  it("accepts the two events and nothing else", () => {
    expect(parseUsageEvent({ kind: "search_no_hits", query: " Kran " })).toEqual({ kind: "search_no_hits", query: "kran" });
    expect(parseUsageEvent({ kind: "ref_unresolved", provisionId: "eu-1178-2011/FCL.800", spans: ["SFCL.200", "SFCL.200"] })).toEqual({
      kind: "ref_unresolved",
      provisionId: "eu-1178-2011/FCL.800",
      spans: ["SFCL.200"],
    });
    for (const bad of [
      null,
      [],
      "kran",
      { kind: "search_no_hits" },
      { kind: "search_no_hits", query: "   " },
      { kind: "search_no_hits", query: 5 },
      { kind: "search_no_hits", query: "kran", ip: "1.2.3.4" },
      { kind: "page_view", query: "kran" },
      { kind: "ref_unresolved", provisionId: "x", spans: [] },
      { kind: "ref_unresolved", provisionId: "x", spans: Array.from({ length: 21 }, (_, i) => `s${i}`) },
      { kind: "ref_unresolved", provisionId: "x", spans: ["a".repeat(201)] },
      { kind: "ref_unresolved", provisionId: "x".repeat(121), spans: ["a"] },
      { kind: "ref_unresolved", provisionId: "x", spans: ["a"], query: "kran" },
    ]) {
      expect(parseUsageEvent(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});
