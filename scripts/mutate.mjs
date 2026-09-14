#!/usr/bin/env node
// The mutation:
//
//   node scripts/mutate.mjs <file> --from <text> --to <text> -- <command> [args…]
//
// 1. Refuses, exit 2, unless <text> occurs in the file exactly once, saying
//    the count, before any copy is made.
// 2. Copies the file to a backup in a directory of its own under the
//    system's temporary directory, reads the backup back, and prints its
//    path first, so nothing is lost even if what follows is killed.
// 3. Writes the mutated file, runs the command with the terminal's stdio,
//    and reads its exit code itself.
// 4. Copies the backup back, compares the file to it byte for byte, and
//    removes the backup. A restore that fails or compares unequal is exit 3,
//    the backup's path in the last line, and the backup kept.
// 5. Prints one line: `mutation killed by <command> (exit <n>)`, exit 0, when
//    the command failed; `mutation survived <command> (exit 0)`, exit 1,
//    when it did not.
//
// The restore runs in a `finally`, and on SIGINT or SIGTERM too, whether or
// not the command has exited yet: the signal is passed to the command, the
// file put back and compared, the backup removed, and the exit is 130 (143
// for SIGTERM), or 3 if the restore failed. The restore writes the backup's
// bytes into the file rather than cloning it, so the file takes a new mtime,
// later than any build the command made of the mutation, and the next build
// is not skipped as fresh by scripts/stale.ts. Matching
// and replacing are on bytes, so nothing else in the file is re-encoded. No
// version control is run here, on purpose: the tree this runs in holds a
// builder's uncommitted work, and only the one file is ever written.

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { constants, tmpdir } from "node:os";
import path from "node:path";

const USAGE = "usage: node scripts/mutate.mjs <file> --from <text> --to <text> -- <command> [args…]";

/** A line on stdout or stderr, written before the next thing happens, so it lands above the command's output and survives an exit. */
const out = (line) => writeSync(1, `${line}\n`);
const err = (line) => writeSync(2, `${line}\n`);

function refuse(line) {
  err(line);
  process.exit(2);
}

function parse(argv) {
  const given = { file: undefined, from: undefined, to: undefined, command: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      given.command = argv.slice(i + 1);
      break;
    }
    if (a === "--from" || a === "--to") {
      if (i + 1 >= argv.length) refuse(`${a} needs a text; ${USAGE}`);
      given[a.slice(2)] = argv[++i];
    } else if (a.startsWith("--from=") || a.startsWith("--to=")) {
      const eq = a.indexOf("=");
      given[a.slice(2, eq)] = a.slice(eq + 1);
    } else if (given.file === undefined) {
      given.file = a;
    } else {
      refuse(`one file per run, and ${JSON.stringify(a)} is a second; ${USAGE}`);
    }
  }
  if (given.file === undefined) refuse(`no file given; ${USAGE}`);
  if (given.from === undefined) refuse(`no --from given; ${USAGE}`);
  if (given.to === undefined) refuse(`no --to given; ${USAGE}`);
  if (given.command.length === 0) refuse(`no command after --; ${USAGE}`);
  if (given.from === "") refuse("--from is empty, and an empty text occurs everywhere");
  return given;
}

/** Every place `needle` starts in `bytes`, overlaps counted, so "once" means one reading of the edit. */
function occurrences(bytes, needle) {
  const at = [];
  for (let i = bytes.indexOf(needle); i !== -1; i = bytes.indexOf(needle, i + 1)) at.push(i);
  return at;
}

const { file, from, to, command } = parse(process.argv.slice(2));
const shown = command.join(" ");

let original;
try {
  original = readFileSync(file);
} catch (e) {
  refuse(`cannot read ${file}: ${e.message}`);
}
const fromBytes = Buffer.from(from);
const at = occurrences(original, fromBytes);
if (at.length !== 1) {
  refuse(`${JSON.stringify(from)} occurs ${at.length} times in ${file}, not once; nothing was copied or changed`);
}

// 2. The backup, read back before the file is touched.
const dir = mkdtempSync(path.join(tmpdir(), "mutate-"));
const backup = path.join(dir, path.basename(file));
writeFileSync(backup, original);
if (!readFileSync(backup).equals(original)) {
  err(`the backup does not read back as ${file}'s bytes; ${file} is unchanged; the backup is at ${backup}`);
  process.exit(3);
}
out(`backup: ${backup}`);

/** 4. Put the file back from the backup and compare; true when it is back and the backup removed. */
let restored;
function restore() {
  if (restored !== undefined) return restored;
  try {
    const saved = readFileSync(backup);
    writeFileSync(file, saved);
    if (!readFileSync(file).equals(saved)) throw new Error("the file does not compare equal to the backup");
    rmSync(dir, { recursive: true, force: true });
    restored = true;
  } catch (e) {
    err(`restore failed: ${e.message}`);
    err(`${file} may still hold the mutation; its original is at ${backup}`);
    restored = false;
  }
  return restored;
}

let child;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (child && child.exitCode === null && child.signalCode === null) child.kill(signal);
    if (!restore()) process.exit(3);
    out(`mutation interrupted by ${signal}; ${file} put back`);
    process.exit(128 + constants.signals[signal]);
  });
}

// 3. The mutation and the command.
let outcome;
try {
  const i = at[0];
  writeFileSync(file, Buffer.concat([original.subarray(0, i), Buffer.from(to), original.subarray(i + fromBytes.length)]));
  outcome = await new Promise((resolve) => {
    child = spawn(command[0], command.slice(1), { stdio: "inherit" });
    child.on("error", (error) => resolve({ error }));
    child.on("exit", (code, signal) => resolve({ code: code ?? 128 + (constants.signals[signal] ?? 0), signal }));
  });
} finally {
  if (!restore()) process.exit(3);
}

// 5. The verdict.
if (outcome.error) {
  err(`could not run ${shown}: ${outcome.error.message}; ${file} put back`);
  process.exit(2);
}
if (outcome.signal === "SIGINT" || outcome.signal === "SIGTERM") {
  out(`mutation interrupted: ${shown} ended by ${outcome.signal}; ${file} put back`);
  process.exit(outcome.code);
}
if (outcome.code !== 0) {
  out(`mutation killed by ${shown} (exit ${outcome.code})`);
  process.exit(0);
}
out(`mutation survived ${shown} (exit 0)`);
process.exit(1);
