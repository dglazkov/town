# The growth constellation — a possible future

**Status:** Draft. A possible future, not a decision. Nothing built.
**Date:** 2026-09-13

Sketched the same evening as the
[sheep constellation](sheep-constellation.md), as the other direction.
The question here is not where the town runs but how it grows: a future
where the seams between shops are project boundaries, so agents write
synergistic code independently, and composition is what brings the
freedom to grow. The projects named here do not exist; their names are
proposals in the town's style, and one star, **citizen**, is shared with
the sheep constellation.

---

## What is already true

A shop is already most of a project boundary. Its manifest is the whole
contract: commands, args, effects, constraints, guidance, and tests. Its
`depends` list is an import list with authority attached, since
[compose](../projects/compose/design.md)'s clerk cuts the caller's grant
to exactly what was declared. Its tests run through real dependencies as
the agent, in scratch state, as [hall](../projects/hall/design.md) made
them. And the audit is a call tree, so the town already sees the whole
graph at runtime. What the town does not yet do is use that graph at
publish time. That is the gap between "shops compose" and "agents grow
shops independently."

Three cuts made on purpose earlier are exactly what independence needs
revisited: latest-only with republish-replaces (gate), `depends` per shop
rather than per command (compose's "a finding if it chafes"), and no
visibility between users (hall's "a project with a second person in it").

## The future, if it works

An agent republishes its shop and the town, before anything lands, runs
the tests of every shop that depends on it. If a dependent breaks, the
publisher is told in that dependent's words and the change is held, the
way a permit is held. The agent never learns semver, because the
manifest diff is the version: the town classifies a change as additive,
narrowing, or breaking by comparing two structured manifests, and only a
breaking change owes anything to anyone. Every author can ask the town
where callers of their shop stumble, and fix it, so every author is
their own gardener. Another person's agent finds a shop, depends on it,
and asks for the grant with one verb. Two agents who have never met build
shops over each other's, and neither can break the other silently.

## The one line that does not move

Two things stay the person's, whatever an agent builds. **The
registration:** an OAuth client is the operator's, never an agent's;
[consent](../projects/consent/design.md) wrote that rule so an agent can
propose where a secret goes but never supply the identity it goes as.
**The screen the person approves on:** the manifest is the trust unit
because a person reads it and the town renders it; a shop that drew the
approval screen would let the asker write the question. The Square, when
it comes, is the town's, born with it like the hall. An agent's part in
it is the words the town already lets it write: the guidance and the
summary.

So the "auth agent" of this future is not one that builds the UI or the
conduit's registration. It is the author of the credentialed leaf: the
shop with a need, which is the hardest shop to write, so that no other
author ever touches OAuth. The shop is the conduit, and the town signs
through it.

---

## The constellation

```
   ┌─────────┐
   │ survey  │  the graph as the build: a republish runs its dependents'
   │         │  tests and holds a break; the manifest diff is the version
   └────┬────┘
        │            ┌─────────┐  ┌─────────┐  ┌─────────┐
        │            │ ledger  │  │  plot   │  │  stall  │   small, independent,
        │            └─────────┘  └─────────┘  └─────────┘   any time after survey
        │             the audit    per-command   a scratch
        │             handed back  depends and   namespace
        │             to authors   compositional
        │             as a shop    effects
        ▼
   ┌─────────┐
   │ conduit │  the transitive hold: a shop over a dependency whose permit
   │         │  is pending waits, told why in the dependency's words
   └────┬────┘
        │
        ▼
   ┌─────────┐      ┌─────────┐
   │ citizen │ ───▶ │ commons │  visibility between users, a public namespace,
   └─────────┘      └─────────┘  a grant from one person to another's agent
   (shared with the sheep constellation)

   three walks, one per tier:
   1  two agents, one user       A publishes, B depends, A breaks, the town holds it
   2  three agents, one user     C's credentialed leaf, B over C, A over B; the hold ripples
   3  three agents, two people   C is another person's; the permit is a negotiation
```

## Each star in a sentence

- **survey** (a surveyor stakes the boundaries). The town keeps each
  dependent's view of its dependencies at publish, and a republish runs
  the tests of every shop that depends on the changed one before it
  lands: a break is held and reported to the publisher in the dependent's
  words, an additive change lands, a narrowing lands and dependents'
  liveness says `lacks` as compose already does. The diff between two
  manifests is the version; there are no numbers. This is the draft's
  gardener step 3 (§12.2) generalized, and the one mechanism that makes a
  seam a boundary. Proof: walk 1.
- **ledger**. The audit handed back to authors as a shop the town is
  born with, like the hall: `town ledger` shows a pass its own shops'
  rows, denials, exits, malformed arguments, immediate retries, cut to
  the caller's namespace and never another's. Every author is their own
  gardener, and the draft's §12.3 work queue becomes something an agent
  reads. Proof: an agent reads where callers of its shop stumble and
  republishes a fix, the rows saying so after.
- **plot** (a parcel within a boundary). `depends` per command: a command
  names the dependency commands it calls, its declared `effect` must
  cover theirs, checked at `validate`, and the clerk's cut is per
  command. Publish asks for what it lacks: a dependency the agent holds
  no grant at holds the shop and asks for a permit, as publish already
  does for a credential. Proof: a `read` command that calls a `write`
  dependency is refused at `validate` with the line that fixes it.
- **stall** (a market stall, temporary). The draft's §9.4 scratch
  namespace: `<user>/~/<shop>`, iterated on without a person, running
  only through dependencies the pass already holds, expiring unused.
  Proof: an agent tries a composition in scratch and publishes it whole.
- **conduit**. The transitive hold. A shop published over a dependency
  whose own permit is pending, its type proposed or its credential
  missing, is kept waiting and told why in the dependency's words; when
  the person approves the dependency's permit, the dependent's tests run
  and it goes live with no action from its author. A break from the
  credentialed leaf ripples through every level, held at each. Proof:
  walk 2.
- **citizen**. A second person's own token to their own consents and
  permits, shared with the sheep constellation. Proof: a second person
  connects a credential from their own terminal to the operator's box.
- **commons**. Visibility between users, a public namespace a person
  publishes into, and a grant at one person's shop to another person's
  agent, asked for by `town hall request` and approved by the shop's
  person, not the operator. Proof: walk 3.

## The three walks

1. **Two agents, one user.** A publishes a shop. B finds it in search,
   depends on it, and publishes over it and a town shop. A renames a
   command and republishes; the town runs B's tests, holds A's change,
   and tells A in B's words. A ships an additive change instead, and B's
   shop keeps working with no action from B. No token in any file
   searched. The first town walk with two authors, and the first where
   the proof is a change that did not land.
2. **Three agents, one user.** C publishes the credentialed leaf, with a
   proposed type and guidance. B publishes over C while C's type is still
   proposed and is held, told why. The person walks C's checklist; B goes
   live on its own. A publishes over B. C makes a breaking change and it
   is held at B and at A, each told in its dependent's words.
3. **Three agents, two people.** C belongs to a second person. B's
   request for a grant at C's shop reaches that person, who approves it
   narrower than asked. The permit is a negotiation between parties, not
   with the operator, and that is where the word earns itself.

Each walk is a sitting of its own. The box walk showed most of a walk's
spend goes on false starts, so three agents in one sitting would mostly
buy noise; three sittings buy three findings.

## The sequence

1. **survey**, closed by walk 1.
2. **ledger**, **plot**, **stall**, small and independent, in any order.
3. **conduit**, closed by walk 2.
4. **citizen**, then **commons**, closed by walk 3.

## What this constellation does not do, on purpose

- **Semver, or any version number.** The manifest diff is the version.
  The draft's pinned ranges (§12.3) are what this replaces.
- **A central gardener.** Consolidation (§12.2) waits for a corpus that
  teaches what "similar" means (open question 6); the ledger gives every
  author the gardener's inputs first.
- **A registry UI, or a Square drawn by a shop.** The approval screen is
  the town's; see the line that does not move.
- **A registration from an agent.** Never, as consent said.
- **A package manager.** A dependency is a name the town holds, resolved
  at the call, held to its contract by survey rather than by a lockfile.
