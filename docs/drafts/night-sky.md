# The night sky — the four constellations in one sequence

**Status:** Draft. The shepherd's lean of 13 Sep 2026, late. Its first
project, [baton](../projects/baton/design.md), was cut and closed the
same night, so the order is being walked; each later row is a decision
only when its project is cut. [Road](../projects/road/design.md) was cut
and closed on 14 Sep 2026, after this page was read through against all
four drafts the same morning. Drove was planned the same day in a
clone of sheep, `../sheep-drove`, on branch `drove`, since collie holds
`../sheep`; it lands on sheep's `main` after collie's, and its walk runs
on a second station of its own, deployed from that checkout's kennel.
Drove closed the same evening, 14 Sep 2026, on sheep-drove `7c85374`:
the line is drawn, and the standing station `sheep-drove` stays.
[Tent](../projects/tent/design.md), row 4's tent and stranger as one
project, was cut that night and closed the same night: the account ring
and the agent ring walk on the operator's account and the station.
[Wagon](../projects/wagon/design.md), the second half of row 5, was cut
the same night: `store export` and `store import`, the two verbs box
said were one verb away; street stays a proposal.
**Date:** 2026-09-13

Four drafts sketch what the town could do after its first seven projects
closed, each a constellation of proposed projects around one question:

| Constellation | Question | Cornerstone star |
| --- | --- | --- |
| [sheep](sheep-constellation.md) | where the town runs | drove, `town` in a sheep's shell |
| [growth](growth-constellation.md) | how the town grows | survey, the graph as the build |
| [infra](infra-constellation.md) | how the town is built | stranger, the ladder's agent ring |
| [square](square-constellation.md) | what the person sees | square, the one surface from the manifests |

The lean is that **sheep is the cornerstone**, not because it is the
most important question but because of **the line** it draws: the walk
that closes drove leaves a real agent in a real environment, minted in
one command, reaching the town over the wire and nothing else, with its
transcript and its calls readable from outside. After that walk every
other constellation gets cheaper: infra's agent ring is a sheep, growth's
walks are herds, square's bell has its second half. The line is defined
in the sheep draft; this page is the order across all four.

## The sequence

```
   before the line
   1  baton      infra    the conductor's tools: brief.sh, mutate.mjs, --ring   done 13 Sep
   2  road       sheep    the wire named, the grant from the environment, conformance   done 14 Sep
   3  drove      sheep    town in the sheep's shell; the walk shipped as a script   done 14 Sep
   ─────────────────────  the line: a dog mints a sheep that works memory and github on the box
   after the line
   4  tent + stranger   infra    the account ring, deployed from the checkout; the agent ring as a sheep inside it   done 14 Sep as tent
   5  street, wagon     sheep    a public origin; export and import      (small, in gaps; wagon cut 14 Sep)
   6  survey            growth   a republish runs its dependents' tests; walk 1 as a herd
   7  deputy            sheep    a narrower durable grant, the earmark its first home
   8  tempo, crate, yard infra   the suite's clock and CI; the release path, tent moved onto it; the machine ring
   9  ledger, plot, stall growth small and independent
  10  conduit           growth   the transitive hold; walk 2 as a herd
  11  square + visit    square   the one surface, and the pass a browser holds
  12  display, board    square   views from a closed set; a place to talk
  13  citizen           shared   a second person's own token, consents, permits; sheep's and growth's
  14  commons           growth   visibility between users; walk 3, two people
  15  clock             sheep    a shop that wakes on its own, on deputy's grant
  16  bell              square   town wait, as a park and as a summons
  17  window, relay     sheep    pen's broker replaced by a window the town opens
  18  sweep             infra    in the gaps, throughout
      kiosk             square   if ever
```

## Why this order

- **Baton before road** because it cost a day and every phase after it
  is briefed by it.
- **Nothing paid before the line but the line's own walk.** Road and
  drove are proven by a conformance script and one walk; every later
  walk is run by the script drove leaves.
- **Tent and stranger right after the line** so the first project past
  it is proven by the ladder and not by hand, and because a sheep in a
  cell can reach only a box. This takes the ladder's top two rungs
  before its middle two, so tent's box is deployed from the checkout,
  as `pnpm box deploy` does today, and `hermetic.mjs` is born in tent;
  crate later moves the deploy onto the installed package, and yard adds
  nothing stranger needs, since a sheep is not an image.
- **Survey before deputy** because growth's first walk needs no
  narrowing, only two sheep on operator-made passes, and its finding, a
  change that did not land, is the one the town has never had.
- **Citizen before commons**, since commons is the first star that
  needs a second person, and citizen is the star the sheep and growth
  constellations share and visit waits on. **Clock after deputy**, for
  the grant it wakes with when its caller is gone. **Bell after clock
  and after board**, since its summons half is clock's mechanism and its
  walk speaks on the board.
- **Window and relay last among the paid work**, the largest cross-repo
  change, after the seam has been taught by drove and deputy; the sheep
  draft's own order had them before citizen and clock, and this page
  moves them.

## The rules that hold across the sky

- Town projects never import or read sheep's files; sheep projects
  implement town's wire from its doc, never from its code.
- The registration and the approval page are the person's, whatever an
  agent builds.
- The manifest is the source: the CLI, the square, and the version are
  all derived from it, and none of them knows a shop's name.
- A phase that crosses repos names the other repo's commit in its
  findings; a project cut from a constellation names the star it came
  from in its design's first paragraph.
