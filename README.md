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
# the four shops under shops/ say runtime: worker: the entry exports main, run once per call under the town's own Node through bin/main.js, within the wall; runtime: subprocess runs the entry as its own process, on a laptop alone
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
printf '%s\n' "$TOKEN" | node bin/townd.js admin credential add --user dimitri --type figma --label figma --replace <id>   # a new secret in place of one that falls short: every unrevoked grant that read <id> reads the new one, each named on stderr, and <id> is revoked (replaced by <new id>); permit show prints this line for a need the user holds, and credential connect --replace does the same for an oauth type
# a shop that proposed a type rewrites its guidance by publishing again with the same definition; the origin, header, and oauth a person approved never move
# an oauth type's registration is the operator's: make a Desktop OAuth client at the provider (for Google, in the Google Cloud console, with the Docs API enabled), then give the town its id, and its secret on stdin
printf '%s\n' "$CLIENT_SECRET" | node bin/townd.js admin shop add shops/gdocs --user dimitri --client-id "$CLIENT_ID"   # town/gdocs: holds google-oauth as its manifest defines it, sealing the registration; refused until dimitri has a google-oauth credential, the type staying held
printf '%s\n' "$CLIENT_SECRET" | node bin/townd.js admin type approve google-oauth --client-id "$CLIENT_ID"   # the same for an oauth type an agent's shop proposed; type add <name> --kind oauth --authorize <url> --token <url> --scopes a,b --client-id <id> for one of the operator's own
node bin/townd.js admin credential connect --user dimitri --type google-oauth   # the type's guidance, then a URL to open in a browser; the redirect comes back to 127.0.0.1, and the id is printed. credential add is refused at an oauth type
node bin/townd.js admin shop add shops/gdocs --user dimitri   # again, once connected: its test runs on dimitri's credential, then town gdocs read --doc-id <id> prints a document's text under a grant
# the town refreshes an access token within a minute of expiry at the call, sealing the new one; a refresh the provider refuses revokes the credential, credential ls says revoked (refresh refused), and connect makes a new one
node bin/townd.js admin audit --pass <id>       # every call: pass, shop, command, argv hash, result, latency, notices; a consent is a row of its own, and a refresh says refreshed <type>
node bin/townd.js admin grant revoke <id>       # seen by the next call; pass revoke makes the grant file paper
# The data directory must never sit in or under a directory an agent works in (one with .town/grant in it or above):
# an agent that can reach it can read the database or widen its own grant, so townd serve refuses one there.
```

Put `bin/town.js` on the agent's PATH as `town`, and never `townd`.

## The box

The town as one Cloudflare Worker (`wrangler.jsonc`, `src/box.ts`): the same verbs, typed at this laptop, run in the box's object. Every verb not below prints and refuses as it does at a laptop.

```sh
CLOUDFLARE_API_TOKEN=… pnpm box deploy --name town   # the Worker, named town unless --name says, from this checkout's commit; without the token it prints the permissions and what it costs, and makes nothing
# the token needs Account > Workers Scripts > Edit and Account > Account Settings > Read; the deploy makes TOWN_VAULT_KEY and TOWN_OPERATOR once, each on stdin,
# writes the operator's token to ~/.town/operator with mode 600 and prints it once, reads GET / at the address, and names the consent redirect: <url>/consent. Run again, it redeploys and keeps both
CLOUDFLARE_API_TOKEN=… pnpm box delete --name town   # lists what goes, waits for the name typed, deletes the Worker and its object's rows, and removes ~/.town/operator when it was this box's
export TOWN_OPERATOR=<token>                    # or keep it in ~/.town/operator; --town without either is refused naming both
node bin/townd.js admin --town <url> user add dimitri   # a pipe: the verb posted to <url>/admin with its stdin when the verb reads one (a shop as -, a secret, a client secret), what comes back printed; a token the box refuses prints: the operator token is refused
tar --format ustar -cf - -C shops/memory . | node bin/townd.js admin --town <url> shop add -   # a shop comes from stdin as - for its directory; shop add <dir> over --town is refused printing this pipe, and shop test - is the same
# the box runs a shop in an isolate and runs runtime: worker alone: shop add - and the hall's publish refuse runtime: subprocess; the audit's wall column says isolate
node bin/townd.js admin --town <url> pass new --user dimitri --label "research assistant" > ~/work/.town/grant   # the grant file's town is <url>
node bin/townd.js admin --town <url> credential connect --user dimitri --type google-oauth   # the redirect lands at <url>/consent, and the pipe waits for the id; register the client with that redirect URI
# --data and --town together are refused; --wall over --town is refused, since the box's wall is not the operator's to choose
node scripts/walk.mjs --shop hall --town <url>   # the hall's walk staged on the box over the wire: memory added when missing, dimitri reused, a pass and its grant file naming <url>, the agent's project settings
node scripts/walk.mjs --status <root>            # the walk's rows read over the wire, by wall with isolate counted; --teardown <root> revokes the walk's pass there and removes the root, and --search-sealed is refused, the box's key being the platform's
```

## The agent

The one sentence an agent is told:

> There is a `town` command, and `town --help` says what it can do.
