---
status: partial
since: 2026-09-14
see: road
note: "written 14 Sep 2026, the morning after baton closed: the town's road, where the wire `bin/town.js` speaks becomes a contract any harness may implement. `TOWN_GRANT` carries the grant itself as well as the path of a file holding one; `docs/harness.md` says what a `town` posts, prints, and refuses; and `scripts/conform.mjs` proves a harness against a town it sets up, on a laptop or over a box. The second project of the night sky and the first star of the sheep constellation, cut so the first thing built toward the line is the proof that town stays usable without sheep. Road phase 0 closed journey 2 the same morning: `TOWN_GRANT` holding the JSON `pass new` prints is the grant, anything else a path, and whatever in it yields no grant, a bad value, a bare token, a missing path, is refused in a line naming the variable and never its text; `--grant` and the walk up unchanged, twenty-six command tests. Road phase 1 wrote docs/harness.md, the wire in ten numbered sections for a reader who will not open src/, and scripts/conform.mjs, thirty checks each citing its section, against a town it starts or a box over --town, with the check shop test/conform; the laptop binary is conformant, a broken harness in twenty-three modes fails exactly the checks each breaks, and a checkout test binds the sections to the checks both ways."
---

# Road — the journeys

Today `bin/town.js` is the only `town` there is, and the wire it speaks
is written down nowhere but in its code. A harness that wants to hand an
agent a town, a sheep's shell the first of them, must read that code or
guess. **This project names the wire as a contract, lets the grant
arrive as a value in the environment where no file can be put, and ships
the script that proves a harness speaks it, so a `town` written by
someone who never saw town's code can be told, check by check, whether
it is one.** Nothing a shop sees changes, and nothing the town answers
changes; the agent's binary learns one new way to find its grant.

Each journey is an acceptance test: the work is done when it can be
walked as written. [design.md](design.md) is the mechanism and
[phases.md](phases.md) the walk. If a journey and the mechanism
disagree, the mechanism is what changes.

Vocabulary the journeys use, on top of the earlier projects':

- **A harness**: any program an agent runs as `town`. The laptop binary,
  `bin/town.js`, is one; a sheep's shell program would be another.
- **The contract**: `docs/harness.md`, what a harness posts, prints, and
  refuses, in numbered sections.
- **The grant value**: `TOWN_GRANT` holding the grant itself, the JSON
  `{ "town": <url>, "token": <token> }` that `townd admin pass new`
  prints, where today it holds a path.
- **Conformance**: `node scripts/conform.mjs [--town <url>] -- <harness
  command…>`: a town set up, the harness run once per check, each check
  `ok` or `FAIL` naming the contract's section, the town struck.
- **The check shop**: `test/conform`, a worker shop whose commands exist
  to be called by conformance, at `scripts/conform-shop/`.

## Journey 1: A harness author proves a `town`

Someone writing a harness, in any language, with no copy of town's
source open.

1. They read `docs/harness.md`. It says, in numbered sections: the
   request a harness posts to `<town>/call`, its header, and its body;
   where the harness finds its grant; which words the harness takes for
   itself (`--json`, wherever it stands) and that every other word goes
   to the town as typed, in order, empty strings and spaces intact; when
   stdin is read and sent, that it must be UTF-8 text, and when it is
   not read at all; the answer and what the harness does with each
   field; the harness's own refusals, their exit codes, and their
   `--json` envelope; the exit codes and what each means; and what a
   harness may add of its own (a grant file, a flag) without breaking
   the contract.
2. They write their `town` and run `node scripts/conform.mjs -- ./town`
   from a town checkout. The script starts a town on a free port over a
   data directory of its own, adds the check shop, makes a user, a pass
   expiring in three days with a grant at the check shop narrowed to
   some of its commands and one constraint, and a second pass it
   revokes. It runs the harness once per check, with `TOWN_GRANT` set to
   the grant value or not set, from an empty directory under an empty
   `HOME`, stdin a real pipe, a file, or nothing, as the check says.
3. Each check prints one line, `ok <check> (§<n>)` or `FAIL <check>
   (§<n>): <what was expected> / <what came>`. The checks cover: help
   for the grant with no words, and at the shop with `--help`; a call
   whose output and the notice line come back on the right streams; argv
   with an empty word, a word with spaces, and non-ASCII kept as typed;
   stdin through a pipe and from a file, text with quotes, backslashes,
   and newlines round-tripped, and a large stdin under the limit; no
   stdin read from a socket held open, the call answered all the same;
   stdin that is not UTF-8 refused before any
   request, which the audit confirms by a row count unchanged; a command
   the grant lacks and a value outside the constraint, exit 2 in the
   town's words; a shop that fails, exit 1; `--json` before, among, and
   after the words, the envelope on stdout and stderr empty, for a
   success, a denial, and a refusal of the harness's own; a revoked
   pass, exit 3; no grant, exit 3; a grant value that is not a grant,
   exit 3, the line never holding the value; a town that does not
   answer, exit 1.
4. The script ends on `conformant: <N> checks` and exit 0, or `not
   conformant: <k> of <N> checks failed` and exit 1, and in both cases
   stops the town and removes its directory. A harness command that
   cannot be run is exit 2, before any town is started.

Acceptance criteria:

- Conformance passes on the laptop binary, `-- node bin/town.js`, in the
  `command` ring.
- Every check can fail: a broken harness, a fixture that breaks one rule
  of the contract per mode, fails that check by name and no other, in
  the `command` ring.
- Every numbered section of `docs/harness.md` is cited by at least one
  check, and every check cites a section that exists; a `checkout` test
  reads both to say so.
- A harness written by an agent from `docs/harness.md` alone, in a
  language that is not TypeScript, in a directory outside the checkout,
  passes conformance; what the contract lacked for it is a finding.

## Journey 2: An operator hands a grant as a value

An operator giving an agent a town where no grant file can be put: a
harness's secret, a container's environment, a CI job.

1. `export TOWN_GRANT="$(townd admin pass new --user dimitri --label
   ci)"`, then `town --help` from a directory with no `.town/grant`
   above it and no `~/.town/grant`, prints help for the pass's grants,
   exit 0.
2. `TOWN_GRANT` holding a path still names a grant file, as today.
   `--grant <path>` still wins over `TOWN_GRANT`, and `TOWN_GRANT`, as a
   value or a path, still wins over a grant file found by walking up.
3. `TOWN_GRANT` holding text that begins with `{` and is not a grant, a
   JSON syntax error or a grant missing its token, is refused, exit 3,
   in one line that says `$TOWN_GRANT` does not hold a grant and prints
   none of what it holds; with `--json`, the same line in the envelope.
   `TOWN_GRANT` holding anything else that is not a path to a grant
   file, a bare token pasted where a grant was meant, is refused the
   same way, exit 3, in a line that names `$TOWN_GRANT` and not its
   text; `--grant <path>`, typed on argv, is still named.
4. `town` with no grant anywhere says, in its one line, that it reads
   `$TOWN_GRANT` as a grant or a path to one.

Acceptance criteria:

- Every step is asserted by a `command` test against a real town, and
  the refusal's test holds a token in the bad value and asserts the
  token's bytes appear on neither stream.
- `src/cli.ts` and `src/denials.ts` are the only files under `src/`
  this journey changes, and the CLI guard's test passes unchanged.

## Journey 3: The box speaks the same wire

The operator, at a laptop with the box's operator token, before handing
a harness a grant on the box.

1. `node scripts/conform.mjs --town https://town.dglazkov.workers.dev --
   node bin/town.js` sets up the check shop, the user, and both passes on
   the box through `townd admin --town`, with the operator's token from
   `$TOWN_OPERATOR` or `~/.town/operator`, which the script never reads
   itself. The audit check reads the box's audit over the wire.
2. Every check that passed on the laptop passes on the box, the unreachable
   town's check included, and the script ends `conformant`.
3. After, `townd admin --town <url> pass ls` shows both of the script's
   passes revoked and `shop ls` has no `test/conform`, whether the
   checks passed or failed.

Acceptance criteria:

- Walked against the operator's box, not a fixture: `wrangler dev` is not
  the box, and the box is where a sheep's harness will be pointed.
- The script run twice in a row against the box passes both times, so a
  user or a shop the first left behind does not fail the second.
