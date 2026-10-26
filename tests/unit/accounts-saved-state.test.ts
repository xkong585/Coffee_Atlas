import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bean = { itemType: "bean" as const, itemId: "ethiopia-yirgacheffe" };
const savedResponse = (saved: boolean) => new Response(JSON.stringify({
  ok: true,
  data: saved ? [{ ...bean, savedAt: "2026-01-01T00:00:00Z" }] : [],
}), { status: 200 });

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe("shared saved state", () => {
  it("shares the initial read and publishes confirmed changes to duplicate buttons", async () => {
    const fetch = vi.fn().mockResolvedValue(savedResponse(false));
    vi.stubGlobal("fetch", fetch);
    const { savedState } = await import("@/modules/accounts/ui/saved-state");
    const first = vi.fn(() => savedState.read(bean));
    const second = vi.fn(() => savedState.read(bean));
    const stopFirst = savedState.subscribe(first);
    const stopSecond = savedState.subscribe(second);
    await savedState.load();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(savedState.read(bean)).toBe(false);

    savedState.record(bean, true, savedState.version());
    expect(first).toHaveLastReturnedWith(true);
    expect(second).toHaveLastReturnedWith(true);
    savedState.record(bean, false, savedState.version());
    expect(first).toHaveLastReturnedWith(false);
    expect(second).toHaveLastReturnedWith(false);
    stopFirst();
    stopSecond();
  });

  it("retries a signed-out or failed read after navigating to another page", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false }), { status: 401 }))
      .mockResolvedValueOnce(savedResponse(true));
    vi.stubGlobal("fetch", fetch);
    const { savedState } = await import("@/modules/accounts/ui/saved-state");
    const stopFirst = savedState.subscribe(() => {});
    await savedState.load();
    expect(savedState.read(bean)).toBeNull();
    stopFirst();

    const stopSecond = savedState.subscribe(() => {});
    await savedState.load();
    expect(savedState.read(bean)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    stopSecond();
  });

  it("clears the previous account's state immediately after an auth change", async () => {
    const nextAccount = deferredResponse();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(savedResponse(true))
      .mockReturnValueOnce(nextAccount.promise));
    const { savedState } = await import("@/modules/accounts/ui/saved-state");
    const stop = savedState.subscribe(() => {});
    await savedState.load();
    const oldVersion = savedState.version();
    expect(savedState.read(bean)).toBe(true);

    savedState.reset();
    expect(savedState.read(bean)).toBeNull();
    expect(savedState.record(bean, true, oldVersion)).toBe(false);
    nextAccount.resolve(savedResponse(false));
    await savedState.load();
    expect(savedState.read(bean)).toBe(false);
    stop();
  });

  it("ignores a previous account's read that finishes after authentication changes", async () => {
    const previousAccount = deferredResponse();
    vi.stubGlobal("fetch", vi.fn()
      .mockReturnValueOnce(previousAccount.promise)
      .mockResolvedValueOnce(savedResponse(false)));
    const { savedState } = await import("@/modules/accounts/ui/saved-state");
    const stop = savedState.subscribe(() => {});
    const previousLoad = savedState.load();
    savedState.reset();
    await savedState.load();
    previousAccount.resolve(savedResponse(true));
    await previousLoad;
    expect(savedState.read(bean)).toBe(false);
    stop();
  });

  it("does not overwrite a confirmed save with an older in-flight list", async () => {
    const initial = deferredResponse();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(initial.promise));
    const { savedState } = await import("@/modules/accounts/ui/saved-state");
    const stop = savedState.subscribe(() => {});
    savedState.record(bean, true, savedState.version());
    initial.resolve(savedResponse(false));
    await savedState.load();
    expect(savedState.read(bean)).toBe(true);
    stop();
  });
});
