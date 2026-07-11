import { describe, expect, it } from "vitest";
import { epLabel } from "./epLabel";

describe("epLabel", () => {
  it("maps known ORT provider ids", () => {
    expect(epLabel("CUDAExecutionProvider")).toBe("CUDA");
    expect(epLabel("CPUExecutionProvider")).toBe("CPU");
    expect(epLabel("DmlExecutionProvider")).toBe("DirectML");
    expect(epLabel("CoreMLExecutionProvider")).toBe("CoreML");
  });

  it("maps backend short ids (production contract)", () => {
    expect(epLabel("cpu")).toBe("CPU");
    expect(epLabel("cuda")).toBe("CUDA");
    expect(epLabel("directml")).toBe("DirectML");
    expect(epLabel("dml")).toBe("DirectML");
    expect(epLabel("coreml")).toBe("CoreML");
  });

  it("is case-insensitive", () => {
    expect(epLabel("CUDA")).toBe("CUDA");
    expect(epLabel("DirectML")).toBe("DirectML");
  });

  it("returns em dash for null/empty/unknown", () => {
    expect(epLabel(null)).toBe("—");
    expect(epLabel(undefined)).toBe("—");
    expect(epLabel("")).toBe("—");
    expect(epLabel("SomeNewExecutionProvider")).toBe("—");
  });
});
