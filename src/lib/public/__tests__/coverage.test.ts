import { describe, expect, it } from "vitest";
import { formatWeekdayRanges, normalizeDominicanPhone } from "@/lib/public/coverage";

describe("formatWeekdayRanges", () => {
  it("compresses consecutive days into a range", () => {
    expect(formatWeekdayRanges([1, 2, 3])).toBe("lun–mié");
  });

  it("joins two separate groups with 'y'", () => {
    expect(formatWeekdayRanges([4, 5, 6])).toBe("jue–sáb");
  });

  it("handles a single day", () => {
    expect(formatWeekdayRanges([0])).toBe("dom");
  });

  it("handles non-consecutive days with commas and 'y'", () => {
    expect(formatWeekdayRanges([1, 3, 5])).toBe("lun, mié y vie");
  });

  it("returns empty string for no days", () => {
    expect(formatWeekdayRanges([])).toBe("");
  });
});

describe("normalizeDominicanPhone", () => {
  it("accepts a bare 10-digit RD number", () => {
    expect(normalizeDominicanPhone("8095551234")).toBe("+18095551234");
  });

  it("accepts formatted input with separators", () => {
    expect(normalizeDominicanPhone("(809) 555-1234")).toBe("+18095551234");
  });

  it("accepts a leading country code 1", () => {
    expect(normalizeDominicanPhone("18095551234")).toBe("+18095551234");
  });

  it("rejects an invalid area code", () => {
    expect(normalizeDominicanPhone("2125551234")).toBeNull();
  });

  it("rejects the wrong number of digits", () => {
    expect(normalizeDominicanPhone("80955512")).toBeNull();
  });
});
