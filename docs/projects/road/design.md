# Road — the design

**14 September 2026.** Done: all three phases closed. `TOWN_GRANT`
holds the grant itself or a path; `docs/harness.md` is the contract and
`scripts/conform.mjs` its thirty checks; a Python harness written from
the doc alone and the laptop binary are both conformant on the box. The project's status lives in
[journey.md](journey.md)'s front matter. The journeys are the acceptance
suite, this doc is the argument, and [phases.md](phases.md) is the walk.
It is the star **road** cut from the
[sheep constellation](../../drafts/sheep-constellation.md), and the
second project of the [night sky](../../drafts/night-sky.md), after
[baton](../baton/design.md) and before drove, the sheep project that
puts a `town` in a sheep's shell. Road is town's half of that seam and
all of it that town can prove alone.

The thesis in one line: **the wire `bin/town.js` speaks is already small
enough to be a contract, a bearer, three fields posted, three fields
answered, four exit codes, so the work is to write it down where a
harness author can read it, to let the grant arrive as a value where a
harness cannot put a file, and to turn "any harness may implement it"
from a promise into a script that says, check by check, whether one
did.**

The draft's rule for the constellation holds here: town never imports
or reads sheep's files, and sheep implements town's wire from its doc,
never from its code. Road is what makes the second half possible. Its
proof that the doc is enough is an agent that writes a `town` from the
doc alone and passes the script, before any sheep is involved.

## The names

| Word | What it is | Where it lives |
| --- | --- | --- |
| the harness | any program an agent runs as `town`; the laptop binary is one | `bin/town.js` over `src/cli.ts`, and anyone's |
| the contract | what a harness posts to `<town>/call`, prints, and refuses, in numbered sections a check cites | `docs/harness.md` |
| the grant value | `TOWN_GRANT` holding the grant itself, `{ "town": <url>, "token": <token> }`, where today it holds a path | `src/cli.ts`; the contract's grant section |
| conformance | a town set up, a harness run once per check with the environment and stdin the check names, a line per check, the town struck | `scripts/conform.mjs` |
| the check shop | `test/conform`, a worker shop whose commands exist to be called by conformance, so a check's expected output is exact and owes nothing to a real shop's | `scripts/conform-shop/` |
| a broken harness | the laptop binary's rules broken one at a time by mode, so each check is seen to fail | `test/fixtures/broken-harness.mjs` |

## What the wire is today

Read from `src/cli.ts`, `src/clerk.ts`, `src/server.ts`, and
`src/box.ts`, 14 Sep 2026. The contract writes down this, and changes
only the grant:

- **The request.** `POST <town>/call`, `authorization: Bearer <token>`,
  `content-type: application/json`, body `{ "argv": [string…],
  "stdin": string | null, "json": bool }`. The town is the grant's
  `town` URL, and `/call` is resolved against it. A body over eight
  mebibytes is refused, and stdin over one megabyte is refused by the
  gate in its words; both come back as an answer, not an HTTP error.
- **The answer.** HTTP 200 and `{ "stdout", "stderr", "exit" }`. The
  harness writes `stdout` to its stdout and `stderr` to its stderr, as
  given, and exits with `exit`. It adds no newline and removes none.
  In json mode the town has already made `stdout` the envelope and
  `stderr` empty. A laptop town that fails outright answers 500 with the
  same three fields and a `why`; anything that is not the three fields,
  whatever the status, is a town that did not answer.
- **The words.** `--json` is the harness's, wherever it stands, and is
  sent as `json: true`, never in `argv`. Every other word goes in `argv`
  in order, as typed, and the town answers for all of them: no words and
  `--help` are help for the grant, which a harness does not render.
  `--grant <path>` is the laptop binary's own, as is where it looks for
  a file.
- **Stdin.** Read and sent when it is a pipe or a regular file; not read
  when it is a terminal, a character device such as `/dev/null`, or a
  socket, since a harness's commands may be handed a socket that never
  closes. Sent as `null` when empty. Bytes that are not UTF-8 are refused
  before any request, exit 1.
- **The harness's own refusals.** No grant, exit 3. A grant that is not
  one, exit 3. A town that does not answer, exit 1. Stdin that is not
  text, exit 1. Each one line on stderr, or with `--json` the envelope
  `{ "ok": false, "output": "", "notices": [], "exit": <n>, "error":
  <line> }` on stdout. Their words are the harness's; the exit codes and
  the envelope's shape are the contract's.
- **The exit codes.** 0 the call succeeded; 1 a usage error, a shop that
  failed or ran out of time, the town's failure, or the harness's own
  refusal of stdin or of a town that did not answer; 2 a denial by the
  grant, a command it lacks or a value outside a constraint; 3 a pass
  that is not valid, or no grant to make one.
- **Notices.** `town-notice: <kind> key=value…` lines at the head of
  `stderr`, or objects in the envelope's `notices`, written by the town;
  a harness passes them through like any other stderr.
- **The probe.** `GET <town>/` answers `town`, on a laptop and on the
  box. A harness need not use it.

Nothing here is new, which is the point: the laptop binary passes
conformance as it stands, but for the grant value, and a check it fails
is either a bug in it or a sentence of the contract that is wrong, and
the conductor decides which and records it.

## The grant from the environment

`TOWN_GRANT` names a file today. A harness that holds its grant as a
secret, a sheep's earmark, a container's environment, a CI job's
variable, has a value and nowhere it wants to write it. So
`TOWN_GRANT` takes either:

- **A value**, when its first character that is not white space is `{`:
  the JSON `townd admin pass new` prints, parsed as a grant file's
  contents are, `town` a URL and `token` a non-empty string.
  `TOWN_GRANT="$(townd admin pass new …)"` is the whole of handing it.
- **A path**, otherwise, read as today.

No path a person would write begins with `{`, and the rule needs no
second variable and no flag. The order is unchanged: `--grant <path>`,
then `TOWN_GRANT`, then `.town/grant` walking up, then `~/.town/grant`.

The refusal of a value is the one place this project must be careful.
Today's line for a bad file names the file, which is fair to read aloud;
a bad value holds, very likely, a token. So the line names the variable
and prints nothing of what it holds: `error: $TOWN_GRANT holds no grant
of the form { "town": <url>, "token": <token> }, nor the path of a file
holding one`, exit 3, a new entry in `src/denials.ts`. The same care reaches the path: a `TOWN_GRANT` that
does not begin with `{` and names no grant file may be a bare token
pasted where the grant was meant, and today's line would print it, so
that refusal is the same line, naming `$TOWN_GRANT` and not its text; a path given to
`--grant` is on argv already and is still named. The no-grant line grows to say `$TOWN_GRANT` is read
as a grant or as a path to one. `--grant` stays a path: a value on argv
is in the model's own command, its transcript, and the process table,
which is what the value exists to avoid.

Spec §7 does not change. A shop with dependencies still gets
`TOWN_GRANT` as the path of a grant file made for the call, on a laptop
and, as `/tmp/grant`, on the box; a shop's `town` would read either.

## The contract

`docs/harness.md`, written for a reader who has not seen town's code and
will not: a harness author, or an agent told to be one. Its sections are
numbered because a check cites them. In order: what a harness is and
that a person handed it a grant; the grant, the value and the path, and
that where a harness looks beyond `TOWN_GRANT` is its own; the words;
stdin; the request; the answer; the harness's own refusals and the
envelope; the exit codes; notices; what a harness may add, a grant file,
a `--grant`, a timeout no shorter than the town's own, and what it may
not, rendering help, parsing a shop's arguments, retrying a call; and
how to run conformance. Every rule in it is one the laptop binary keeps,
and every example is one a check runs.

It is a doc and not a `townd spec` section because its reader is neither
an operator nor a shop author, and because it must be readable from
GitHub by a project in another repo. `README.md` and `AGENTS.md` point
at it. It says what the wire is, not why; this design says why.

## Conformance

`node scripts/conform.mjs [--town <url>] [--wall <kind>] -- <harness
command…>`. Plain Node, no dependency, the built binaries, like
`scripts/walk.mjs`. The harness command is argv after `--`, and each
check appends its words to it.

**The town.** Without `--town`, `townd serve --data <tmp> --port 0`, its
wall the box's unless `--wall` names one, and every verb `townd admin
--data <tmp>`. With `--town <url>`, no town is started and every verb is
`townd admin --town <url>`, the operator's token townd's to read, the
check shop sent as a tar on stdin as `walk.mjs` sends memory. Either
way: the user `conform`, made or reused; the check shop added, replacing
one there; pass A expiring in three days, with a grant at `test/conform`
narrowed to its commands but one and a constraint on one argument;
pass B made and revoked at once. After, whatever happened: pass A
revoked, the shop removed, and a laptop town stopped and its directory
removed. Twice in a row over a box must pass twice.

**A check.** A name, the contract's section it proves, the words, the
grant (A's value, B's value, a value that is not a grant, a value whose
town is a closed port on `127.0.0.1`, or none), the stdin (none, a real
pipe, a regular file, holding the check's bytes, or a socket held open
and never written), and what must come
back: the exit code, stdout, and stderr, each exact or a stated match.
The harness runs from an empty directory under an empty `HOME`, with
`TOWN_GRANT` set or removed and nothing else of town's in its
environment. A pipe is made through `/bin/sh -c 'printf … | "$0" "$@"'`,
never Node's `stdio: "pipe"`, which on macOS and Linux is a socket and
which a conformant harness rightly does not read. A check that needs the
town's side, stdin refused before any request, reads the audit's rows
for pass A before and after.

**What it prints.** A line per check, `ok <name> (§<n>)`, or `FAIL <name>
(§<n>): expected <…> / came <…>` with the streams quoted and cut at a
few hundred bytes. Then `conformant: <N> checks`, exit 0, or `not
conformant: <k> of <N> checks failed`, exit 1. A harness command that
does not run at all is exit 2 before any town is made. `--list` prints
the checks and their sections and runs nothing, which the checkout test
reads.

**The check shop.** `test/conform`, `runtime: worker` so it runs on both
boxes, commands small enough to be exact: one that prints its argument,
one that prints its stdin back, one that prints the byte length of its
stdin, one that fails with a line on stderr, and one the grant leaves
out. Its manifest's tests run at `shop add` like any shop's. It lives
beside the script, not under `shops/`, since it is not one of the
town's shops and a box's hall should not offer it longer than a run.

## Proving the checks can fail

A script that says `ok` to everything proves nothing, and a harness
author's `town` is exactly the program that has not been written yet.
So `test/fixtures/broken-harness.mjs` is the laptop binary's rules
written again, small, with a mode in its environment that breaks one:
drops stderr on success, joins argv with spaces, reads stdin from a
socket and waits on it, sends stdin that is not text, leaves `--json` in argv, prints
the bad value in its refusal, exits 1 for no grant. `test/conform.test.ts`,
ring `command`, runs conformance on the laptop binary, expecting
`conformant`, and on the broken harness in each mode, expecting exactly
the checks that mode breaks to fail. A `checkout` test reads
`docs/harness.md`'s section numbers and `conform.mjs --list`, both ways.

## The walk

Two walks close the project, neither paid:

- **A stranger's harness.** An agent given `docs/harness.md` and nothing
  else, in a directory outside the checkout, told not to read it, writes
  a `town` in a language that is not TypeScript, Python or POSIX shell
  with `curl`. Conformance runs on it. What it failed and why, and what
  the contract did not say, are findings, and the contract is fixed
  where it was silent. The stranger's program is not kept in the suite:
  it would make the `command` ring need a second language, and the
  broken harness already keeps every check honest.
- **The box.** Conformance with `--town` on the operator's box, the
  laptop binary as the harness, twice, and the box left with no live
  pass of the script's and no check shop. The box is where drove will
  point a sheep's `town`, and `wrangler dev` is not the box.

## Deliberately not

- **A version on the wire.** There is one wire; a version is owed when a
  second exists, and `GET /` answering `town` leaves room for it.
- **A value on `--grant`.** Argv is the one place a secret must not go.
- **A package, an install, or `townd conform`.** The script runs from a
  checkout, as `walk.mjs` does; crate is where town gets an install path.
- **The operator's wire.** `townd admin --town` stays the operator's and
  undocumented for harnesses; nothing a harness does touches `/admin`.
- **Drove.** A sheep's `town`, its earmark, and its cell's fetch are
  sheep's project, and this repo never reads them.
