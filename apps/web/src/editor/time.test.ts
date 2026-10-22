import { describe, expect, it } from "vitest";
import { formatTimecode, snapValue } from "./time";

describe("timeline time", () => {
  it("formats frames as minutes and seconds", () => {
    expect(formatTimecode(0, 30)).toBe("00:00");
    expect(formatTimecode(90, 30)).toBe("00:03");
    expect(formatTimecode(30 * 65, 30)).toBe("01:05");
  });

  it("snaps to the nearest point inside the threshold", () => {
    expect(snapValue(12, [0, 10, 40], 3)).toBe(10);
    expect(snapValue(12, [0, 10, 40], 1)).toBe(12);
  });
});
