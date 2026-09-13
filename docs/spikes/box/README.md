# Spike: box

**Question.** The town is to leave the laptop. Can it be one Cloudflare
Worker, with the store in a Durable Object's SQLite, the vault's seal
under `node:crypto`, and a shop run in a fresh isolate from the Worker
Loader whose only way out is a window the town made for the call, so
that the wall is the absence of any other binding and nothing of spec
§7 changes but where the process is?

**Answer, 13 Sep 2026: yes, with one change to a shop's shape.** In
workerd through `@cloudflare/vitest-pool-workers`, the object ran the
town's SQL as written, a transaction rolled back whole, and the vault's
AES-256-GCM seal opened under the right id and refused the wrong one.
A shop loaded per call with `globalOutbound` set to an entrypoint made
with per-call `props` reached its window and was refused everything
else by URL; with `globalOutbound: null` its `fetch` threw. `TOWN_STATE`
as a directory held: rows written under `/tmp/state` before the call
and read back after, a hundred files in six milliseconds. The four
shops in `shops/` do their work at the module's top level, and workerd
evaluates a module's top level as global scope, with no I/O and no
timers, and does not wait for a top-level `await`: `town/memory` and
`town/github` loaded, ran to their first `await`, and stopped, exit 0
and nothing done. The same sources with their imports hoisted and the
rest wrapped as `export default async function main()` ran every case
of memory's tests and github's `list` through the window, unchanged
otherwise: `process.argv`, `process.env`, `process.stdin`, `process.exit`,
and `node:fs` on the state all as on the laptop.

## What was tried

`src/index.ts` is the Worker: a `Town` object with `exec`, a
transaction that fails on its second write, and the vault's seal; a
`Window` entrypoint that takes `{ callId, nonce, type, origin, header,
token }` as props and, for a request under `http://window/<nonce>/`,
answers with what it would have forwarded and the header it would have
set, and for anything else a 403 naming the call; and a `Runner` that
loads a shop from source with `env` of strings alone, the window as
`globalOutbound`, and a CPU limit, and calls the entry's `run` over
RPC. `src/entry.ts` is the isolate's entry as source text: it writes
the state rows under `/tmp/state`, sets `process.argv`, `process.env`,
and `process.stdin`, captures `process.stdout` and `process.stderr`,
makes `process.exit` throw, imports the shop's entry, calls its `main`,
and returns what was printed, the exit, and the state's files.
`test/box.test.ts` is seven cases: the object; a shop under the
contract; the top-level `await`; a shop with no window, which also
imports `node:child_process`, `node:net`, `node:http`, and `node:os`;
`town/memory` and `town/github` from `shops/`, read with `?raw` and
wrapped; and a hundred state files.

```sh
cd docs/spikes/box && pnpm install && pnpm test
```

## Numbers

Wall clock inside the pool on this laptop, one run each, warm.

| What | ms |
| --- | --- |
| The object: schema, two inserts, `json_each`, the rollback, the seal | 7–8 |
| A shop's first load and call, state in and out, one window request | 13–14 |
| `town/memory` wrapped as `main`, each of six calls | 4–5 |
| `town/github` wrapped as `main`, `list` through the window | 6–11 |
| A hundred state files of 2 KB in, listed, and out | 6–9 |

## Findings

- **The isolate's `env` is what the town puts there and nothing else.**
  `Object.keys(process.env)` in the shop was the contract's names and
  the spike's own `TOWN_ENTRY`; no binding of the Worker's was visible.
  `process.cwd()` is `/bundle`, `os.hostname()` is `localhost`, and
  `os.homedir()` is `/tmp/`.
- **`globalOutbound` is the wall.** Set to an entrypoint stub, every
  `fetch` of the shop arrives there with its full URL and the stub's
  props, so a window is a URL rule and a refusal is a 403 with the
  call's id. Set to `null`, `fetch` throws `This worker is not
  permitted to access the internet via global functions like fetch()`.
  `node:child_process` imports and `spawnSync` throws `not
  implemented`; `node:net` and `node:http` import and have nowhere to go.
- **`ctx.exports` with `props` is on `DurableObjectState` too**, so the
  gate can run inside the object and make a window per call there.
- **A module's top level is global scope**, as pen phase 5 found: an
  `await` on a timer there throws `Disallowed operation called within
  global scope`, and an `await` on a promise that resolves at once
  returns from `import()` before the rest of the module has run. A
  shop's program must be a function the entry calls.
- **The loader wants typed modules**: `{ js: source }`, not a bare
  string, for a `.mjs` name.
- **The pool pins vitest.** `@cloudflare/vitest-pool-workers` 0.22
  wants `vitest ^4.1`; the town is on 5. The spike runs on 4.1.11.
- **The state round trip is cheap at this size.** Rows to files to rows
  for a hundred files cost as much as one call; a cap is a design
  choice, not a measurement.
