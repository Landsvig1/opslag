/**
 * Display forms of provision and container labels. A graph that names positional sections by
 * slug ("LBK 570/2025 afsnit-III", "EU 2018/1139 kap-III-afd-IV") reads as "Afsnit III" and
 * "Kapitel III, afdeling IV". Display only: ids and the graph's own labels are unchanged.
 */

const PARTS: Record<string, string> = { afsnit: "afsnit", kap: "kapitel", afd: "afdeling", del: "del", bilag: "bilag", tit: "titel" };
const NUMERAL = "(?:[0-9]+[a-z]?|[IVXLC]+)";
const SLUG_RE = new RegExp(`^[a-z]+-${NUMERAL}(?:-[a-z]+-${NUMERAL})*$`);

function pairs(slug: string): Array<[string, string]> | null {
  if (!SLUG_RE.test(slug)) return null;
  const bits = slug.split("-");
  const out: Array<[string, string]> = [];
  for (let i = 0; i < bits.length; i += 2) {
    if (!PARTS[bits[i]]) return null;
    out.push([bits[i], bits[i + 1]]);
  }
  return out;
}

function humanize(slug: string): string {
  const p = pairs(slug);
  if (!p) return slug;
  const text = p.map(([k, n]) => `${PARTS[k]} ${n}`).join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The label as a reader should see it. With `code`, the instrument code is dropped when the label starts with it. */
export function displayLabel(label: string, code?: string): string {
  const rest = code && label.startsWith(`${code} `) ? label.slice(code.length + 1) : label;
  const at = rest.lastIndexOf(" ");
  const head = at < 0 ? "" : rest.slice(0, at + 1);
  return head + humanize(rest.slice(at + 1));
}

function romanValue(s: string): number {
  const v: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const cur = v[s[i]];
    total += cur < (v[s[i + 1]] ?? 0) ? -cur : cur;
  }
  return total;
}

/** Numbering of a section label ("afsnit-III" is [3]), or null for anything that is not a positional section. */
export function sectionOrder(label: string): number[] | null {
  const p = pairs(label.slice(label.lastIndexOf(" ") + 1));
  return p ? p.map(([, n]) => (/^[IVXLC]+$/.test(n) ? romanValue(n) : parseInt(n, 10))) : null;
}

/** Sections in their numbered order when every item is a positional section; anything else keeps the order it came in. */
export function inSectionOrder<T extends { label: string }>(items: T[]): T[] {
  const keys = items.map((i) => sectionOrder(i.label));
  if (keys.some((k) => !k)) return items;
  const cmp = (a: number[], b: number[]) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
    return 0;
  };
  return items.map((item, i) => ({ item, key: keys[i]! })).sort((a, b) => cmp(a.key, b.key)).map((x) => x.item);
}
