// The shelf: where a shop's files are kept, by the shop's name. On a
// laptop, `diskShelf` keeps each shop's files in a directory of its own
// under <data>/shops, named as gate's shopDir names it, and a subprocess
// runs from that directory; the box's shelf is rows. A put is whole: the
// files are written beside the shop's directory and moved into its place,
// and what was there is gone. `shopAt` is a shelf of one directory,
// whatever the shop's name: the directory `shop test` reads, and a copy
// staged for its tests before it is put on the town's shelf.

import { randomBytes } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { BundleFile } from "./bundle.js";
import { segment } from "./runtime.js";

export interface Shelf {
  /** A shop's files by path relative to its root, or null when the shelf holds none. */
  read(shop: string): Map<string, BundleFile> | null;
  /** Puts a shop's files in place, whole; what was there is gone. */
  put(shop: string, files: ReadonlyMap<string, BundleFile>): void;
  remove(shop: string): void;
  /** On a laptop, the directory a shop's process runs from; the box has none. */
  dir?(shop: string): string;
}

/** A shop's files at <root>/<segment>, as gate's shopDir names it. */
export function diskShelf(root: string): Shelf {
  const dirOf = (shop: string) => path.join(root, segment(shop));
  return {
    read: (shop) => readTree(dirOf(shop)),
    put(shop, files) {
      mkdirSync(root, { recursive: true, mode: 0o700 });
      const fresh = path.join(root, `.put-${randomBytes(6).toString("hex")}`);
      writeTree(fresh, files);
      const final = dirOf(shop);
      const old = `${fresh}-old`;
      const had = existsSync(final);
      try {
        if (had) renameSync(final, old);
        renameSync(fresh, final);
      } catch (err) {
        rmSync(fresh, { recursive: true, force: true });
        throw err;
      }
      if (had) rmSync(old, { recursive: true, force: true });
    },
    remove: (shop) => rmSync(dirOf(shop), { recursive: true, force: true }),
    dir: dirOf,
  };
}

/** The one directory `dir`, as a shelf holding whatever shop is there under any name. */
export function shopAt(dir: string): Shelf {
  return {
    read: () => readTree(dir),
    put(_shop, files) {
      rmSync(dir, { recursive: true, force: true });
      writeTree(dir, files);
    },
    remove: () => rmSync(dir, { recursive: true, force: true }),
    dir: () => dir,
  };
}

/** Every plain file under `dir` by `/`-separated relative path, its content as text and its mode; null when there is no directory. Anything else in it is thrown. */
export function readTree(dir: string): Map<string, BundleFile> | null {
  if (!existsSync(dir)) return null;
  const out = new Map<string, BundleFile>();
  const walk = (at: string, prefix: string) => {
    for (const name of readdirSync(at).sort()) {
      const full = path.join(at, name);
      const st = lstatSync(full);
      if (st.isDirectory()) walk(full, `${prefix}${name}/`);
      else if (st.isFile()) out.set(`${prefix}${name}`, { content: readFileSync(full, "utf8"), mode: st.mode & 0o777 });
      else throw new ShelfError(full, `${full} is not a plain file`);
    }
  };
  walk(dir, "");
  return out;
}

/** Something on a shelf that is not a shop's plain files, at `path`. */
export class ShelfError extends Error {
  constructor(readonly path: string, message: string) {
    super(message);
  }
}

/** Writes `files` under a new directory `dir`, mode 700, each file 700 when its owner may execute it and 600 otherwise; a path outside `dir` is thrown before anything is written. */
function writeTree(dir: string, files: ReadonlyMap<string, BundleFile>): void {
  const root = path.resolve(dir);
  const targets = [...files].map(([rel, file]) => {
    const to = path.resolve(root, rel);
    if (!to.startsWith(root + path.sep)) throw new ShelfError(rel, `${JSON.stringify(rel)} is outside the shop`);
    return { to, file };
  });
  mkdirSync(root, { recursive: true, mode: 0o700 });
  try {
    for (const { to, file } of targets) {
      mkdirSync(path.dirname(to), { recursive: true, mode: 0o700 });
      writeFileSync(to, file.content, { mode: file.mode & 0o100 ? 0o700 : 0o600, flag: "wx" });
    }
  } catch (err) {
    rmSync(root, { recursive: true, force: true });
    throw err;
  }
}
