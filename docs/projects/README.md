# Projects

One directory per body of work. A project holds everything about itself:
the ideal it is aiming at (`journey.md`), the mechanism (`design.md`), and
the walk that gets there (`phases.md`). Reading a project end to end is
`ls` and then reading in order; adding a doc to one edits nothing outside
it.

**Where each project stands lives in its own primary doc**, in front
matter, so this table cannot be more right than the thing it describes.

**A project is short.** It holds one body of work with an end: a journey
that can be walked, phases that close, a last phase after which nothing
in it waits on work. A project that turns out to be long-lived was cut at
the wrong grain and should have been several. The pilot in the draft
([../drafts/town-design-doc.md](../drafts/town-design-doc.md) §16) is
several such projects, each named for what it adds to the town.

| Project | What it is | Where it stands |
| --- | --- | --- |
| [gate](gate/) | The town's gate: where a grant is checked. One server on one box, a grant file in an agent's directory, the `town` command as a thin client and `townd` as the operator's, help rendered on the server for the calling grant, a call allowed or denied before any shop runs, and one shop, `town/memory`, built from a manifest and run as a subprocess. No credentials, no Square, no Town Hall: the operator puts shops and grants in at the box. [`design.md`](gate/design.md) is the argument, [`journey.md`](gate/journey.md) the acceptance suite, [`phases.md`](gate/phases.md) the walk. | **Gate phase 0 closed 12 Sep 2026.** `townd spec`, the validator, the runtime, and `town/memory` passing its own tests, no server yet. Next: gate phase 1, the town and the command; then gate phase 2, the walk with a real agent. |
