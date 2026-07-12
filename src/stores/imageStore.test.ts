import { beforeEach, describe, expect, it } from "vitest";
import { type ImageItem, imageStore } from "./imageStore";

function makeItem(overrides: Partial<ImageItem> = {}): ImageItem {
  return {
    id: "test-id",
    inputPath: "/tmp/input.png",
    outputPath: null,
    status: "ready",
    progress: 0,
    stage: null,
    error: null,
    ...overrides,
  };
}

describe("imageStore", () => {
  beforeEach(() => {
    imageStore.setState({ current: null });
  });

  it("sets the current image", () => {
    const item = makeItem({ id: "a" });
    imageStore.getState().set(item);
    expect(imageStore.getState().current).toEqual(item);
  });

  it("replaces the current image on set", () => {
    imageStore.getState().set(makeItem({ id: "a" }));
    imageStore.getState().set(makeItem({ id: "b" }));
    expect(imageStore.getState().current?.id).toBe("b");
  });

  it("patches the current image", () => {
    imageStore.getState().set(makeItem({ id: "a", status: "ready" }));
    imageStore.getState().patch({ status: "processing", progress: 50 });
    const current = imageStore.getState().current;
    expect(current?.status).toBe("processing");
    expect(current?.progress).toBe(50);
  });

  it("does not patch when there is no current image", () => {
    imageStore.getState().patch({ status: "processing" });
    expect(imageStore.getState().current).toBeNull();
  });

  it("clears the current image", () => {
    imageStore.getState().set(makeItem({ id: "a" }));
    imageStore.getState().clear();
    expect(imageStore.getState().current).toBeNull();
  });
});
