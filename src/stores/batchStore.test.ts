import { describe, it, expect, beforeEach } from "vitest";
import { batchStore, type BatchItem } from "./batchStore";

function makeItem(overrides: Partial<BatchItem> = {}): BatchItem {
  return {
    id: "test-id",
    inputPath: "/tmp/input.png",
    outputPath: null,
    status: "queued",
    progress: 0,
    stage: null,
    error: null,
    ...overrides,
  };
}

describe("batchStore", () => {
  beforeEach(() => {
    batchStore.setState({ items: [] });
  });

  it("adds an item", () => {
    const item = makeItem({ id: "a" });
    batchStore.getState().addItem(item);
    expect(batchStore.getState().items).toHaveLength(1);
    expect(batchStore.getState().items[0]).toEqual(item);
  });

  it("updates an item by id", () => {
    batchStore.getState().addItem(makeItem({ id: "a", status: "queued" }));
    batchStore.getState().updateItem("a", { status: "processing", progress: 50 });
    const item = batchStore.getState().items[0];
    expect(item.status).toBe("processing");
    expect(item.progress).toBe(50);
  });

  it("does not update items with a non-matching id", () => {
    batchStore.getState().addItem(makeItem({ id: "a", status: "queued" }));
    batchStore.getState().updateItem("b", { status: "done" });
    expect(batchStore.getState().items[0].status).toBe("queued");
  });

  it("removes an item by id", () => {
    batchStore.getState().addItem(makeItem({ id: "a" }));
    batchStore.getState().addItem(makeItem({ id: "b" }));
    batchStore.getState().removeItem("a");
    expect(batchStore.getState().items).toHaveLength(1);
    expect(batchStore.getState().items[0].id).toBe("b");
  });

  it("clears all items", () => {
    batchStore.getState().addItem(makeItem({ id: "a" }));
    batchStore.getState().addItem(makeItem({ id: "b" }));
    batchStore.getState().clear();
    expect(batchStore.getState().items).toHaveLength(0);
  });
});
