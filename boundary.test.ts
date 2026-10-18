import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** What a host has to install to copy src/opslag/ as it is. */
const PACKAGES = new Set(["react", "minisearch", "lucide-react", "vitest", "node:fs", "node:path", "@testing-library/react"]);

describe("src/opslag is self-contained", () => {
  it("imports only its own files and the listed packages", () => {
    const dir = __dirname;
    const outside: string[] = [];
    for (const f of readdirSync(dir).filter((x) => /\.tsx?$/.test(x))) {
      const src = readFileSync(join(dir, f), "utf8");
      for (const [, spec] of src.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)) {
        if (spec.startsWith("./") && !spec.slice(2).includes("/")) continue;
        if (PACKAGES.has(spec)) continue;
        outside.push(`${f}: ${spec}`);
      }
    }
    expect(outside).toEqual([]);
  });
});
