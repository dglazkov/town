---
name: conduct
description: Run the conductor pattern on a project under docs/projects/ — read where it stands, brief a subagent on the next phase, verify the named proof independently, record findings, move the status lines, commit the phase whole to main. Use for "/conduct <project>", "conduct square", "do the next phase of gateway", "where does registry stand", or "close vault phase 5".
argument-hint: "<project> [status | <phase number> | one]"
---

# conduct: one phase of a project, verified, recorded, committed

A project under `docs/projects/<name>/` is three documents: `journey.md`
(the acceptance suite), `design.md` (the argument), `phases.md` (the
walk). This skill is how the walk is walked. The session that runs it is
the **conductor**. It does not build; it briefs a subagent that builds,
then it verifies the proof the phase named up front, never taking the
subagent's word for it, and only then writes the record and commits.
Then it goes on to the next phase. **The default is unattended**: the
conductor runs until the leg is done or until the next step needs a
person, and nothing else stops it. A person is needed for exactly three
things: a token or a login, a paid plan or a cloud resource (a ⚑ step),
and a hand the journey names (a second machine, a click in a browser, an
OAuth consent screen). Everything else, a wrong design, a proof that
cannot be run as written, a doc that disagrees with another, is the
conductor's decision to take, record, and commit.

The project's `phases.md` is the contract. Its opening paragraphs carry
rules of its own (where a proof must run, what stands in for a real
service until the phase whose job is the real one). Those rules win over
anything here. The house rules in `AGENTS.md` apply to everyone,
conductor and subagent alike.

## Arguments

- `/conduct <project>`: orient, then conduct phase after phase until a
  step needs a person or the leg is done. Commit and push after each
  phase; the user reads progress from the commits on `main`, not from
  a report they must wait for.
- `/conduct <project> status`: orient and report, change nothing.
- `/conduct <project> <N>`: conduct that phase and stop after it. If an
  earlier phase is NOT STARTED, conduct it first and say so; phases run
  in order for a reason.
- `/conduct <project> one`: the next phase only, then stop.

## Status vocabulary

One of four words on each phase's `**Status:**` line, followed by the
date it last moved and one sentence of what holds:

- **NOT STARTED.** Nothing built.
- **PART-DONE.** Every proof that can run here has run; the walk that
  closes it waits on something named in an Open finding (a person, a
  second machine, a paid plan).
- **CLOSED.** The proof held, walk included. A phase that claims a
  journey closes only when the journey was walked for real.
- **WITHDRAWN**, or a phase re-cut with a `**Formerly: …**` record at the
  end of its section. What was built and why it went stays in the doc.

## 0. Orient

Run the status script first. It is mechanical on purpose: where-we-are,
every phase's status, the next phase's proof and ⚑ steps, the Open
roster, and a lint of the docs' own rules.

```sh
/Users/dimitriglazkov/Documents/code/town/.claude/skills/conduct/status.sh <project>
```

Then the brief script, for the phase you will conduct, into the
scratchpad; §1 is what to do with what it writes. It refuses a phase
whose status is not NOT STARTED, printing the word, unless `--any`, and
refuses a journey the phase names that `journey.md` lacks, which is the
first gate below, found early.

```sh
/Users/dimitriglazkov/Documents/code/town/.claude/skills/conduct/brief.sh <project> <N> > <scratchpad>/brief.md
```

Then read, in this order: the phase's section in `phases.md`; every
journey it names, in `journey.md`; the parts of `design.md` those cite;
the Findings of the phases before it (they are the things the design
did not know); `AGENTS.md`. Note the wall clock; a Finding records what
a phase cost.

**Three gates before any code:**

- **The docs agree.** If the phase's Proof, the journey's steps, and the
  design's mechanism disagree, fix the docs first, as their own commit,
  before briefing anyone. Journey.md says which way: the mechanism
  changes. Building on a contradiction produces a facade that satisfies
  one document and not the other, and the subagent will not tell you
  which.
- **Nothing is owed to another project.** The where-we-are paragraph
  says when a phase waits on another project's phase. If so, conduct
  that phase of the other project first, under the same rules, then
  come back. Say so in the report; do not stop for it.
- **⚑ provision steps are asked, not done.** Each one creates a cloud
  resource, spends money, or needs a login. Before the phase starts,
  list them to the user with the price, and get a yes for each. A step
  without a yes is the subagent's stop line: it builds up to it and
  reports. This is the one gate that waits on a person, so before
  stopping at it, do every phase and every part of this phase that does
  not need the answer, so the ask is the only thing left.

## 1. Brief

Write the brief to a file in the scratchpad so it can be reread, reused
if the subagent must be restarted, and quoted in the commit. The script
writes it (§0) and the conductor edits it: the brief is the phase's
section verbatim plus what the subagent needs to not guess, and the
script copies every part of that the docs hold, by the same conventions
`status.sh` reads them by:

```
# <project> phase <N>: <title> — briefed <date> at <commit>

## Asked before the phase starts   (the phase's ⚑ steps, or none)
## The phase                       (phases.md section, verbatim)
## The journeys it closes          (every journey its **Closes:** names, whole)
## The mechanism                   (design.md's names table; every heading as a sed -n line)
## Findings so far that bind you   (every earlier phase's, verbatim; then the Open roster)
## House rules                     (AGENTS.md, verbatim; the project's own rules paragraph, verbatim)
## What you own                    (the paths the phase names; then the tail)
```

The conductor then pastes into the mechanism the design sections the
phase leans on, and anywhere the brief needs it what the docs do not
say, and gives it to the subagent. The tail, what the subagent owns,
where it stops, and what it returns, is `brief.sh`'s, and this skill
no longer quotes it.

Spawn with the Agent tool (`general-purpose`). Parallel subagents belong
inside a phase, splitting its Work list by file ownership, never across
phases. A subagent's final report is not shown to the user; you relay
what matters.

## 2. Verify

This is the conductor's job and nobody else's. The subagent's report is
a map; the phase's **Proof** paragraph is the territory. Run the proof
as written there, from the repo root, in the order written, and read
exit codes rather than tails (`| tail` and a trailing `echo` both report
the last command's status, not the suite's).

The checklist, every phase:

- `git status --short`: only the phase's files changed, no leftovers,
  no secrets file (`.env`, `.dev.vars`, a token in a fixture) in the
  diff, nothing under `docs/projects/`.
- The whole suite and typecheck, not just the new tests, by the commands
  `AGENTS.md` names. The project's rules say where a test must run; a
  test that passes somewhere else proves that somewhere else works. If
  CI runs a subset, a green workflow is not the proof. If you ran a
  subset, name what you skipped in the report, or run it.
- The named proof, command by command.
- The walk, when the phase has one: against a real deployment, a real
  model, a real service, a real credential. Walks find what fixtures
  cannot. A phase with a walk is not CLOSED until the walk is walked.
- Open the new tests and ask of each: could this fail? What does it
  exercise, the thing or a stand-in for the thing? A test that asserts
  what the code returns, rather than what the journey requires, proves
  the code agrees with itself.
- Read the diff for a facade: a surface that imitates a program, a shim
  that satisfies the fixture's calls only, a refusal sentence that
  changed without its test.

**Work that fails goes back down.** Send the failure to the same
subagent with `SendMessage`, so it keeps its context: the exact command,
the exact output, the line of the Proof or journey it violates. Do not
fix code yourself; the conductor edits documents. A doc fix the failure
exposes (a Proof that cannot be run as written) is yours, before
sending it back.

## 3. Record

When the proof holds, and only then, write the record. All of it in one
change, so the docs never disagree with each other:

- **Findings**, under the phase: one dated line per claim, about forty
  words, `- **YYYY-MM-DD — Claim.** Evidence.` The argument goes in the
  commit message, not here. A Findings section stays under three
  hundred words. Something a later phase must pay for is an Open entry:
  `- **YYYY-MM-DD — Open: what.** Who or what it waits on.` The status
  script lists the roster.
- **The Status line** of the phase: the word, the date, one sentence of
  what holds.
- **The where-we-are paragraph**: which phases stand where, what the
  next thing to do is (`<project> phase N`), what waits on a person and
  what waits on work.
- **`journey.md` front matter**: `status:` (`planned`, `partial`,
  `done`) and the `note:` retold to include this phase.
- **The projects index**, `docs/projects/README.md`: the project's
  "where it stands" cell, which must not be more right than the docs
  it summarizes, and must not be less.
- **Another project's docs**, when this phase changed something they
  describe. `grep -rn` the file or term across `docs/projects/` and fix
  each mention, so a reader of that project is not told a stale fact.
- **Citations name their project**: `gateway phase 2`, never `phase 2`.

Run the status script again. Its lint must be clean for what you
touched; pre-existing hits are reported, not silently absorbed.

## 4. Commit

One commit per phase, the phase whole: code, tests, the record. Title
`<project> phase <N>: <title>` for a phase that moved, `<project>: <what>`
for anything smaller. The body is the argument: what was built, what the
proof showed, what was found, in prose a reader who was not here can
follow. End with the session trailer the harness gives you. Commit to
`main` and push; do not bunch phases on a branch. The user reads
progress from the commits.

Then go on to the next phase. Write a short report between phases (the
phase, its new status, the proof and what it printed, the findings) so
a reader following along has one; do not wait for a reply to it. The
full report comes when you stop.

## Stopping

The conductor stops for a person, and for nothing else. The stop is
always recorded first, so a later session can pick up from the docs
alone:

- **PART-DONE, waits on a person.** Local proofs green; the walk needs a
  second machine, a login, a token, a paid plan, or a hand. Status
  PART-DONE, an Open finding naming exactly what and whom, where-we-are
  says so, commit, push. Then, before stopping, look past it: if the
  next phase needs none of that, conduct it. Stop only when every phase
  left needs the person. The final report puts every ask in one list,
  each one sentence with its price.

Two things look like stops and are not. Decide them, record them, go on:

- **The design is wrong.** The subagent found the mechanism does not
  hold. Change `design.md` as its own commit with the reason, then
  re-brief. A phase can be withdrawn; it cannot be quietly redefined.
  This is the conductor's call, not the user's, and the commit message
  is where the user hears the argument.
- **The proof cannot be run as written.** The Proof paragraph asks for
  something the repo cannot produce. Fix the Proof, say why in the
  commit, then continue. Never mark a phase by a proof that was not the
  one named.

When in doubt whether something needs a person, ask: is the missing
thing a credential, money, or a hand? If not, it is yours.

## Things that have gone wrong before

These are from sheep, the repo this skill came from. The pattern is the
same here and so are the failure modes.

- A subagent said the suite passed; it had run `npm test | tail`, and
  six tests had failed. Read the exit code.
- Two suites and two typechecks passed while the CLI was broken,
  because the break was in a command only the walk runs. Walk.
- A twelve-verb `git` passed every test against a fixture that used
  neither `--depth` nor `git diff`'s header, and the model fabricated a
  real-looking diff to cover for it. A facade that is almost the thing
  costs more than a shell that says it lacks it. Read the diff for one.
- Journey docs were recast while phases still said the old thing; a
  reader found three names for one phase. Record everything in one
  change.
- Provisioning happened before it was asked (a deploy on a scratch
  account was fine; a paid plan would not have been). ⚑ steps are asked
  with the price, every time.
- A subagent edited `phases.md` and the conductor edited it too; the
  merge lost a finding. The conductor owns the record.
- The shell's cwd was inside a submodule and a relative `cd` chain did
  nothing. Absolute paths in every command you give a subagent.
