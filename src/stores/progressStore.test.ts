import { describe, it, expect, beforeEach, vi } from "vitest";
import { batchStore } from "./batchStore";
import { initEventListeners } from "./progressStore";

const handlers: Record<string, (event: { payload: unknown }) => void> = {};

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (eventName: string, handler: (event: { payload: unknown }) => void) => {
    handlers[eventName] = handler;
    return () => {
      delete handlers[eventName];
    };
  }),
  invoke: vi.fn(),
}));

describe("progressStore", () => {
  beforeEach(() => {
    batchStore.setState({ items: [] });
    Object.keys(handlers).forEach((key) => delete handlers[key]);
  });

  it("patches progress on inference:progress", async () => {
    batchStore.getState().addItem({
      id: "img-1",
      inputPath: "/tmp/in.png",
      outputPath: null,
      status: "queued",
      progress: 0,
      stage: null,
      error: null,
    });

    await initEventListeners();

    handlers["inference:progress"]({
      payload: { id: "img-1", stage: "inferring", pct: 55 },
    });

    const item = batchStore.getState().items[0];
    expect(item.status).toBe("processing");
    expect(item.stage).toBe("inferring");
    expect(item.progress).toBe(55);
  });

  it("sets done status and output path on inference:done", async () => {
    batchStore.getState().addItem({
      id: "img-2",
      inputPath: "/tmp/in.png",
      outputPath: null,
      status: "processing",
      progress: 80,
      stage: "encoding",
      error: null,
    });

    await initEventListeners();

    handlers["inference:done"]({
      payload: { id: "img-2", output_path: "/tmp/out.png" },
    });

    const item = batchStore.getState().items[0];
    expect(item.status).toBe("done");
    expect(item.outputPath).toBe("/tmp/out.png");
    expect(item.progress).toBe(100);
    expect(item.stage).toBeNull();
  });

  it("sets error status and message on inference:error", async () => {
    batchStore.getState().addItem({
      id: "img-3",
      inputPath: "/tmp/in.png",
      outputPath: null,
      status: "processing",
      progress: 20,
      stage: "decoding",
      error: null,
    });

    await initEventListeners();

    handlers["inference:error"]({
      payload: { id: "img-3", message: "out of memory" },
    });

    const item = batchStore.getState().items[0];
    expect(item.status).toBe("error");
    expect(item.error).toBe("out of memory");
    expect(item.stage).toBeNull();
  });
});
