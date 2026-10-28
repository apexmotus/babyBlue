import { describe, expect, it } from "vitest";
import { SOURCE_LABEL, isBabyBlue } from "@/lib/sources";

describe("where a booking came from, as the practice sees it", () => {
  it("recognises a patient booking made through BabyBlue", () => {
    expect(isBabyBlue("app")).toBe(true);
    expect(isBabyBlue("os")).toBe(false);
    expect(isBabyBlue("flow")).toBe(false);
    expect(isBabyBlue("")).toBe(false);
  });

  it("names the BabyBlue source plainly and the others differently", () => {
    expect(SOURCE_LABEL.app).toBe("BabyBlue");
    expect(SOURCE_LABEL.os).not.toBe(SOURCE_LABEL.app);
    expect(SOURCE_LABEL.flow).not.toBe(SOURCE_LABEL.app);
  });
});
