#!/usr/bin/env node
// The selector, `pnpm test`:
//
//   pnpm test                             build, then all three rings, the reporter's line last
//   pnpm test --ring <name>[,<name>…]     those rings alone; --ring may be given again
//   pnpm test <file>…                     those files, each in the vitest project its ring says
//   pnpm test --list [--ring <name>]      each ring, what it needs, and its files; nothing built or run
//   pnpm test --watch [<file>…]           vitest's watch over the checkout ring, or those of its files
//   pnpm test --build …                   build whether or not dist/ is stale
//
// With nothing given the run is what it was: `tsc -p tsconfig.build.json`,
// then `vitest run` over both projects of vitest.config.ts. Given a ring or
// a file, the build runs only when scripts/stale.ts says dist/ is stale, the
// rule test/helpers/town.ts fails a command test by, and says `dist is
// fresh` or `building` in one line. The checkout and command rings are file
// lists, testFilesOfRing's, handed to vitest's `node` project; box is the
// `box` project, handed its files the same way so a file list of another
// ring never filters it to nothing. Vitest matches a file argument as a
// substring of each test file's path, so a list that would match a file it
// does not name is refused. `--watch` takes the checkout ring alone: the
// command ring runs dist/ as built before the watch, so a watch would rerun
// yesterday's build, and the box ring runs in workerd through the pool. A
// refusal is one line on stderr and exit 2, before anything is built or run.
// Plain node imports the two .ts files by stripping their types.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { RINGS, testFilesOfRing } from "./rings-reporter.ts";
import { staleness } from "./stale.ts";

const ROOT = path.resolve(import.meta.dirname, "..");

/** The build, package.json's `build` script; test/rings.test.ts holds the two to one string. */
const BUILD = "tsc -p tsconfig.build.json";

/** The vitest project each ring runs in, by the `name` vitest.config.ts and vitest.box.config.ts give it. */
const PROJECT = { checkout: "node", command: "node", box: "box" };

/** What each ring needs, as --list prints it. */
const NEEDS = {
  checkout: "this process and the modules under src/, nothing built",
  command: "the built binaries, dist/ no older than src/, each against a townd serve of its own",
  box: "workerd, through the vitest pool over wrangler.jsonc, no account and no network",
};

/** The run with nothing given, what `pnpm test` was: vitest over every project of vitest.config.ts. */
const ALL = ["run"];

function refuse(line) {
  process.stderr.write(`${line}\n`);
  process.exit(2);
}

function parse(argv) {
  const given = { rings: [], files: [], list: false, watch: false, build: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue;
    if (a === "--ring" || a.startsWith("--ring=")) {
      const value = a === "--ring" ? argv[++i] : a.slice("--ring=".length);
      if (!value || value.startsWith("-")) refuse(`--ring needs a name: ${RINGS.join(", ")}`);
      for (const name of value.split(",")) {
        if (!RINGS.includes(name)) refuse(`no ring "${name}": the rings are ${RINGS.join(", ")}`);
        if (!given.rings.includes(name)) given.rings.push(name);
      }
    } else if (a === "--list") given.list = true;
    else if (a === "--watch") given.watch = true;
    else if (a === "--build") given.build = true;
    else if (a.startsWith("-")) refuse(`no flag ${a}: the selector takes --ring <name>[,<name>…], a test file, --list, --watch, and --build`);
    else given.files.push(a);
  }
  return given;
}

/** Each ring's test files, relative to the root. */
function ringFiles() {
  return Object.fromEntries(RINGS.map((ring) => [ring, testFilesOfRing(ROOT, ring)]));
}

/** A file argument as the root-relative path of a test file, with its ring. */
function resolveFile(arg, files) {
  const base = process.env.INIT_CWD ?? process.cwd();
  const full = path.resolve(base, arg);
  const rel = path.relative(ROOT, full).split(path.sep).join("/");
  if (!existsSync(full)) refuse(`no file ${arg}`);
  const ring = RINGS.find((r) => files[r].includes(rel));
  if (!ring) refuse(`${arg} is not a test file with a ring: a *.test.ts under test/ whose first line is // ring: ${RINGS.join("|")}`);
  return { rel, ring };
}

function list(rings, files) {
  const out = rings.map((ring) => `${ring}: ${NEEDS[ring]}; ${files[ring].length} files\n${files[ring].map((f) => `  ${f}\n`).join("")}`);
  process.stdout.write(out.join(""));
}

function build() {
  const [bin, ...args] = BUILD.split(" ");
  const r = spawnSync(path.join(ROOT, "node_modules/.bin", bin), args, { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function vitest(args) {
  const r = spawnSync(path.join(ROOT, "node_modules/.bin/vitest"), args, { cwd: ROOT, stdio: "inherit" });
  process.exit(r.status ?? 1);
}

const given = parse(process.argv.slice(2));
const files = ringFiles();

if (given.list) {
  if (given.files.length || given.watch || given.build) refuse("--list builds and runs nothing: give it --ring <name> or nothing");
  list(RINGS.filter((r) => given.rings.length === 0 || given.rings.includes(r)), files);
  process.exit(0);
}

const named = given.files.map((f) => resolveFile(f, files));
// A ring named is all its files; a file named is itself. --watch with neither is the checkout ring.
const whole = [...given.rings];
if (given.watch && whole.length === 0 && named.length === 0) whole.push("checkout");
const rings = [...whole];
for (const { ring } of named) if (!rings.includes(ring)) rings.push(ring);
if (given.watch && rings.includes("command")) refuse("--watch watches the checkout ring alone: the command ring runs dist/ as it was built before the watch began, so a watch would rerun yesterday's build");
if (given.watch && rings.includes("box")) refuse("--watch watches the checkout ring alone: the box ring runs in workerd through the pool, which a watch leaves out");

if (rings.length === 0) {
  process.stdout.write("building\n");
  build();
  vitest(ALL);
}

for (const ring of whole) if (files[ring].length === 0) refuse(`no test file names ring ${ring}`);
const filters = [...new Set([...whole.flatMap((r) => files[r]), ...named.map((n) => n.rel)])].sort();
const every = RINGS.flatMap((r) => files[r]);
for (const f of filters) {
  const also = every.filter((t) => !filters.includes(t) && t.toLowerCase().includes(f.toLowerCase()));
  if (also.length) refuse(`${f} would also run ${also.join(" ")}: vitest matches a file by substring; rename one`);
}

const why = given.build ? "--build" : staleness(ROOT);
if (why === null) process.stdout.write("dist is fresh\n");
else {
  process.stdout.write(`building: ${why}\n`);
  build();
}

const projects = [...new Set(rings.map((r) => PROJECT[r]))];
vitest([given.watch ? "watch" : "run", ...projects.flatMap((p) => ["--project", p]), ...filters]);
