import test from "node:test";
import assert from "node:assert/strict";
import {
  getBrowserSupabase,
  setBrowserSupabasePersistence,
} from "../app/lib/supabase.ts";

class MemoryStorage {
  #items = new Map();

  getItem(key) {
    return this.#items.get(key) ?? null;
  }

  removeItem(key) {
    this.#items.delete(key);
  }

  setItem(key, value) {
    this.#items.set(key, String(value));
  }
}

test("getBrowserSupabase returns one browser client across persistence changes", () => {
  const previousWindow = globalThis.window;
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://sxavgqzwfahljdvmisyq.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-anon-key";
  globalThis.window = {
    localStorage: new MemoryStorage(),
    sessionStorage: new MemoryStorage(),
  };

  try {
    const initialClient = getBrowserSupabase();
    setBrowserSupabasePersistence("session");
    const sessionClient = getBrowserSupabase(false);
    setBrowserSupabasePersistence(null);
    const persistentClient = getBrowserSupabase(true);

    assert.ok(initialClient);
    assert.equal(sessionClient, initialClient);
    assert.equal(persistentClient, initialClient);
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }

    if (previousUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    }

    if (previousKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousKey;
    }
    setBrowserSupabasePersistence(null);
  }
});
