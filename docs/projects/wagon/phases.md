# Wagon: implementation phases

[`design.md`](design.md) is the argument; [`journey.md`](journey.md) is
the acceptance suite. Each phase names the journey steps it closes. The
rules are the repo's ([../../../AGENTS.md](../../../AGENTS.md)): the
manifest is the source and the command knows nothing; nothing an agent
can see holds a secret; every test says what it needs; Node 24 and
nothing native; findings are one dated line of about forty words; steps
marked **⚑ provision** are asked out loud first. `/conduct wagon` is
the procedure. Phase citations name their project: `wagon phase 1`,
never a bare "phase 1".

**Three rules for this project.** The wagon holds no secret in the
clear: a credential and an oauth client in it are sealed under the
wagon's key, a pass is its hash, and a proof that finds a value, a
token, or the wagon's key in the wagon, in a file the town wrote, or in
the box's rows has found the bug. An import is whole or not at all:
every check in the design's order before a byte is written, the rows
in one transaction, and a refusal that leaves a row behind is a bug. The
standing box is exported and never imported into: it is not empty, and
a walk that needs a box to import into pitches a tent and strikes it.

---

**Where we are: partial, 14 September 2026.** Wagon phase 0 is CLOSED:
`store export` and `store import` pack and unpack a town at the laptop,
journey 1 walked with a real GitHub token. Next is wagon phase 1, the
wagon over the wire, whose account ring, kept tent, and standing box's
export the shepherd said yes to on 14 September; nothing waits on a
person.

The order is the order of dependence. Wagon phase 0 is the wagon
itself, `src/wagon.ts` and the states seam, packed and unpacked at the
laptop, since a wagon that cannot cross a data directory cannot cross
the wire. Wagon phase 1 is the wire and the box: the key in the body,
the box's refusals, the move onto a tent and back, and the standing
box's backup.

**Deliberately open.** Postponed on purpose: a merge into a town that
is not empty; a wagon from an older schema; a schedule (tempo, or the
operator's cron); the wagon sealed whole; `--since` on the audit, or a
wagon in pieces; `box deploy --from <wagon>`; a person's own export
(citizen). Never: the vault's key in a wagon, or the box's read out of
the platform.

---

## Phase 0: The wagon, on a laptop

**Closes:** journey 1 in full.

**Work:** `src/wagon.ts`: the wagon's shape from the design, `pack`
over a store and a key, `unpack` into a store with the five checks in
the design's order and the writing after, and `wagonVerb` for `store
export --key <file> [--no-audit]` and `store import --key <file>`, the
counts line on stderr, each refusal in the design's words. `src/store.ts`:
`States` and `StoreSeams.states`, the laptop's over `<data>/state` with
`segment` undone; `src/rows.ts`: the box's over `shop_state` under
`BOX_STATE_ROOT`, since the store suite runs in workerd too. `src/admin.ts`:
`store` in `dispatch` reaching `wagonVerb` in two lines, `--key` read in
`main` into `Over` (made on export when missing, mode 600, the line on
stderr; refused missing on import; `readKey`'s size refusal reused),
and `store import` in `readsStdin`; the file split first along its nouns
if the work would take it past six hundred lines, as the house rule
says, committed on its own. `test/helpers/store-suite.ts`: the packing
and unpacking cases from the design's Tests section, run by
`test/store.test.ts` and `test/object.test.ts` both. `test/wagon.test.ts`,
command ring: the two-town cases from the design's Tests section, save
the pipe's. `README.md`: the two verbs in the operator section, and the
line that a backup is an export, with the key kept beside
`~/.town/operator`.

**⚑ provision, one step.** A GitHub token scoped to one repository, the
shepherd's to give, in a file, for journey 1 step 3's `github show`; no
cloud resource and no cost.

**Proof:** `pnpm test` exits 0 across the three inner rings. Then,
typed by the conductor from the repo root and recorded in the findings:

1. Journey 1 steps 1 to 7 on two data directories under the
   scratchpad, the token from the file on `credential add`'s stdin,
   each verb's exit and its counts line quoted.
2. Journey 1's second criterion: `grep -F` over `wagon.json` for the
   credential's value and the pass's token, nothing found, and `cmp`
   of the sealed values against `a/town.db`'s, different.
3. Journey 1 step 5's `sha256sum` of `a/town.db` before and after the
   refused import, the same.

Falsified by one mutation with `scripts/mutate.mjs`: the emptiness
check in `unpack` made to pass always, seen by the store suite's
not-empty case, and put back.

**Status: CLOSED.** 14 Sep 2026. A town crosses data directories whole, its grant working with the address changed, and journey 1 walked for real.

**Findings:**

- **2026-09-14 — Journey 1 walked, real token.** `a` with a user, pass, four grants, memory, github, a credential, an approved permit, 11 calls: export exit 0, `wagon.key` made 600; import into `b` exit 0, same counts; at `b`, `memory recall` and `github show dglazkov/town 6` exit 0.
- **2026-09-14 — No secret in the wagon.** `grep -F` for the credential's value and the pass's token over `wagon.json`: exit 1 each. `cmp` of `credentials.sealed` in `a/town.db` against the wagon's and against `b`'s, and of the two `vault.key`s: all differ.
- **2026-09-14 — Refusals hold.** Into `a`: `this town holds 1 user and 2 shops; import writes into an empty town alone`, exit 1, sha256 same. Another key, no `--key`, schema 8 and 6, not JSON, JSON without `wagon`: each exit 1 in the design's words; `c` holds no user.
- **2026-09-14 — Suite and mutation.** `pnpm test` exit 0, 775 tests (31/16/4 files); typecheck 0. `if (held.length > 0)` to `if (false)` killed by the store suite's not-empty case. `src/admin.ts` 577 lines, no split. The two-town test took 4.3 s against vitest's 5 s default and failed under load; it has 120 s now.
- **2026-09-14 — What differs after import is by design.** Right after, every `ls` matches `a`'s but `shop ls`'s hall `added`, the hall being written on open; `town --help` is an audited call. `readWagon` also checks columns, paths, and no hall row, before emptiness.
- **2026-09-14 — A mutation's build outlives its restore for `bin/`.** The first walk ran `dist/` built from the mutant and imported past the emptiness check; `pnpm build` then walking again held. Walk before mutating, or build first.
- **2026-09-14 — Cost.** Builder 15 minutes; conductor's proof and two walks 20 minutes; no money.

## Phase 1: The wagon, over the wire

**Closes:** journeys 2 and 3 in full.

**Work:** `src/wire.ts`: `--key <file>` read at the laptop, taken out
of `argv`, and sent as `key` in the body; the body's size refused
before posting past `BODY_LIMIT_BYTES`, naming the size, the limit, and
`--no-audit`. `src/box.ts`: the door reading `key` and `Town.admin`
taking it. `src/admin.ts`: `inTown` putting the key in `Over` and
refusing `--key` in `argv` naming the pipe. `src/wagon.ts`: the box's
three checks, `runtime: worker` alone, state as text, and every file
and state row under `overRowLimit`, each naming its shop, user, or
path, run when the store is the box's. `test/box.test.ts` or
`test/object.test.ts`, box ring: the cases from the design's Tests
section. `test/wagon.test.ts`: the pipe's refusal with a fake fetch and
the key in the posted body and in no argument. `README.md`: the box
section's paragraph on a box's export as the only copy of its
credentials, and the move in two lines. `docs/projects/box/design.md`
and `phases.md`: the two deferred bullets on backups and a store moved
now point at wagon. The night sky's and the sheep draft's status lines
moved.

**⚑ provision, three steps.** `pnpm hermetic --ring account` on the
commit that changes the wire, cents and a minute; a tent pitched empty by
`pnpm box deploy --name <tent>` under a walk's HOME for journey 2 and
struck by `pnpm hermetic --strike` after, cents; and the
token file from wagon phase 0 again, for journey 2 step 2's `github
show` through the tent.

**Proof:** `pnpm test` exits 0. `pnpm hermetic --ring account` exits 0
on this phase's commit, its verdict line in the findings. Then, typed
by the conductor and recorded in the findings with the tent's name:

1. Journey 2 steps 1 to 6 on the tent, each verb's exit and counts
   quoted, the `memory recall` and `github show` output quoted, and
   `grep -rF` of the wagon key's bytes over the walk's directory
   finding the two key files alone.
2. Journey 3 steps 1 and 2 on the standing box, the counts, the box's
   audit's last `at` before and after the export the same, and `e`
   removed.
3. Journey 3 step 3 read aloud: the README's lines quoted.

Falsified by one mutation with `scripts/mutate.mjs`: the box's
`runtime: worker` check removed from `unpack`, seen by the box ring's
subprocess case, and put back.

**Status: NOT STARTED.**
