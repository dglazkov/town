// ring: checkout
// The bundle: a shop's directory as a ustar tar on stdin, read by
// src/bundle.ts. A tar built here block by block, and one the box's own
// `tar --format ustar` makes, each read back file for file with the
// owner-execute bit kept. Then each refusal, one line naming what was
// found and the tar command: a `..` segment, an absolute path, a symbolic
// link, a pax header, a name past the format (GNU's long-name header),
// a tar cut short, no manifest at the root, an empty stdin, and text that
// is no tar at all.

import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { TAR_COMMAND, readBundle, type BundleFile } from "../src/bundle.js";

const BLOCK = 512;

interface Entry {
  name: string;
  content?: string;
  type?: string;
  mode?: number;
  prefix?: string;
  /** The size the header claims, when not the content's. */
  size?: number;
}

/** One ustar header block: name, mode, size in octal, type, the magic, prefix, and the checksum over all of it. */
function header(e: Entry, size: number): Buffer {
  const b = Buffer.alloc(BLOCK);
  const put = (text: string, offset: number, length: number) => {
    const bytes = Buffer.from(text, "utf8");
    if (bytes.length > length) throw new Error(`${text} does not fit ${length} bytes`);
    bytes.copy(b, offset);
  };
  const oct = (n: number, length: number) => `${n.toString(8).padStart(length - 1, "0")}\0`;
  put(e.name, 0, 100);
  put(oct(e.mode ?? 0o644, 8), 100, 8);
  put(oct(0, 8), 108, 8);
  put(oct(0, 8), 116, 8);
  put(oct(size, 12), 124, 12);
  put(oct(0, 12), 136, 12);
  put(e.type ?? "0", 156, 1);
  put("ustar\0", 257, 6);
  put("00", 263, 2);
  put(e.prefix ?? "", 345, 155);
  b.fill(" ", 148, 156);
  const sum = b.reduce((a, x) => a + x, 0);
  put(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8);
  return b;
}

/** A tar, block by block: each entry's header then its content padded to a block, then two zero blocks; as the text a hall call's stdin carries. */
function tar(entries: Entry[], { end = true }: { end?: boolean } = {}): string {
  const parts: Buffer[] = [];
  for (const e of entries) {
    const content = Buffer.from(e.content ?? "", "utf8");
    parts.push(header(e, e.size ?? content.length));
    parts.push(Buffer.concat([content, Buffer.alloc((BLOCK - (content.length % BLOCK)) % BLOCK)]));
  }
  if (end) parts.push(Buffer.alloc(BLOCK * 2));
  return Buffer.concat(parts).toString("utf8");
}

const MANIFEST = "name: dimitri/todo\nversion: 0.1.0\n";
const ENTRY = "console.log('a list');\n";

const files = (bundle: ReturnType<typeof readBundle>): Map<string, BundleFile> => {
  if ("refusal" in bundle) throw new Error(bundle.refusal);
  return bundle.files;
};
const refusal = (bundle: ReturnType<typeof readBundle>): string => {
  if (!("refusal" in bundle)) throw new Error(`read ${[...bundle.files.keys()].join(", ")}`);
  return bundle.refusal;
};

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "town-bundle-test-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

it("reads a tar built block by block, file for file, with the owner-execute bit kept and the root's entry skipped", () => {
  const text = tar([
    { name: "./", type: "5", mode: 0o755 },
    { name: "./manifest.yaml", content: MANIFEST },
    { name: "./main.mjs", content: ENTRY, mode: 0o644 },
    { name: "./bin/", type: "5", mode: 0o755 },
    { name: "./bin/run", content: "#!/bin/sh\necho ok\n", mode: 0o755 },
    { name: "lib.mjs", prefix: "./src/deep", content: "export {};\n" },
    { name: "./empty.txt", content: "" },
  ]);
  const read = files(readBundle(text));
  expect([...read.keys()]).toEqual(["manifest.yaml", "main.mjs", "bin/run", "src/deep/lib.mjs", "empty.txt"]);
  expect(read.get("manifest.yaml")).toEqual({ content: MANIFEST, mode: 0o644 });
  expect(read.get("main.mjs")).toEqual({ content: ENTRY, mode: 0o644 });
  expect(read.get("bin/run")).toEqual({ content: "#!/bin/sh\necho ok\n", mode: 0o755 });
  expect(read.get("src/deep/lib.mjs")!.content).toBe("export {};\n");
  expect(read.get("empty.txt")!.content).toBe("");
  // Content a block long, and past one, is read to its size and no further; the end of the text ends it too.
  const long = "x".repeat(BLOCK) + "y".repeat(BLOCK + 3);
  const two = files(readBundle(tar([{ name: "manifest.yaml", content: MANIFEST }, { name: "big.txt", content: long }], { end: false })));
  expect(two.get("big.txt")!.content).toBe(long);
  // Text that is not ASCII is counted in bytes, as the header counts it.
  const words = "todo: café, 買い物\n";
  expect(files(readBundle(tar([{ name: "manifest.yaml", content: words }]))).get("manifest.yaml")!.content).toBe(words);
});

it("reads what the box's tar --format ustar makes of a shop's directory, file for file, modes kept", () => {
  const shop = path.join(dir, "todo");
  mkdirSync(path.join(shop, "bin"), { recursive: true });
  writeFileSync(path.join(shop, "manifest.yaml"), MANIFEST);
  writeFileSync(path.join(shop, "main.mjs"), ENTRY);
  writeFileSync(path.join(shop, "bin", "entry.sh"), "#!/bin/sh\necho from sh\n");
  chmodSync(path.join(shop, "bin", "entry.sh"), 0o755);
  const made = spawnSync("tar", ["--format", "ustar", "-cf", "-", "-C", shop, "."], { env: { ...process.env, COPYFILE_DISABLE: "1" } });
  expect(made.status, made.stderr.toString()).toBe(0);
  const read = files(readBundle(made.stdout.toString("utf8")));
  expect([...read.keys()].sort()).toEqual(["bin/entry.sh", "main.mjs", "manifest.yaml"]);
  for (const rel of read.keys()) expect(read.get(rel)!.content, rel).toBe(readFileSync(path.join(shop, rel), "utf8"));
  expect(read.get("bin/entry.sh")!.mode & 0o100).toBe(0o100);
  expect(read.get("main.mjs")!.mode & 0o100).toBe(0);
  expect(TAR_COMMAND).toBe("tar --format ustar -cf - -C <dir> .");
});

it("refuses each thing a shop's tar must not hold, one line naming what was found and the tar command", () => {
  const cmd = "tar --format ustar -cf - -C <dir> .";
  const m = { name: "./manifest.yaml", content: MANIFEST };
  const cases: Array<[string, string, string]> = [
    ["a .. segment", tar([m, { name: "./../escape.mjs", content: ENTRY }]), `"./../escape.mjs": holds a .. segment; make the tar with ${cmd}, so every path is inside the shop (spec §1)`],
    ["a .. segment in the prefix", tar([m, { name: "x.mjs", prefix: "lib/../..", content: ENTRY }]), `"lib/../../x.mjs": holds a .. segment; make the tar with ${cmd}, so every path is inside the shop (spec §1)`],
    ["an absolute path", tar([m, { name: "/etc/passwd", content: ENTRY }]), `"/etc/passwd": is an absolute path; make the tar with ${cmd}, so every path is inside the shop (spec §1)`],
    ["a symbolic link", tar([m, { name: "./main.mjs", type: "2" }]), `"./main.mjs": is a symbolic link, not a plain file; a shop is plain files, so put the file itself there and make the tar with ${cmd} (spec §1)`],
    ["a hard link", tar([m, { name: "./again.mjs", type: "1" }]), `"./again.mjs": is a hard link, not a plain file; a shop is plain files, so put the file itself there and make the tar with ${cmd} (spec §1)`],
    ["a pax header", tar([{ name: "./PaxHeader/manifest.yaml", type: "x", content: "30 path=./manifest.yaml\n" }, m]), `"./PaxHeader/manifest.yaml": is a pax header (type x), which a long path or an odd name needs; shorten the path and make the tar with ${cmd} (spec §1)`],
    ["a name past the format", tar([m, { name: "././@LongLink", type: "L", content: `./${"a".repeat(120)}.mjs\0` }, { name: `./${"a".repeat(97)}`, content: ENTRY }]), `"././@LongLink": is a GNU long-name header (type L), which a long path or an odd name needs; shorten the path and make the tar with ${cmd} (spec §1)`],
    ["truncated content", tar([m, { name: "./main.mjs", content: ENTRY, size: 4096 }], { end: false }), `"./main.mjs": the tar ends 3584 bytes into its content; send the whole of what ${cmd} makes (spec §1)`],
    ["a truncated header", `${tar([m], { end: false })}${"./main.mjs".padEnd(300, "\0")}`, `stdin: the tar ends inside a header at byte 1024; send the whole of what ${cmd} makes (spec §1)`],
    ["no manifest at the root", tar([{ name: "./todo/", type: "5" }, { name: "./todo/manifest.yaml", content: MANIFEST }]), `manifest.yaml: is not at the root of the tar; make it with ${cmd}, from the shop's directory, so the shop's files are (spec §1)`],
    ["an empty stdin", "", `stdin: is empty; send the shop's directory on stdin, as ${cmd} makes it (spec §1)`],
    ["a manifest sent bare", MANIFEST.repeat(40), `stdin: is not a ustar tar (the header at byte 0 has no size); make the tar with ${cmd} (spec §1)`],
    ["a file and a directory both", tar([m, { name: "./lib", content: ENTRY }, { name: "./lib/x.mjs", content: ENTRY }]), `"lib": is a file and a directory both; make the tar with ${cmd} (spec §1)`],
  ];
  for (const [what, text, line] of cases) {
    const said = refusal(readBundle(text));
    expect(said, what).toBe(line);
    expect(said, what).not.toContain("\n");
    expect(said, what).toContain(cmd);
  }
  expect(refusal(readBundle(null))).toBe(cases.find(([w]) => w === "an empty stdin")![2]);
});
