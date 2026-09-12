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
| [gate](gate/) | The town's gate: where a grant is checked. One server on one box, a grant file in an agent's directory, the `town` command as a thin client and `townd` as the operator's, help rendered on the server for the calling grant, a call allowed or denied before any shop runs, and one shop, `town/memory`, built from a manifest and run as a subprocess. No credentials, no Square, no Town Hall: the operator puts shops and grants in at the box. [`design.md`](gate/design.md) is the argument, [`journey.md`](gate/journey.md) the acceptance suite, [`phases.md`](gate/phases.md) the walk. | **Done 12 Sep 2026.** All three phases closed. The town runs on one laptop: manifest, runtime, `town/memory`, the store, the gate, help for the grant, the audit, the admin, and `town` as a pipe. It was walked by a real Claude Code session: no call denied, and after its grant was narrowed it said it could no longer write memory. Nothing waits. |
| [vault](vault/) | The town's vault: where a credential is kept and used on a shop's behalf without the shop ever holding it. Typed credentials seeded with a GitHub token, the operator connecting one from stdin, rows sealed under a key file, a binding made with the grant, and the teller: a loopback window opened per call that signs a shop's requests to the type's origin and closes after. One new shop, `town/github`. No OAuth, no Square, no egress control. [`design.md`](vault/design.md) is the argument, [`journey.md`](vault/journey.md) the acceptance suite, [`phases.md`](vault/phases.md) the walk. | **Done 12 Sep 2026.** All three phases closed. Credentials are sealed under `vault.key`, bound to grants, opened only when a call is allowed, and signed onto the wire by a per-call teller. `town/github` was walked by a real Claude Code session on a real token: no call denied, the reply on GitHub, and after narrowing it said it could no longer reply; the token was in no file searched. Open, owed to a containers project: on one box a shop can read the key and unseal. |
