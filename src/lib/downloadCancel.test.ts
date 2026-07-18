import { describe, expect, it } from "vitest";
import { isDownloadCancelled } from "./downloadCancel";

describe("isDownloadCancelled", () => {
  it("detects cancelled invoke errors", () => {
    expect(isDownloadCancelled(new Error("cancelled"))).toBe(true);
    expect(isDownloadCancelled("cancelled")).toBe(true);
  });

  it("ignores other failures", () => {
    expect(isDownloadCancelled(new Error("download failed"))).toBe(false);
    expect(isDownloadCancelled(null)).toBe(false);
  });
});
