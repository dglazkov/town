# Town: A Capability System for Agents

**Status:** Draft v0 — pilot design
**Date:** 2026-09-12

---

## 1. Summary

Town is a hosted service that gives AI agents access to the outside world through *shops*: sandboxed, credentialed, agent-authored capabilities exposed as a CLI. The central design commitment is that **the CLI handed to an agent *is* the capability** — authentication, authorization, and scope are resolved before the agent ever runs a command, so from the agent's side there is nothing to sign into, and from the user's side there is nothing an agent can do that wasn't explicitly granted.

Shops are built, published, composed, and maintained by agents, not people. Humans do two things: connect credentials and approve grants. Everything else — authoring, migration, deduplication, improvement — is agent work, driven by the town's own telemetry.

The first milestone is a hand-picked pilot to test one hypothesis: *does the grant-as-CLI model make agents more useful and users more comfortable?* Nothing in this document is a one-way door. If the pilot says the model is wrong, we rebuild.

---

## 2. Goals and non-goals

### Goals

- Agents get real-world capabilities (Google Docs, memory, calendars, arbitrary services) with zero credential handling.
- Users grant capabilities with fine-grained, revocable, attenuable scope, and can see exactly what an agent can do.
- Capabilities are reusable across agents, machines, and (eventually) people.
- Agents author new capabilities in minutes, with a fast validate-publish-test loop.
- The registry improves itself over time without human curation.

### Non-goals (for now)

- **Local capabilities.** Filesystem, shell, git, and other machine-local actions stay with the agent harness. Town is the agent's connection to the *outside* world. (Revisit if this chafes — see §15.)
- **Being an agent framework.** Town is harness-agnostic. Any agent that can run a CLI can use it.
- **A human authoring experience.** Shops are written by agents. The authoring surface is a spec doc and a validator, not an IDE.
- **Self-host parity in v1.** Self-hosting exists but requires bringing your own OAuth apps. See §14.

---

## 3. Vocabulary

| Term | Meaning |
|---|---|
| **Town** | The hosted service: registry, grants, credentials, policy, execution, audit. One binary. |
| **Shop** | A published capability: manifest + code + tests. Has commands, declares credential needs and dependencies. |
| **Grant** | A per-user, per-shop authorization, possibly attenuated to a subset of commands and argument constraints. Represented to the agent as a token in a config file. |
| **Credential** | A typed secret held by the town on a user's behalf (e.g. `google-oauth` with a scope set). Bound to shops by grants, never ambiently available. |
| **`town` CLI** | The agent-facing client. Thin HTTPS client. `town <shop> <command> [args]`. |
| **Town Hall** | The management API and its CLI surface (`town hall ...`). Search, build, publish, install, request grants. |
| **Square** | The web UI. OAuth touchpoint, approvals, grant management, audit viewer. The human's entire interface. |
| **Gardener** | A scheduled agent with Town Hall privileges that consolidates, deprecates, and improves shops. |
| **Notice** | Out-of-band signal returned alongside a command result (deprecation, migration hint, expiring grant). |

---

## 4. Design principles

1. **The CLI is the capability.** If an agent can run it, the agent is allowed to do it. No sign-in, no key discovery, no ambient authority. Attenuation shapes both enforcement *and* discovery: `--help` shows only what the grant allows.
2. **Agents author, humans approve.** Every shop is agent-written. Every credential binding and grant is human-approved. Humans never see code; they see capabilities.
3. **The manifest is the product.** Commands, credential needs, dependencies, tests, and agent guidance are declared, not inferred. The CLI, the API, `--help`, the grant vocabulary, the audit log format, and the sandbox boundary are all derived from it.
4. **Calls carry the caller's grant.** Inter-shop calls are attenuated by the caller, never elevated by the callee. This is the confused-deputy rule and it is not negotiable.
5. **Hosted first.** One code path. Self-host is a deployment choice, not a separate architecture.
6. **Cheap authoring changes what's valuable.** Code is regenerable. What's worth reusing is proven behavior, refined guidance, and existing credential bindings.
7. **No one-way doors.** Migrations are prompts run against the registry. The spec explains itself well enough that an agent can port any shop to any new version.

---

## 5. Architecture

```
                 ┌──────────────────────────────────────────────────────┐
                 │                        TOWN                          │
                 │                                                      │
  ┌──────────┐   │  ┌──────────┐  ┌────────┐  ┌─────────┐  ┌────────┐  │
  │  Agent   │──▶│  │  Gateway │─▶│ Policy │─▶│ Shop    │─▶│ Vault  │  │
  │ (town    │◀──│  │  (HTTPS) │  │ /Grant │  │ Runtime │  │ (creds)│  │
  │  CLI)    │   │  └──────────┘  └────────┘  └─────────┘  └────────┘  │
  └──────────┘   │        │             │           │                   │
                 │        ▼             ▼           ▼                   │
  ┌──────────┐   │  ┌──────────┐  ┌────────┐  ┌─────────┐              │
  │  Human   │──▶│  │  Square  │  │ Audit  │  │ Registry│              │
  │ (browser)│◀──│  │ (web UI) │  │  log   │  │ (shops) │              │
  └──────────┘   │  └──────────┘  └────────┘  └─────────┘              │
                 │                                    ▲                 │
                 │  ┌──────────┐                      │                 │
                 │  │ Gardener │──────────────────────┘                 │
                 │  │ (agent)  │                                        │
                 │  └──────────┘                                        │
                 └──────────────────────────────────────────────────────┘
                                          │
                                          ▼
                              External services (Google, etc.)
```

### Components

**Gateway.** Terminates HTTPS, resolves the bearer grant token, routes to Town Hall or a shop command.

**Policy / grant resolver.** Given (grant, shop, command, args), decides allow/deny and computes the effective attenuation to pass downstream. Every call — agent-originated or shop-to-shop — passes through here.

**Shop runtime.** Executes shop code with exactly the capabilities the manifest declares and the grant permits. Pilot: subprocess/container per invocation. Post-pilot: WASI components (see §13).

**Vault.** Stores credentials encrypted at rest. Shops never receive raw credentials; the runtime injects them into outbound requests the shop is permitted to make, or exposes them as scoped handles.

**Registry.** Versioned shop artifacts, manifests, tests, publish history, usage telemetry.

**Audit log.** Every call: who (grant), what (shop/command/args hash), result class, latency, notices emitted.

**Square.** Web UI. See §11.

**Gardener.** See §12.

### Data plane vs. control plane

There is no distinction. The town is a single service. A "machine" is wherever a grant token lives. Multi-machine is free; there is nothing to sync.

---

## 6. The grant model

### 6.1 Caller identity

A grant is a bearer token. The `town` CLI reads it from, in order: `--grant <path>`, `$TOWN_GRANT`, `./.town/grant`, `~/.town/grant`. A grant file is a small JSON document containing the token and the town URL.

Handing an agent a directory containing a grant file is handing it a capability. Deleting the grant in the Square revokes it everywhere instantly.

Rejected alternatives: process ancestry and socket peer credentials (OS-specific, break in containers, meaningless with a hosted service).

### 6.2 Grant structure

```json
{
  "id": "grt_8f3a...",
  "user": "usr_...",
  "shop": "town/gdocs",
  "version": "^1",
  "commands": ["read", "list"],
  "constraints": {
    "read.doc-id": { "in_folder": "1AbC..." }
  },
  "credentials": {
    "google-oauth": "crd_..."
  },
  "expires": "2026-12-01T00:00:00Z",
  "label": "Research assistant — read-only, project folder"
}
```

- `commands` is a subset of the shop's declared commands. Omitted = all.
- `constraints` are argument-level restrictions, expressed in a small vocabulary the shop's manifest can extend (see §7.4).
- `credentials` binds the user's credential instances to the shop's declared credential types.
- `version` pins a semver range. Upgrades within range that do not increase declared capabilities apply automatically.

### 6.3 Attenuation shapes discovery

`town gdocs --help` is rendered *server-side, for the calling grant*. An agent with a read-only grant never sees `create` in help output. This matters more than it sounds: agents plan against what they can see, and not showing forbidden commands prevents an entire class of wasted attempts and confused retries.

### 6.4 Inter-shop calls

When shop A calls shop B, the call is made through the town with A's *effective grant* — the caller's grant, further attenuated by A's declared dependency scope. B never uses its own credentials on behalf of A's caller.

Concretely: an agent with a read-only Docs grant calls `summarize`, which depends on `gdocs`. `summarize` can only call `gdocs read` on documents the agent's grant permits. If `summarize` tries `gdocs create`, the town denies it.

Shops *may* hold private credentials for resources that are theirs alone (the Memory shop's storage bucket). These are declared in the manifest as `private` and are never granted to callers.

### 6.5 Grant lifecycle

- **Created** by a human in the Square, or proposed by an agent via Town Hall and approved by a human.
- **Modified** only by a human. Agents can request broader grants; requests appear in the Square.
- **Revoked** by a human, or automatically on expiry.
- **Migrated** by the gardener when a shop is consolidated (§12.2). Migration never widens a grant.

---

## 7. Shops

### 7.1 What a shop is

A shop is a directory containing a manifest, code, and tests, published to the registry under a namespaced name (`author/shop`, `town/shop` for gardener-canonical shops, `org/shop` for private org shops).

Code is the least valuable part. The parts worth publishing and reusing:

- **Typed credential declarations** — so the shop slots into credentials the user already holds.
- **Agent-facing `--help` text** — refined against real agent confusion.
- **Guidance** — when to use it, recipes, pitfalls. A skill document bundled with its capability.
- **Tests** — what "working" means, executable.
- **Composition** — a shop that's mostly a recipe over other shops.

### 7.2 Manifest (v0)

```yaml
name: alice/gdocs
version: 0.3.0
summary: Read and create Google Docs.

guidance: |
  Use this for reading or creating Google Docs by ID. Document IDs are the
  long string in the URL after /d/. For spreadsheets use town/gsheets.
  `read` returns plain text; use `read --format markdown` to preserve headings.

runtime: subprocess          # pilot value; `wasi` post-pilot
entry: ./main.py

credentials:
  - type: google-oauth
    scopes: [drive.file, documents.readonly]
    private: false           # bound per-user via grant

depends:
  - shop: town/memory
    version: ^1
    commands: [remember, recall]

commands:
  - name: read
    summary: Print the text of a document.
    effect: read
    args:
      - name: doc-id
        type: string
        required: true
        doc: The document ID from the URL.
        constrainable: [in_folder]
      - name: format
        type: enum
        values: [text, markdown]
        default: text
    output: text

  - name: create
    summary: Create a new document and print its ID.
    effect: write
    args:
      - name: title
        type: string
        required: true
      - name: body
        type: string
        doc: Initial content. Reads stdin if omitted.
        constrainable: [in_folder]
    output: json

tests:
  - name: reads fixture doc
    run: read --doc-id $FIXTURE_DOC_ID
    expect:
      contains: "hello world"
  - name: create then read roundtrip
    run: |
      id=$(create --title "test" --body "roundtrip" | jq -r .id)
      read --doc-id $id
    expect:
      contains: "roundtrip"
```

### 7.3 What is derived from the manifest

| Derived artifact | Source |
|---|---|
| `town <shop> --help` (per grant) | `summary`, `guidance`, `commands[].summary`, `args[].doc`, filtered by grant |
| CLI argument parsing and validation | `commands[].args` |
| HTTP API (isomorphic) | `commands[]` |
| Grant vocabulary (what can be attenuated) | `commands[].name`, `args[].constrainable` |
| Sandbox boundary (post-pilot) | `credentials`, `depends`, `runtime` |
| Audit log schema | `commands[].name`, `effect` |
| Approval screen in the Square | `credentials`, `depends`, `commands[].effect` |
| MCP server (optional export) | `commands[]` |

### 7.4 Constraints

Constraints are how grants attenuate below the command level. A shop declares which constraint kinds each argument supports (`constrainable`), and implements the check. The town supplies a small built-in vocabulary (`equals`, `one_of`, `prefix`, `regex`, `max_length`) and shops can add domain-specific kinds (`in_folder`) implemented in shop code and verified by tests.

The rule: a constraint the shop can't verify can't be granted. This keeps attenuation honest.

### 7.5 Effects

Every command declares `effect: read | write | destructive`. The Square uses this to structure approval screens ("this shop can read your docs and create new ones; it cannot delete"). The gardener uses it to prioritize review of consolidations. Agents can use it to plan (prefer reads before writes).

### 7.6 Tests

Tests are part of a shop and are agent-written. They serve three purposes:

- **Publishing gate.** A shop with failing tests can be published to scratch, not to a public namespace.
- **Consolidation gate.** The gardener may only deprecate shop A in favor of B if B passes all of A's tests.
- **Regression signal.** Nightly test runs catch upstream API drift.

Tests run against fixture credentials the town provides (a sandbox Google account, etc.). Shops that can't be tested against fixtures declare `tests: manual` and are held to a higher adoption threshold before the gardener touches them.

---

## 8. The `town` CLI

### 8.1 Shape

```
town <shop> <command> [--arg value ...] [--json]
town <shop> --help
town --help                    # lists shops visible to this grant
town hall <subcommand> ...     # management surface, requires a Town Hall grant
```

The CLI is a thin client. It resolves the grant, sends the request, prints the result. All parsing, validation, help rendering, and policy happen server-side, so the CLI never needs updating when shops change.

### 8.2 Output contract

- **stdout:** the command's result. Text or JSON per the manifest's `output`; `--json` forces a JSON envelope.
- **stderr:** notices. Structured lines the agent should read and the human never will.
- **exit code:** 0 success; 1 shop error; 2 denied by policy; 3 grant invalid/expired; 4 deprecated-and-sunset.

### 8.3 Notices

Notices are the town's channel for talking to consuming agents out of band. Format on stderr:

```
town-notice: deprecated shop=alice/gdocs successor=town/gdocs
  migrate: `--file` is now `--doc-id`; all other args unchanged
  sunset: 2026-11-01
town-notice: grant-expires in=3d grant=grt_8f3a label="Research assistant"
town-notice: better-shop-exists shop=town/gdocs-batch reason="you called read 40 times in 2m"
```

In `--json` mode, notices appear in a `notices` array in the envelope. Agents are expected to act on `deprecated` notices (rewrite their call; if they are a shop, update their dependency). The notice channel is designed in the pilot because everything in §12 depends on it.

### 8.4 Help rendering

`--help` is rendered server-side from the manifest, filtered to the calling grant, and includes `guidance`. It is the primary way agents learn a shop. Quality of help text is a first-class shop property and a gardener target.

---

## 9. Town Hall

Town Hall is the agent's entrance to the registry. It is the same server, with a distinct grant type (`hall`) that a user chooses whether to give their agent.

### 9.1 Subcommands

```
town hall search <query>                  # find shops
town hall inspect <shop>                  # manifest, guidance, tests, usage stats
town hall spec                            # print the manifest spec (the SDK)
town hall validate <dir>                  # lint a shop; LLM-friendly errors
town hall publish <dir> --scratch         # publish to the caller's scratch namespace
town hall publish <dir>                   # publish to a public/org namespace (tests must pass)
town hall test <shop>                     # run a shop's tests against fixtures
town hall request-grant <shop> [--commands ...] [--constraint ...]
                                          # propose a grant; human approves in Square
town hall deprecate <shop> --successor <shop> --migrate "..."   # gardener-only in v1
```

### 9.2 Propose-then-approve

Agents never receive credentials or grants directly from Town Hall. `request-grant` creates a pending permit. The human sees it in the Square with the manifest's credential needs, effects, and dependencies rendered plainly, does OAuth if needed, and approves. The approval and the sign-in are the same click.

This holds even for shops the agent just built: build → publish to scratch → request-grant → human approves → agent uses.

### 9.3 The authoring loop

Iteration speed is what to optimize. Target: an agent goes from "I need a capability that doesn't exist" to "working shop" in under five round-trips.

1. `town hall search` — nothing found (or something close; see §12.1 on surfacing near-matches before building).
2. `town hall spec` — read the manifest spec.
3. Write manifest + code + tests.
4. `town hall validate ./myshop` — errors say what's wrong *and what to write instead*.
5. `town hall publish ./myshop --scratch` — gets a scratch grant automatically (fixture credentials only).
6. `town myshop <command>` — try it; iterate.
7. `town hall publish ./myshop` — real namespace, tests must pass.
8. `town hall request-grant myshop` — human approves with real credentials.

Every validator error message is a spec-doc bug until proven otherwise. Track them.

### 9.4 Scratch namespaces

Every user has `~scratch/` — shops here run only against fixture credentials, aren't searchable by others, and expire after 30 days of no use. This is where agents iterate without any human in the loop.

---

## 10. Credentials

### 10.1 Typed credentials

Credentials are typed (`google-oauth`, `github-token`, `api-key:openai`, etc.) with type-specific structure (OAuth scopes, key prefixes). A shop declares credential *types* and scopes it needs; a user's credential *instances* are bound to shops by grants.

The tenth Google shop a user adopts needs no new sign-in — the Square offers "grant existing Google credential to this shop." Each credential a user holds lowers the adoption cost of every future shop that needs it.

### 10.2 The vault

Credentials are encrypted at rest with per-user keys. Shop code never sees raw credentials. The runtime either:

- injects them into outbound HTTP requests to declared hosts (pilot: the runtime provides an HTTP proxy that adds auth headers for allowed hosts), or
- exposes a scoped handle the shop passes back to town-provided client libraries (post-pilot, WASI host functions).

Either way, a shop that tries to exfiltrate a credential has nothing to exfiltrate.

### 10.3 OAuth

Hosted mode owns the OAuth app registrations. The Square runs the consent flow, stores the resulting token, and binds it. Refresh is transparent.

Self-host mode requires the operator to register their own OAuth apps per provider. Documented; not softened in v1. See §14 for the relay idea.

### 10.4 Scope escalation

If a shop upgrade requests additional scopes, the grant does not auto-upgrade. The Square shows a diff ("now also requests `gmail.send`") and the human re-approves or pins. See §13.3.

---

## 11. The Square

The Square is the human's entire interface. It should be boring, clear, and rarely visited.

- **Connect:** OAuth flows, API key entry. Lists held credentials and which shops use them.
- **Approve:** pending permits from agents. Each shows: what the shop does (summary + guidance), what it can touch (effects by command), what credentials it needs and which existing ones would satisfy them, what it depends on, and its usage stats if public. One-click approve, or edit the attenuation first.
- **Grants:** every active grant with its label, scope, and last use. Revoke, narrow, extend, or re-issue the grant file.
- **Audit:** searchable call log. Filter by grant, shop, effect, time.
- **Shops (user view):** what's installed, what's deprecated with pending migration, what the gardener changed recently.

Setup on a new machine: paste a grant file. That's it.

---

## 12. Evolution

The registry maintains itself. This section describes the mechanisms; the gardener is not in the pilot, but the hooks it needs are.

### 12.1 Surfacing before building

`town hall search` returns near-matches with a similarity score and a "what's missing" summary. Before an agent builds a Docs shop, it should see "town/gdocs does 90% of this; the missing 10% is X." Cheap to add, prevents most duplication at the source.

### 12.2 Consolidation

Nightly, the gardener:

1. Clusters shops by manifest similarity (command names, arg shapes, credential types, guidance embeddings).
2. For each cluster above a threshold, authors a consolidated shop under `town/` whose command surface covers the union.
3. Runs every parent's tests against the consolidated shop. **All must pass** or the cluster is skipped and flagged.
4. Publishes the consolidated shop.
5. Rewrites each parent as a forwarding shim to the successor, marks it deprecated with a migration hint, sets a sunset date.
6. Migrates grants: each user's grant on a parent becomes a grant on the successor, **attenuated to exactly the parent's command surface**. No new capability, no re-approval.
7. Monitors: if error rate on migrated calls rises above baseline, auto-revert the deprecation and flag.

Because shims are agent-written and cheap, nothing breaks. Notices nudge consumers over; sunset happens when the parent's call volume hits zero.

### 12.3 Telemetry-driven improvement

The town sees every failed call, retry, malformed argument, and immediate re-invocation. That's a work queue:

- Argument repeatedly malformed → tighten the schema or rewrite `args[].doc`.
- Command repeatedly followed by a correction → rewrite `guidance`.
- Same composition rebuilt by multiple agents → publish it as a shop.
- Same read called in tight loops → add a batch command.

The gardener turns each into a shop change, tests it, and publishes a patch version. Since patches don't add capabilities, they auto-apply within pinned ranges.

### 12.4 Migration by prompt

When the manifest spec changes, migration is: "here's spec v(n+1), port this shop, keep tests passing." Run across the registry. The only thing that must stay stable is the spec's explanation of itself, because that's what agents read.

---

## 13. Security model

### 13.1 Threats

1. Shop code exfiltrates credentials.
2. Shop code exceeds its declared capabilities.
3. Confused deputy: a shop with broad access acts on behalf of a narrowly-granted caller.
4. Supply chain: a popular shop's publisher is compromised; a new version adds a capability with a plausible changelog.
5. Agent with a Town Hall grant publishes something malicious into a namespace others trust.
6. Prompt injection via shop output steers the consuming agent.

### 13.2 Mitigations

| Threat | Mitigation | When |
|---|---|---|
| 1 | Vault never exposes raw credentials; runtime injects auth into permitted outbound calls only. | Pilot |
| 2 | Pilot: container with egress allowlist from manifest. Post-pilot: WASI component whose imports are the manifest — sandbox and declaration are the same mechanism. | Pilot / v1 |
| 3 | Calls carry caller's grant, attenuated by dependency scope. Enforced in policy, not in shop code. | Pilot |
| 4 | Version pinning by default; capability-increase re-approval with the diff highlighted; publisher 2FA; cooling-off period for capability increases on shops above an adoption threshold. | v1 |
| 5 | Namespaces: public shops are searchable but grants always require human approval with the manifest rendered. `town/` is gardener-only. Org namespaces have their own publish policy. | v1 |
| 6 | Out of scope for the town; the harness's problem. Notices are structured so agents can distinguish town signals from shop output. | — |

### 13.3 Why the manifest is the trust unit

npm's trust model is "trust the author." With agent-authored shops there is no author to trust. The town's model is "read the manifest; the sandbox enforces it." The review burden lands on a small, declarative, diffable document. That's what makes a stranger's — or a stranger's agent's — shop adoptable.

This only holds once the sandbox actually enforces the manifest. In the pilot (friends, containers) it's a promise. Before opening beyond friends, it must be a mechanism (WASI or equivalent).

---

## 14. Deployment

### Hosted

One binary, Postgres, object storage for shop artifacts, a container/WASI runtime. The town owns OAuth app registrations for supported providers.

### Self-hosted

Same binary, SQLite or Postgres, run anywhere. `localhost` is a valid town URL, which makes a "local daemon" simply a self-host on your own machine.

**Accepted friction:** self-hosters register their own OAuth apps with each provider. This is documented as the cost of self-hosting, not hidden. The credential broker is the part that resists self-hosting, and we're not solving that in v1.

### v.NEXT: OAuth relay

The hosted town acts as an OAuth *relay* for self-hosters: runs the consent flow with the hosted app registrations, forwards the resulting token to the self-hosted town, stores nothing. Self-hosters get everything local except the one thing that's painful to make local. Nice trust story ("we broker, we don't hold"), but sequenced after we know self-hosting matters.

---

## 15. Roadmap

### v0 — Pilot

Prove the grant-as-CLI model with a hand-picked group. Scope in §16.

### Survey

After the pilot: examine every shop built, every grant configured, every validator error, every failed call. Decide what the manifest should be. Rebuild whatever needs rebuilding.

### v1 — Marketplace

Public registry, WASI sandbox, typed credentials at scale, propose-then-approve hardened, version pinning and capability-diff approvals, publisher accounts, org namespaces, the gardener (consolidation + telemetry improvements), usage-based trust signals in search.

### v.NEXT

OAuth relay for self-hosters. Paid shops if there's demand. Local runtime (`runtime: local`, `town` CLI doubles as an executor) if excluding local capabilities turns out to be the wrong call. MCP export of a town.

---

## 16. Pilot plan

### Hypothesis

The grant-as-CLI model makes agents more useful and users more comfortable than the status quo (agents holding credentials directly or via ad-hoc MCP servers).

### Scope

**In:**
- Hosted town, one box.
- `town` CLI with grant files, server-rendered help, notices on stderr, `--json`.
- Grants with command-level attenuation and the built-in constraint vocabulary.
- Town Hall: `search`, `spec`, `validate`, `publish --scratch`, `publish`, `test`, `request-grant`.
- Square: OAuth for Google, API key entry, permit approval, grant list, revoke, flat-file audit view.
- Manifest v0 with tests.
- Shop runtime: container per invocation with manifest-derived egress allowlist; runtime HTTP proxy injects credentials.
- Fixture credentials for tests (one sandbox Google account).
- Telemetry: every call logged with grant, shop, command, result class, latency, notices.

**Out:**
- WASI. Versioning beyond "latest." Capability-diff approvals. Gardener. Self-host. Marketplace UI. Org namespaces. Paid anything.

### Seed shops

Built by an agent, using only the spec and Town Hall — this is the first test of the authoring loop.

1. `town/gdocs` — code + credential.
2. `town/memory` — code + service + private credential (cloud storage).
3. `town/summarize-doc` — composition over both, so inter-shop calls and grant attenuation are exercised from day one.

### Group

8–12 people. Not builders — users with agents. Vary the harness (Claude Code, Cursor, a custom loop, at least one non-developer using a chat agent). Include at least two people whose agents are likely to build shops the other would want, to get the smallest possible signal on sharing.

### What to measure

| Question | Metric |
|---|---|
| Does the authoring loop work? | Round-trips from "need capability" to working shop. Validator error frequency by type. |
| Do agents reuse or rebuild? | Searches before publishes. Shops built that overlap an existing shop. |
| Do people attenuate grants? | Fraction of grants narrower than full. Which constraints get used. |
| Does discovery-by-grant help? | Denied calls per grant (should be near zero if help is honest). |
| Where do agents stumble? | Failed calls by cause: bad args, wrong shop, wrong command. |
| Where do humans stumble? | Minutes to first successful call, dominated by OAuth setup. Time spent in the Square. |
| Does sharing have any pull? | Shops published by one person's agent and granted by another person. |
| Do compositions happen? | Shops with `depends` entries. Depth of dependency chains. |

### Exit criteria

The pilot is done when the group has built enough shops that the survey has something to say — likely 30–50 shops and a few hundred grants — or when it's clear the model isn't wanted. Either outcome is a success; the point is to know.

---

## 17. Open questions

1. **Constraint expressiveness.** How rich does the constraint vocabulary need to be before attenuation is useful? Pilot with the built-in five plus `in_folder` and see what people ask for.
2. **Shop-to-shop call cost.** In-platform calls are cheap, but a composition three levels deep is three policy checks and three container spawns. Fine for pilot; measure.
3. **Fixture credentials at scale.** One sandbox Google account works for friends. What's the story for a public registry where any provider might need fixtures?
4. **Grant file ergonomics across harnesses.** Does `./.town/grant` work naturally in Claude Code, Cursor, and a custom loop? Or does each need a different injection path?
5. **User vs. agent CLI.** Is there a real human-facing CLI, or is the Square sufficient plus grant files? Pilot assumes the latter.
6. **What "similar" means.** Consolidation depends on a similarity judgment the pilot corpus will teach us. Hand-consolidate once before automating.
7. **Multi-user shops.** Does a shop ever need to act across users (a shared team memory)? Org namespaces gesture at this; the grant model as written is single-user.

---

## Appendix A — Example session

An agent with a grant for `town/gdocs` (read-only, constrained to one folder) and `town/summarize-doc`:

```
$ town --help
Shops available to this grant:
  gdocs           Read Google Docs.                      [read, list]
  summarize-doc   Summarize a Google Doc into memory.    [run]
  hall            Manage shops.                          [search, spec, validate, publish, test, request-grant]

$ town gdocs --help
gdocs — Read Google Docs.

Use this for reading Google Docs by ID. Document IDs are the long string in
the URL after /d/. For spreadsheets use town/gsheets.

Commands:
  read   --doc-id <id> [--format text|markdown]   Print the text of a document.
  list   [--folder <id>]                          List documents in a folder.

This grant is constrained to folder 1AbC... (label: "Research assistant").

$ town gdocs read --doc-id 1XyZ...
[document text]
town-notice: grant-expires in=12d grant=grt_8f3a label="Research assistant"

$ town gdocs create --title "Notes"
error: command 'create' is not available to this grant
exit 2

$ town summarize-doc run --doc-id 1XyZ... --json
{"summary": "...", "stored_as": "mem_44f..."}
```

## Appendix B — Example permit (as shown in the Square)

> **Research assistant** wants to use **alice/gcal** (v0.2.1)
>
> *Read and create calendar events.*
>
> **Can:** read events (`list`, `get`) · create events (`create`)
> **Cannot:** delete or modify existing events
>
> **Needs:** Google Calendar access — your existing Google credential covers this (scope `calendar.events`)
> **Depends on:** `town/memory` (remember, recall) — already granted
>
> **Used by:** 14 people · 2,300 calls last 30 days · 0.4% error rate
>
> [Approve] [Approve read-only] [Edit scope] [Deny]

## Appendix C — Example deprecation flow

1. Gardener finds `alice/gdocs`, `bob/google-docs`, `carol/docs-reader` cluster at 0.91 similarity.
2. Authors `town/gdocs` covering the union; all three parents' tests pass against it.
3. Publishes `town/gdocs@1.0.0`.
4. Rewrites each parent as a shim; publishes as patch versions with `deprecated: {successor: town/gdocs, migrate: "...", sunset: 2026-11-01}`.
5. Migrates 27 grants across the three parents to `town/gdocs`, each attenuated to the parent's surface.
6. Next call to `alice/gdocs read` succeeds via shim, emits a `deprecated` notice. Consuming agent rewrites its call. `carol/docs-summarizer`, which depends on `carol/docs-reader`, is ported by its owner's agent on next use (or by the gardener on the following night).
7. Error rate on migrated calls stays at baseline. Sunset proceeds.
