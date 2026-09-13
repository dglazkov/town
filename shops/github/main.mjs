// town/github: a repository's issues, through the town's window for a
// github-token (townd spec, §7 and §8). It sends to
// $TOWN_CREDENTIAL_GITHUB_TOKEN what it would send to api.github.com,
// unsigned; the town signs it. Its stderr is kept in the town's audit, so
// no line here repeats an argument, a body, a URL, or what GitHub sent.

// The program, as spec §7 gives a worker shop: called once per call.
export default async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = {};
  for (let i = 0; i < rest.length; i += 2) args[rest[i].slice(2)] = rest[i + 1];
  const base = process.env.TOWN_CREDENTIAL_GITHUB_TOKEN;
  const HEADERS = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "town-github" };

  function fail(line) {
    process.stderr.write(`${line}\n`);
    process.exit(1);
  }

  /** `owner/name` as two encoded path segments; anything else, `.` and `..` included, is refused. */
  function repoPath(repo) {
    const m = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(repo ?? "");
    if (!m || [m[1], m[2]].some((part) => part === "." || part === "..")) fail("the repo is not owner/name");
    return `/repos/${encodeURIComponent(m[1])}/${encodeURIComponent(m[2])}`;
  }

  function positive(value, what) {
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 1) fail(`the ${what} is not a whole number above zero`);
    return n;
  }

  async function github(method, path, body) {
    if (!base) fail("the town gave no window for a github-token");
    let res;
    try {
      res = await fetch(`${base}${path}`, {
        method,
        redirect: "manual", // a Location names api.github.com itself, past the window: report it instead
        headers: body === undefined ? HEADERS : { ...HEADERS, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      fail("the town's window for github could not be reached");
    }
    const text = await res.text().catch(() => "");
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    if (res.status < 200 || res.status > 299) {
      const message = typeof json?.message === "string" ? json.message : res.statusText;
      fail(`github answered ${res.status}: ${message.replace(/\s+/g, " ").trim().slice(0, 200)}`);
    }
    if (json === undefined) fail(`github answered ${res.status}: not JSON`);
    return json;
  }

  async function readStdin() {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8");
  }

  const oneLine = (s) => String(s ?? "").replace(/[\r\n]+/g, " ");

  switch (command) {
    case "list": {
      const repo = repoPath(args.repo);
      const limit = positive(args.limit, "limit");
      const state = encodeURIComponent(args.state ?? "open");
      const lines = [];
      for (let page = 1; page <= 5 && lines.length < limit; page++) {
        const items = await github("GET", `${repo}/issues?state=${state}&per_page=100&page=${page}`);
        if (!Array.isArray(items)) fail("github answered with something other than a list");
        for (const issue of items) if (!issue.pull_request && lines.length < limit) lines.push(`#${issue.number} ${oneLine(issue.title)}`);
        if (items.length < 100) break;
      }
      if (lines.length) process.stdout.write(`${lines.join("\n")}\n`);
      break;
    }
    case "show": {
      const issue = await github("GET", `${repoPath(args.repo)}/issues/${positive(args.number, "number")}`);
      const body = issue.body ?? "";
      process.stdout.write(`#${issue.number} ${oneLine(issue.title)}\nstate: ${issue.state}\nauthor: ${issue.user?.login ?? "-"}\n\n${body}${body.endsWith("\n") ? "" : "\n"}`);
      break;
    }
    case "reply": {
      const path = `${repoPath(args.repo)}/issues/${positive(args.number, "number")}/comments`;
      const body = args.body ?? (await readStdin());
      if (body.trim() === "") fail("the body is empty; give --body or send it on stdin");
      const comment = await github("POST", path, { body });
      process.stdout.write(`${comment.html_url}\n`);
      break;
    }
    default:
      fail("no such command");
  }
}
