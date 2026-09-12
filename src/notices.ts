// Notices: lines the town, never a shop, writes for the agent. Two kinds
// in this project, `grant-expires` and `pass-expires`, each when under
// seven days remain. Rendered as `town-notice: <kind> key=value …` lines
// on stderr, or as objects in the `--json` envelope's `notices`.

import type { Grant, Pass } from "./store.js";

export const NOTICE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type NoticeKind = "grant-expires" | "pass-expires";

export interface Notice {
  kind: NoticeKind;
  [detail: string]: string;
}

/** An instant as ISO 8601 to the second, `2026-09-13T10:00:00Z`. */
export function isoTime(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function soon(expiresAt: number | null, now: number): expiresAt is number {
  return expiresAt !== null && expiresAt > now && expiresAt - now < NOTICE_WINDOW_MS;
}

/** The notices a call made with `pass`, touching `grants`, carries at `now`. */
export function noticesFor(now: number, pass: Pass, grants: readonly Grant[]): Notice[] {
  const out: Notice[] = [];
  for (const g of grants) {
    if (soon(g.expiresAt, now)) out.push({ kind: "grant-expires", shop: g.shop, expires: isoTime(g.expiresAt) });
  }
  if (soon(pass.expiresAt, now)) out.push({ kind: "pass-expires", expires: isoTime(pass.expiresAt) });
  return out;
}

/** One notice as its stderr line, without the newline. */
export function renderNotice(n: Notice): string {
  const details = Object.entries(n)
    .filter(([k]) => k !== "kind")
    .map(([k, v]) => `${k}=${/[\s"=]/.test(v) ? JSON.stringify(v) : v}`);
  return ["town-notice:", n.kind, ...details].join(" ");
}

/** Notices as stderr text, one line each, newline-terminated; empty when there are none. */
export function renderNotices(ns: readonly Notice[]): string {
  return ns.map((n) => `${renderNotice(n)}\n`).join("");
}
