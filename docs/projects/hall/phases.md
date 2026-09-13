# Hall: implementation phases

[`design.md`](design.md) is the argument; [`journey.md`](journey.md) is
the acceptance suite. Each phase names the journey steps it closes, and
a phase that claims a walk closes only when the walk was walked for
real. The rules are the repo's ([../../../AGENTS.md](../../../AGENTS.md)):
the manifest is the source and the command knows nothing; nothing an
agent can see holds a secret; every test says what it needs, `checkout`
in process, `command` against a server it starts, and a walk with a real
agent; Node 24 and nothing native; findings are one dated line of about
forty words; steps marked **⚑ provision** create a cloud resource, spend
money, or need a login, and are asked out loud first. `/conduct hall` is
the procedure. Phase citations name their project: `hall phase 1`, never
a bare "phase 1".

**Two rules for this project.** The hall is never more than the agent:
a proof that finds a shop the agent sent tested or run with a grant the
agent does not hold, at a command or a value the agent's grants refuse,
or kept under a name that is not the agent's user's, has found the bug,
whatever the shop asked for. And a person decides: a proof that finds a
pass holding a grant no person made, other than the publish grant at a
shop the pass itself published, has found the bug. Gate's, vault's, and
compose's rules still hold: the gate decides before a process exists,
the value never leaves the town's memory, a shop is never more than its
caller, and `src/cli.ts` learns nothing here, not `hall`, not
`publish`, not `permit`; the one thing it learns, that stdin is text,
names no shop.

---

**Where we are: hall phase 1 closed, 12 September 2026.** Next is
hall phase 2, the walk, which waits on nothing: the conductor drives a
real Claude Code session at the cost of one model session, with no
token, cloud resource, or hand. An agent's shop now crosses the wire
as a ustar tar on stdin, is validated, tested as the agent in scratch,
and published under its user's name with a grant at it; a request says
what its approval would drop; and every journey step but the walk's is
proved in both rings and walked by hand against a real town.

The order is dependency order. Phase 0 is the hall in the town: the
store's fourth schema with the hall's row, permits, owners, and
sources; the gate's door for the town's own shop; the hall's five
commands that read and write the store alone, `search`, `show`,
`spec`, `request`, `requests`; and the admin's permit verbs, each
provable in process with the gate over a store. Phase 1 is the bundle
and the publish: the tar on stdin, the staging shared with `shop add`,
`validate`, `test`, and `publish` with the agent's tree, the publish
grant, the agent's binary's one line, and every journey step the
`command` ring can walk. Phase 2 is the walk, last, because it is the
only thing here that costs money and it reads the audit the earlier
phases made.

**Deliberately open.** Postponed on purpose: a second user and what one
sees of another's shops; versions, deprecation, the gardener, usage and
similarity in search; notices for permits; credentials at a sent shop;
the Square; containers, which the first shop nobody read makes the next
project.

---

## Phase 0: The hall is a shop

**Closes:** journey 2 steps 1, 2, 3, 4, and the `user add` refusal of
step 6, as verbs against a store with no server and as the gate run in
process; journey 1 steps 2, 3, and 7, as run in process with the gate
over a store; journey 3 steps 1 and 8, and its second criterion, as run
in process.

**Work:** `src/store.ts`: schema 4, the `permits` table, `shops.owner`,
`grants.source`, the migration of a compose-era database on open, the
hall's row written on every open from `src/hall.ts`, the permit queries
(new, replacing a pending one of the pass at the shop; by id; list by
pass; decide), `newGrant` taking a source, `user add` refusing a name
that is not a namespace. `src/manifest.ts`: `runtime` typed
`"subprocess" | "town"`, `town` refused for any manifest the validator
sees with a line naming it the town's own, a dependency on `town/hall`
refused naming §8. `src/hall.ts`: the manifest as the design writes it,
and `runHall` answering `search`, `show`, `spec`, `request`, and
`requests` as the design's Permits and Search sections write them;
`validate`, `test`, and `publish` answer `error: not built yet` with
exit 1 and result `town-error`, until hall phase 1. `src/help.ts`:
`helpForShop(manifest, held)`, a shop's help for every command with a
line saying which this pass holds. `src/gate.ts`: step 6 for a manifest
whose runtime is `town`, no binding, no process, the hall's outcome
taken whole. `src/admin.ts`: `permit ls`, `permit approve` with
`--commands`, `--constraint`, `--credential`, and `--expires`, `permit
deny`; `grant ls` gaining `source`; `shop ls` gaining `owner`; `shop
add` and `shop rm` refusing `town/hall`. `test/cli-guard.test.ts` grown
by the words `hall`, `publish`, `permit`. `README.md`: the operator's
lines gain the hall grant and the permit verbs.

Tests, `checkout`: `test/store.test.ts`, a compose-era database opens
with its rows and the table, the columns, and the hall's row, and a
second open leaves one hall row; permits made, replaced, decided, and
listed; the namespace refusal. `test/manifest.test.ts`, `runtime: town`
and `depends` on the hall each refused with their line.
`test/hall.test.ts`, the hall's manifest through the validator with
`runtime` its one refusal, and the hall's own tests through `runHall`;
the gate over a store with the hall and the memory shop: no hall grant
denied at step 2 and `spec` alone denied `publish` at step 3, both with
no process; `search` listing every shop with held commands and
filtering by query; `show` for a shop not held; `spec` equal to `SPEC`;
`request` refused as `grant new` refuses a command the shop lacks and a
constraint on an argument that takes none, and made otherwise,
replacing a pending one; `requests` in each state; a constraint on
`request.shop` enforced at step 5. `test/admin.test.ts` grown: `permit
approve` making a grant with its source, narrowing, refusing wider,
revoking and naming a held grant, refusing an uncovered dependency with
the permit still pending; `permit deny`; the two hall refusals at `shop
add` and `shop rm`; the columns in `grant ls` and `shop ls`.

**Not this phase:** No bundle, no publish, no server change, no
`command` test, no change to `src/cli.ts` or the spec.

**Proof:** `pnpm build && pnpm test && pnpm typecheck` exit 0. Then by
hand against a temporary data directory: `townd admin --data <tmp> shop
ls` lists `town/hall` and nothing else; `townd admin --data <tmp> shop
rm town/hall` is refused naming the town's own; `townd admin --data
<tmp> permit ls` prints a header and no rows. Falsified by at least one
mutation: the gate spawning a process for the hall (the no-process test
fails), `permit approve` accepting a command the permit did not ask for
(the wider test fails), and the hall's row not written on open (the
store's test fails).

**Status: CLOSED.** 12 Sep 2026. The proof held as written: 423 tests
in both rings, typecheck clean, `shop ls` listing `town/hall` alone,
`shop rm town/hall` refused as the town's own, `permit ls` a bare
header, and each of the three mutations failing its tests.

**Findings:**

- **2026-09-12 — The phase took thirty-three minutes of wall clock.**
  The docs agreed; the one detour was the split below, committed on its
  own as 77318d8 before the phase's work. No return to the builder.
- **2026-09-12 — `store.ts` and `admin.ts` split along their nouns.**
  The store, 829 to 375, gave `schema.ts`, `credentials.ts`, `audit.ts`,
  and `liveness.ts`; the admin, 720 to 414, gave `grants.ts` and
  `publish.ts`. The ratchet is empty.
- **2026-09-12 — `request` checks shop, commands, and constraints
  only.** Dependencies and needs are `permit approve`'s, through the
  whole of `checkGrant`, so a permit at a composed or needy shop is made
  and waits for its dependencies.
- **2026-09-12 — `user add town` is refused too.** A user named `town`
  would own the operator's namespace at publish; the design's namespace
  rule did not name it.
- **2026-09-12 — Approval drops the permit's constraints on commands it
  did not grant,** since a grant may not constrain a command it lacks;
  a replaced pending permit is deleted and the new one gets a new id.
- **2026-09-12 — The compose-era fixture is a dump of a real town.**
  `test/fixtures/compose-store.sql` is `sqlite3 .dump` of a data
  directory `townd admin` made at 77318d8, its vault key a fixture's.
- **2026-09-12 — `shop add` over a published shop clears its owner.**
  `upsertShop` writes owner on conflict; hall phase 1 kept it, since the
  operator's door is owner none, and tests it both ways.

---

## Phase 1: The bundle and the publish

**Closes:** journey 1 steps 1 to 7 and its three criteria, as walked by
a scripted agent on the memory shop and a to-do shop the test writes;
journey 2 in full; journey 3 in full but for step 5's walk of the
contract by a real agent, which is hall phase 2's.

**Work:** `src/bundle.ts`: `readBundle` as the design's Bundle section
writes it, each refusal one line naming what was found and the `tar`
command. `src/publish.ts`: the staging, the checks against dependents,
the copy, the tests, the move, the row, and the naming of grants that
stop being live, already there since the split, given two front doors: the
operator's from a directory with the operator's tree and owner none,
the hall's from a bundle with the agent's tree and the agent's user as
owner; `shop add` unchanged in what it prints. `src/gate.ts`: the pass
caller carrying an optional `stateRoot`, handed to the runtime in place
of the store's and carried to every caller below. `src/shoptest.ts`:
`testShop` taking the caller its tree runs as, the operator's
`TestTree` or the agent's pass with the test's scratch root, so one
runner serves both. `src/hall.ts`: `validate`, `test`, and `publish` as
the design's Publishing section writes them, steps 1 to 9, with the
answers, exits, results, and details it names; the publish grant made,
remade, and left alone over a person's. `src/cli.ts`: stdin read as
bytes and refused when not UTF-8, with `denials.stdinNotText`.
`src/spec.ts`: the four statements, still under three hundred lines by
the manifest test's count.
`scripts/walk.mjs`: `--shop hall`, the memory shop, a pass with the
hall whole and memory at `remember`, `recall`, and `list`, no token;
`--status` counting the hall's rows by command and detail: validates
and their refused sections, tests, publishes, requests, and the pass's
grants with their sources.

Tests, `checkout`: `test/bundle.test.ts`, a tar built by hand block by
block and one built by the box's `tar --format ustar` read back file
for file with the execute bit kept; `..`, absolute, a link, a pax
header, a name past the format, truncated, and no manifest at the root
each refused with its line. `test/hall.test.ts` grown, over a fixture
bundle with a fake runtime and the real one: refusals in the design's
order and `detail` naming their sections; the tests' caller the pass
with the test's scratch root, asserted by a fixture dependency that
prints `TOWN_STATE`; a test at a dependency outside the agent's
constraint failing with the agent's line and no dependency process; the
publish grant made at every command, remade at a republish with a new
command, and not made over a grant with source null or `permit`; the
staging gone after every path; the grants at the shop that stop being
live named. `test/cli-guard.test.ts`, the new words, and `--json` and
`--grant` still the only flags. Tests, `command`: `test/publish.test.ts`,
walking journey 1 steps 1 to 7
through the built `town` with the box's `tar`, a to-do shop the test
writes, approval at the box between steps, and the audit's tree under
the publish; journey 2 steps 1 to 6 with the copy of a compose-era
store; journey 3 steps 1 to 8: the constraint on `request.shop`, the
five refusals written nowhere, the uncovered dependency, the
constraint at a dependency with the origin's process count unchanged,
the bundle refusals with no staging left, the published fixture's
environment printed and the agent's token found nowhere, a second pass
not listing the shop, the person's grant left standing, the recipe
vanishing when memory is narrowed and back when granted, and a source
enumeration of every grant at the end. `test/walk.test.ts` grown:
`--shop hall` sets the stage with no token and `--status` counts.

**Not this phase:** No real agent. The to-do shop that exists is the
test's.

**Proof:** `pnpm build && pnpm test && pnpm typecheck` exit 0, the run's
last line naming both rings. `node bin/townd.js spec | wc -l` under
three hundred, and `node bin/townd.js spec | grep -c 'town/hall'` at
least 1. Falsified by at least one mutation: the bundle accepting a
path with `..` (the bundle test fails), the hall's tests running with
grants of the declared commands instead of the agent's (the constraint
test fails), and `src/cli.ts` sending bytes that are not text (the
guard's or the cli test's line fails). Then by hand, from this
checkout: `townd serve` in one terminal; in another, the memory shop
added, a user, a pass, a hall grant and a memory grant, a to-do shop
written in a scratch directory with `.town/grant`, `tar --format ustar
-cf - -C todo . | town hall publish`, `town --help` listing it, one
call to it, `town hall request --shop town/memory --commands
remember,recall,list,forget`, `permit approve` at the box, `town --help`
listing `forget` and the to-do shop still, and
`audit --call` on the publish showing its tests' calls, typed as
journey 1 writes them.

**Status: CLOSED.** 12 Sep 2026. The proof held as written: 442 tests
in both rings, typecheck clean, a 295-line spec naming `town/hall`, the
three mutations each failing its tests, and the walk by hand against a
real town through publish, request, approval, and the publish's tree.

**Findings:**

- **2026-09-12 — The phase took forty minutes of wall clock.** One
  doc fix came first (c0f7852) and one design change midway (b4514b3);
  the builder was sent back once, for it.
- **2026-09-12 — An approval that replaces a grant can take away.**
  Journey 1 step 7 as first written left memory at `forget` alone and
  the agent's to-do shop not live. Now a request names what its
  approval would drop.
- **2026-09-12 — Every `tar -C <dir> .` begins with `./`.** The reader
  skips the root's entry; the design's "empty or `.` path is refused"
  would have refused every tar the box makes.
- **2026-09-12 — macOS tar skips a path too long for ustar, exit 0,**
  and its pax tar holds binary xattr headers, so `town` refuses it as
  not text before the hall's pax refusal can speak.
- **2026-09-12 — A failed test line ends with the denial's line,** at
  both doors, so the operator's `shop test` text changed too. Bundle
  refusals cite §1; dependency refusals count as §8 in `detail`.
- **2026-09-12 — A publish revokes every unrevoked publish grant of the
  pass at the shop,** live or not, so a stale one cannot come back
  beside the new one.
- **2026-09-12 — A publish's inner rows carry the publish's start
  time:** the gate hands the hall one clock reading per call.
- **2026-09-12 — Journey 3 step 5's thirty-second stop is not walked
  for a published shop.** It is the runtime path every shop runs, which
  the runtime tests prove.

---

## Phase 2: The walk

**Closes:** journey 1 step 8; journey 3 step 5 as walked by a real
agent's shop.

No provision step: the town and the agent both run on this laptop, and
the walk needs no token.

**Work:** `README.md`: the operator's lines gain the hall's one-line
example. Then, driven by the conductor: `node scripts/walk.mjs --shop
hall`; Claude Code started in the agent's directory with the README's
sentence, Bash as its only tool and the project's settings alone, as
compose's walk found necessary, and a task ("build a shop that keeps a
to-do list, put it in the town, and use it to add three items and
finish one"); a second ask that memory's grant does not allow ("clear
every note under notes/"), with the conductor approving the permit at
the box when the agent asks and telling it so; the transcript read for
what the agent did at each refusal and for how it asked; `--status`
read for round trips through `validate` and `publish`, refusals by
section, test counts, and denied rows; the audit read as a tree under
the publish.

**Not this phase:** No second harness, no second user, no shop with a
dependency unless the agent writes one.

**Proof:** `pnpm test` still exit 0. The walk, as above, at the
shepherd's cost of one model session, well under a dollar: the audit
shows at least one `publish` row with detail `published <user>/<shop>
<version>` and at least one call at the published shop with result
`ok`; zero rows `denied` at any shop before the second ask, and after
it, the agent's transcript shows a `request` rather than a workaround,
one `requested` row, one grant with source `permit <id>`, and a call at
`forget` with result `ok`. The number of `validate` and `publish` rows
before the first `published`, and every `refused §…` detail, recorded
as a finding with the counts, since they are the pilot's first
measure. `grep -r` for the pass's token over the transcript, the
scratch directory, and the published shop's directory under the data
directory finds it only in the grant file.

**Status: NOT STARTED.**
