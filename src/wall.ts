// The wall: what encloses a shop's process. Given a spawn and an
// enclosure, the paths the process may read, the paths it may read and
// write, and the loopback ports it may reach, it returns the spawn to
// make. `none` returns the spawn it was given. `seatbelt` returns
// /usr/bin/sandbox-exec with a profile made for the one call: the box
// allowed, then the network, signals, and every write denied, then the
// home, the temporary directories, the volumes, and the data directory
// hidden, then each ancestor of an allowed path allowed a stat, as given
// and made real, so a path through a link such as /tmp resolves, and the
// enclosure's paths allowed back by name. Seatbelt's last match wins, so
// an allow below a deny opens a subpath inside a hidden one. Every path
// in the profile is absolute and real, since Seatbelt matches the path a
// process opens; a path or a port that would break the profile's text is
// refused before any process exists.

import { existsSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** `seatbelt` and `none` are a laptop's; `isolate` is the box's, a Worker loaded for the call, which no process runs within. */
export type WallKind = "seatbelt" | "none" | "isolate";

export interface Enclosure {
  /** Directories the process may read: the shop's, Node's, the town's install, the call's. */
  reads: string[];
  /** Directories it may read and write: its state. */
  writes: string[];
  /** Loopback ports it may connect to: its tellers' and its clerk's. */
  ports: number[];
}

export interface Wall {
  readonly kind: WallKind;
  /** The spawn to make for `file` with `args` so that it runs within `within`. */
  enclose(file: string, args: readonly string[], within: Enclosure): { file: string; args: string[] };
}

export const SANDBOX_EXEC = "/usr/bin/sandbox-exec";

/** The box's wall: no process, a Worker loaded for the call, which src/isolate.ts runs. It encloses nothing, since there is nothing to enclose. */
export const ISOLATE_WALL: Wall = {
  kind: "isolate",
  enclose() {
    throw new Error("the box starts no process; a shop runs in an isolate");
  },
};

/** The words a shop whose runtime is not `worker` is refused in on the box, at `shop add` and at `publish`. */
export const SUBPROCESS_REFUSAL = "runtime: subprocess runs on a laptop; this box runs a shop in an isolate: write runtime: worker (spec §7)";

/** The most one file of a shop's state, or of its shelf, may hold on the box, its path and content in UTF-8: the platform's two megabytes a row. Beside the box's other words, and not in src/rows.ts, since src/wagon.ts checks it and is Node's too. */
export const ROW_LIMIT_BYTES = 2_000_000;

/** The largest file of a state past the row limit, its bytes; null when every file fits. */
export function overRowLimit(state: ReadonlyMap<string, string>): number | null {
  const encoder = new TextEncoder();
  let most: number | null = null;
  for (const [path, content] of state) {
    const bytes = encoder.encode(path).length + encoder.encode(content).length;
    if (bytes > ROW_LIMIT_BYTES && (most === null || bytes > most)) most = bytes;
  }
  return most;
}

/** What a file past the row limit is over, in the row limit's line and the wagon's refusal alike. */
export const ROW_LIMIT_WORDS = "over the box's two megabyte limit on one file";

/** The row limit's line, on stderr for a call that would leave a file past it. */
export function rowLimitLine(bytes: number): string {
  return `town: a file of the state would be ${bytes} bytes after this call, ${ROW_LIMIT_WORDS}; it is kept as it was before the call`;
}

/** The wall chooser the box's admin is given: the box's own, and `--wall` refused, since it is not the operator's to choose. */
export const BOX_WALL = (flag: string | undefined): { open: (opts: { data?: string }) => Wall } | { refused: string } =>
  flag === undefined ? { open: () => ISOLATE_WALL } : { refused: "--wall is not the operator's to choose on the box; every shop runs in an isolate" };

/**
 * The environment name by which a test says this box has no wall. Read
 * here alone; it can only take a wall away, never give one.
 */
export const NO_WALL_ENV = "TOWN_TEST_NO_WALL";

/** The wall this box has: seatbelt where /usr/bin/sandbox-exec is, null otherwise. */
export function wallOnThisBox(): WallKind | null {
  if (process.env[NO_WALL_ENV]) return null;
  return process.platform === "darwin" && existsSync(SANDBOX_EXEC) ? "seatbelt" : null;
}

/** A wall of the kind, hiding `data` when given; throws when the kind is not this box's to give. */
export function openWall(kind: WallKind, opts: { data?: string } = {}): Wall {
  if (kind === "none") return { kind, enclose: (file, args) => ({ file, args: [...args] }) };
  if (kind !== "seatbelt") throw new Error(`${String(kind)} is not a wall; write seatbelt or none`);
  if (wallOnThisBox() !== "seatbelt") throw new Error(`this box has no seatbelt wall: ${SANDBOX_EXEC} is not here to run a shop within`);
  const data = opts.data === undefined ? null : realPath(opts.data);
  if (data !== null) checkPath(data);
  return {
    kind,
    enclose: (file, args, within) => ({ file: SANDBOX_EXEC, args: ["-p", seatbeltProfile(within, data), file, ...args] }),
  };
}

/**
 * The Seatbelt profile for `within`, hiding `data` when not null: the
 * design's text, one line per port, ancestor, read, and write. Throws
 * before any text is made when a path or a port would break it.
 */
export function seatbeltProfile(within: Enclosure, data: string | null): string {
  for (const port of within.ports) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`${String(port)} is not a port the wall can open; a port is a whole number from 1 to 65535`);
  }
  const reads = within.reads.map(realPath);
  const writes = within.writes.map(realPath);
  // Each allowed path as the runtime was given it, for its ancestors: a link on the way, /tmp to /private/tmp, is looked up by its own name.
  const given = [...within.reads, ...within.writes].map((p) => path.resolve(p));
  // The operator's home from the password database, not $HOME, which the town's own environment may have moved.
  const home = realPath(os.userInfo().homedir);
  const hidden = [home, "/tmp", "/private/tmp", "/private/var/folders", "/Volumes", ...(data === null ? [] : [data])];
  for (const p of [...reads, ...writes, ...given, ...hidden]) checkPath(p);
  const sub = (p: string) => `(subpath "${p}")`;

  const ancestors: string[] = [];
  for (const p of [...reads, ...writes, ...given]) {
    for (let d = path.dirname(p); ; d = path.dirname(d)) {
      if (!ancestors.includes(d)) ancestors.push(d);
      if (path.dirname(d) === d) break;
    }
  }
  return [
    "(version 1)",
    "(allow default)",
    "(deny network*)",
    ...within.ports.map((port) => `(allow network-outbound (remote ip "localhost:${port}"))`),
    "(deny signal)",
    "(allow signal (target same-sandbox))",
    "(deny file-write*)",
    '(allow file-write* (literal "/dev/null"))',
    "(deny file-read* file-write*",
    `  ${hidden.slice(0, 3).map(sub).join(" ")}`,
    `  ${hidden.slice(3, 5).map(sub).join(" ")}${data === null ? ")" : ""}`,
    ...(data === null ? [] : [`  ${sub(data)})`]),
    ...ancestors.map((a) => `(allow file-read-metadata (literal "${a}"))`),
    ...reads.map((r) => `(allow file-read* ${sub(r)})`),
    ...writes.map((w) => `(allow file-read* file-write* ${sub(w)})`),
    "",
  ].join("\n");
}

/** Refuses a path the profile's text cannot hold as itself: one with a quote, a backslash, or a control character. */
function checkPath(p: string): void {
  if (/["\\\u0000-\u001f\u007f]/.test(p)) throw new Error(`${JSON.stringify(p)} holds a quote, a backslash, or a control character, which the wall's profile cannot hold; move it to a path without one`);
}

/** The path with links resolved: the nearest existing ancestor made real, the rest joined on. */
function realPath(p: string): string {
  const tail: string[] = [];
  let d = path.resolve(p);
  for (;;) {
    try {
      return path.join(realpathSync(d), ...tail);
    } catch {
      const up = path.dirname(d);
      if (up === d) return path.resolve(p);
      tail.unshift(path.basename(d));
      d = up;
    }
  }
}
