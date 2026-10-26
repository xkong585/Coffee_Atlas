import type { ApiResult } from "@/contracts";

export interface Reply<T> {
  status: number;
  envelope: ApiResult<T> | null;
}

/** Same-origin JSON call; a network failure becomes status 0 with no envelope. */
export async function callApi<T>(path: string, init?: { method?: string; body?: unknown }): Promise<Reply<T>> {
  try {
    const response = await fetch(path, {
      method: init?.method ?? "GET",
      headers: init?.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      credentials: "same-origin",
    });
    let envelope: ApiResult<T> | null = null;
    try {
      const body: unknown = await response.json();
      if (body && typeof body === "object" && "ok" in body) envelope = body as ApiResult<T>;
    } catch {
      envelope = null;
    }
    return { status: response.status, envelope };
  } catch {
    return { status: 0, envelope: null };
  }
}

export const dataOf = <T>(reply: Reply<T>): T | null =>
  reply.status === 200 && reply.envelope?.ok ? reply.envelope.data : null;

export const messageOf = (reply: Reply<unknown>, fallback: string): string =>
  reply.envelope && !reply.envelope.ok ? reply.envelope.error.message : fallback;

/** Only same-site paths may be used as a post-sign-in destination. */
export function safeNext(next: string | undefined | null, fallback = "/account"): string {
  if (!next?.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  // URL parsing strips tabs/newlines, which could turn a path into an external URL.
  for (const character of next) {
    if (character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127) return fallback;
  }
  return next;
}
