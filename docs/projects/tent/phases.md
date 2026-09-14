# Tent: implementation phases

[`design.md`](design.md) is the argument; [`journey.md`](journey.md) is
the acceptance suite. Each phase names the journey steps it closes. The
rules are the repo's ([../../../AGENTS.md](../../../AGENTS.md)): the
manifest is the source and the command knows nothing; nothing an agent
can see holds a secret; every test says what it needs; Node 24 and
nothing native; findings are one dated line of about forty words; steps
marked **⚑ provision** are asked out loud first. `/conduct tent` is the
procedure. Phase citations name their project: `tent phase 1`, never a
bare "phase 1".

**Three rules for this project.** The ring chooses the environment,
never the steps: the account ring's steps are `scripts/conform.mjs`'s
and the agent ring's are sheep's `scripts/drove.mjs`'s, and neither
script changes in this project; a ring that needs a step those do not
have has found work for road or drove, recorded as a finding and not
built here. Sheep is a program at a path: the stage is run as a child
from the checkout `--sheep` names, and no file under it is imported,
read, or copied, by the ring or by a test. And the shepherd's world is
not the ring's: every child runs under a HOME the ring made, the tent's
name is never `town`, and a proof that finds `~/.town/operator` read,
the standing box called, or the operator's token in a file the ring
wrote has found the bug.

---

**Where we are: planned, 14 September 2026; tent phase 0 is next.**
Nothing built. The ring's script does not exist; the standing station
`sheep-drove` stands at sheep-drove `b589052` from drove phase 2, and
the checkout's `pnpm box deploy`, `scripts/conform.mjs --town`, and
drove's stage are what the rings will run. Nothing waits on a person
until a phase's ⚑ step.

The order is the order of dependence. Tent phase 0 is the ring's shape
and the account ring, since the tent is what the stranger walks into.
Tent phase 1 is the stranger, drove's stage inside the tent. Tent phase
2 is the ring as the conductor's proof: the docs, the list, and the
mutation that shows the ring's own assertions bite.

**Deliberately open.** Postponed on purpose: the package and machine
rings (crate, yard); the consent from afar in any ring; the deploy from
an installed package rather than the checkout (crate); CI over any
outer ring (tempo). Never: a ring that reads sheep's files, or one that
runs against the standing box.

---

## Phase 0: The tent, pitched and struck

**Closes:** journey 1 in full.

**Work:** `scripts/hermetic.mjs`: the usage block from the design; the
words (`--ring account`, `--name`, `--yes`, `--dry-run`, `--keep`,
`--strike <worker>`, `--list`, and `-- <harness command…>` defaulting
to `node bin/town.js`), each refused in a sentence when wrong;
`main(words, deps)` with the world in `deps`, the real ones spawning
`scripts/box.mjs` and `scripts/conform.mjs` as children under the ring's
HOME with `TOWN_OPERATOR` unset, and the listing read with the GETs
`scripts/box.mjs`'s delete already makes, exported from it for the ring
with the delete's behavior unchanged; box's deploy waiting for the door
to take the operator's token it made, as the design's what-stands-today
says, with its case in `test/deploy.test.ts`; the ring's directory
and `ring.json`; the preflight, the ask, and the `--dry-run` stop; the
pitch with the build checked against the sha; conformance's lines
through to the terminal and to `conform.txt`, the verdict line read;
the strike on every exit unless `--keep`, a signal included where the
process can still act; the listing compared; the closing block; the
exits 0, 1, and 2 as the design says. `package.json`: `"hermetic": "node
scripts/hermetic.mjs"`. `test/hermetic.test.ts`, checkout ring: the
paths the design's Tests section lists for the account ring, `--list`,
and `--strike`, every one on fakes, the fake deploy printing a token
line that must reach no file. The file's first line names its ring.

**⚑ provision, one step.** The real run: a Worker named
`town-hermetic-<sha>` deployed on the operator's account, walked, and
deleted, twice, and once more with `--keep` and struck by `--strike`;
its cost the deploys' requests and an object's minutes, cents. Asked
once, with its sentence; the second and third runs are the same ask
answered.

**Proof:** `pnpm test` exits 0 across the three inner rings. Then, typed
by the conductor and recorded in the findings with the account's
listing before and after:

1. Journey 1 steps 1 and 2: `--list`, and `--dry-run` deploying
   nothing, the listing unchanged.
2. Journey 1 step 3, twice: green, about a minute, thirty `ok`, the
   listing the same, `~/.town/operator` unchanged by `shasum`.
3. Journey 1 step 4: `--keep`, the directory searched for the operator's
   token and `home/.town/operator` the only hit, then `--strike`.
4. Journey 1 steps 5 to 7 on fakes in the test, and step 6 once for
   real with `-- env BROKEN=<mode> node test/fixtures/broken-harness.mjs`
   as the harness, exit 1 and the tent gone.

Falsified by one mutation with `scripts/mutate.mjs`: the strike's call
removed from the failure path, seen by the test's failed-check case,
and put back.

**Status: NOT STARTED.**

**Findings:**

## Phase 1: The stranger

**Closes:** journey 2 in full.

**Work:** `scripts/hermetic.mjs`: `--ring agent` with `--sheep <dir>`,
`--repo <owner/name>`, `--issue <n>`, `--kennel <dir>`, and `--user
<name>`; the preflight's stage half, the script and the kennel found by
path, the token read whole from stdin and refused from a terminal, when
empty, or with a line break; the furnishing as `townd admin --town`
children from the checkout's `bin/townd.js` under the ring's HOME, in
walk.mjs's github plan's order, the token on the credential child's
stdin alone, the two shops as tars on stdin, then `shop ls` and
`credential ls --user` read as the stage reads them; the stage as a
child, `node <sheep>/scripts/drove.mjs` with the design's words, its
stdout through to the terminal and to `drove.txt`, its exit the walk's
verdict, its root recorded; the ring's own search over its directory
for the token's bytes, in walk.mjs's `--search`'s way, a hit named and
never printed; `--dry-run` printing the stage's command line and
stopping. `test/hermetic.test.ts`: the agent ring's paths from the
design's Tests section, on fakes: the furnishing order, the token in no
argument and no file, the stage's command line word for word, its exit
and its root, the search finding a planted token in a fake stage's
output, and journey 2 step 6.

**⚑ provision, two steps.** A GitHub token scoped to one repository,
the shepherd's to give, in a file the ring reads on stdin, and an open
issue on that repository the shepherd names; then the real runs: the
tent pitched and furnished, a sheep minted on `sheep-drove` by the
stage, the model's turn, the strike, twice and once failing; the cost
the account ring's, a container's minutes on the station, and two
model turns, under a dollar each.

**Proof:** `pnpm test` exits 0. Then, typed by the conductor and
recorded in the findings with the sheep checkout's commit and the
station's name:

1. Journey 2 steps 1 and 2: the `--dry-run` naming the stage's command
   line, and each refusal, nothing read from the account.
2. Journey 2 steps 3 and 4: green twice, two comments on the issue,
   the station's `sheep ls` empty of the run's sheep after, the listing
   the same, the stage's root named and its `--status` read once.
3. Journey 2 step 5 once for real: the issue closed before the run,
   exit 1, the tent gone, `drove.txt` kept; the issue reopened after.
4. Journey 2's third criterion: `grep -rn sheep scripts/hermetic.mjs`
   read aloud in the findings.

Falsified by one mutation with `scripts/mutate.mjs`: the ring's search
made to skip `drove.txt`, seen by the test's planted-token case, and
put back.

**Status: NOT STARTED.**

**Findings:**

## Phase 2: The ring as the proof

**Closes:** journey 3 in full.

**Work:** `AGENTS.md`: the outer rings' sentence in the bullet on what
every test needs, and `pnpm hermetic --list` and `--ring account` in the
command block. `README.md`: one paragraph in the operator section after
the deploy. `.claude/skills/conduct/SKILL.md`: the proof section's
sentence on a Proof that names a walk over the box, and `brief.sh`
carrying it into the brief when a phase's Proof holds `pnpm hermetic`.
`scripts/hermetic.mjs`: `--list` naming what each ring needs and costs
so that, with `pnpm test --list`, the five rings are each named once;
`test/rings.test.ts` or `test/hermetic.test.ts` reading both lists and
checking the union against the design's ladder. The infra
constellation's and the night sky's status lines moved.

**Proof:** `pnpm test` exits 0. Journey 3 steps 1 to 3 read aloud in
the findings, each doc's line quoted. Step 4 for real: the listing
comparison mutated to always agree with `scripts/mutate.mjs`, the test
red, the tree as it was by `git status`. No ⚑ step.

**Status: NOT STARTED.**

**Findings:**
