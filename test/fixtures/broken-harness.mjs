#!/usr/bin/env node
// A harness written again from the contract, docs/harness.md, small and
// importing nothing of town's, with one rule broken by the mode named in
// $BROKEN, so each conformance check is seen to fail. With BROKEN unset it
// breaks nothing and is conformant. test/conform.test.ts names, for each
// mode, exactly the checks it must fail.
//
//   env BROKEN=<mode> node test/fixtures/broken-harness.mjs <words…>
//
// It takes the grant from TOWN_GRANT as a value and nothing else: no path,
// no grant file, no --grant.

import { fstatSync } from "node:fs";

/** Each mode, and the rule of the contract it breaks. */
const MODES = {
  "drop-stderr-on-success": "writes the answer's stderr only when the call did not succeed",
  "split-argv": "joins the words with spaces and splits them again, as a careless shell would",
  "latin1-argv": "sends each word's UTF-8 bytes read as Latin-1",
  "json-in-argv": "takes --json and leaves it in argv too",
  "json-first-only": "takes --json only as the first word, leaving it among the words elsewhere",
  "own-help": "renders its own help for no words and for --help instead of asking the town",
  "no-stdin": "never reads stdin",
  "pipe-only": "reads stdin from a pipe and not from a regular file",
  "socket-stdin": "reads stdin from anything that is not a terminal, a held socket included",
  "trim-stdin": "trims white space from the end of stdin",
  "stdin-one-chunk": "reads stdin in one chunk of at most 64 KiB",
  "non-utf8-stdin": "sends stdin that is not UTF-8, its bad bytes replaced",
  "append-call": "posts to the grant's town with /call appended as text",
  "strict-value": "takes TOWN_GRANT as a value only when its very first character is {",
  "leak-grant": "prints what TOWN_GRANT holds in its refusal",
  "no-url-check": "takes a grant whose town is not a URL",
  "no-grant-exit-1": "exits 1 when there is no grant",
  "json-refusal-plain": "says its own refusals on stderr even with --json",
  "crash-unreachable": "lets a town that does not answer throw, its stack on stderr",
  "retry-on-failure": "posts a call again when its answer is exit 1",
  "own-failure-words": "replaces a failed call's stderr with a line of its own",
  "clamp-exit": "exits 2 for any answer's exit above 2",
  "denial-exit-1": "exits 1 for a denial",
};

const mode = process.env.BROKEN ?? "";
if (mode !== "" && !(mode in MODES)) {
  process.stderr.write(`broken-harness: no mode ${mode}\n`);
  process.exit(64);
}
const broken = (m) => mode === m;

function write(stream, text) {
  return new Promise((resolve) => (text === "" ? resolve() : stream.write(text, () => resolve())));
}

async function refuse(json, line, exit) {
  if (json && !broken("json-refusal-plain")) await write(process.stdout, `${JSON.stringify({ ok: false, output: "", notices: [], exit, error: line })}\n`);
  else await write(process.stderr, `${line}\n`);
  return exit;
}

function grantOf(text) {
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== "object" || typeof v.town !== "string" || typeof v.token !== "string" || v.token === "") return null;
    if (!broken("no-url-check")) new URL(v.town);
    return v;
  } catch {
    return null;
  }
}

async function readStdin() {
  let kind;
  try {
    const st = fstatSync(0);
    kind = st.isFIFO() ? "pipe" : st.isFile() ? "file" : st.isSocket() ? "socket" : "other";
  } catch {
    return null;
  }
  if (broken("no-stdin")) return null;
  const reads = broken("socket-stdin") ? !process.stdin.isTTY : broken("pipe-only") ? kind === "pipe" : kind === "pipe" || kind === "file";
  if (!reads) return null;
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
    size += chunk.length;
    if (broken("stdin-one-chunk") && size >= 64 * 1024) break;
  }
  let bytes = Buffer.concat(chunks);
  if (broken("stdin-one-chunk")) bytes = bytes.subarray(0, 64 * 1024);
  if (bytes.length === 0) return null;
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: !broken("non-utf8-stdin"), ignoreBOM: true }).decode(bytes);
  } catch {
    return undefined;
  }
  return broken("trim-stdin") ? text.trimEnd() : text;
}

async function main(argv) {
  let json = false;
  let words = [];
  argv.forEach((w, i) => {
    if (w === "--json" && (!broken("json-first-only") || i === 0)) {
      json = true;
      if (broken("json-in-argv")) words.push(w);
    } else words.push(w);
  });
  if (broken("split-argv")) words = words.join(" ").split(/\s+/).filter((w) => w !== "");
  if (broken("latin1-argv")) words = words.map((w) => Buffer.from(w, "utf8").toString("latin1"));

  if (broken("own-help") && (words.length === 0 || words.includes("--help"))) {
    await write(process.stdout, "usage: town <shop> <command> [--name value ...]\n");
    return 0;
  }

  const held = process.env.TOWN_GRANT;
  if (held === undefined) return refuse(json, "error: no grant: set TOWN_GRANT to the grant", broken("no-grant-exit-1") ? 1 : 3);
  const looksLikeValue = broken("strict-value") ? held.startsWith("{") : held.trimStart().startsWith("{");
  const grant = looksLikeValue ? grantOf(held) : null;
  if (!grant) return refuse(json, broken("leak-grant") ? `error: TOWN_GRANT=${held} is not a grant` : "error: TOWN_GRANT holds no grant", 3);

  const stdin = await readStdin();
  if (stdin === undefined) return refuse(json, "error: stdin is not UTF-8 text", 1);

  const url = broken("append-call") ? `${grant.town}/call` : new URL("/call", grant.town);
  const post = async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${grant.token}`, "content-type": "application/json" },
      body: JSON.stringify({ argv: words, stdin, json }),
    });
    const body = await res.json();
    if (typeof body.stdout !== "string" || typeof body.stderr !== "string" || typeof body.exit !== "number") throw new Error("not an answer");
    return body;
  };
  let answer;
  if (broken("crash-unreachable")) answer = await post();
  else {
    try {
      answer = await post();
      if (broken("retry-on-failure") && answer.exit === 1) answer = await post();
    } catch {
      return refuse(json, "error: the town did not answer", 1);
    }
  }

  await write(process.stdout, answer.stdout);
  if (broken("own-failure-words") && answer.exit === 1) await write(process.stderr, "error: the call failed\n");
  else if (!(broken("drop-stderr-on-success") && answer.exit === 0)) await write(process.stderr, answer.stderr);
  if (broken("clamp-exit") && answer.exit > 2) return 2;
  if (broken("denial-exit-1") && answer.exit === 2) return 1;
  return answer.exit;
}

process.exitCode = await main(process.argv.slice(2));
