# Road: implementation phases

[`design.md`](design.md) is the argument; [`journey.md`](journey.md) is
the acceptance suite. Each phase names the journey steps it closes. The
rules are the repo's ([../../../AGENTS.md](../../../AGENTS.md)): the
manifest is the source and the command knows nothing; nothing an agent
can see holds a secret; every test says what it needs; Node 24 and
nothing native; findings are one dated line of about forty words; steps
marked **⚑ provision** are asked out loud first. `/conduct road` is the
procedure. Phase citations name their project: `road phase 1`, never a
bare "phase 1".

**Three rules for this project.** The contract writes down the wire as
the laptop binary and the town speak it, and only the grant value
changes it: a check the laptop binary fails has found a bug in the
binary or a wrong sentence in the contract, and which one is decided,
fixed, and recorded, never papered over by loosening the check. Nothing
a shop or the town sees changes: `src/cli.ts` and `src/denials.ts` are
the only files under `src/` the project touches, spec §7 is unchanged,
and a proof that finds another changed has found the bug. And town
never reads sheep's files: the stranger's harness in road phase 2 is
written from `docs/harness.md` alone, outside the checkout, by an agent
told not to read it.

---

**Where we are: planned, 14 September 2026.** Nothing built. Next is
road phase 0, the grant as a value. No phase needs a person: there are
no provision steps, and road phase 2's box walk reaches the operator's
existing box with the token already in `~/.town/operator`, as box
phase 4's walk did.

The order is the order of dependence. Road phase 0 is the grant value,
since every check hands a harness its grant that way. Road phase 1 is
the contract and conformance together, since each is the other's test.
Road phase 2 is the walk: a stranger's harness from the doc alone, and
the laptop binary over the box.

**Deliberately open.** Postponed on purpose: a version on the wire; a
value on `--grant`; an install path or `townd conform` (crate); the
operator's wire as a harness contract; a sheep's `town` (drove).

---

## Phase 0: The grant as a value

**Closes:** journey 2 in full.

**Work:** `src/cli.ts`: `TOWN_GRANT` read as a grant when its first
character that is not white space is `{`, parsed and checked as a grant
file's contents are, and as a path otherwise; the order of `--grant`,
`TOWN_GRANT`, the walk up, and `~/.town/grant` unchanged; the header
comment saying so. `src/denials.ts`: a new line for a value that holds
no grant, naming `$TOWN_GRANT` and printing nothing of its value, exit
3; the no-grant line saying `$TOWN_GRANT` is read as a grant or a path
to one. A `command` test, in the file that tests the binary's grant
today or a new `test/grant-value.test.ts`: journey 2's four steps
against a real town, the refusal's bad value holding a token whose bytes
are asserted absent from both streams, with and without `--json`.
`README.md` and `AGENTS.md`: the line that says `town` reads a grant
file says it reads `TOWN_GRANT` as a value too.

**Not this phase:** No `docs/harness.md`, no conformance. No change to
`--grant`, to spec §7, to `src/runtime.ts`, or to any shop.

**Proof:** `pnpm build && pnpm test && pnpm typecheck` exit 0, three
rings. By hand, from an empty directory with `HOME` an empty directory,
against a town from `townd serve --data <tmp> --port 0` and `townd
admin --data <tmp> user add u`:
`TOWN_GRANT="$(townd admin --data <tmp> pass new --user u --label l
2>/dev/null)" node bin/town.js --help` exit 0 with help;
`TOWN_GRANT='{"town":"http://127.0.0.1:1","token":"sekrit-abc"}x' node
bin/town.js` exit 3, and neither stream holds `sekrit`. `git diff
--stat` names no file under `src/` but `cli.ts` and `denials.ts`.
Falsified by at least one mutation, by `scripts/mutate.mjs`: the value
branch's `{` test inverted (journey 2 step 1's test fails), the refusal
made to interpolate the value (the token-absence assertion fails).

**Status: NOT STARTED.**

---

## Phase 1: The contract and its conformance

**Closes:** journey 1 steps 1 to 4 and its first three criteria; its
fourth closes with road phase 2.

**Work:** `docs/harness.md`: the contract in numbered sections as the
design lists them, every rule one the laptop binary keeps, every example
one a check runs, written for a reader who will not open `src/`.
`scripts/conform.mjs`: the laptop mode and the `--town` mode as the
design writes them, the checks journey 1 step 3 lists, each citing its
section, `--list`, the exit codes of step 4, and the teardown whatever
happened. `scripts/conform-shop/`: `test/conform`, `runtime: worker`,
its manifest's tests passing at `shop add`. `test/fixtures/broken-harness.mjs`:
the laptop binary's rules in a small program of its own that imports
nothing of town's, one mode per broken rule. `test/conform.test.ts`, ring
`command`: conformance `conformant` on `node bin/town.js`, and on the
broken harness in each mode exactly the checks that mode breaks failing.
A `checkout` test, in `test/conform.test.ts`'s sibling or a file of its
own: `docs/harness.md`'s section numbers against `conform.mjs --list`,
both ways. `README.md` and `AGENTS.md`: a pointer to the contract and
the conformance line in the command block.

**Not this phase:** No change under `src/`; a check the laptop binary
fails is brought to the conductor with the sentence of the contract it
tested, not fixed in `src/` by the builder. No run against the
operator's box; `--town` is built and exercised in this phase only
against a `wrangler dev` box if the builder finds `test/helpers/town.ts`'s
`dev` makes that cheap, and otherwise by road phase 2.

**Proof:** `pnpm build && pnpm test && pnpm typecheck` exit 0, three
rings, `test/conform.test.ts` in the command ring's count. `node
scripts/conform.mjs -- node bin/town.js` exit 0 ending `conformant: <N>
checks`, `N` at least twenty; `node scripts/conform.mjs -- /nonexistent`
exit 2; `node scripts/conform.mjs --list` runs nothing. The conductor
reads `docs/harness.md` start to end as a stranger would and lists any
rule it states that no check tests. `git status --short` after a run
shows no leftover directory. Falsified by mutations, by
`scripts/mutate.mjs`: in `src/cli.ts`, `--json` left in `argv` (the
json-among-words check fails in `test/conform.test.ts`), and the
socket rule dropped so stdin is read from anything that is not a
terminal (the held-socket check fails); in `scripts/conform.mjs`, one
check's expected exit changed (the laptop binary's run fails).

**Status: NOT STARTED.**

---

## Phase 2: The walk

**Closes:** journey 1's fourth criterion; journey 3 in full.

**Work:** Two walks, the conductor's. **The stranger:** a fresh agent,
given a copy of `docs/harness.md` in an empty directory outside the
checkout and told not to read the checkout, writes a `town` in Python or
POSIX shell with `curl`, and the conductor runs `node
scripts/conform.mjs -- <its town>`. What failed, what the contract did
not say, and how long it took are findings; a silence in the contract is
fixed in `docs/harness.md`, and the stranger's harness is run again. The
program is kept in the scratchpad and named in the findings by its line
count and language, not committed. **The box:** `node
scripts/conform.mjs --town https://town.dglazkov.workers.dev -- node
bin/town.js`, twice, then `townd admin --town <url> pass ls` and `shop
ls`. A failure in either walk goes back to a builder as a fix to
`scripts/conform.mjs`, `docs/harness.md`, or, if the laptop binary broke
the contract, `src/cli.ts`, under road phase 1's rules.

**Not this phase:** No new check unless a walk finds a rule the contract
states and no check tests. No stranger's program in the suite.

**Proof:** The stranger's harness `conformant`, and its conversation
showing it read nothing of the checkout. Both box runs `conformant`, and
after them no live pass labelled by the script and no `test/conform` in
`shop ls`. If anything was fixed, `pnpm build && pnpm test && pnpm
typecheck` exit 0 after the fix, and the laptop run `conformant` again.

**Status: NOT STARTED.**
