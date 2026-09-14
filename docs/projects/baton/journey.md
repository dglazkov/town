---
status: done
since: 2026-09-13
see: baton
note: "written 13 Sep 2026, the night the four constellations were drafted: the conductor's tools, the first star of the infra constellation and the first project of the night sky. Baton phase 0 closed 13 Sep 2026: brief.sh writes a phase's brief from the docs, tested against a fixture project and read against box phase 4. Baton phase 1 closed the same night: pnpm test takes a ring, a file, --list, or --watch, building only when dist/ is stale. Baton phase 2 closed it: mutate.mjs backs a file up, runs a command against its mutation, and restores it by copy, verified in a dirty tree and on itself, with no git checkout typed. Done 13 Sep 2026."
---

# Baton — the journeys

Seven projects were conducted in two days, seventy-one commits, every
phase briefed, verified, and recorded by hand. Three of the hands were
mechanical. **This project gives the conductor a brief written by a
script from the docs, a mutation that cannot lose the builder's work,
and a `pnpm test` that runs one ring or one file, and it conducts its
own last two phases with the first.** Nothing an agent, a shop, or an
operator can see changes.

Each journey is an acceptance test: the work is done when it can be
walked as written. [design.md](design.md) is the mechanism and
[phases.md](phases.md) the walk. If a journey and the mechanism
disagree, the mechanism is what changes.

Vocabulary the journeys use, on top of the earlier projects':

- **The brief**: the file a subagent is given for a phase, in the
  conduct skill's §1 shape.
- **The tail**: the brief's three fixed parts, what you own, where you
  stop, what you return.
- **A mutation**: one literal edit to one file, a command run against
  it, the file put back by copy. Killed when the command failed;
  survived when it did not.
- **The selector**: `pnpm test` taking a ring, a file, or `--list`.
- **Stale**: `dist/` older than any file under `src/`, the rule
  `test/helpers/town.ts` already applies.

## Journey 1: The conductor briefs a phase

A conductor at the repo root, about to conduct a phase of some project.

1. `.claude/skills/conduct/brief.sh <project> <N> > <scratchpad>/brief.md`
   writes the brief. Its first line names the project, the phase, the
   date, and the commit. Under it, in order: the ⚑ steps to ask about
   first, or `none`; the phase's section verbatim; every journey the
   phase's `**Closes:**` names, whole; the design's names table and a
   map of its headings with line ranges as `sed -n` lines; every
   finding of every earlier phase, then the Open roster; `AGENTS.md`
   verbatim and the project's own rules paragraph verbatim; what the
   subagent owns, the paths the phase names, then the tail.
2. `brief.sh <project> <N>` for a phase whose status is `CLOSED`,
   `PART-DONE`, or `WITHDRAWN` prints the word and exits 1;
   `--any` writes the brief anyway. A phase that is not in `phases.md`
   is exit 2 naming the file. A journey the phase names and
   `journey.md` lacks is exit 1 naming the journey, and no brief is
   written.
3. The conductor edits the brief, pasting in the design sections the
   phase leans on and anything the docs do not say, and gives it to
   the subagent. The skill's §1 says this is the procedure, and quotes
   the tail no longer; the tail the subagent reads is `brief.sh`'s.

Acceptance criteria:

- Every section of the brief for a fixture project's phase is the
  fixture's own text, byte for byte where the design says verbatim, in
  the order above; a `checkout` test asserts it.
- Baton phases 1 and 2 were briefed by `brief.sh`, and what
  the conductor had to add by hand is a finding on each.

## Journey 2: The conductor checks a mutation

A conductor verifying a phase whose Proof names a mutation, in a tree
with the builder's uncommitted work in it.

1. `node scripts/mutate.mjs src/<file>.ts --from '<text>' --to
   '<text>' -- pnpm test test/<file>.test.ts` prints the backup's path,
   runs the test with its output on the terminal, puts the file back,
   and ends on `mutation killed by pnpm test test/<file>.test.ts (exit
   1)`, exit 0. `git status --short` before and after are the same, and
   the builder's uncommitted edits in every file are intact.
2. The same with a mutation the test does not catch ends on `mutation
   survived pnpm test test/<file>.test.ts (exit 0)`, exit 1, the file
   put back all the same.
3. A `--from` that occurs twice, or not at all, is refused before any
   copy, exit 2, with the count.
4. Interrupted with `^C` during the command, the file is put back and
   the backup removed. A restore that fails ends on the backup's path,
   exit 3.

Acceptance criteria:

- `scripts/mutate.mjs` contains no invocation of `git`, and a test
  reads its source to say so.
- Every outcome above is asserted by a `checkout` test against a
  fixture file and a `node -e` command.
- Baton phase 2 was verified with `mutate.mjs`, and the
  conductor typed no `git checkout`.

## Journey 3: The builder's inner loop

A builder in the middle of a phase, one test file open.

1. `pnpm test test/args.test.ts` builds only if `dist/` is stale,
   saying `dist is fresh` or `building` in one line, then runs that
   file in the project its ring says, and ends on the reporter's line
   naming one file of one ring.
2. `pnpm test --ring checkout` runs the checkout ring's files and no
   other; `--ring command,box` the other two; `--ring box` the pool
   alone. `pnpm test --list` prints each ring, what it needs, and its
   files, and runs nothing.
3. `pnpm test --watch` watches the checkout ring; with `--ring command`
   it refuses in one line saying why.
4. `pnpm test` with nothing is what it was: build, three rings, the
   reporter last, exit 0 on a green tree.

Acceptance criteria:

- `test/rings.test.ts` guards the new `scripts.test` string, the
  selector's build command, and that every ring is reachable by name,
  so a selector that dropped a ring fails the guard.
- `pnpm test` from a clean checkout after `pnpm install` runs all three
  rings and exits 0, exactly as `AGENTS.md`'s block says.
