# The square constellation — a possible future

**Status:** Draft. A possible future, not a decision. Nothing built.
**Date:** 2026-09-13

Sketched the same evening as the [sheep](sheep-constellation.md),
[growth](growth-constellation.md), and [infra](infra-constellation.md)
constellations, as the fourth direction: give the shop a second
surface. The idea borrows [isocan](https://github.com/dglazkov/isocan)'s
shape, an isomorphic surface where a CLI and a web page are equal
clients over one vocabulary and one engine, and the CLI can park and be
woken by what the person does on the page. Town has the vocabulary
already, per shop, in the manifest, and the engine, in the gate. What it
lacks is the page and the event coming back. The projects named here do
not exist; their names are proposals in the town's style, and one star,
**visit**, leans on **citizen**, which every other constellation names.

---

## The fit

Isocan's guarantee is that the CLI and the web app cannot diverge
because both speak one operation vocabulary to one engine. A shop's
manifest is that vocabulary: its commands are the ops, their args the
payload, `effect` the class, and the gate is the one door everything
passes through. Isocan's extension rule translates word for word. There,
an extension may only ask for what a person could ask for. Here:

> **A front may only ask for what an agent could ask for.**

Every gesture in the person's browser is a command of a manifest, run
through the gate under a pass, and written to the audit with its actor.
The person's click and the agent's call are the same row, told apart by
who held the pass. That gives the page revocation, narrowing, and the
audit for free, the way isocan's extensions get undo and comments for
free by being items.

## One surface, not one per shop

Isocan has one surface, the canvas, and a module contributes to both
surfaces at once: a verb family for the CLI and components for the
shell's slots. Town's version is the same one level up. The person has
one surface, the draft's Square, at the town's address, and every shop
their pass holds contributes to it through the manifest that already
contributes its commands to `town`. A shop is a module; the town is the
shell. There is no page per shop.

Composition falls out of what compose already built. A view is bound to
a command. A composed shop may bind a view to a dependency's command it
declared, and the clerk's cut applies to the view exactly as it applies
to the call, so `town/watch`'s card can show the memory rows it keeps
without holding memory whole. The rule stays one sentence: a front shows
only what its pass could call. Layout is the town's, not the shop's: a
card per shop made of its views, a feed of calls underneath, and the
person pins or hides. Nobody's manifest says where anything goes on
someone else's screen.

## Who draws it

The CLI knows nothing and is rendered from the manifest on the server.
The first square knows nothing too: the town renders it from the
manifests, a form per command the pass allows, output shown as text or
a table by the command's `output`, the state's presence, and the call
feed, refreshed when a write lands. No shop code reaches the browser.
Weaker than a hand-built app, and honest: the person sees exactly the
help the agent sees, as buttons.

The next step is declarative, in isocan's stage-one shape: a manifest
names views from a closed set, each bound to a command. Shop-authored
UI code, if it ever comes, runs from an origin of its own under a pass,
never from the town's, so it can imitate nothing; it is an agent that
happens to render, and it is the only place an address of its own ever
made sense.

## The event coming back

Isocan's `wait` is the missing verb: an agent parks in the foreground
and returns when something lands that is for it, on the canvas and not
on an item. Town's is town-wide the same way: `town wait` returns the
next call by another actor at any shop the pass holds, or a message,
as JSON, exit 2 on timeout. The town holds the long poll, not the shop,
so nothing about the thirty-second call changes. Messages need a place,
and the natural one is a shop the town is born with, like the hall, with
`say` and a chat view; every person then has somewhere to talk to their
agents on day one, and an agent's lap is isocan's: work, say, park.

## The line that does not move

The approval page is the one part of the square no manifest contributes
to. A hall card can list requests, since `requests` is a hall command,
but approve is the operator's verb and stays off any surface a shop's
author could shape. The growth constellation says why.

---

## The constellation

```
   ┌─────────┐   ┌─────────┐
   │ square  │   │  visit  │     the one surface, rendered from the manifests
   └────┬────┘   └────┬────┘     the pass a browser holds
        └──────┬──────┘
               ▼
   ┌─────────┐   ┌─────────┐
   │ display │   │  board  │     views a manifest declares; a place to talk
   └────┬────┘   └────┬────┘
        └──────┬──────┘
               ▼
          ┌─────────┐
          │  bell   │           town wait: the person acted, the agent wakes
          └────┬────┘
               ▼
          ┌─────────┐
          │  kiosk  │           shop-authored UI from its own origin; last, maybe never
          └─────────┘
```

## Each star in a sentence

- **square.** The person's one surface at the town's address, rendered
  by the town from the manifests their pass holds: a card per shop, a
  form per command, output by its kind, the call feed, refreshed when a
  write lands. Read-only first, then forms. Proof: a person uses
  `town/memory` from a browser, and the audit shows their rows beside
  the agent's with the same shop and command.
- **visit.** The pass a browser holds: a URL minted at the box, bound to
  one user, its grants the person's shops, revocable like any grant and
  seen by the next request. Operator-minted first; the person's own
  when citizen lands. Proof: a revoked visit's next click is refused in
  the words a revoked grant's next call is.
- **display.** `views:` in a manifest, from a closed set, list, table,
  text, chat, form, each bound to a command of the shop's own or of a
  dependency it declared, validated with everything else and cut by the
  clerk. Proof: `town/watch` declares a view over memory's `recall`,
  and the card shows it under the composed shop's grant alone.
- **board.** A shop the town is born with: `say`, `read`, a chat view,
  state per user like any shop, so the square has a place to talk and
  an agent has a place to ask. Proof: a person says a line in the
  square and the agent reads it with `town board read`.
- **bell.** `town wait [--timeout <s>]`, held in the foreground,
  returning the next call by another actor at any shop the pass holds,
  or a board line, as JSON; exit 2 when nothing came. The rule of the
  lap comes with it: a turn ends inside the wait. For a sheep the bell
  inverts: an idle cell costs nothing but a cell holding a wait is not
  idle, so the sheep's bell is a summons, the board line waking a sheep
  through a dog, which is collie's shape and clock's mechanism. Bell is
  designed knowing both halves, the park for a laptop's agent and the
  summons for a cell's. Proof: the walk.
- **kiosk.** Shop-authored UI from an origin of its own under a visit,
  posting to the town as `town` does. Last, and only if display proves
  too small.

## The walk

An agent writes a to-do shop, publishes it, and parks on `town wait`.
The person opens the square, sees the to-do card beside memory's, and
checks a box. The wait returns that call. The agent says so on the
board, and the square updates without a reload. Both actors are in the
audit under the same shop and command, and the token is in no file
searched but the grant file and the visit.

## The sequence

1. **square** and **visit**, together, read-only first.
2. **display** and **board**.
3. **bell**, closed by the walk.
4. **kiosk**, if ever.

## Crossings

An agent that is not running when the bell rings needs the growth
constellation's **clock** and **deputy**, or the sheep constellation's
collie summoning a sheep. The person's own token is **citizen**, in
every constellation. And the Square the draft describes (§11) turns
out to be this: the fronts of the shops the person holds, the board,
and one page of the town's own, the approval.

## What this constellation does not do, on purpose

- **A page per shop, or an address of its own.** One surface, the
  person's; only kiosk ever has an origin, and for isolation alone.
- **Shop code in the browser.** Not until kiosk, and never at the
  town's origin.
- **A shop that waits.** A shop is a call; the town holds the wait for
  an agent. A shop that wakes on its own is clock's.
- **Layout in a manifest.** Views, yes; where they go, no.
- **The approval on any card.** The line that does not move.
