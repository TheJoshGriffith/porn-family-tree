import { describe, expect, it } from "vitest";
import { imagesAllowedFor, parseRestricted, stripImages } from "../src/lib/region";

const GB = parseRestricted(undefined);

describe("imagesAllowedFor", () => {
  it("blocks the UK by default, in any case", () => {
    expect(imagesAllowedFor("GB", GB, true)).toBe(false);
    expect(imagesAllowedFor("gb", GB, true)).toBe(false);
  });
  it("allows other countries", () => {
    expect(imagesAllowedFor("US", GB, true)).toBe(true);
    expect(imagesAllowedFor("IE", GB, true)).toBe(true);
  });
  it("fails closed on unknown, Tor or missing country in production", () => {
    for (const c of [null, "", "XX", "T1"]) expect(imagesAllowedFor(c, GB, true)).toBe(false);
  });
  it("allows a missing header in development", () => {
    expect(imagesAllowedFor(null, GB, false)).toBe(true);
    expect(imagesAllowedFor("GB", GB, false)).toBe(false); // but still honours a real header
  });
  it("is configurable, and an empty list disables it", () => {
    const set = parseRestricted(" gb, fr ");
    expect(imagesAllowedFor("FR", set, true)).toBe(false);
    expect(imagesAllowedFor(null, parseRestricted(""), true)).toBe(true);
  });
});

describe("stripImages", () => {
  it("nulls image_url at any depth and leaves everything else", () => {
    const input = { p: { name: "A", image_url: "x" }, list: [{ image_url: "y", cast: [{ image_url: "z", n: 1 }] }] };
    expect(stripImages(input)).toEqual({ p: { name: "A", image_url: null }, list: [{ image_url: null, cast: [{ image_url: null, n: 1 }] }] });
    expect(input.p.image_url).toBe("x"); // original untouched
  });
});
