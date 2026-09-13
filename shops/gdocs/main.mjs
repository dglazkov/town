// town/gdocs: a Google document's text, through the town's window for a
// google-oauth credential (townd spec, §7 and §8). It sends to
// $TOWN_CREDENTIAL_GOOGLE_OAUTH what it would send to
// docs.googleapis.com, unsigned; the town signs it, refreshing the token
// first when it must. Its stderr is kept in the town's audit, so no line
// here repeats the id, a URL, or what Google sent: a failure is the status
// alone.

const [command, ...rest] = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i += 2) args[rest[i].slice(2)] = rest[i + 1];
const base = process.env.TOWN_CREDENTIAL_GOOGLE_OAUTH;

function fail(line) {
  process.stderr.write(`${line}\n`);
  process.exit(1);
}

if (command !== "read") fail("unexpected arguments");
if (!base) fail("the town gave no window for a google-oauth credential");
// A document's id is letters, digits, "-" and "_"; anything else would be a path of its own.
if (!/^[A-Za-z0-9_-]{1,200}$/.test(args["doc-id"] ?? "")) fail("the document id is not one");
const markdown = args.format === "markdown";

let res;
try {
  res = await fetch(`${base}/v1/documents/${args["doc-id"]}`, {
    redirect: "manual", // a Location would name Google itself, past the window: report it instead
    headers: { Accept: "application/json", "User-Agent": "town-gdocs" },
  });
} catch {
  fail("the town's window for google-oauth could not be reached");
}
const text = await res.text().catch(() => "");
if (res.status < 200 || res.status > 299) fail(`gdocs answered ${res.status}`);
let doc;
try {
  doc = JSON.parse(text);
} catch {
  fail(`gdocs answered ${res.status}: not JSON`);
}

const HEADINGS = { TITLE: 1, SUBTITLE: 2, HEADING_1: 1, HEADING_2: 2, HEADING_3: 3, HEADING_4: 4, HEADING_5: 5, HEADING_6: 6 };

/** A body's paragraphs as lines, a table's cells walked in order; a line break inside a paragraph is a space. */
function lines(content) {
  const out = [];
  for (const el of content ?? []) {
    if (el.paragraph) {
      const line = (el.paragraph.elements ?? []).map((e) => e.textRun?.content ?? "").join("").replace(/[\r\n\v]+/g, " ").trimEnd();
      const level = HEADINGS[el.paragraph.paragraphStyle?.namedStyleType];
      out.push(markdown && level && line ? `${"#".repeat(level)} ${line}` : line);
    } else if (el.table) {
      for (const row of el.table.tableRows ?? []) for (const cell of row.tableCells ?? []) out.push(...lines(cell.content));
    }
  }
  return out;
}

const body = lines(doc?.body?.content);
while (body.length && body.at(-1) === "") body.pop();
process.stdout.write(body.length ? `${body.join("\n")}\n` : "");
