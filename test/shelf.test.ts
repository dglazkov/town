// ring: checkout
// The shelf (box's design, "The seams"): a disk shelf puts a shop's files
// whole under <root>/<segment>, reads them back by name, and removes them;
// a second put leaves nothing of the first; a name is escaped to one path
// segment as stateDir escapes it; a path outside the shop is refused
// before anything is written; and a shelf of one directory holds whatever
// shop is put there.

import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BundleFile } from "../src/bundle.js";
import { segment } from "../src/runtime.js";
import { ShelfError, diskShelf, readTree, shopAt } from "../src/shelf.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "town-shelf-test-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const files = (entries: Record<string, string | BundleFile>) =>
  new Map(Object.entries(entries).map(([k, v]) => [k, typeof v === "string" ? { content: v, mode: 0o644 } : v]));

describe("a disk shelf", () => {
  it("puts a shop's files under its name's segment, reads them back, and removes them", () => {
    const shelf = diskShelf(path.join(root, "shops"));
    expect(shelf.read("town/memory")).toBeNull();
    shelf.put("town/memory", files({ "manifest.yaml": "name: town/memory\n", "main.mjs": "export default async function main() {}\n", "lib/util.mjs": "export const x = 1;\n", "bin/run": { content: "#!/bin/sh\n", mode: 0o755 } }));
    const dir = shelf.dir!("town/memory");
    expect(dir).toBe(path.join(root, "shops", "town%2Fmemory"));
    expect(readdirSync(path.join(root, "shops"))).toEqual(["town%2Fmemory"]);
    const read = shelf.read("town/memory")!;
    expect([...read.keys()].sort()).toEqual(["bin/run", "lib/util.mjs", "main.mjs", "manifest.yaml"]);
    expect(read.get("manifest.yaml")!.content).toBe("name: town/memory\n");
    expect(read.get("bin/run")!.mode & 0o100).toBe(0o100);
    expect(read.get("main.mjs")!.mode & 0o177).toBe(0);
    shelf.remove("town/memory");
    expect(shelf.read("town/memory")).toBeNull();
    expect(existsSync(dir)).toBe(false);
  });

  it("puts whole: a second put leaves nothing of the first, and nothing beside the shop's directory", () => {
    const shelf = diskShelf(root);
    shelf.put("dimitri/todo", files({ "manifest.yaml": "v1\n", "old.mjs": "old\n" }));
    shelf.put("dimitri/todo", files({ "manifest.yaml": "v2\n", "new.mjs": "new\n" }));
    expect([...shelf.read("dimitri/todo")!.keys()].sort()).toEqual(["manifest.yaml", "new.mjs"]);
    expect(shelf.read("dimitri/todo")!.get("manifest.yaml")!.content).toBe("v2\n");
    expect(readdirSync(root)).toEqual(["dimitri%2Ftodo"]);
  });

  it("escapes a name to one path segment as stateDir does, so no name reaches outside and two names never share a directory", () => {
    const shelf = diskShelf(root);
    for (const name of ["../escape", "a/b", "a%2Fb", ".", ""]) {
      shelf.put(name, files({ "manifest.yaml": name }));
      expect(shelf.dir!(name)).toBe(path.join(root, segment(name)));
      expect(path.dirname(shelf.dir!(name))).toBe(root);
    }
    expect(readdirSync(root).sort()).toEqual(["%", "%2E", "%2E%2E%2Fescape", "a%252Fb", "a%2Fb"]);
    expect(shelf.read("a/b")!.get("manifest.yaml")!.content).toBe("a/b");
    expect(shelf.read("a%2Fb")!.get("manifest.yaml")!.content).toBe("a%2Fb");
  });

  it("refuses a file outside the shop before anything is written, and leaves the shop as it was", () => {
    const shelf = diskShelf(root);
    shelf.put("town/memory", files({ "manifest.yaml": "kept\n" }));
    for (const rel of ["../outside", "/abs/path", "a/../../b"]) {
      expect(() => shelf.put("town/memory", files({ "manifest.yaml": "not kept\n", [rel]: "x" })), rel).toThrow(ShelfError);
    }
    expect(shelf.read("town/memory")!.get("manifest.yaml")!.content).toBe("kept\n");
    expect(readdirSync(root)).toEqual(["town%2Fmemory"]);
  });

  it("reads plain files alone: a link on the shelf is thrown, naming it", () => {
    const shelf = diskShelf(root);
    shelf.put("town/memory", files({ "manifest.yaml": "m\n" }));
    symlinkSync("/etc/hosts", path.join(shelf.dir!("town/memory"), "hosts"));
    expect(() => shelf.read("town/memory")).toThrow(`${path.join(shelf.dir!("town/memory"), "hosts")} is not a plain file`);
  });
});

describe("a shelf of one directory", () => {
  it("holds whatever shop is put there, under any name, and is read back as a disk shelf reads", () => {
    const dir = path.join(root, ".staging-1");
    mkdirSync(dir, { mode: 0o700 });
    writeFileSync(path.join(dir, "stale"), "from before");
    const shelf = shopAt(dir);
    shelf.put("dimitri/todo", files({ "manifest.yaml": "m\n", "src/main.mjs": "x\n" }));
    expect(shelf.dir!("anything")).toBe(dir);
    expect([...shelf.read("anything")!.keys()]).toEqual(["manifest.yaml", "src/main.mjs"]);
    expect(readTree(dir)).toEqual(shelf.read("dimitri/todo"));
    expect(lstatSync(dir).mode & 0o077).toBe(0);
    shelf.remove("dimitri/todo");
    expect(existsSync(dir)).toBe(false);
  });
});
