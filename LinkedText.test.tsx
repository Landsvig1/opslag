import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { LinkedText, bodyStart, headingOf, stkLead } from "./LinkedText";

const BODY = "a) Enhver ændring:\n\n1)\n\nder berører certifikatet, eller\n\nkræver godkendelse jf. ADR.AR.C.040.\n\nb) Andre ændringer.";

describe("LinkedText", () => {
  it("renders blank-line paragraphs as blocks, not empty lines", () => {
    const { container } = render(<LinkedText text={BODY} links={[]} onLink={vi.fn()} />);
    const blocks = [...container.querySelectorAll(":scope > span")].map((s) => s.textContent);
    expect(blocks).toEqual(["a) Enhver ændring:", "1) der berører certifikatet, eller", "kræver godkendelse jf. ADR.AR.C.040.", "b) Andre ændringer."]);
    expect(container.textContent).not.toContain("\n\n");
  });

  it("gives list items a hanging indent and plain paragraphs none", () => {
    const { container } = render(<LinkedText text={BODY} links={[]} onLink={vi.fn()} />);
    const indented = [...container.querySelectorAll(":scope > span")].map((s) => s.className.includes("-indent-"));
    expect(indented).toEqual([true, true, false, true]);
  });

  it("keeps links in their paragraph and appends the suffix to the last one", () => {
    const start = BODY.indexOf("ADR.AR.C.040");
    const link = { start, end: start + "ADR.AR.C.040".length, kind: "provision" as const, to: "eu-139-2014/ADR.AR.C.040" };
    const { container } = render(<LinkedText text={BODY} links={[link]} to={link.end + 1} suffix=" ..." onLink={vi.fn()} />);
    const blocks = [...container.querySelectorAll(":scope > span")];
    expect(blocks.at(-1)!.querySelector("button")!.textContent).toBe("ADR.AR.C.040");
    expect(blocks.at(-1)!.textContent).toBe("kræver godkendelse jf. ADR.AR.C.040. ...");
  });

  it("shows an unresolved reference as dotted text titled Ikke i korpus, not as a button", () => {
    const text = "Se IS.D.OR.230 og ADR.AR.C.040.";
    const start = text.indexOf("ADR.AR.C.040");
    const link = { start, end: start + 12, kind: "provision" as const, to: "eu-139-2014/ADR.AR.C.040" };
    const u = { start: text.indexOf("IS.D.OR.230"), end: text.indexOf("IS.D.OR.230") + 11 };
    const { container } = render(<LinkedText text={text} links={[link]} unresolved={[u]} onLink={vi.fn()} />);
    const dead = container.querySelector("[data-guide-unresolved]")!;
    expect(dead.getAttribute("title")).toBe("Ikke i korpus");
    expect(dead.textContent).toBe("IS.D.OR.230 (ikke i korpus)");
    expect(dead.closest("button")).toBeNull();
    expect([...container.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["ADR.AR.C.040"]);
  });

  it("opens the first paragraph with the lead and gives it no hanging indent", () => {
    const { container } = render(<LinkedText text={"Tilladelse gives.\n\nStk. 2. Vilkår."} links={[]} lead="Stk. 1. " onLink={vi.fn()} />);
    const blocks = [...container.querySelectorAll(":scope > span")];
    expect(blocks.map((b) => b.textContent)).toEqual(["Stk. 1. Tilladelse gives.", "Stk. 2. Vilkår."]);
    expect(blocks[0].className).not.toContain("-indent-");
  });
});

describe("Danish paragraphs", () => {
  // LBK 570/2025 § 57: the indexed title is the whole first subsection.
  const body = "Tilladelse skal gives på bestemt tid og gøres afhængig af de vilkår, som skønnes påkrævet.\n\nStk. 2. I tilladelser til flyvepladser ...";
  const title = "Tilladelse skal gives på bestemt tid og gøres afhængig af de vilkår, som skønnes påkrævet.";

  it("never promotes Stk. 1 to a heading and keeps it in the body", () => {
    expect(headingOf(body, title)).toBe(title);
    expect(headingOf(body, title, true)).toBe("");
    expect(bodyStart(body, title, true)).toBe(0);
  });

  it("numbers Stk. 1 only when the paragraph has a Stk. 2", () => {
    expect(stkLead(body, true)).toBe("Stk. 1. ");
    expect(stkLead("Kun ét stykke.", true)).toBe("");
    expect(stkLead(body, false)).toBe("");
  });
});
