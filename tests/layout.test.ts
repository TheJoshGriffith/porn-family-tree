import { describe, expect, it } from "vitest";
import { generations, layout } from "../src/lib/layout";

describe("generations", () => {
  it("puts parents above, children below, siblings level", () => {
    const g = generations("me", [
      { a: "mom", b: "me", kind: "parent" },
      { a: "me", b: "kid", kind: "parent" },
      { a: "me", b: "sis", kind: "sibling" },
      { a: "gran", b: "mom", kind: "parent" },
    ]);
    expect(Object.fromEntries(g)).toEqual({ me: 0, mom: -1, kid: 1, sis: 0, gran: -2 });
  });

  it("contradictions resolve by shortest path, typed edges first", () => {
    // x is my mom in one scene and merely 'related' in another.
    const g = generations("me", [
      { a: "me", b: "x", kind: "family" },
      { a: "x", b: "me", kind: "parent" },
    ]);
    expect(g.get("x")).toBe(-1);
  });
});

describe("layout", () => {
  it("centres the focus in its row", () => {
    const pos = layout("me", [
      { a: "me", b: "s1", kind: "sibling" },
      { a: "me", b: "s2", kind: "sibling" },
    ]);
    expect(pos.get("me")!.x).toBeLessThan(pos.get("s2")!.x);
    expect(pos.get("me")!.x).toBeGreaterThan(pos.get("s1")!.x);
  });
});
