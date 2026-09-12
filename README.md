# town

Town gives agents the outside world through **shops**, capabilities handed
to an agent as a command. What an agent can run is what it may do, decided
by the town before anything runs. [AGENTS.md](AGENTS.md) has the house
rules; [docs/projects/](docs/projects/README.md) has the work.

## The operator

```sh
pnpm install && pnpm build                      # Node 24; bin/town.js and bin/townd.js run dist/
export TOWN_DATA=~/town                         # the whole state: database, shops' code, shops' state
node bin/townd.js serve                         # a town on 127.0.0.1:7000; admin works with it up or down
node bin/townd.js admin shop add shops/memory   # validates, runs the shop's tests, copies it in
node bin/townd.js admin user add dimitri
printf '%s\n' "$TOKEN" | node bin/townd.js admin credential add --user dimitri --type github-token --label "dimitri's PAT"   # the secret on stdin, never an argument; the id on stdout
node bin/townd.js admin shop add <dir> --user dimitri   # a shop that needs a credential type: its tests run through the town on dimitri's
node bin/townd.js admin shop add shops/watch --user dimitri   # a shop over others, github and memory added first: its tests run through them, on dimitri's
node bin/townd.js admin pass new --user dimitri --label "research assistant" > ~/work/.town/grant   # the token, shown once; the id on stderr
node bin/townd.js admin grant new --pass <id> --shop town/memory --commands remember,recall,list --constraint 'remember.key prefix notes/' --expires 30d
# grant new at a shop with a need binds the user's one credential of its type, or the one named with --credential <id>
# grant new at a composed shop (one whose manifest depends on others) needs the pass's grants at each dependency, covering the commands it calls, made first
node bin/townd.js admin audit --pass <id>       # every call: pass, shop, command, argv hash, result, latency, notices
node bin/townd.js admin grant revoke <id>       # seen by the next call; pass revoke makes the grant file paper
# The data directory must never sit in or under a directory an agent works in (one with .town/grant in it or above):
# an agent that can reach it can read the database or widen its own grant, so townd serve refuses one there.
```

Put `bin/town.js` on the agent's PATH as `town`, and never `townd`.

## The agent

The one sentence an agent is told:

> There is a `town` command, and `town --help` says what it can do.
