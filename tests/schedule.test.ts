import { describe, expect, it } from "vitest";
import { parseDuration } from "../src/lib/schedule";

describe("parseDuration", () => {
  it("parses the usual units", () => {
    expect(parseDuration("30m")).toBe(30 * 60e3);
    expect(parseDuration("6h")).toBe(6 * 3600e3);
    expect(parseDuration("1d")).toBe(86400e3);
    expect(parseDuration("1.5H")).toBe(1.5 * 3600e3);
  });
  it("rejects nonsense and anything under a minute", () => {
    expect(() => parseDuration("")).toThrow();
    expect(() => parseDuration("6")).toThrow();
    expect(() => parseDuration("10s")).toThrow();
  });
});
