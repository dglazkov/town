# Baton — the design

**13 September 2026.** Done: all three phases closed. The project's status
lives in [journey.md](journey.md)'s front matter. The journeys are the
acceptance suite, this doc is the argument, and [phases.md](phases.md)
is the walk. It is the first star cut from the
[infra constellation](../../drafts/infra-constellation.md), and the
first project of the [night sky](../../drafts/night-sky.md), placed
before the sheep constellation's road because it costs a day and every
phase after it is briefed by it. It changes nothing a shop, an agent,
or an operator can see; its audience is the conductor and the builder
under [`/conduct`](../../../.claude/skills/conduct/SKILL.md).

The thesis in one line: **the conductor pattern has three hand-done
steps that cost time and lose work, and each is mechanical: the brief
is copied from the docs by a fixed recipe, a mutation check is a copy,
an edit, a run, and a copy back, and the inner loop is a subset of a
suite that already knows its rings. This project makes each a tool,
and conducts its own last two phases with the first.**

Measured 13 Sep 2026, and recorded in the infra draft: `pnpm test` is
44 s for 45 files and 687 tests, and the only test verb; the conductor
assembles every brief by hand from 67,000 words of project docs; and in
box phase 0 a conductor reverted a mutation with `git checkout` in a
dirty tree and wiped the builder's uncommitted work, which the repo's
memory now warns against in prose. A rule in prose is what a tool
replaces.

## The names

| Word | What it is | Where it lives |
| --- | --- | --- |
| the brief | the file a subagent is given for a phase: the phase's section, the journeys it closes, the design's names and map, the findings before it, the house rules, what it owns, where it stops, what it returns | `.claude/skills/conduct/brief.sh`, written to a path the conductor names |
| the mutation | one literal edit to one file, a command run against it, and the file put back by copy and compared byte for byte; killed when the command failed, survived when it did not | `scripts/mutate.mjs` |
| the selector | `pnpm test` grown to take a ring, a file, or `--list`, building only when `dist/` is older than `src/` | `scripts/test.mjs` |
| the ring | a test file's declared environment, `checkout`, `command`, or `box`, read from its first line | `scripts/rings-reporter.ts`, unchanged |
| the tail | the three parts of every brief that never change, what you own, where you stop, what you return | inside `brief.sh`, and the skill points at it |

## What the skill says, and what this project makes of it

The conduct skill's §1 gives the brief's shape verbatim: the phase's
section, the journeys it closes, the design parts they cite as paths,
the findings so far, the house rules, then what the subagent owns,
where it stops, and what it returns. Every part but one is a fixed
extraction from three files and `AGENTS.md`; the one that is not, the
design parts a phase cites, the skill itself asks for as paths, not
paraphrase. So the brief is a script. §2's checklist asks for
mutations by hand and warns, from box phase 0, what a `git checkout`
does in a dirty tree. So the mutation is a script that cannot type
`git`. §2 also asks for the whole suite and typecheck, not just the new
tests; nothing changes there, and the selector is for the builder's
loop before that point, never for the proof.

## The brief

`brief.sh <project> <phase> [--any]` prints the brief to stdout; the
conductor redirects it to the scratchpad and edits it after. It is
mechanical in the way `status.sh` is, and it reads the same files by the
same conventions, so a doc that breaks a convention breaks the brief
loudly rather than silently leaving a section empty:

- **The phase**: from `## Phase <N>:` to the next `## ` in `phases.md`,
  verbatim. A phase that does not exist is exit 2. A phase whose
  `**Status:**` is not `NOT STARTED` is refused with the word it has,
  unless `--any`, since briefing a closed phase is almost always the
  wrong phase number.
- **The ⚑ steps**, listed first under a line that says they are asked
  before the phase starts, taken from the phase's section; `none` when
  there are none.
- **The journeys it closes**: every `journey <N>` the phase's
  `**Closes:**` paragraph names, each `## Journey <N>:` section of
  `journey.md` whole, steps and criteria, since a journey is short and
  a step range cut out of one loses its criteria. A journey named and
  not found is exit 1 naming it: that is the skill's first gate, the
  docs disagree, found before anyone is briefed.
- **The design's names and map**: `design.md`'s `## The names` table
  whole, then every heading of `design.md` with its line range as a
  `sed -n` the builder can run. This is what "paths, not paraphrase"
  means when a script does it; the conductor pastes a section in when
  a phase leans on one, and the builder reads the rest by path.
- **The findings that bind**: every finding under every phase before
  `<N>`, verbatim, and the Open roster after them under its own line.
- **The house rules**: `AGENTS.md` verbatim, then the project's own
  rules, which are `phases.md` from its first line to its first `---`,
  verbatim.
- **What you own**: every path under `src/`, `test/`, `scripts/`,
  `shops/`, `bin/`, `.claude/`, and `docs/drafts/` that the phase's
  section names, deduplicated and in order of first mention, followed
  by the tail's fixed sentences: nothing under `docs/projects/`,
  nothing vendored, no other project's code.
- **Where you stop** and **what you return**: the tail, verbatim from
  the skill's §1 as it stands the day this is built, kept inside
  `brief.sh` so the two cannot drift apart without a test noticing;
  the skill's §1 is rewritten to say "the tail is `brief.sh`'s" and to
  quote it no longer.

The first line of the brief names the project, the phase, the date,
and `git rev-parse --short HEAD`, so a brief reread a day later says
which tree it described.

## The mutation

`node scripts/mutate.mjs <file> --from <text> --to <text> -- <command>
[args…]`:

1. Refuses, exit 2, unless `<text>` occurs in the file exactly once,
   printing the count, so a mutation is never applied twice or to the
   wrong line.
2. Copies the file to a backup under the system's temporary directory
   in a directory named for this run, and prints the backup's path
   first, so nothing is lost even if what follows is killed.
3. Writes the mutated file, runs the command with the terminal's stdio,
   and reads its exit code itself.
4. Copies the backup back, compares the two byte for byte, and removes
   the backup. A restore that fails or compares unequal is exit 3 and
   names the backup path in the last line; that is the one outcome that
   needs a person, and it is loud.
5. Prints one line: `mutation killed by <command> (exit <n>)`, exit 0,
   when the command failed as a mutation should make it; `mutation
   survived <command> (exit 0)`, exit 1, when it did not.

It never runs `git`, never touches another file, and restores in a
`finally`, on `SIGINT` included. The command usually is `pnpm test
<file>` through the selector, which is why the selector comes before the
mutation in the phase order below, and why both are needed for a
mutation check to be cheap enough to run on every proof.

## The selector

`pnpm test` becomes `node scripts/test.mjs`, which keeps every property
`test/rings.test.ts` guards today and adds four:

- `pnpm test` with nothing: build, then all three rings, the reporter's
  line last, exactly as now.
- `pnpm test --ring <name>[,<name>…]`, repeatable: those rings alone.
  `checkout` and `command` are file lists handed to vitest's `node`
  project, computed by `testFilesOfRing`; `box` is vitest's `box`
  project. The reporter's line still ends the run and names what ran.
- `pnpm test <file>…`: those files, each in the project its ring says,
  so a builder types the file and never the project.
- `pnpm test --list`: each ring, what it needs, and its files; nothing
  run. `--watch`: vitest's watch over the `checkout` ring alone, since
  the command ring runs built binaries, so a watch would run
  yesterday's build, and the box ring runs in workerd through the pool,
  which a watch leaves out; the flag says so when given with another
  ring.

The build is `tsc -p tsconfig.build.json`, run when `dist/` is older
than any file under `src/` by the rule `test/helpers/town.ts` already
enforces, or when `--build` is given; a fresh `dist/` skips it and says
so in one line, which takes the inner loop from build-plus-suite to the
one file's time. `test/rings.test.ts` changes its assertion about
`scripts.test` to the new string and gains one about `test.mjs`'s build
command and its ring handling, so a selector that quietly dropped a
ring would fail the guard.

## The conductor's tools, in the skill

The skill is edited once, in the phase that builds each tool: §0 says
to run `status.sh` and then `brief.sh`; §1 says the brief is written by
the script and edited by the conductor, and quotes the tail no longer;
§2's checklist names `mutate.mjs` for a mutation and says why in one
line, the box phase 0 story. The `Things that have gone wrong before`
list gains that story. Nothing else in the skill moves.

## Testing it

One test file, `test/baton.test.ts`, ring `checkout`, since nothing in
it spawns the built binaries or imports from the pool: it spawns `bash`
and `node` on the scripts against fixtures. A fixture project,
`test/fixtures/baton-project/`, is three small docs in the house shape
with two phases, two journeys, a names table, one finding, one Open,
and one ⚑ step, and the test asserts each section of the brief for
phase 1 against it, the refusal for phase 0 once its status reads
`CLOSED`, the `--any` override, exit 1 for a journey the phase names
and the fixture lacks, and exit 2 for a phase that is not there. The
mutation is tested against a fixture file and a `node -e` command that
exits by whether the mutation is present, asserting the backup line,
the verdict lines and codes, and the file's bytes after each. The
selector is tested by `--list` alone, since running it runs the suite;
its ring handling is asserted by `test/rings.test.ts` as above.

## What this does not do, on purpose

- **The suite's clock, CI, and the Linux wall.** Tempo's, next in the
  infra constellation; the selector does not make a test faster, it
  runs fewer.
- **A rehearsal or a hermetic ring.** Stranger's and crate's, after the
  line.
- **Choosing the design sections for the builder.** The map with line
  ranges is the mechanical half; the conductor still reads the phase
  and pastes what it leans on, which is the judgment the skill leaves
  with the conductor on purpose.
- **A mutation list or a mutation score.** One mutation per run, named
  by the proof; a phase's Proof paragraph is the list.
- **Editing a brief after it is written.** The script writes, the
  conductor edits; the script never rereads a brief.
- **A formatter, the `.gitignore`, the README test.** Sweep's.
