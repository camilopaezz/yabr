import { describe, it, expect } from "vitest";
import { deriveOutputPath } from "./path";

describe("deriveOutputPath", () => {
  it("places output next to input when outputDir is unset", () => {
    expect(deriveOutputPath("/home/user/pics/photo.jpg", null)).toBe(
      "/home/user/pics/photo-nobg.png",
    );
  });

  it("places output in configured outputDir", () => {
    expect(deriveOutputPath("/home/user/pics/photo.jpg", "/tmp/outputs")).toBe(
      "/tmp/outputs/photo-nobg.png",
    );
  });

  it("handles windows-style input paths", () => {
    expect(deriveOutputPath("C:\\Users\\pics\\photo.jpg", "D:\\Outputs")).toBe(
      "D:\\Outputs/photo-nobg.png",
    );
  });

  it("strips trailing separators from outputDir", () => {
    expect(deriveOutputPath("/home/user/pics/photo.jpg", "/tmp/outputs/")).toBe(
      "/tmp/outputs/photo-nobg.png",
    );
  });

  it("handles input paths without a directory", () => {
    expect(deriveOutputPath("photo.jpg", "/tmp/outputs")).toBe(
      "/tmp/outputs/photo-nobg.png",
    );
    expect(deriveOutputPath("photo.jpg", null)).toBe("./photo-nobg.png");
  });
});
