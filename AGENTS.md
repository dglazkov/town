# House rules

This repo is town: a hosted service that gives agents the outside world
through **shops**, agent-authored capabilities handed to an agent as a
CLI. The thesis is that **the CLI handed to an agent is the capability**:
what an agent can run is what it is allowed to do, resolved before it
runs anything, so there is nothing to sign into and nothing granted that
a person did not approve. The draft that argues the whole of it is
[docs/drafts/town-design-doc.md](docs/drafts/town-design-doc.md); the
projects under [docs/projects/](docs/projects/README.md) are how it gets
built, one short body of work at a time. The first was
[project gate](docs/projects/gate/design.md): a grant file in a
directory, the `town` command, and one shop, on one box. The second is
[project vault](docs/projects/vault/design.md): a credential sealed in
the town and used on a shop's behalf, with the shop never holding it.

Read a project's `phases.md` for where its work stands and what the next
phase is; [docs/projects/README.md](docs/projects/README.md) lists them.
`/conduct <project>` is how a phase is run: briefed to a subagent, proved
by the conductor, recorded, committed whole.

- **The manifest is the source; the CLI knows nothing.** Help, argument
  parsing, the grant vocabulary, the audit schema, and the API are
  derived from a shop's manifest on the server. The `town` command sends
  what it was typed and prints what comes back. A guard reads the CLI's
  source for the name of any shop, command, or argument and fails if it
  finds one.
- **Two binaries, one per audience.** `town` is the agent's: it reads
  the grant file, posts argv, prints what comes back, and is the whole
  of what an agent is handed. `townd` is the operator's: `serve`,
  `admin`, `spec`, over the data directory. Nothing of the operator's
  is in the agent's binary, and nothing puts `townd` on an agent's
  PATH. On one box the agent's filesystem reaches the data directory
  anyway; that is colocation, the harness's authority and not the
  town's, and the rule is that the data directory is never under a
  directory an agent works in.
- **Nothing an agent can see holds a secret.** A grant file holds a
  bearer token that a person can revoke from the town at once, and
  nothing else. A shop never receives a credential; the town uses them
  on the shop's behalf. Anything printed to an agent, written to a log,
  or carried in `--json` is fair to read aloud.
- **Every test says what it needs.** `checkout` tests run in this
  process against the modules. `command` tests spawn the built `town`
  against a `townd serve` they start on a free port with a data directory
  of their own, and delete it after. A **walk** is a real agent given a
  directory and a sentence; it is the only proof that the help is honest
  and the only thing that costs money. `pnpm test` runs the first two;
  a phase's proof says when the walk is owed.
- **Node 24 and nothing native.** The database is `node:sqlite`; the
  server is `node:http`. A dependency that compiles is a finding, not a
  choice.
- **Nothing outside this box without a token the user provided.** Steps
  marked ⚑ provision in a `phases.md` create a cloud resource, spend
  money, or need a login, and are asked out loud first.
- **Findings are one dated line, one claim, about forty words.** The
  argument goes in the commit message.
- **Phase citations name their project:** `gate phase 1`, never a bare
  "phase 1".
- **A commit is a push.** Work lands on `main` and is pushed in the same
  breath; "commit" means commit and push. The shepherd reads progress
  from the commits on GitHub, not from a branch on a laptop.

```
pnpm install
pnpm build           # tsc to dist/; bin/town.js and bin/townd.js run it
pnpm test            # checkout and command tests
pnpm typecheck
node bin/townd.js serve --data /tmp/town-data              # a town on 127.0.0.1:7000
node bin/townd.js admin --data /tmp/town-data shop add shops/memory
```
