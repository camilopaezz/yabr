import { describe, it, expect, beforeEach, vi } from "vitest";
import { imageStore } from "./imageStore";
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
    imageStore.setState({ current: null });
    Object.keys(handlers).forEach((key) => delete handlers[key]);
  });

  it("patches progress on inference:progress for the current image", async () => {
    imageStore.getState().set({
      id: "img-1",
      inputPath: "/tmp/in.png",
      outputPath: null,
      status: "ready",
      progress: 0,
      stage: null,
      error: null,
    });

    await initEventListeners();

    handlers["inference:progress"]({
      payload: { id: "img-1", stage: "inferring", pct: 55 },
    });

    const current = imageStore.getState().current;
    expect(current?.status).toBe("processing");
    expect(current?.stage).toBe("inferring");
    expect(current?.progress).toBe(55);
  });

  it("ignores progress events for a different id", async () => {
    imageStore.getState().set({
      id: "img-1",
      inputPath: "/tmp/in.png",
      outputPath: null,
      status: "ready",
      progress: 0,
      stage: null,
      error: null,
    });

    await initEventListeners();

    handlers["inference:progress"]({
      payload: { id: "other", stage: "inferring", pct: 55 },
    });

    expect(imageStore.getState().current?.status).toBe("ready");
  });

  it("sets done status and output path on inference:done", async () => {
    imageStore.getState().set({
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

    const current = imageStore.getState().current;
    expect(current?.status).toBe("done");
    expect(current?.outputPath).toBe("/tmp/out.png");
    expect(current?.progress).toBe(100);
    expect(current?.stage).toBeNull();
  });

  it("sets error status and message on inference:error", async () => {
    imageStore.getState().set({
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

    const current = imageStore.getState().current;
    expect(current?.status).toBe("error");
    expect(current?.error).toBe("out of memory");
    expect(current?.stage).toBeNull();
  });

  it("sets cancelled status when error message is cancelled", async () => {
    imageStore.getState().set({
      id: "img-4",
      inputPath: "/tmp/in.png",
      outputPath: null,
      status: "processing",
      progress: 20,
      stage: "decoding",
      error: null,
    });

    await initEventListeners();

    handlers["inference:error"]({
      payload: { id: "img-4", message: "cancelled" },
    });

    const current = imageStore.getState().current;
    expect(current?.status).toBe("cancelled");
    expect(current?.error).toBeNull();
    expect(current?.stage).toBeNull();
  });
});
