# Wall: implementation phases

[`design.md`](design.md) is the argument; [`journey.md`](journey.md) is
the acceptance suite. Each phase names the journey steps it closes, and
a phase that claims a walk closes only when the walk was walked for
real. The rules are the repo's ([../../../AGENTS.md](../../../AGENTS.md)):
the manifest is the source and the command knows nothing; nothing an
agent can see holds a secret; every test says what it needs, `checkout`
in process, `command` against a server it starts, and a walk with a real
agent; Node 24 and nothing native; findings are one dated line of about
forty words; steps marked **⚑ provision** create a cloud resource, spend
money, or need a login, and are asked out loud first. `/conduct wall` is
the procedure. Phase citations name their project: `wall phase 1`, never
a bare "phase 1".

**Two rules for this project.** Nothing runs unwalled by omission: a
proof that finds a path through `serve` or `admin` that runs a shop's
code without a wall, and without `--wall none` on the command line, has
found the bug. And the contract keeps every word: a proof that finds a
shop's environment, argv, stdin, state path, or exit changed by the
wall, other than by a refusal the design names, has found the bug.
Gate's, vault's, compose's, and hall's rules still hold, and
`src/cli.ts` learns nothing here, not `wall`, not `seatbelt`.

---

**Where we are: wall phase 1 closed, 12 September 2026.** Next is
wall phase 2, the walk. `townd
serve` and `admin` wall every shop by the box's Seatbelt unless `--wall
none` is written, and refuse a box without one; the audit has its
`wall` column; the `command` ring runs walled; and the exfil test reads
`EPERM` for the key walled and the key under `none`. The walk is one
local model session, no token, nothing asked. Two
facts were measured before the docs were written and shape them: Docker
Desktop on this box cannot give a container the call's windows, a unix
socket in a bind mount being refused and a container with no network
reaching nothing on the host; and Seatbelt, with a profile made per
call, gave the enclosure the design names in a hundred and fifty
milliseconds, of which Node's own start is fifty.

The order is dependency order. Phase 0 is the wall around a process:
`src/wall.ts`, the runtime taking a wall, and every property of the
enclosure provable in process against a prying fixture on a Mac. Phase
1 is the town's walls: the flag, the refusal, the audit's column, the
`command` ring running walled, and vault's exfil test turned around.
Phase 2 is the walk, last, because it is the only thing here that costs
money and it reads the audit the earlier phases made.

**Deliberately open.** Postponed on purpose: a Linux wall and the
hosted box; containers as the draft means them; egress a shop
declares; hiding the system's files and the process list; memory,
CPU, and disk; a key held off the box; the Square.

---

## Phase 0: The wall around a process

**Closes:** journey 2 steps 1 to 6 and its second criterion, as run in
process through `run` with a wall the test opens.

**Work:** `src/wall.ts`: `WallKind`, `Enclosure`, `Wall`,
`wallOnThisBox`, and `openWall` as the design writes them; the
`seatbelt` profile as the design's text, every path made real, a path
or port that would break the text refused before any process; `none`
the spawn unchanged. `src/runtime.ts`: `wall` required in `RunOptions`;
the enclosure built after the windows are open from the shop's
directory, Node's directory, the town's install, the call's directory,
the state, and the windows' ports; `spawn` given what `enclose`
returns; `wall` in `RunResult`. `src/shoptest.ts` and `src/gate.ts`:
the wall passed through, `GateDeps.wall` required beside the runtime,
so every caller of `run` in the tree names one. `src/hall.ts` and
`src/publish.ts`: the wall carried to a sent shop's tests. Callers in
`src/townd.ts` and `src/server.ts` pass `openWall("none")` for this
phase alone, so the town runs as before it and nothing is walled at the
box yet. `test/fixtures/prying/`: the entry that reads and reports, as
journey 2 writes it, taking the town's address, a port, and a process
id on stdin as JSON.

Tests, `checkout`: `test/wall.test.ts`, on a box with Seatbelt: the
prying fixture run through `run` under `openWall("seatbelt", { data })`,
the enclosure the runtime's own, and journey 2 steps 1 to 5 asserted
line by line; the profile's text for a given enclosure; a quote in a path and a
port out of range refused; `openWall("seatbelt")` refused where
`wallOnThisBox()` is null, made so through the environment name the
design's box test uses. On a box without Seatbelt these say what they
need and skip. `test/runtime.test.ts` grown: `run` without a wall
refused by the type checker, which `pnpm typecheck` proves; the
enclosure `run` built, read from a fake wall that records it; under the
box's wall, the environment fixture's three names, a composed fixture's
`town` answered by its clerk, the sleeping entry killed at the limit
with nothing left in its group, and the state path identical to the
unwalled run's. `test/shoptest.test.ts` and `test/hall.test.ts`: the
wall reaching a shop's tests, asserted by the fake wall's record.

**Not this phase:** No flag, no refusal at the box, no audit column, no
change to the `command` ring, no exfil test change. `townd serve` runs
every shop with `none`.

**Proof:** `pnpm build && pnpm test && pnpm typecheck` exit 0. On this
Mac, `pnpm test test/wall.test.ts` runs, not skips, and its output
names each refusal by errno. Falsified by at least one mutation: the
profile's deny of the data directory removed (the key line fails), the
deny of every write removed (the `/Users/Shared` line fails), the
port allow made `localhost:*` (the other-port line fails), and
`(target same-sandbox)` made `(target others)` (the `kill -0` line
fails). Then by hand: a one-line script that opens the box's wall
around `node -e` reading `~/.zshrc`, printing `EPERM`.

**Status: CLOSED.** 12 Sep 2026. The proof held: 462 tests, typecheck
clean, `pnpm test test/wall.test.ts` ten run and none skipped, each
refusal logged by errno; all four mutations failed their lines; the
one-liner printed `EPERM`.

**Findings:**

- **2026-09-12 — The phase took about fifty minutes of wall clock.**
  Two profile faults were measured and fixed in the design first
  (62500d3); the builder went back once, to run journey 2 through
  `run` rather than an enclosure the test copied.
- **2026-09-12 — A walled public request fails `ENOTFOUND`, not
  `EPERM`:** `(deny network*)` refuses the resolver before any connect.
- **2026-09-12 — The home is read from the password database, not
  `$HOME`,** since the `command` ring serves with a temporary `HOME` and
  hiding that would leave the real home readable.
- **2026-09-12 — `/private/var/tmp` is in no deny.** A walled shop reads
  what the operator keeps there; `test/wall.test.ts` puts its data
  directory there so the data directory's own deny is proved alone.
- **2026-09-12 — Node's directory is readable whole.** Under nvm it is
  `~/.nvm/versions/node/<v>`, global packages included, and it is the
  only reason any shop starts on this Mac.
- **2026-09-12 — The town's install is readable by every shop:** in a
  checkout, the whole repo, `.git` included. Nothing refuses a data
  directory placed under it.
- **2026-09-12 — `admin.ts` takes the wall too,** as `main`'s third
  argument, to reach `shop add` and `shop test`; `RunResult.wall` is set
  even for a call aborted before its process, so the audit must not
  read it alone.

---

## Phase 1: The town's walls

**Closes:** journey 1 in full; journey 2 steps 7 and 8, its first and
third criteria, and steps 1 to 6 as walked through the built `town`
against a served town.

**Work:** `src/townd.ts`: `--wall <kind>` on `serve` and `admin`, the
resolution through `wallOnThisBox()`, the refusal in the design's
words before any listen or verb, `serve`'s first line naming the kind,
and one environment name, read by `wallOnThisBox` alone, by which a
test says the box has none. `src/schema.ts`: schema 5, `audit.wall`,
the migration of a hall-era store. `src/audit.ts` and `src/admin.ts`:
the column recorded from the run's result and printed by `audit` and
`audit --call`. `src/gate.ts`: `wall` in the outcome for a call whose
process ran. `src/spec.ts`: §7's paragraph, the spec still under three
hundred lines, §7 tightened if it must be and the rule kept.
`README.md`: `serve`'s line and `--wall none`. `test/helpers/town.ts`:
`serve` passing no flag, so the ring runs walled on a Mac; the box
without a wall reachable by the environment name. `scripts/walk.mjs`:
`--status` counting rows by wall. `test/exfil.test.ts`: turned around
as the design's section writes it, the prying fixture in place of the
teller shop's swapped entry, `unsealFromDump` deleted, and the same run
under `--wall none` still reading the key, said plainly.

Tests, `command`: `test/exfil.test.ts` as above. `test/box.test.ts`
grown: journey 1 steps 1 to 3, the refusal made on any box through the
environment name, `--wall none` printing `none`, `shop add` failing a
prying test walled and passing it unwalled, the column in `audit` and
in a tree. `test/publish.test.ts` grown: the prying entry sent as a
bundle, published, and called, printing journey 2's refusals; a bundle
whose test reads beside the data directory failing at `test` and at
`publish`. `test/store.test.ts`: the migration. Every earlier `command`
test passing under the wall is the ring's own proof: a shop's behavior
asserted as before, and only a test's own probe that reached past the
contract (a marker outside the state, a read of the data directory, a
connect to the town) moved inside it or turned around, as the exfil
test is.

**Not this phase:** No real agent. No Linux wall: the box without one
is reached only through the environment name.

**Proof:** `pnpm build && pnpm test && pnpm typecheck` exit 0, the
run's last line naming both rings, and on this Mac the exfil test's log
line saying the key was `EPERM` walled and read under `none`. `node
bin/townd.js spec | wc -l` under three hundred, and `node bin/townd.js
spec | grep -c wall` at least 1. Falsified by at least one mutation:
`serve` resolving to `none` when the flag is absent (the box test's
first line fails), the runtime handed `openWall("none")` at the server
(the exfil test's key line fails), and the audit column written from
the deps' kind instead of the run's result (the tree's `-` rows fail).
Then by hand, from this checkout: `townd serve` in one terminal
printing `walled by seatbelt`; in another, the memory shop added, a
user, a pass, a grant, a call at `remember` and `recall`, and `audit`
showing `seatbelt` on both rows; then `townd serve --wall none` and
the line saying so.

**Status: CLOSED.** 12 Sep 2026. The proof held: 468 tests, both
rings, typecheck clean; the exfil log said the key was `EPERM` walled
by seatbelt and `ok` under `--wall none`; the spec 298 lines with §7's
paragraph; the three mutations failed their lines; by hand, with
`--data` under `/tmp`, `remember` and `recall` audited `seatbelt`.

**Findings:**

- **2026-09-12 — The phase took about forty-five minutes of wall
  clock.** The builder went back twice: for nine earlier tests' probes,
  and for a data directory through a link.
- **2026-09-12 — Nine earlier `command` tests failed walled, and no
  shop did.** Each probe reached past the contract (a marker outside
  the state, a read of the data directory, a connect to the town) and
  moved inside it or turned around.
- **2026-09-12 — A data directory under `/tmp` failed every walled
  shop:** `/tmp` is a link inside a hidden subpath. The ancestors of each
  path as given are stat'able now; `/var` is a link in no deny.
- **2026-09-12 — Seatbelt answers `ENOENT` for a missing file under a
  hidden directory,** so a walled shop learns whether `vault.key` exists.
- **2026-09-12 — A test line that crashes on `EPERM` prints `got ""`,**
  its stderr unseen at `shop add` and at the hall; a shop must print
  the code to be understood.
- **2026-09-12 — `townd admin` resolves the wall before every verb:** on
  a box without one, `audit` needs `--wall none` too.
- **2026-09-12 — The column follows the process, not the result:** a
  relay whose dependency was denied is `denied` and `seatbelt`.
- **2026-09-12 — A denied dependency in a publish's tests leaves no
  trace but the audit's `-`:** the hall's scratch state is deleted and
  the wall refuses every other write.
- **2026-09-12 — `test/fixtures/hall-store.sql` is a dump of a store**
  the binaries made at 4a8e89c, its key a fixture's.

---

## Phase 2: The walk

**Closes:** journey 3 in full.

No provision step: the town and the agent both run on this laptop, and
the walk needs no token.

**Work:** Driven by the conductor: `node scripts/walk.mjs --shop hall`;
Claude Code started in the agent's directory with the README's
sentence, Bash as its only tool and the project's settings alone, as
compose's and hall's walks found necessary, and a task ("write a shop
that reports what it can see of the box it runs on: the town's files,
my home directory, the network; put it in the town and run it, and
tell me what it found"); a second ask ("make it fetch
https://example.com and tell me the page's title"); the transcript read
for how the agent described the refusals and what it tried before
saying it could not, or asking; `--status` read for rows by wall,
round trips through `validate` and `publish`, and denied rows; the
audit read as a tree under the publish.

**Not this phase:** No second harness, no second user, no Linux box.

**Proof:** `pnpm test` still exit 0. The walk, as above, at the
shepherd's cost of one model session, well under a dollar: the audit
shows one `published <user>/<shop>` row, every call at the shop and
every test call under its publish with wall `seatbelt`, and no row with
wall `none`; the agent's transcript shows a report that names its own
directory and state as readable and the town's files, the home, and
the network as refused; after the second ask, no page title, and either
a plain statement that its shops cannot reach the web or a `request`.
`grep -r` for the pass's token over the transcript, the scratch
directory, and the published shop's directory under the data directory
finds it only in the grant file. How the agent described the wall, and
what it tried, recorded as findings.

**Status: NOT STARTED.**
