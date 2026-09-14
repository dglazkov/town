---
status: partial
since: 2026-09-14
see: tent
note: "written 14 Sep 2026, the evening drove closed in sheep and the night sky's line was drawn: the town's tent, where the ladder's top two rungs become one script. `pnpm hermetic --ring account` pitches a box named for the commit under a HOME of its own, runs road's thirty checks over the wire, and strikes it, the account's listing the same before and after; `pnpm hermetic --ring agent --sheep <dir>` furnishes that box with a user, a credential from stdin, and the memory and github shops, and runs drove's stage against it as a program, a real sheep on the standing station, its report read and its exit the verdict. The fourth row of the night sky, the stars tent and stranger of the infra constellation cut together, and the first project past the line. Tent phase 0 closed 14 Sep 2026: the account ring walked on the operator's account, green twice at thirty `ok`, kept and struck, failing on purpose with the broken harness and struck, the listing the same each time; box's deploy now waits for its door to take the operator fifteen times running, since a fresh Worker's edge answers 1042 for seconds. Tent phase 1 closed the same evening: the agent ring furnished the tent and ran drove's stage from sheep-drove `fe5170a` on the station `sheep-drove`, green twice with a comment each on `dglazkov/town#6`, failing by an empty kennel and struck, the token in no file; a closed issue took a comment, and the listing now speaks for the ring's own Workers on a shared account. Tent phase 2 is next."
---

# Tent — the journeys

Every proof of the town so far was typed by a conductor from the
checkout, against the laptop or against the one standing box: `pnpm box
deploy` by hand, a walk by hand, `pnpm box delete` by hand or not at
all. **This project makes the two rungs of the ladder that need no
image, a box of the run's own and a sheep inside it, into one script, so
that proving the town the way an operator meets it, and the way an
agent meets it, is one command that leaves the account as it found
it.** Nothing a shop, an agent, or the town sees changes; the steps the
rings run are road's and drove's, already written and already walked.

Each journey is an acceptance test: the work is done when it can be
walked as written. [design.md](design.md) is the mechanism and
[phases.md](phases.md) the walk. If a journey and the mechanism
disagree, the mechanism is what changes.

Vocabulary the journeys use, on top of the earlier projects' and
drove's:

- **A ring**: an environment the checkout's state cannot reach, chosen
  by name. The inner three are `pnpm test --ring <name>`; the outer
  two here are `pnpm hermetic --ring <name>`.
- **The tent**: a box deployed by a ring under the name
  `town-hermetic-<sha>` and a HOME of the ring's own, and struck by the
  same ring.
- **The stranger**: the agent ring, a sheep minted by drove's stage
  against the tent, on the standing station the kennel names.
- **The stage**: sheep's `scripts/drove.mjs`, run as a program from a
  sheep checkout the ring is pointed at.
- **The furnishing**: what the tent holds before the stranger walks: a
  user, a `github-token` credential, `town/memory`, and `town/github`.
- **The listing**: the account's Workers by name, read before the
  pitch and after the strike. The account is shared with other rings,
  sheep's among them, so "the same" is said of the ring's own names,
  `town-hermetic-*` and the tent's, and a Worker of another's that came
  or went is named and not held against the run.
- **The strike**: `box delete` of the tent, and `home/.town/operator`
  gone with it.

## Journey 1: The operator proves the box with one command

The operator's laptop, this checkout at some commit, `CLOUDFLARE_API_TOKEN`
in the environment, `~/.town/operator` holding the standing box's token
as it does today, and no Worker on the account named for this commit.

1. `pnpm hermetic --list` prints the two outer rings, one line each
   with what it needs and what it costs, and runs nothing.
2. `pnpm hermetic --ring account --dry-run` prints the preflight: the
   token present, the commit and whether the tree is dirty, the
   listing read and `town-hermetic-<sha>` free, the price in box's
   words, the consent from afar named as not walked; and stops with
   nothing deployed, exit 0. The listing after is the listing before.
3. `pnpm hermetic --ring account` prints the same preflight, asks
   `pitch town-hermetic-<sha> on the account? [y/N]`, and on `y`: the
   pitch, with the address and the build, this commit; conformance's
   lines as they come, thirty `ok` and `conformant: 30 checks`; the
   strike; and one closing block: the ring, the tent, the steps with
   their seconds, the listing the same before and after, the consent
   named as skipped, and the ring's directory removed. Exit 0. It took
   about a minute. `~/.town/operator` is unchanged, byte for byte.
4. The same with `--keep`: the tent stands after, the block names it
   and the line that strikes it, the ring's directory stands and holds
   `ring.json` and `conform.txt` and not the operator's token in either;
   `home/.town/operator` holds it, mode 600. `pnpm hermetic --strike
   town-hermetic-<sha>` lists it, asks, deletes it, and the listing is
   the listing before step 3.
5. The same with `--yes` and no terminal, from a script: no ask, exit 0.
   Without `--yes` and no terminal: refused before the pitch, exit 2,
   naming `--yes`.
6. A run whose conformance fails, a check broken on purpose by
   conformance's broken harness given after the ring's words, `--
   env BROKEN=<mode> node test/fixtures/broken-harness.mjs`, in place of
   the binary: `not conformant`, the strike run anyway, the listing the
   same, the directory kept and named, exit 1. The tent is not on the
   account.
7. Without `CLOUDFLARE_API_TOKEN`: box's own refusal, nothing read,
   exit 2. With `--name town`: refused by name, nothing read. With a
   name the listing already holds: refused before the pitch, naming
   `--strike`.

Acceptance criteria:

- Steps 3 and 4 are walked for real on the operator's account, twice,
  and the account's Workers listing after each is the listing before.
- No file the ring writes holds the operator's token: `grep -r` over
  the kept directory for the token in `home/.town/operator` finds that
  file alone.
- The shepherd's `~/.town/operator` and the standing box are not read,
  written, or called: the standing box's audit holds no row from the
  run.

## Journey 2: A stranger comes to the tent

The same laptop with a sheep checkout beside it whose kennel names a
standing station (`../sheep-drove`, station `sheep-drove`, at this
writing), a GitHub token scoped to one repository in a file, and an
open issue on that repository.

1. `pnpm hermetic --ring agent --sheep ../sheep-drove --repo <owner/name>
   --issue <n> --dry-run < <token file>` prints the account ring's
   preflight and then the stage's: the sheep checkout's script found,
   the kennel found, the token read from stdin and not printed, the
   model's dollars with the last walks' seconds; and the stage's
   command line word for word, with the address it would have. Nothing
   is deployed, exit 0.
2. Without `--sheep`, or with a directory holding no
   `scripts/drove.mjs`, or with stdin a terminal, or an empty file: a
   refusal naming the thing, exit 2, nothing read from the account.
3. `pnpm hermetic --ring agent --sheep ../sheep-drove --repo <owner/name>
   --issue <n> < <token file>`, `y` at the ask: the pitch; the
   furnishing, four verbs each printed with its exit, then the tent's
   `shop ls` naming the two shops and `credential ls --user stranger`
   naming one `github-token`; the stage's report as it prints it, the
   pass, the sheep, the sentence, its last message, the audit's calls
   by command and result, the memory line and the comment, and its
   search's verdict; the ring's own search over its directory, clean;
   the strike; the closing block, with the stage's root named for
   `--status`. Exit 0. The issue has one new comment. The station's
   `sheep ls` shows no sheep of the run's.
4. The same run again: a second comment, exit 0.
5. A run whose stage fails, the kennel naming no station: the stage's report with
   its exit, the strike run anyway, the listing the same, the ring's
   directory kept with `drove.txt` in it, exit 1.
6. The ring's search, falsified: a copy of the ring given a
   `drove.txt` that holds the token's bytes (the fake stage's doing, in
   the test) is exit 1 with the path named and the token not printed.

Acceptance criteria:

- Steps 3 and 4 are walked for real, on the operator's account and the
  standing station, and both comments are on the issue.
- The token is in no file under the ring's directory and in no
  argument of any child: the ring's search says so, and the conductor's
  `grep -r` over the kept directory and the stage's root agrees.
- The stage is run as a program and nothing else: `grep -rn` for
  `sheep` across `scripts/hermetic.mjs` finds the path flag, the
  command line, and prose, and no import or read of a file under it.
- The sheep checkout's commit is in the findings.

## Journey 3: A phase's walk over the box is a ring

A conductor, with the conduct skill and `brief.sh`, planning the next
project's first phase, whose proof needs an agent against the box.

1. `AGENTS.md`'s bullet on what every test needs names the outer rings
   after the inner three, and its command block has `pnpm hermetic
   --list` and `--ring account`. `README.md`'s operator section says,
   in one paragraph after the deploy, what the rings prove and what
   they cost.
2. The conduct skill's proof section says a Proof that names a walk
   over the box writes the ring's line, `pnpm hermetic --ring agent
   --sheep <dir> --repo <owner/name> --issue <n>`, that the conductor
   types it, and that the findings record the ring's exit and the
   stage's report; `brief.sh`'s brief carries the sentence for any
   phase whose Proof names the ring.
3. `pnpm hermetic --list` and `pnpm test --list` together are the
   ladder: five rings, each with what it needs; the two lists share no
   ring and miss none of the design's.
4. A mutation in the ring, the listing comparison made to always agree,
   is seen by `test/hermetic.test.ts` through `scripts/mutate.mjs`, and
   the tree is as it was after.

Acceptance criteria:

- Journey 3 is read, not walked: the docs say it, the test sees the
  mutation, and the next project cut after tent writes the ring's line
  in a Proof, which is that project's to prove.
