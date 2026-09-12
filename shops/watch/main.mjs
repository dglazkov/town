// town/watch: a repository's open issues, compared with the last look,
// over two shops called as the agent that called this one would call them
// (townd spec, §7 and §8): `town github list` for the issues, and `town
// memory remember` and `recall` for the last look, kept under
// watch/<owner>/<name>. The lines go to memory as --value, not on stdin:
// `town` sends stdin only from a pipe or a file, and a Node child's piped
// stdin is a socket. Every `town` is spawned with no shell and its stdin
// closed. When a call fails, what `town` printed on stderr is passed on as
// it came, since the town's lines carry no value, and this shop exits as
// `town` did. Its own lines name no repo, no key, and no title.

import { spawn } from "node:child_process";

const [command, ...rest] = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i += 2) args[rest[i].replace(/^--/, "")] = rest[i + 1];

function fail(line, code = 1) {
  process.stderr.write(`${line}\n`);
  process.exit(code);
}

/** `owner/name` as GitHub's characters, neither part `.` or `..`; the key's two segments. */
function parts(repo) {
  const m = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(repo ?? "");
  if (!m || [m[1], m[2]].some((p) => p === "." || p === "..")) fail("the repo is not owner/name");
  return [m[1], m[2]];
}

function town(argv) {
  return new Promise((resolve) => {
    const child = spawn("town", argv, { stdio: ["ignore", "pipe", "pipe"] });
    const out = [];
    const err = [];
    child.stdout.on("data", (b) => out.push(b));
    child.stderr.on("data", (b) => err.push(b));
    child.on("error", () => fail("there is no town to call"));
    child.on("close", (code) => resolve({ exit: code ?? 1, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8") }));
  });
}

/** Exits as `town` did, with what it printed on stderr. */
function passOn(r) {
  process.stderr.write(r.stderr);
  process.exit(r.exit === 0 ? 1 : r.exit);
}

/** The `#<number> <title>` lines of a text, by number, in order. */
function issues(text) {
  const byNumber = new Map();
  for (const line of text.split("\n")) {
    const m = /^#(\d+) /.exec(line);
    if (m) byNumber.set(m[1], line);
  }
  return byNumber;
}

async function openIssues(repo) {
  const r = await town(["github", "list", "--repo", repo, "--state", "open", "--limit", "100"]);
  if (r.exit !== 0) passOn(r);
  return issues(r.stdout);
}

function section(heading, lines) {
  return lines.length ? `${heading}:\n${lines.join("\n")}\n` : `${heading}: none\n`;
}

const repo = args.repo;
const [owner, name] = parts(repo);
const key = `watch/${owner}/${name}`;

switch (command) {
  case "mark": {
    const now = await openIssues(repo);
    const r = await town(["memory", "remember", "--key", key, "--value", [...now.values()].join("\n")]);
    if (r.exit !== 0) passOn(r);
    process.stdout.write(`remembered ${now.size} open issue${now.size === 1 ? "" : "s"}\n`);
    break;
  }
  case "changes": {
    // The last look first: with none, nothing is asked of GitHub.
    const last = await town(["memory", "recall", "--key", key]);
    if (last.exit === 1 && /^no value under that key$/m.test(last.stderr)) fail("there is no last look at this repository to compare with; remember its issues first");
    if (last.exit !== 0) passOn(last);
    const before = issues(last.stdout);
    const now = await openIssues(repo);
    const opened = [...now].filter(([n]) => !before.has(n)).map(([, line]) => line);
    const closed = [...before].filter(([n]) => !now.has(n)).map(([, line]) => line);
    process.stdout.write(section("opened", opened) + section("closed", closed));
    break;
  }
  default:
    fail("no such command");
}
