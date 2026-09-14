# The sheep constellation — a possible future

**Status:** Draft. A possible future, not a decision, except its first
two stars: [road](../projects/road/design.md) closed 14 Sep 2026 in
town, and drove closed the same day in sheep (sheep-drove `7c85374`),
drawing the line below.
Later the same evening the shepherd leaned toward this one as the
cornerstone, for the line it draws (below); [night-sky.md](night-sky.md)
holds the sequence across all four constellations.
**Date:** 2026-09-13

Sketched the evening the seventh project, [box](../projects/box/design.md),
closed, when the question was what town does next. This is one answer:
align town with [sheep](https://github.com/dglazkov/sheep) as closely
as possible while keeping town usable without it. Another direction is
being pursued beside it, so this draft is kept as a shape the work could
take, to be cut into projects under [`../projects/`](../projects/README.md)
if and when it is chosen. The projects named here do not exist; their
names are proposals in each repo's style.

---

## The tension, stated once

Sheep's house rule says a complement of sheep is a bin inside sheep's
package, not a repository; its collie spent an afternoon as a repo and
was pulled back. Town's thesis pulls the other way: any agent that can
run a CLI can use it, and the [draft](town-design-doc.md) names Claude
Code, Cursor, and a custom loop as the pilot's harnesses. So "align as
closely as possible" cannot mean packaging. It means seams. Town stays
its own repo and its own box, and sheep becomes the first harness that
treats `town` as a program in the shell rather than a binary on PATH.

## Where the seams already match

- **Programs in the shell.** A sheep's `look` and `pasture` are just-bash
  custom commands defined in the cell, tier 0, with a not-found line when
  the home lacks them. A `town` program is the same shape and about as
  long. The in-isolate shell has no network, but the cell has `fetch`,
  so the program hands argv to the cell and the cell posts to the town.
  That is town's own contract, `town` as a pipe, with the pipe run
  through the cell.
- **The grant as a secret.** Sheep has two secret places: a pasture's
  secret for the herd and an earmark for one sheep, given on stdin at
  the mint and ended with the sheep. A grant is a bearer token, so it is
  a `TOWN_GRANT` secret. This is stricter than a laptop's grant file:
  the model's commands never see the secret, only the program does.
- **Delegation is minting.** A dog holding a grant issues a narrower one
  and pipes it into `sheep new --secret TOWN_GRANT`. Earmarks end when
  the sheep is removed, so a delegated grant is an earmark whose value
  the town issued, with an expiry; `sheep rm` needs no hook into town at
  first.
- **The broker.** Pen's credential broker answers a container's git push
  from the sheep's token, then the pasture's, then the home's, and its
  own comment says tokens are the wrong tool and the lookup is one
  function meant to be replaced. Town's teller is that replacement: a
  push goes through a window the town opened, and no token reaches the
  container. This is the deepest alignment and the largest project.

## What "usable without" costs

Three things on town's side, each small:

- **Name the wire as the harness contract.** Today `bin/town.js` is the
  only client and the wire is implicit in it. A doc that says what a
  `town` posts and prints lets sheep implement it without importing
  town, which both repos' no-copy rules want.
- **Take the grant from the environment as a value.** `TOWN_GRANT` names
  a file today (`src/cli.ts`); it should also carry the token and the
  town, on the laptop binary and on any foreign program.
- **Ship a conformance script.** A harness points its `town` at a test
  town and the script checks help, a call, a denial, a notice, and
  `--json`. That turns "usable without sheep" from a promise into a
  proof in town's command ring, and it is the same test the sheep walk
  passes.

---

## The constellation

```
                 town repo                          sheep repo
                 ─────────                          ──────────
   ┌─────────┐
   │  road   │  the wire named, the grant     ┌─────────┐
   │         │  from the environment,  ─────▶ │  drove  │  town as a program in
   └────┬────┘  a conformance script          │         │  the sheep's shell
        │                                     └────┬────┘
        │                                          │
        │            ┌── the sheep walk ───────────┘
        ▼            ▼
   ┌─────────┐
   │ deputy  │  an agent holding a grant      (dog pipes it into
   │         │  issues a narrower one   ─────▶ sheep new --secret,
   └────┬────┘  with an end                    no sheep change)
        │
        ▼
   ┌─────────┐                                ┌─────────┐
   │ window  │  a window for a caller that    │  relay  │  pen's broker asks
   │         │  is not a shop           ─────▶ │         │  the town, not the home
   └─────────┘                                └─────────┘

   side stars, town only, any time after road:
   street   a public origin a shop may reach, a teller that signs nothing
   wagon    store export and import
   citizen  a second person's own token, consents, and permits
   clock    a shop that wakes on its own; one object per shop and user
```

## Each star in a sentence

- **road** (town). The wire that `bin/town.js` speaks becomes a named
  contract any harness may implement: `TOWN_GRANT` accepts the token and
  town as values beside the file it names today, a doc says what a
  `town` posts and prints, and a conformance script proves a foreign
  `town` against a test town. Proof: the script passes on the laptop
  binary, in the command ring.
- **drove** (sheep). `town` as a just-bash program in the cell, tier 0
  like `look`, reading the sheep's earmark or the pasture's `TOWN_GRANT`
  and posting through the cell's fetch, with the not-found line when the
  sheep carries none. Proof: road's conformance script passes against a
  sheep's `town`; then the walk, a dog minting a sheep with a grant from
  the operator's box that works `town/memory` and `town/github`. A drove
  road is the road sheep are driven along to town.
- **deputy** (town). A grant holder issues a narrower grant, durable,
  with an expiry and a parent, revoked when the parent is. The dog pipes
  it into `sheep new --secret`, so sheep changes nothing. Proof: a dog
  holding a grant mints a sheep that can do less, and the sheep's grant
  dies with the dog's. This is what the memory of 13 Sep 2026 calls
  delegation.
- **window** (town). The teller opened for a caller that is not a shop:
  a URL a program outside the town's call reaches for the length of a
  grant, signing to one origin. Proof: a git push over HTTPS through it,
  no token in the pushing process.
- **relay** (sheep). Pen's broker's one lookup replaced: the cell asks
  the town for a window on the sheep's grant and hands the container
  that, the home's `PEN_GIT_TOKEN` gone. Proof: a sheep pushes with no
  git token anywhere in the home.
- **street** (town). A need whose type has no token, a teller that signs
  nothing, so a shop may reach one public origin its manifest names.
  Wall and compose both deferred it; every walk's agent has said its
  shops cannot reach the web. One phase.
- **wagon** (town). `store export` and `import`, owed by box now that
  the operator's box holds a consent and users.
- **citizen** (town). A second person's own token to their own consents
  and permits: the Square's remainder, and what the draft's pilot of
  eight to twelve people gates on.
- **clock** (town). A shop that wakes on its own, an alarm on an object
  of its own per shop and user. Depends on deputy for the grant it wakes
  with when its caller is gone.

## The line

The walk that closes drove is a line in the whole night sky: after it,
every other constellation gets cheaper. What is true once a dog has
minted a sheep with a grant from the operator's box and it has worked
memory and github:

- a real agent runs in a real environment with no checkout in sight;
- it reaches the town over the wire and nothing else;
- its transcript comes back through `sheep log --json` and its calls
  through the audit, over the wire;
- minting another costs one command.

Nothing before that walk provides this, and deputy can wait until after
it, since a dog can mint several sheep on operator-made passes until
narrowing matters. Two things drove owes so the line pays out:

- **The walk shipped as a script, not a sitting.** Drove's last phase
  leaves a reusable stage, a mode of `scripts/walk.mjs` or a sibling,
  that makes the pass, mints the sheep with it, sends the sentence,
  waits, reads the log and the audit, runs the token search, revokes,
  and removes. That script is the heart of the infra constellation's
  **stranger**, delivered early; stranger wraps it in a ring that runs
  it against tent's box.
- **The infra constellation's baton first.** The brief script, the
  mutation script, and the ring selector cost a day and help build road
  and drove themselves; they are the only infra worth doing before the
  line.

What the line buys: infra's agent ring becomes a sheep against the box
instead of Claude Code in a Docker image; growth's walks become herds,
two or three sheep in a pasture with earmark grants, minted from one
script; and square's bell inverts for a sheep, since a cell holding
`town wait` is not idle, into a summons through a dog, which is collie's
shape. A sheep in a cell cannot reach a laptop's town, so everything
past the line runs against a box.

## The sequence

1. **road**, then **drove**, then the walk closes drove and draws the
   line. This is the sheep walk decided on 13 Sep 2026, recut so the
   first thing built is the proof that town stays usable without sheep.
2. **street** and **wagon**, small, in the gap while drove's walk
   findings settle.
3. **deputy**. Its design is written knowing drove exists, since the
   earmark is the first place a deputy's grant lives.
4. **citizen**, then **clock**, where the pilot's needs and the other
   constellations' stars put them; clock waits on deputy for the grant
   it wakes with.
5. **window**, then **relay**, last. The point where town generalizes
   pen's broker, and the largest cross-repo change, so it comes after
   the smaller ones have taught the seam.

Where the other constellations' stars fall between these is
[night-sky.md](night-sky.md)'s to say.

## Two rules, if this future is chosen

Town projects never import or read sheep's files, and sheep projects
implement town's wire from its doc, never from its code. Each phase that
crosses names the other repo's commit in its findings.

## What this constellation does not do, on purpose

- **Put `town` in sheep's release bundle.** That would make sheep town's
  only harness in practice, against the draft's non-goal.
- **Make town's box depend on sheep's station or its kept credentials.**
  Collie's design warns against reading another program's private file
  shapes, and a town deploy reading `~/.sheep/credentials` would be that.
- **Share a Durable Object.** The town's object and a sheep's cell stay
  apart; they meet on the wire.
