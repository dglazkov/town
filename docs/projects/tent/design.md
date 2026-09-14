# Tent — the design

**14 September 2026.** Done: all three phases closed, walks included. The project's status lives in
[journey.md](journey.md)'s front matter. The journeys are the acceptance
suite, this doc is the argument, and [phases.md](phases.md) is the walk.
It is the stars **tent** and **stranger**, cut together from the
[infra constellation](../../drafts/infra-constellation.md) as that
draft's sequence said they would be, and the fourth row of the
[night sky](../../drafts/night-sky.md): the first project past the line
that [drove](https://github.com/dglazkov/sheep/tree/drove/docs/projects/drove)
drew in sheep on 14 Sep 2026, when a dog minted a sheep with a grant
from the operator's box and it worked memory and github, twice, its
search clean.

The thesis in one line: **every proof of the town so far was typed by
a conductor from the checkout, and the line left two things that are
each one command, a box (`pnpm box deploy`) and a walk (sheep's
`scripts/drove.mjs`), so the two rungs of the ladder that need no image,
the account ring and the agent ring, are one script that pitches a box
under a name stamped with the commit, runs road's conformance and
drove's stage against it, strikes it, and exits 0 or says why; after it
a phase's walk over the box is a line in its Proof and not an
afternoon.**

Sheep's rule is the spine, restated for town in the infra draft: **the
ring chooses the environment, never the steps.** Town has no steps to
invent here. The account ring's steps are road's thirty checks, which
already run over a box with `--town`; the agent ring's steps are drove's
stage, which already mints a sheep against a box and reads its
transcript, its audit, and the four places a token could leak. What is
missing is the environment the checkout's state cannot reach: a box of
the ring's own, a HOME of the ring's own, the listing before and after,
and the strike that leaves the account as it was. The ladder is climbed
out of order on purpose, its top two rungs before the middle two,
because a box deploys from the checkout today and a sheep needs no
image; crate moves the deploy onto an installed package later, and yard
adds nothing the agent ring needs.

The night sky's rules hold. Town never imports or reads sheep's files:
the agent ring runs drove's stage as a program, `node <sheep
checkout>/scripts/drove.mjs`, from a checkout the ring is pointed at,
reads its exit and its report, and nothing else of sheep's. A phase that
crosses repos names the other repo's commit in its findings.

## The names

| Word | What it is | Where it lives |
| --- | --- | --- |
| a ring | an environment this checkout's state cannot reach, chosen by name; the inner three are `pnpm test --ring`, the outer two this project's | `scripts/hermetic.mjs` |
| the tent | a box of the ring's own: `pnpm box deploy --name town-hermetic-<sha>` under a HOME the ring made, healthy when `GET /` answers with the build and the door takes the operator's token box made | the ring's directory, `home/` |
| the pitch | the deploy, and the wait for the build in `x-town-build` and for the door to take the new operator's token | `scripts/box.mjs`, run by the ring |
| the strike | `pnpm box delete --name <tent>` with the name on stdin, on every exit of a ring unless `--keep`; `--strike <name>` alone for a tent a killed run left | `scripts/box.mjs`, run by the ring |
| the listing | the account's Workers by name, read before the pitch and after the strike; the ring's own names, `town-hermetic-*` and the tent's, must be the same set, and another's that came or went is named | the API's GET, as `box delete` reads it |
| the account ring | the tent pitched, conformance over the wire, the tent struck | `pnpm hermetic --ring account` |
| the furnishing | what the tent holds before a stranger walks: a user, a `github-token` credential from the ring's stdin, `town/memory` and `town/github` from the checkout's `shops/` | the ring, each verb `townd admin --town` |
| the stranger | the agent ring: the tent pitched and furnished, drove's stage run against it in a kennel that names a standing station, its report read, the tent struck | `pnpm hermetic --ring agent --sheep <dir>` |
| the stage | sheep's `scripts/drove.mjs`: a pass, a sheep minted with the grant on stdin, the sentence, the log and the audit, the search, the revoke, the end | a sheep checkout, run as a program |
| the preflight | what `--dry-run` does and every run does first: the token present, the listing read, the name free, the price and the ask, the stage found; nothing deployed | the ring |
| the ring's directory | `ring.json`, the checks' lines, the stage's report, and never a token; under the system's temporary directory, removed after a green run unless `--keep` | `mkdtemp` |

## What stands today, read 14 Sep 2026

Read from `scripts/box.mjs`, `scripts/conform.mjs`, `scripts/walk.mjs`,
and sheep's `scripts/drove.mjs` at town `473687e` and sheep-drove
`fe5170a`. The ring runs these and changes none of them, save one refusal
it must route around and one function it must import: the listing, which
box's delete reads inside itself with GETs, exported from `scripts/box.mjs`
for the ring, the delete's behavior unchanged.

- **`pnpm box deploy [--name <worker>]`** deploys the checkout as a
  Worker named `town` or `--name`, the build stamped as the commit plus
  `-dirty` when git has anything to say, makes `TOWN_VAULT_KEY` and
  `TOWN_OPERATOR` once, writes the operator's token to
  `$HOME/.town/operator` with mode 600 and prints it once, and waits for
  `GET /` to answer with the build. It **refuses** a deploy that would
  make an operator token while `$HOME/.town/operator` holds one already,
  which the shepherd's does: the standing box's. `deps.home` is `$HOME`,
  so a deploy run with `HOME` set to a directory of the ring's own is
  refused by nothing, writes the tent's token there, and the shepherd's
  file is never read. This is the one fact the ring is built around.
  **Found 14 Sep 2026, by tent phase 0's first real run:** a fresh
  deploy's `GET /` answers with the build seconds before the version
  holding the secrets serves, and `townd admin --town` meanwhile gets a
  500, for ten to fifteen seconds. Box's wait was too early to say the
  box stands, so box's deploy, not the ring, changes: when it made the
  operator's token it also waits, within the same ninety seconds, for the
  door to take that token (`POST /admin` with it answering 400, as the
  delete already asks, the answer stamped with the build) fifteen times
  running, a second apart, each on a connection of its own, and says so.
  One answer was not enough, nor five on one kept-alive connection: two
  real runs then got a 404 to `user ls`, and a probe of a fresh tent
  saw, in its first seconds, 500, Cloudflare's 404 `error code: 1042`
  with no build, the build's 401 before the secret, and then 200 only. The ring adds no retry; a step it
  retried would be a step of its own.
- **`pnpm box delete --name <worker>`** lists what goes with GETs, asks
  for the name on a terminal or takes one line of stdin, deletes with
  `wrangler delete --force`, and removes `$HOME/.town/operator` when it
  was this box's. Under the ring's HOME that file is the tent's.
- **`node scripts/conform.mjs --town <url> -- <harness>`** makes or
  reuses the user `conform`, adds the check shop, makes two passes, runs
  the harness once per check from an empty directory under an empty
  HOME, prints a line per check and a verdict, and revokes and removes
  what it made whatever happened. Every verb is `townd admin --town`,
  whose token townd reads from `$TOWN_OPERATOR` or `$HOME/.town/operator`
  and the script never does. On the standing box: thirty `ok`, twelve
  to fourteen seconds, twice, in drove phase 2.
- **`node scripts/drove.mjs --box <url> --user <name> --repo <owner/name>
  --issue <n> --townd <path> [--kennel <dir>] [--keep]`**, sheep's, refuses
  before making anything unless the box holds `town/memory` and
  `town/github` and the user has exactly one active `github-token`;
  then a root under the temporary directory, a pass expiring in a day,
  grants at memory and at github's `reply` and `show` on the one
  repository, the grant on `sheep new --secret TOWN_GRANT`'s stdin, the
  sentence, `sheep wait`, the log and the audit to the root, the search
  over the log, the export, the status, and the peek's `env`, the revoke
  and `sheep rm`, and one report; exit 0 is every child at 0, the audit
  holding `memory remember` and `github reply` at `ok`, and the search
  clean. `--townd` takes a `.js` path and runs it through node, so the
  checkout's `bin/townd.js` is the townd, and its environment is the
  stage's, so the ring's HOME reaches it. `--kennel` names the kennel
  whose config names the station the sheep is minted on. Sixteen and
  fifteen seconds against the standing box.
- **`scripts/walk.mjs`** over a box furnishes it for the hall walk with
  `townd admin --town` verbs, memory added as a tar on stdin when
  missing, and its github plan on a laptop adds the credential from
  stdin before the github shop, since `shop add --user` runs the shop's
  tests on that credential. The furnishing below is that plan's verbs
  over a box, written in the ring, since walk.mjs's `--town` knows the
  hall walk alone and the ring must not grow a mode there.

## The ladder in town

```
                          the inner rings, pnpm test --ring <name>
   checkout   this process: node, and workerd through the pool
   command    the built binaries spawned against a town on a free port
   box        the Worker in workerd through the pool; wrangler dev in dev.test.ts
                          the outer rings, pnpm hermetic --ring <name>
   account    a tent pitched from this checkout on the operator's account, road's
              conformance over the wire, the tent struck; the listing the same
                                                        pennies, a minute, this project
   agent      the account ring's tent furnished, and drove's stage run against it
              from a sheep checkout in a kennel naming a standing station: a real
              sheep, a real model, the transcript and the audit read, the search
                                                        under a dollar, minutes, this project
   package    town installed from a ref into a fresh prefix and HOME      crate
   machine    the package ring in a container from node:24-slim            yard
```

One script holds the outer half, as `scripts/test.mjs` and
`scripts/rings-reporter.ts` hold the inner; `pnpm hermetic --list`
prints each outer ring, what it needs, and what it costs, and runs
nothing, as `pnpm test --list` does. The two halves share a rule and no
code.

## The ring

`scripts/hermetic.mjs`, plain Node, no dependency, in `scripts/box.mjs`'s
shape: `main(words, deps)` takes its world as `deps`, the deploy, the
strike, the listing, conformance, the stage, a clock, stdin, stdout, and
stderr, so `test/hermetic.test.ts` drives every path with fakes and the
real ones are the children below. Its usage block is the whole of it:

```
pnpm hermetic --ring account [--name <worker>] [--yes] [--dry-run] [--keep] [-- <harness command…>]
pnpm hermetic --ring agent --sheep <dir> --repo <owner/name> --issue <n> [--kennel <dir>] [--user <name>] [--name <worker>] [--yes] [--dry-run] [--keep] < <token file>
pnpm hermetic --strike <worker> [--yes]
pnpm hermetic --list
```

**The directory.** Every run makes one under the system's temporary
directory, `town-hermetic-<sha>-<random>/`, holding `home/`, an empty
HOME the children run under, `ring.json`, the run's facts as they
happen (the ring, the name, the sha, the build, the address, each step
with its exit and its seconds, the listing before and after), and the
steps' output, `conform.txt` or `drove.txt`. A green run removes it
after the strike and says so; `--keep` leaves it and names it; a run
that is not green leaves it and names it, always, since what went wrong
is in it. The deploy's stdout is read for the address and the build and
is **never written to the directory**, since it prints the operator's
token once; `home/.town/operator` is where that token lives, mode 600,
and `box delete` removes it at the strike.

**The name.** `town-hermetic-<sha>`, the short commit of `HEAD`, unless
`--name`. A dirty tree is not refused, since a conductor runs the ring
mid-phase over a builder's tree; the build carries `-dirty` as box's
does, and the ring's first line says the tree is dirty. A tent of the
name already in the listing is refused before anything is made, naming
`--strike`.

**The preflight, which is `--dry-run` whole.** In order, each a line:
`CLOUDFLARE_API_TOKEN` present in the environment, or box's own refusal
repeated and exit 2; the sha and whether the tree is dirty; the listing
read and the name free; for the agent ring, the sheep checkout's
`scripts/drove.mjs` existing at the path given and the kennel directory
existing, read by path and never by content, and the token read whole
from stdin, a pipe or a file and never a terminal, refused empty or with
a line break in it; the price, in box's words, the Workers plan and cents
a day, and for the agent ring the model's dollars, with the last two
walks' seconds; the consent from afar, box journey 4, named as not
walked since it needs a browser. Then the ask: `pitch <name> on the
account? [y/N]` on a terminal, unless `--yes`; no terminal and no
`--yes` is a refusal, exit 2. `--dry-run` stops before the ask, having
deployed nothing, exit 0.

**The account ring's steps, after the ask.**

1. The pitch: `node scripts/box.mjs deploy --name <name>` as a child
   with `HOME` the ring's `home/`, `TOWN_OPERATOR` unset, the rest of
   the environment through; its stdout read for the workers.dev address
   and the build, which must be this run's sha with or without `-dirty`;
   its exit read.
2. The walk: `node scripts/conform.mjs --town <address> -- <harness>`
   as a child under the same HOME, the harness `node bin/town.js`
   unless the words after the ring's `--` give one, as conformance's own
   `--` does, so a check can be broken on purpose with conformance's
   broken harness and the ring's failure path walked; the harness is
   named in `ring.json` and the closing block. Its lines to
   `conform.txt` and to the terminal as they come, its exit read; green
   is `conformant: 30 checks` and 0. The count is not fixed in the ring;
   the verdict line is.
3. The strike: `node scripts/box.mjs delete --name <name>` under the
   same HOME with the name on stdin, its exit read.
4. The listing after, whose ring's own names, those starting
   `town-hermetic-` and the tent's, must equal the listing before's.
   The account is shared: tent phase 1's first real run was green in
   every step and exit 1 on the listing, since sheep's own ring had
   deployed `sheep-hermetic-cc475fb-c-t-collie` mid-run. A Worker of
   another's that came or went is named in the closing block and
   `ring.json` as another's and does not fail the run; the ring
   neither made it nor may strike it.

Exit 0 is every step at 0 and the listings equal; 1 is any other run,
the strike attempted whatever step failed, unless `--keep`, which leaves
the tent standing and says its name and how to strike it; 2 is a
refusal that made nothing. A step that is killed, the ring's own signal
included, is followed by the strike where the process can still run it;
where it cannot, `--strike <name>` is the morning after: the listing
read, the name found, the ask, the delete under a fresh HOME that holds
no token, since box's delete does not need the box's own operator to
delete it, and the listing again.

**The agent ring's steps** are the account ring's with two between the
pitch and the strike:

1. The furnishing, each verb `townd admin --town <address>` from the
   checkout's `bin/townd.js` under the ring's HOME, in the order
   walk.mjs's github plan runs them: the user (`--user`, default
   `stranger`), the credential from the token the preflight read,
   `--type github-token`, the token on the child's stdin and nowhere
   else; `town/memory` and `town/github` from the checkout's `shops/`,
   each as a tar on stdin, github's with `--user` so its tests run on
   the credential. Then `shop ls` and `credential ls --user`, read as the
   stage will read them, so a furnishing the stage would refuse is seen
   here with the ring's words.
2. The walk: `node <sheep>/scripts/drove.mjs --box <address> --user
   <user> --repo <repo> --issue <n> --townd <checkout>/bin/townd.js
   --kennel <kennel>` as a child under the ring's HOME, its stdout to
   `drove.txt` and to the terminal as it comes, its exit read; the root
   it names recorded in `ring.json`, since `--status` and `--teardown`
   on it are the stage's. Green is exit 0, which the stage defines as
   every child at 0, the audit holding the two calls at `ok`, and its
   search clean. `--kennel` defaults to `<sheep>/.sheep`, the stage's
   own default, said explicitly so the ring names the kennel whose
   station it used in `ring.json`.
3. After the walk and before the strike, the ring's own search: every
   file under the ring's directory read for the token's bytes, as
   walk.mjs's `--search` reads, a hit named by path and never printed,
   and a hit is exit 1. The stage's search over the sheep is the
   stage's, and its verdict is in its exit.

The standing station is a fact the ring records and does not make: the
kennel's config names it, and the stage mints on it. In this project it
is `sheep-drove`, deployed from `../sheep-drove/.sheep` in drove phase 2
and kept as the standing second station for this ring. A sheep in a
cell cannot reach a laptop's town, which is why the tent is a box and
why this ring sits beside the account ring and not after it.

## What the ring never does

- Reads `~/.town/operator`, or writes it. Every child runs under the
  ring's HOME; the shepherd's box and its token are not in the ring's
  world, and a run with `--name town` is refused by name.
- Imports or reads a file of sheep's. The stage is a program at a path;
  its usage is known from drove's README and its exit from drove's
  design, and a change in either is a finding in the run's findings.
- Holds a token in argv or in `ring.json`. The github token goes from
  the ring's stdin to `credential add`'s stdin; the operator's is
  box's, in the ring's `home/`; the grant is the stage's, on `sheep
  new`'s stdin, and the ring never sees it.
- Fixes a count. Conformance's checks and the stage's calls are those
  scripts' to know; the ring reads verdict lines and exits.
- Decides a step. A ring that grew a step of its own would be a fourth
  script's walk; the steps are road's and drove's, and a proof that
  needs another step changes those.

## Tests

`test/hermetic.test.ts`, checkout ring, drives `main` with fakes and no
child: the usage and every refusal before anything is made; the
preflight's lines and the `--dry-run` stop; a dirty tree named; the name
from the sha and from `--name`, `town` refused; the pitch's build
checked against the sha; a green account run's step order and its
directory removed; a failed check striking the tent and leaving the
directory; `--keep` leaving the tent and naming it; the listings unequal
seen; `--strike` on a name the listing lacks refused and on one it
holds deleted; the agent ring's furnishing order, the token on the
credential child's stdin and in no argument and no file, the stage's
command line word for word, its exit read, its root recorded, and the
ring's search finding a planted token under the directory and never
printing it. The fake deploy prints a token line, and the test reads
the directory after for it.

No command-ring test spawns the real script against a real account.
`test/deploy.test.ts` proves box's verbs with a fake wrangler and is
unchanged.

## The docs the ring changes

- `AGENTS.md`'s "every test says what it needs" bullet gains the outer
  rings' sentence, and the command block gains `pnpm hermetic --ring
  account` and `--list`.
- `README.md`'s operator section gains the ring in one paragraph, after
  the box's deploy.
- The conduct skill's proof section says a phase whose Proof names a walk
  over the box writes `pnpm hermetic --ring agent` and the conductor
  types one command, recording the ring's exit and the stage's report
  in the findings; and `brief.sh` carries that line into the brief.

## Costs

The account ring: a deploy's requests and an object's minutes, cents,
and about a minute of wall clock, most of it the deploy and the health
wait. The agent ring: that, a container's minutes on the station while
the sheep rents one, and a model turn, the two walks in drove phase 2
at sixteen and fifteen seconds and well under a dollar each. Each ring
asks once unless `--yes`.

## What this does not do, on purpose

- **The package and machine rings.** Crate and yard, after survey and
  deputy; the deploy from the checkout is enough for the tent, and the
  ring says it deploys the checkout.
- **A rehearsal without a model.** The infra draft's stranger phase 0
  is not needed past the line: drove's own tests prove the stage
  against the fake container in sheep, and the account ring's
  conformance is the scripted proof of the wire.
- **The stage split out of `scripts/walk.mjs`.** The draft said tent
  would be born with it; walk.mjs already runs over a box and stages
  nothing the ring needs, and a split it does not need is sweep's or
  never.
- **The consent from afar.** Box journey 4 needs a browser; the ring
  skips it with one line and names it at the end, and keeps doing so
  until a ring can hold a browser, which none here can.
- **CI.** Tempo's; a ring that costs money or needs an account never
  runs on push.
- **A second standing box.** The tent is struck; the shepherd's box is
  the only one that stands, and drove's station is sheep's.
- **Deleting the station, or minting one.** The kennel names it; a run
  without a kennel that names one is a stage refusal, repeated.

## Open questions

- Whether the stage should take the townd's environment explicitly
  rather than inheriting it. Today the ring relies on drove's `run`
  passing `process.env` through to townd; drove phase 1's design says
  the stage reads the token where townd does, which is the same thing
  said from the other side. A stage that stopped passing HOME would fail
  the agent ring at the furnishing check, which is where a reader would
  look.
- Whether the listing should be read by the ring itself with the API or
  through a `box list` verb that does not exist. The ring imports the
  GET from `scripts/box.mjs`, town's own file, and a verb is not made for
  one caller.
