import { describe, expect, it } from "vitest";
import { assignRoles, buildEdges, findRoles, type CastMember } from "../src/lib/relations";

const keys = (t: string) => findRoles(t).map((f) => `${f.step ? "step-" : ""}${f.role.key}`).sort();

describe("findRoles", () => {
  it("handles step prefixes in every spelling", () => {
    expect(keys("Stepmom Helps Step-Son")).toEqual(["step-mother", "step-son"]);
    expect(keys("My Step Sister and stepbro")).toEqual(["step-brother", "step-sister"]);
  });
  it("matches plurals and pet forms, not substrings", () => {
    expect(keys("Mommy and her daughters")).toEqual(["daughter", "mother"]);
    expect(keys("Mason the Sonic fan")).toEqual([]);
  });
});

const F = (id: string, age: number | null): CastMember => ({ id, gender: "FEMALE", age });
const M = (id: string, age: number | null): CastMember => ({ id, gender: "MALE", age });

describe("assignRoles + buildEdges", () => {
  it("stepmom and stepson: one role per gender", () => {
    const a = assignRoles([F("m", 40), M("s", 22)], findRoles("Stepmom seduces stepson"));
    expect(buildEdges(a)).toEqual([{ a: "m", b: "s", kind: "parent", step: true }]);
  });

  it("mom and daughter split by age, regardless of cast order", () => {
    const a = assignRoles([F("d", 21), F("m", 38), M("x", 30)], findRoles("Mom and Daughter share stepdad"));
    const role = Object.fromEntries(a.map((x) => [x.performerId, x.role]));
    expect(role).toEqual({ d: "daughter", m: "mother", x: "father" });
    const e = buildEdges(a);
    expect(e).toContainEqual({ a: "m", b: "d", kind: "parent", step: false });
    expect(e).toContainEqual({ a: "x", b: "d", kind: "parent", step: true });
    expect(e).toContainEqual({ a: "m", b: "x", kind: "spouse", step: true });
  });

  it("mom with two daughters: extras get the youngest role", () => {
    const a = assignRoles([F("a", 20), F("b", 45), F("c", 22)], findRoles("mother and daughters"));
    const role = Object.fromEntries(a.map((x) => [x.performerId, x.role]));
    expect(role).toEqual({ a: "daughter", b: "mother", c: "daughter" });
    expect(buildEdges(a)).toContainEqual({ a: "a", b: "c", kind: "sibling", step: false });
  });

  it("refuses to order same-gender roles without ages", () => {
    const a = assignRoles([F("a", null), F("b", 40)], findRoles("Stepmom and stepdaughter"));
    expect(a.every((x) => x.role === null)).toBe(true);
    expect(buildEdges(a)).toEqual([{ a: "a", b: "b", kind: "family", step: false }]);
  });

  it("two stepsisters and a stepbrother are all siblings", () => {
    const a = assignRoles([F("a", 20), F("b", 21), M("c", 25)], findRoles("Stepsisters share their stepbrother"));
    expect(buildEdges(a).map((e) => e.kind)).toEqual(["sibling", "sibling", "sibling"]);
  });

  it("a lone parent role goes to the eldest, not every man in the scene", () => {
    const a = assignRoles([M("dad", 49), F("mom", 44), M("kid", 24)], findRoles("Stepdad and Stepmom Get Caught"));
    const role = Object.fromEntries(a.map((x) => [x.performerId, x.role]));
    expect(role).toEqual({ dad: "father", mom: "mother", kid: null });
  });

  it("aunt and nephew", () => {
    const a = assignRoles([M("n", 20), F("t", 35)], findRoles("Aunt teaches nephew"));
    expect(buildEdges(a)).toEqual([{ a: "t", b: "n", kind: "auncle", step: false }]);
  });

  it("no generic links in big unresolved casts", () => {
    const cast = ["a", "b", "c", "d", "e"].map((id) => F(id, null));
    expect(buildEdges(assignRoles(cast, []))).toEqual([]);
  });
});

import { roleTags } from "../src/lib/relations";
describe("roleTags", () => {
  it("drops tags that mention a relative who is not in the scene", () => {
    expect(roleTags(["Step Daughter", "Daughter's Friend", "Mother In Law", "Other Person's Mom", "Taboo"])).toEqual(["Step Daughter", "Taboo"]);
  });
});
