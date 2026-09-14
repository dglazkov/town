# Baton: implementation phases

[`design.md`](design.md) is the argument; [`journey.md`](journey.md) is
the acceptance suite. Each phase names the journey steps it closes. The
rules are the repo's ([../../../AGENTS.md](../../../AGENTS.md)): the
manifest is the source and the command knows nothing; nothing an agent
can see holds a secret; every test says what it needs; Node 24 and
nothing native; findings are one dated line of about forty words; steps
marked **⚑ provision** are asked out loud first. `/conduct baton` is the
procedure. Phase citations name their project: `baton phase 1`, never a
bare "phase 1".

**Two rules for this project.** The tools are for the conductor and the
builder and change nothing a shop, an agent, or an operator can see: a
proof that finds `src/` changed by this project, other than nothing,
has found the bug. And the project conducts itself: baton phase 1 and
baton phase 2 are briefed with the `brief.sh` baton phase 0 builds, and
baton phase 2 is verified with the `mutate.mjs` baton phase 1 builds;
what the conductor still had to do by hand is a finding, not a failure.

---

**Where we are: planned, 13 September 2026.** Nothing built; baton
phase 0 is next. No phase has a ⚑ step and nothing waits on a person.
The first star cut from the infra constellation, placed before the
sheep constellation's road in the night sky because it costs a day and
every phase after it is briefed by it.

The order is the order of use. Phase 0 is the brief, so the two phases
after it are briefed by it. Phase 1 is the selector, since the mutation
runs one file through it. Phase 2 is the mutation, verified by itself,
and the conductor's last hand-done step goes.

**Deliberately open.** Postponed on purpose: the suite's clock, CI, and
the Linux wall (tempo); the rehearsal and the hermetic rings (stranger,
crate); choosing design sections for the builder; a mutation list or
score; the formatter and the README test (sweep).

---

## Phase 0: The brief

**Closes:** journey 1 steps 1 to 3 and its first criterion; its second
criterion closes with baton phase 2.

**Work:** `.claude/skills/conduct/brief.sh`: the extraction as the
design writes it, section by section, in the order journey 1 step 1
gives, reading `phases.md`, `journey.md`, `design.md`, and `AGENTS.md`
by the conventions `status.sh` already reads them by; the header line
with the commit; the refusals of step 2 with their exit codes and
`--any`; the tail inside the script as the skill's §1 has it today. The
skill: §0 names `brief.sh` after `status.sh`; §1 says the script writes
and the conductor edits, and replaces its quoted tail with one sentence
naming the script. `test/fixtures/baton-project/`: `phases.md`,
`journey.md`, `design.md` in the house shape, two phases, two journeys,
a names table, one finding, one Open, one provision step, and a phase 1 that
names a journey the fixture lacks behind a flag the test flips.
`test/baton.test.ts`, ring `checkout`: journey 1's assertions against
the fixture.

**Not this phase:** No change to `scripts/`, `src/`, or `package.json`.
No design section chosen for the builder; the map is the whole of it.

**Proof:** `pnpm build && pnpm test && pnpm typecheck` exit 0, three
rings, `test/baton.test.ts` in the checkout ring's count. `brief.sh
box 4 --any > /tmp/b.md` writes a brief whose sections, read by the
conductor against `docs/projects/box/`, are the phase 4 section, journey
5 and journey 2 whole, box's names table and heading map, every finding
of box phases 0 to 3 and the two Opens, `AGENTS.md`, box's rules
paragraph, and an owned list naming `scripts/walk.mjs`; `brief.sh box 4`
without `--any` exits 1 saying `CLOSED`; `brief.sh box 9` exits 2.
Falsified by at least one mutation: a journey number dropped from the
`**Closes:**` parse (the fixture test's journey section fails), the
tail's text changed in the script alone (the test comparing the tail to
the skill's one sentence and the script's text fails).

**Status: NOT STARTED.**

---

## Phase 1: The selector

**Closes:** journey 3 in full.

**Work:** `scripts/test.mjs`: the argument parse, `--ring` repeatable
and comma-separated, positional files, `--list`, `--watch`, `--build`;
the stale rule as `test/helpers/town.ts` applies it, factored so both
read one function or the test reads the same rule twice and says so; the
build, then vitest with the `node` project's file list or the `box`
project or both, the reporter last; the one-line refusals the journey
names. `package.json`: `"test": "node scripts/test.mjs"`, `build` and
`typecheck` unchanged. `test/rings.test.ts`: the `scripts.test`
assertion moved to the new string and the selector's build command and
ring names asserted from its source. `AGENTS.md`'s block: the four new
lines. `test/baton.test.ts`: `--list`'s output asserted.

**Not this phase:** No test made faster; no ring added; no CI.

**Proof:** Briefed by `brief.sh baton 1`, what the conductor added by
hand recorded as a finding. `pnpm build && pnpm test && pnpm typecheck`
exit 0, three rings, the reporter's counts as before plus this
project's file. `pnpm test test/args.test.ts` prints `dist is fresh` and
ends on a reporter line of one checkout file; `pnpm test --ring box`
runs the four pool files and no other; `pnpm test --list` runs nothing;
`pnpm test --watch --ring command` refuses in one line; `touch
src/args.ts && pnpm test test/args.test.ts` prints `building`. Falsified
by at least one mutation: the box project dropped from the all-rings
run (`test/rings.test.ts`'s ring assertion fails), the stale rule
inverted (the fresh-dist line appears after a `touch`, which the
conductor reads by hand and records).

**Status: NOT STARTED.**

---

## Phase 2: The mutation

**Closes:** journey 2 in full, and journey 1's second criterion.

**Work:** `scripts/mutate.mjs`: the five steps as the design writes
them, the once-only match, the backup under the temporary directory
printed first, the command with inherited stdio, the restore by copy in
a `finally` with `SIGINT` handled, the byte comparison, the verdict
lines and exit codes 0, 1, 2, 3; no `git` anywhere in the file. The
skill: §2's checklist names `mutate.mjs` with the box phase 0 sentence;
the `Things that have gone wrong before` list gains it.
`test/fixtures/baton-mutant.txt` and `test/baton.test.ts`: journey 2's
assertions, each outcome, the bytes after each, and the source read for
`git`.

**Not this phase:** No mutation list, no score, no second file per run.

**Proof:** Briefed by `brief.sh baton 2`, what the conductor added by
hand recorded as a finding. `pnpm build && pnpm test && pnpm typecheck`
exit 0, three rings. With an uncommitted edit made by the conductor to
`test/fixtures/baton-mutant.txt`'s neighbour for the purpose, `node
scripts/mutate.mjs src/args.ts --from '<a line the conductor picks>'
--to '<its mutation>' -- pnpm test test/args.test.ts` ends on `mutation
killed`, exit 0, and `git status --short` is the same before and after;
the same with `--to` equal to `--from`'s text plus a comment ends on
`mutation survived`, exit 1; a `--from` of `import` is refused with its
count, exit 2. The conductor verifies this phase's own `test/baton.test.ts`
mutation with `mutate.mjs` and types no `git checkout`; the memory rule
about reverting by backup is then the script's, recorded as a finding.

**Status: NOT STARTED.**
