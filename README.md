# town

Town gives agents the outside world through **shops**, capabilities handed
to an agent as a command. What an agent can run is what it may do, decided
by the town before anything runs. [AGENTS.md](AGENTS.md) has the house
rules; [docs/projects/](docs/projects/README.md) has the work.

## The operator

```sh
pnpm install && pnpm build                      # Node 24; bin/town.js and bin/townd.js run dist/
export TOWN_DATA=~/town                         # the whole state: database, shops' code, shops' state
node bin/townd.js serve                         # prints: town listening on http://127.0.0.1:7000, shops walled by seatbelt; admin works with it up or down
# every shop's process runs within the box's wall: its directory and its state, the call's windows, nothing else. A box without one (Linux) is refused;
# --wall none, on serve or admin, runs shops with the box's authority: a shop can read the vault's key and the database, and reach anything the operator can.
node bin/townd.js admin shop add shops/memory   # validates, runs the shop's tests, copies it in
node bin/townd.js admin user add dimitri          # a user's name is a namespace, lowercase letters, digits, and "-": dimitri's agent publishes dimitri/<shop>
printf '%s\n' "$TOKEN" | node bin/townd.js admin credential add --user dimitri --type github-token --label "dimitri's PAT"   # the secret on stdin, never an argument; the id on stdout
node bin/townd.js admin shop add <dir> --user dimitri   # a shop that needs a credential type: its tests run through the town on dimitri's; a type its manifest defines and the town lacks is held in the same step, and with no credential of it yet the add is refused, the type staying held: credential add, then the same shop add
node bin/townd.js admin type add figma --origin https://api.figma.com --header 'X-Figma-Token: {token}' --guidance "Make a personal access token at Figma > Settings > Security."   # a type of the operator's; type ls shows kind, state, and who proposed it
node bin/townd.js admin shop add shops/watch --user dimitri   # a shop over others, github and memory added first: its tests run through them, on dimitri's
node bin/townd.js admin pass new --user dimitri --label "research assistant" > ~/work/.town/grant   # the token, shown once; the id on stderr
node bin/townd.js admin grant new --pass <id> --shop town/memory --commands remember,recall,list --constraint 'remember.key prefix notes/' --expires 30d
# grant new at a shop with a need binds the user's one credential of its type, or the one named with --credential <id>
# grant new at a composed shop (one whose manifest depends on others) needs the pass's grants at each dependency, covering the commands it calls, made first
node bin/townd.js admin grant new --pass <id> --shop town/hall   # the hall, in every town: the agent finds shops, reads the spec, and asks for grants; narrow it with --commands like any shop
# with a hall grant the agent puts in a shop it wrote, named for its user and held by its pass alone: tar --format ustar -cf - -C todo . | town hall publish
node bin/townd.js admin permit ls               # what agents asked for with town hall request: pass, user, shop, commands, constraints, why, state
node bin/townd.js admin permit approve <id> --commands recall --expires 30d   # makes the grant, as asked or narrower, never wider; replaces the pass's grant at the shop, and names it
node bin/townd.js admin permit deny <id>        # a decided permit is not decided again; the agent sees the answer in town --help and town hall requests
# an agent's shop that needs a credential the town has never seen proposes the type in its manifest: its origin, its header, and guidance for the person;
# publish keeps the shop, its tests waiting, and asks for a permit in place of a grant. permit ls shows each need: figma: proposed (https://api.figma.com), none connected
node bin/townd.js admin permit show <id>        # the checklist: the shop, each need with its origin and the shop's words, and the lines to type, in order, the done ones marked
node bin/townd.js admin type approve figma      # prints the proposed type's kind, origin, header, and guidance, then it is the town's; a credential add at a proposed type is refused
printf '%s\n' "$TOKEN" | node bin/townd.js admin credential add --user dimitri --type figma --label figma   # the type's guidance on stderr first, under the shop's name
node bin/townd.js admin permit approve <id>     # at a shop with needs: refused while a type is proposed or a credential missing, printing what remains; then the shop's tests run on the credential through the town, under the approval's audit row, and only on a pass the grant
node bin/townd.js admin audit --pass <id>       # every call: pass, shop, command, argv hash, result, latency, notices
node bin/townd.js admin grant revoke <id>       # seen by the next call; pass revoke makes the grant file paper
# The data directory must never sit in or under a directory an agent works in (one with .town/grant in it or above):
# an agent that can reach it can read the database or widen its own grant, so townd serve refuses one there.
```

Put `bin/town.js` on the agent's PATH as `town`, and never `townd`.

## The agent

The one sentence an agent is told:

> There is a `town` command, and `town --help` says what it can do.
