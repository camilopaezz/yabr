import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyTheme,
  isTheme,
  persistTheme,
  readStoredTheme,
  THEME_STORAGE_KEY,
} from "./theme";

class MemStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }
}

function useMemStorage() {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
}

describe("readStoredTheme", () => {
  useMemStorage();

  it("returns null when nothing is stored", () => {
    expect(readStoredTheme()).toBeNull();
  });

  it("returns a valid stored theme", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    expect(readStoredTheme()).toBe("dark");
  });

  it("rejects an invalid value", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "hot-pink");
    expect(readStoredTheme()).toBeNull();
  });
});

describe("persistTheme", () => {
  useMemStorage();

  it("writes the theme under the storage key", () => {
    persistTheme("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });
});

describe("isTheme", () => {
  it("accepts valid themes", () => {
    expect(isTheme("system")).toBe(true);
    expect(isTheme("light")).toBe(true);
    expect(isTheme("dark")).toBe(true);
  });

  it("rejects invalid values", () => {
    expect(isTheme("hot-pink")).toBe(false);
    expect(isTheme(null)).toBe(false);
  });
});

describe("applyTheme", () => {
  beforeEach(() => document.documentElement.removeAttribute("data-theme"));

  it("sets data-theme=dark for dark", () => {
    applyTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("sets data-theme=light for light", () => {
    applyTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("removes data-theme for system so the media query drives it", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    applyTheme("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
});

describe("storage resilience", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("readStoredTheme tolerates a throwing localStorage", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
    } as unknown as Storage);
    expect(readStoredTheme()).toBeNull();
  });

  it("persistTheme tolerates a throwing localStorage", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("denied");
      },
    } as unknown as Storage);
    expect(() => persistTheme("dark")).not.toThrow();
  });
});
