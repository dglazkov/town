# The infra constellation — a possible future

**Status:** Draft. A possible future, not a decision. Nothing built.
**Date:** 2026-09-13

Sketched the same evening as the [sheep](sheep-constellation.md) and
[growth](growth-constellation.md) constellations, as the third
direction: not where the town runs or how it grows, but how it is
built. The builders here are agents, a conductor briefing a subagent
phase by phase under [`/conduct`](../../.claude/skills/conduct/SKILL.md),
and the question is what the repo owes them so a phase costs less and
proves more. Its spine is the ladder of hermetic rings sheep built for
itself, which fits town better than most of sheep's shapes do. The
projects named here do not exist; their names are proposals in the
town's style.

---

## Where the build stands, measured

The repo's real infrastructure is its guards, and they are good: the
600-line ratchet (`test/shape.test.ts`), the rings guard
(`test/rings.test.ts`), the CLI-knows-nothing guard
(`test/cli-guard.test.ts`), the contract test, and the stale-dist check
in the command helper. Seventy-one commits landed in two days, every
phase verified by the conductor by hand. Measured 13 Sep 2026:

| | |
| --- | --- |
| `pnpm test` wall clock | 44 s for 45 files, 687 tests |
| CPU inside it | 246 s, so the suite parallelizes well |
| `pnpm typecheck` | 1 s |
| Slowest files | deputy 42 s, door 32 s, publish 25 s, walk 18 s |
| A phase, from the findings | twelve minutes to two hours; most between thirty and fifty |
| A walk | about $2 of model, most of it on false starts |
| CI | none |
| Lint or formatter | none |
| Install path | a checkout; `dist/` is ignored and nothing builds on install |

Two facts a builder cannot see from the code: the suite is Mac-only,
since `townd serve` refuses a Linux box without a wall and the command
helper passes none; and a third of the suite's time is spent waiting
for real thirty-second limits, which only the box has a test clock for.

## What hurts

- **The inner loop has no small step.** The only test verb is the whole
  suite after a build; one file means knowing to build and then run
  vitest with the right project. Sheep has `pnpm test --ring <name>` and
  `--list`; town's rings reporter has what it needs to offer the same.
- **The conductor assembles every brief by hand.** The brief's shape is
  fixed and verbatim: the phase's section, the journeys it names, the
  design parts they cite, the findings so far, the house rules. The
  project docs are 67,000 words, reread and copied from each phase.
- **A mutation check is dangerous by hand.** In box phase 0 a conductor
  reverted a proof's mutation with `git checkout` and wiped the
  builder's uncommitted work.
- **The walk relearns its lessons.** Settings ignored in an untrusted
  directory, Bash alone unable to write a file, the operator's
  connectors leaking in: each cost a false start, and each lives in a
  memory note rather than in a script.
- **Nothing proves the town the way a user meets it.** Every proof runs
  from the checkout with `bin/townd.js`. Nobody has installed town.

## The ladder

Sheep's rule, restated for town: **the ring chooses the environment,
never the steps.** One walk, the journey's steps as `scripts/walk.mjs`
stages them, run in places the checkout's state cannot reach. The inner
three rings exist, `checkout`, `command`, and `box`; the outer four are
this constellation's.

```
                          the inner rings, pnpm test
   checkout   this process: node, and workerd through the pool
   command    the built binaries spawned against a town on a free port
   box        the Worker in workerd through the pool; wrangler dev in dev.test.ts
                          the outer rings, pnpm hermetic
   package    town installed from a ref into a fresh prefix and HOME, the
              checkout stripped from PATH; the README's operator section
              walked with the installed binaries                   seconds, free
   machine    the package ring in a container from node:24-slim, where
              there is no wall: --wall none, and the first line says so   a minute, Docker
   agent      the machine ring's container with Claude Code in it, the
              skill from the root SKILL.md, a grant file, the allow list,
              no prompts, a budget, the journey's sentence; then the
              audit and the token search                          dollars, capped
   account    pnpm box deploy under a name stamped with the commit, the
              hall walk over the wire, pnpm box delete; the consent from
              afar skipped and named                              pennies, a deploy
```

Town already has the two things the ladder needs and sheep had to
build: the root `SKILL.md` is the agent's one sentence, which `npx
skills add` finds, and the stage script's steps are the journey's. What
is missing is the environments, and three prerequisites that are worth
having anyway: a release path, the shops carried in the package, and
the stage split from the environment.

---

## The constellation

```
   ┌─────────┐   ┌─────────┐
   │  baton  │   │  tempo  │      the conductor's tools; the suite's clock
   └────┬────┘   └────┬────┘
        └──────┬──────┘
               ▼
          ┌─────────┐
          │  crate  │            the release path, and the package ring that proves it
          └────┬────┘
               ▼
          ┌─────────┐
          │  yard   │            the machine ring, and the Linux wall decided
          └────┬────┘
               ▼
          ┌──────────┐
          │ stranger │           the agent ring: a walk by an agent that never saw the checkout
          └────┬─────┘
               ▼
          ┌─────────┐
          │  tent   │            the account ring: a box pitched, walked, struck
          └─────────┘

          ┌─────────┐
          │  sweep  │            housekeeping, any time
          └─────────┘
```

## Each star in a sentence

- **baton** (the conductor's). `brief.sh <project> <phase>` beside
  `status.sh`, assembling the brief file mechanically from the docs, the
  phase's section, the journeys it names, the design parts they cite,
  the findings before it, and the house rules; `scripts/mutate.mjs`,
  which backs a file up, applies a named mutation, runs one test,
  restores by copy, and compares, so `git checkout` is never typed in a
  dirty tree; and `pnpm test --ring <name>`, `--list`, and a single-file
  form, with a watch that rebuilds. Proof: a phase conducted with the
  brief the script wrote, and a mutation run and reverted with the tree
  unchanged by `git status`.
- **tempo**. The laptop's call limit behind the same test clock seam the
  box has, so no test waits a real thirty seconds; the command helper
  passing `--wall none` when the box has no wall, so the suite runs on
  Linux; and CI on push over the three inner rings, which need no
  account. Sheep's rule holds: a green CI is not the proof, a red one
  catches a push that skipped it. Proof: `pnpm test` under twenty
  seconds here and green on a bare Linux runner.
- **crate**. A release branch built from `main` with `dist/` and the
  four shops in it, installable with npm's git installer and nothing on
  npm, as sheep's collar did; and the package ring: `pnpm hermetic
  --ring package [ref]` installs the ref into a fresh prefix and HOME,
  strips the checkout from PATH, serves a town over a fresh data
  directory, adds a shop, makes a pass and a grant, and runs the
  installed `town` from a fresh directory through help, a call, a
  denial, and the audit row. The stage's steps move out of
  `scripts/walk.mjs`'s modes into one walk the ring calls. Proof: the
  package ring green on the release ref, with `which town` naming the
  prefix and not the checkout. CI's second job runs it with the public
  spec on a bare runner.
- **yard**. The package ring inside a container from `node:24-slim`,
  the ref exported as a bare repository and nothing mounted. There is no
  wall in the container, so the walk runs `--wall none` and the ring
  asserts the first line says the shops run with the box's authority.
  The Linux story becomes a proven sentence rather than a deferred
  paragraph; a Linux wall stays not-done, as box said. Proof: the
  machine ring green, exit 2 with one line on a machine without Docker.
- **stranger** (a stranger comes to town). Phase 0 is the rehearsal, a
  scripted agent in the command ring that types the journey's commands
  against the stage, so help and permissions are proven before a model
  is paid. Phase 1 is the agent ring: the machine ring's image with
  Claude Code installed, the skill added from the root `SKILL.md`, a
  grant file in a fresh working directory, `--allowedTools` for Bash and
  the file tools, `--permission-prompts none`, `--max-budget-usd`,
  `--strict-mcp-config`, the journey's sentence, and the stream rendered
  as the transcript; afterwards the installed `townd admin audit` must
  show the calls and the token search must find the token nowhere but
  the grant file. `--dry-run` prints the command and stops. Every lesson
  the box walk paid for becomes a line here. Proof: the walk that closes
  the next constellation's first phase is run by this ring and not by
  hand.
- **tent** (pitched and struck). The account ring: `pnpm box deploy
  --name town-hermetic-<sha>` from the package ring's install, the hall
  walk over the wire, `--status` read, `pnpm box delete` waiting on the
  name typed unless `--yes`. The consent from afar needs a browser and
  is skipped with one line, named at the end. Proof: the ring green on
  the operator's account, the listing before and after the same.
- **sweep**. A formatter, Prettier being pure JavaScript and within the
  no-native rule; the `.gitignore`, which is sheep's copy and still
  names the kennel and the collar; a README test that checks every
  operator line in the README against `townd admin --help`, so the
  README stays honest the way the CLI guard keeps the client honest; and
  `town hall example`, printing spec §9's full worker shop, which cuts
  the first `validate` round trip the walks keep paying. Proof: each is
  a test that fails when the thing drifts.

## The sequence

1. **baton** and **tempo**, together or in either order, since they
   change every phase from here on.
2. **crate**, with CI's second job.
3. **yard**, deciding the Linux wall by proving `--wall none` there.
4. **stranger**, before whichever constellation's first walk, so that
   walk is the ladder's first and not the last done by hand.
5. **tent**.
6. **sweep**, in the gaps.

## What this constellation does not do, on purpose

- **A Linux wall.** Yard proves the absence honestly; wall and box both
  said the mechanism is never coming, and a box is a Worker.
- **A lint beyond `tsc --strict` and the guards.** A rule nobody reads
  is a rule nobody follows; a guard with a sentence is the repo's way.
- **Publishing to npm.** The release branch is the install, as sheep's is.
- **CI as the proof.** The inner rings on push, the package ring on a
  bare runner, and nothing that costs money or needs a person; a phase
  closes when the conductor ran its proof, as `/conduct` says.
- **Sharing sheep's scripts.** Town writes its own `hermetic.mjs` in
  sheep's shape; both repos forbid copying, and the ladder is the idea,
  not the file.
