// The box: the town as one Worker. Its `fetch` is the door; `Town` is the
// object, one per box, holding the store over its own SQL, the shops'
// files and state in its rows, and the key from the platform's secret; and
// `Window` is a call's one way out.
//
// The door is small. `GET /` answers `town`; `POST /call` reads the bearer
// and the body as the clerk's `parseCall` does and hands them to the
// object, which runs the gate and writes one audit row; `POST /admin`
// compares the bearer to the operator's secret in constant time and hands
// the verb's words, its stdin, and for the wagon's verbs the wagon's key as
// sixty-four hex characters to the object, which runs src/admin.ts's
// `main` over its store with what it prints captured; `GET
// /admin/consent/<state>` waits, with the same bearer, on a consent the
// object holds; `GET /consent`, where a provider's redirect lands, and
// `GET /consent/<state>` finish one; anything else is 404. Every answer
// carries `x-town-build`, the commit the deploy was made from. A bearer
// that is not the operator's is 401 and reaches no verb and no row.
//
// The object opens the store on first use and runs the migrations, so a
// box made by this code holds what a laptop's data directory holds; its
// seams are src/rows.ts's. Its runtime is src/isolate.ts's, handed to the
// gate as the only runtime there is: a shop whose runtime is not `worker`
// is refused before any test and never run. For each call it makes a
// window with the call's props, the needs with their nonces and tokens
// and, for a shop with dependencies, a clerk's nonce and bearer, and hands
// it to the isolate as its outbound. What the window forwards is counted
// in the object, and a shop's own call is answered in the object by the
// gate for the caller one deeper, the answer the gate made for that run,
// which is compose's clerk with the listener taken out: the window
// re-enters the object while the object waits on the isolate.
//
// This module is the Worker's main module, and a main module exports
// handlers alone: its words and its wall are src/wall.ts's and
// src/window.ts's, and its seams src/rows.ts's.
//
// The window is a WorkerEntrypoint whose `fetch` reads the URL: under
// `http://window/<nonce>` of one of the call's needs it is the teller by
// host, forwarded with this Worker's own `fetch` to the need's origin by
// src/window.ts's rule, the type's header set from the token, the hop's
// headers dropped both ways; `POST http://clerk/<nonce>/call` with the
// run's bearer is a shop's own call; anything else is refused, 403 naming
// the call, and never leaves the box. The token rides in the props, in
// the town's own isolate, and never in the shop's `env`.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";
import { main as admin, type Io } from "./admin.js";
import type { ArgValues } from "./args.js";
import { BODY_LIMIT_BYTES, parseCall, respond, type Answer, type ClerkCall, type WireResponse } from "./clerk.js";
import { BROWSER_NOT_CONNECTED, landConsent, timedOut, type Consent, type Landed } from "./consent.js";
import { denials } from "./denials.js";
import { storeVault, type GateDeps, type Runtime } from "./gate.js";
import { CLERK_HOST, WINDOW_HOST, runIsolate, windowNeeds, type IsolateCredential } from "./isolate.js";
import type { Manifest } from "./manifest.js";
import type { RunOptions, RunResult } from "./runtime.js";
import { decideAndRecord, handleCall, refusedCall } from "./server.js";
import type { Shelf } from "./shelf.js";
import { TOWN_OBJECT, objectStore, readState, writeState } from "./rows.js";
import type { Store } from "./store.js";
import { openCredential, sealCredential } from "./vault.js";
import { OPERATOR_REFUSED, type AdminAnswer } from "./wire.js";
import { BOX_WALL, ISOLATE_WALL, SUBPROCESS_REFUSAL, overRowLimit, rowLimitLine } from "./wall.js";
import { forwardHeaders, forwardPath, parseHeaderTemplate, parseOrigin, signedHeader, windowRefusal } from "./window.js";

export interface Env {
  LOADER: WorkerLoader;
  TOWN: DurableObjectNamespace<Town>;
  /** The commit the deploy was made from. */
  TOWN_BUILD: string;
  /** The vault's key, thirty-two bytes as hex, made by the deploy and never by the town. */
  TOWN_VAULT_KEY?: string;
  /** The operator's token, made by the deploy. */
  TOWN_OPERATOR?: string;
  /** Moves the town's clock, in milliseconds; a var the box ring alone sets. */
  TOWN_TEST_CLOCK_OFFSET_MS?: string;
}

/** How long one wait on a consent holds the request before it answers that the consent still waits. */
const WAIT_SLICE_MS = 20_000;

/** A window's props: the object and the run it reports to, the call it was made for, the needs it forwards, each with its nonce and token, and a clerk's nonce and bearer for a shop with dependencies. */
export interface WindowProps {
  town: string;
  run: string;
  callId: string;
  needs: IsolateCredential[];
  clerk?: { nonce: string; token: string };
}

const encoder = new TextEncoder();

/** Whether two strings are the same, compared in constant time over their digests. */
function same(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b) && encoder.encode(given).length === encoder.encode(expected).length;
}

/** A body read up to `limit` bytes; null when it is longer, with its size. */
async function bodyOf(request: Request, limit: number): Promise<{ text: string } | { over: number }> {
  const bytes = new Uint8Array(await request.arrayBuffer());
  return bytes.length > limit ? { over: bytes.length } : { text: new TextDecoder().decode(bytes) };
}

export class Window extends WorkerEntrypoint<Env, WindowProps> {
  override async fetch(request: Request): Promise<Response> {
    const { callId, needs, clerk } = this.ctx.props;
    const url = new URL(request.url);
    const [, segment = "", ...rest] = url.pathname.split("/");
    const refused = () => new Response(windowRefusal(callId, request.method, url), { status: 403 });
    if (url.protocol !== "http:") return refused();
    if (url.host === CLERK_HOST && clerk && same(segment, clerk.nonce) && rest.join("/") === "call" && request.method === "POST") return this.clerk(request, clerk.token);
    const need = url.host === WINDOW_HOST ? needs.find((n) => same(segment, n.nonce)) : undefined;
    if (!need) return refused();

    const origin = parseOrigin(need.origin);
    const template = parseHeaderTemplate(need.header);
    const signed = template && signedHeader(template, need.token);
    if (!origin || !signed) return new Response(null, { status: 502 });
    const target = new URL(forwardPath(origin, `${rest.length ? `/${rest.join("/")}` : ""}${url.search}`), origin);
    const headers = forwardHeaders(Object.fromEntries(request.headers), [signed.name]);
    headers[signed.name] = signed.value;

    await this.town().forwarded(this.ctx.props.run, need.nonce);
    let answer: Response;
    try {
      answer = await fetch(target, { method: request.method, headers, body: request.body, redirect: "manual" });
    } catch {
      // The origin could not be reached: the shop sees a 502, and nothing is written anywhere.
      return new Response(null, { status: 502 });
    }
    return new Response(answer.body, { status: answer.status, statusText: answer.statusText, headers: forwardHeaders(Object.fromEntries(answer.headers), []) });
  }

  private town(): DurableObjectStub<Town> {
    return this.env.TOWN.get(this.env.TOWN.idFromString(this.ctx.props.town));
  }

  /** A shop's own call, as the laptop's clerk answers it: the run's bearer or an invalid pass, a body the town reads or a bad call, and otherwise the object's answer. */
  private async clerk(request: Request, token: string): Promise<Response> {
    const quiet = { stdout: "", notices: [] };
    const body = await bodyOf(request, BODY_LIMIT_BYTES);
    if ("over" in body) return Response.json(respond({ ...quiet, error: denials.stdinTooLarge(body.over), exit: 1 }, false));
    const call = parseCall(null, body.text);
    if (!call) return Response.json(respond({ ...quiet, error: denials.badCall(), exit: 1 }, false));
    if (!same(request.headers.get("authorization") ?? "", `Bearer ${token}`)) return Response.json(respond({ ...quiet, error: denials.invalidPass(), exit: 3 }, call.json));
    return Response.json(await this.town().clerk(this.ctx.props.run, { argv: call.argv, stdin: call.stdin, json: call.json }));
  }
}

/** A run of a shop in an isolate: the answer to its own calls, how many it made and the first denial, and the requests its windows forwarded. A run the object's runtime did not open is a window made elsewhere, whose counts are taken by `requestsUnder`. */
interface Run {
  answer: Answer | null;
  ours: boolean;
  calls: number;
  denied: string | null;
  counts: Map<string, number>;
  controller: AbortController;
}

const hex = (bytes: number) => randomBytes(bytes).toString("hex");

export class Town extends DurableObject<Env> {
  #store: Store | null = null;
  readonly #runs = new Map<string, Run>();

  /** The store, opened over the object's rows on first use, its migrations run. */
  get store(): Store {
    this.#store ??= objectStore(this.ctx.storage, this.env.TOWN_VAULT_KEY);
    return this.#store;
  }

  /** The town's clock: the platform's, moved by the test var when it is set. */
  readonly now = (): number => Date.now() + (Number(this.env.TOWN_TEST_CLOCK_OFFSET_MS ?? 0) || 0);

  /** The gate's deps on the box: the store, the vault over it and the secret, the isolate as the runtime, and the path that decides and records. */
  deps(): GateDeps {
    const store = this.store;
    return { store, vault: storeVault(store, () => store.key.read()), wall: ISOLATE_WALL, runtime: this.runtime, decide: decideAndRecord, now: this.now };
  }

  /** An agent's call: the gate and its one audit row; a body that is not a call, or one past the limit, its row and refusal as a laptop writes them. */
  async call(token: string | null, body: string | null, over: number | null): Promise<WireResponse> {
    const call = body === null ? null : parseCall(token, body);
    if (!call) return refusedCall(this.store, token, over);
    return handleCall(this.deps(), call);
  }

  /** The operator's verb: src/admin.ts's `main` over the object's store, with what it prints captured, and for a consent begun, its state to wait on; `key`, the wagon's key as hex the pipe sent, is held for this verb alone and written nowhere. */
  async admin(argv: string[], stdin: string | null, address: string, key: string | null = null): Promise<AdminAnswer> {
    const store = this.store;
    if (store.getMeta("address") !== address) store.setMeta("address", address);
    let stdout = "";
    let stderr = "";
    let wait: string | undefined;
    const io: Io = {
      out: (s) => void (stdout += s),
      err: (s) => void (stderr += s),
      env: {},
      now: this.now,
      ...(stdin === null ? {} : { stdin: { isTTY: false, async *[Symbol.asyncIterator]() { yield Buffer.from(stdin, "utf8"); } } }),
      consent: { redirect: `${address}/consent`, hold: (c) => void (this.hold(c), (wait = c.state)) },
    };
    let exit: number;
    try {
      exit = await admin(argv, io, BOX_WALL, { store, runtime: this.runtime, address, build: this.env.TOWN_BUILD, ...(key === null ? {} : { wagonKey: Buffer.from(key, "hex") }) });
    } catch (err) {
      // What a verb threw that is not a refusal names no value: its kind alone.
      stderr += `townd admin: the town failed on this verb: ${(err as Error).name}\n`;
      exit = 1;
    }
    return { stdout, stderr, exit, ...(wait !== undefined && exit === 0 ? { wait } : {}) };
  }

  /** A consent begun by `credential connect`, held for its landing: sealed under the vault's key by its state's digest, with when it stops waiting. */
  private hold(consent: Consent): void {
    const id = consentId(consent.state);
    const sealed = sealCredential(this.store.key.ensure(), id, JSON.stringify(consent));
    this.store.sql.run("INSERT INTO consents (id, sealed, expires_at) VALUES (?, ?, ?)", id, sealed, Date.now() + consent.timeoutMs);
  }

  /** The consent held under `id`, opened. */
  private consentAt(id: string, sealed: Uint8Array): Consent {
    return JSON.parse(openCredential(this.store.key.ensure(), id, sealed)) as Consent;
  }

  /**
   * The wire's wait on a consent: its end once the landing wrote one, or
   * the timeout's once it is past with no redirect; otherwise, after a
   * slice, that it still waits. A state the object does not hold is
   * refused, and nothing is written.
   */
  async waitConsent(state: string): Promise<AdminAnswer> {
    const id = consentId(state);
    const store = this.store;
    const slice = Date.now() + WAIT_SLICE_MS;
    for (;;) {
      const row = store.sql.get<{ sealed: Uint8Array; expires_at: number; landing: number; outcome: string | null }>("SELECT sealed, expires_at, landing, outcome FROM consents WHERE id = ?", id);
      if (!row) return { stdout: "", stderr: "townd admin: credential connect refused: no consent waits under that state; nothing was written\n", exit: 1 };
      if (row.outcome !== null) {
        store.sql.run("DELETE FROM consents WHERE id = ?", id);
        return JSON.parse(row.outcome) as AdminAnswer;
      }
      if (row.landing === 0 && Date.now() >= row.expires_at && store.sql.run("UPDATE consents SET landing = 1 WHERE id = ? AND landing = 0", id).changes > 0) {
        const ended = timedOut(store, this.consentAt(id, row.sealed), this.now);
        store.sql.run("DELETE FROM consents WHERE id = ?", id);
        return { stdout: ended.stdout, stderr: ended.stderr, exit: ended.exit };
      }
      if (Date.now() >= slice) return { stdout: "", stderr: "", exit: 0, wait: state };
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  /**
   * The landing: a redirect for a consent the object holds, still waiting,
   * and not already landing, claimed once and finished by the flow, its end
   * kept for the wait and the browser told in consent's words. A state the
   * object does not hold, one past its wait, and one already landed are
   * 404, the status the laptop's listener gives them, with consent's words
   * that it did not connect, and nothing is written: no credential, no
   * consent row changed, no audit row.
   */
  async landing(state: string | null, search: string): Promise<{ status: number; body: string }> {
    if (state === null) return { status: 404, body: BROWSER_NOT_CONNECTED };
    const store = this.store;
    const id = consentId(state);
    const claimed = store.sql.run("UPDATE consents SET landing = 1 WHERE id = ? AND landing = 0 AND outcome IS NULL AND expires_at > ?", id, Date.now()).changes > 0;
    if (!claimed) return { status: 404, body: BROWSER_NOT_CONNECTED };
    const row = store.sql.get<{ sealed: Uint8Array }>("SELECT sealed FROM consents WHERE id = ?", id)!;
    let landed: Landed;
    try {
      landed = await landConsent(store, () => store.key.ensure(), this.consentAt(id, row.sealed), new URLSearchParams(search), this.now(), this.now);
    } catch (err) {
      landed = { exit: 1, stdout: "", stderr: `townd admin: ${(err as Error).message}\n`, browser: BROWSER_NOT_CONNECTED };
    }
    store.sql.run("UPDATE consents SET outcome = ? WHERE id = ?", JSON.stringify({ stdout: landed.stdout, stderr: landed.stderr, exit: landed.exit }), id);
    return { status: 200, body: landed.browser ?? BROWSER_NOT_CONNECTED };
  }

  /** A shop's own call, from its window: the gate for the caller one deeper, as the run's answer decides it; a run the object does not hold is an invalid pass. */
  async clerk(runId: string, call: ClerkCall): Promise<WireResponse> {
    const run = this.#runs.get(runId);
    const quiet = { stdout: "", notices: [] };
    if (!run?.answer) return respond({ ...quiet, error: denials.invalidPass(), exit: 3 }, call.json);
    try {
      const a = await run.answer(call, run.controller.signal);
      run.calls++;
      if (a.denial !== null && run.denied === null) run.denied = a.denial;
      return { stdout: a.stdout, stderr: a.stderr, exit: a.exit };
    } catch {
      return respond({ ...quiet, error: denials.townFailed(), exit: 1 }, call.json);
    }
  }

  /** A request a window forwarded under a nonce of a run, counted. */
  async forwarded(runId: string, nonce: string): Promise<void> {
    const run = this.#runs.get(runId) ?? this.open(runId, null, true);
    run.counts.set(nonce, (run.counts.get(nonce) ?? 0) + 1);
  }

  /** How many requests the window of a run made elsewhere forwarded under a nonce; the count is taken, so a second read says 0. */
  async requestsUnder(runId: string, nonce: string): Promise<number> {
    const run = this.#runs.get(runId);
    const n = run?.counts.get(nonce) ?? 0;
    if (run && !run.ours) {
      run.counts.delete(nonce);
      if (run.counts.size === 0) this.#runs.delete(runId);
    }
    return n;
  }

  private open(runId: string, answer: Answer | null, elsewhere: boolean): Run {
    const run: Run = { answer, ours: !elsewhere, calls: 0, denied: null, counts: new Map(), controller: new AbortController() };
    this.#runs.set(runId, run);
    return run;
  }

  /** The window for a run, made through this Worker's exports with its props. */
  window(props: WindowProps): Fetcher {
    return (this.ctx as unknown as { exports: { Window(o: { props: WindowProps }): Fetcher } }).exports.Window({ props });
  }

  /** The box's runtime: a `worker` shop's command in an isolate, its state from the object's rows and back, its windows and clerk made for the run. */
  readonly runtime: Runtime = Object.assign(
    async (shelf: Shelf, manifest: Manifest, command: string, args: ArgValues, opts: RunOptions): Promise<RunResult> => {
      const refusal = refusesOnTheBox(manifest);
      if (refusal) return { stdout: "", stderr: `${refusal}\n`, exit: 1, timedOut: false, aborted: false, credentials: [], calls: 0, denied: null, wall: null };
      const files = shelf.read(manifest.name);
      if (files === null) throw new Error(`the shelf holds no files for ${manifest.name}`);
      const sql = this.store.sql;
      const state = readState(sql, opts.stateRoot, manifest.name, opts.user);
      const runId = hex(16);
      const run = this.open(runId, opts.town?.answer ?? null, false);
      try {
        const needs = windowNeeds(opts.credentials ?? []);
        const clerk = (manifest.depends ?? []).length ? { nonce: hex(16), token: randomBytes(32).toString("base64url") } : null;
        const props: WindowProps = { town: this.ctx.id.toString(), run: runId, callId: opts.callId ?? runId, needs, ...(clerk ? { clerk } : {}) };
        const outbound = needs.length || clerk ? this.window(props) : null;
        const r = await runIsolate(files, manifest, command, args, {
          user: opts.user,
          state,
          loader: this.env.LOADER,
          outbound,
          credentials: needs,
          requests: (nonce) => run.counts.get(nonce) ?? 0,
          ...(opts.stdin == null ? {} : { stdin: opts.stdin }),
          ...(opts.timeoutMs === undefined ? {} : { timeoutMs: opts.timeoutMs }),
          ...(opts.signal ? { signal: opts.signal } : {}),
          ...(clerk ? { grant: `${JSON.stringify({ town: `http://${CLERK_HOST}/${clerk.nonce}`, token: clerk.token })}\n` } : {}),
        });
        // A row holds two megabytes on the platform, and local workerd need not say so: a file past it fails the call, the state as it was.
        const over = overRowLimit(r.state);
        if (over !== null) {
          return { stdout: r.stdout, stderr: `${r.stderr}${rowLimitLine(over)}\n`, exit: 1, timedOut: r.timedOut, aborted: r.aborted, credentials: r.credentials, calls: run.calls, denied: run.denied, wall: r.wall };
        }
        writeState(sql, opts.stateRoot, manifest.name, opts.user, state, r.state);
        return { stdout: r.stdout, stderr: r.stderr, exit: r.exit, timedOut: r.timedOut, aborted: r.aborted, credentials: r.credentials, calls: run.calls, denied: run.denied, wall: r.wall };
      } finally {
        run.controller.abort();
        this.#runs.delete(runId);
      }
    },
    { refuses: refusesOnTheBox },
  );
}

/** Why the box does not run a manifest: any runtime but `worker`. */
function refusesOnTheBox(manifest: Manifest): string | null {
  return manifest.runtime === "worker" ? null : SUBPROCESS_REFUSAL;
}

/** A consent's row id: its state's digest, so the row does not hold the state. */
function consentId(state: string): string {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

/** Whether a request carries the operator's bearer, compared to the secret in constant time; a box with no secret has no operator. */
function operator(request: Request, env: Env): boolean {
  const expected = env.TOWN_OPERATOR;
  const given = request.headers.get("authorization") ?? "";
  return expected !== undefined && expected !== "" && same(given, `Bearer ${expected}`);
}

/** The door's answer to one request, before the build is stamped on it. */
async function door(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const town = () => env.TOWN.getByName(TOWN_OBJECT);
  const { method, headers } = request;
  const path = url.pathname;

  if (method === "GET" && path === "/") return new Response("town\n");
  if (method === "POST" && path === "/call") {
    const token = /^Bearer (\S+)$/.exec(headers.get("authorization") ?? "")?.[1] ?? null;
    const body = await bodyOf(request, BODY_LIMIT_BYTES);
    return Response.json(await town().call(token, "text" in body ? body.text : null, "over" in body ? body.over : null));
  }
  if (method === "POST" && path === "/admin") {
    if (!operator(request, env)) return Response.json({ error: OPERATOR_REFUSED }, { status: 401 });
    const body = await bodyOf(request, BODY_LIMIT_BYTES);
    let parsed: unknown = null;
    try {
      parsed = "text" in body ? JSON.parse(body.text) : null;
    } catch {
      parsed = null;
    }
    const o = (typeof parsed === "object" && parsed !== null ? parsed : {}) as Record<string, unknown>;
    const key = o.key === undefined || o.key === null ? null : typeof o.key === "string" && /^[0-9a-fA-F]{64}$/.test(o.key) ? o.key : undefined;
    if (!Array.isArray(o.argv) || !o.argv.every((a) => typeof a === "string") || (o.stdin !== undefined && o.stdin !== null && typeof o.stdin !== "string") || key === undefined) {
      return Response.json({ stdout: "", stderr: "townd admin: the box could not read this verb\n", exit: 1 }, { status: 400 });
    }
    return Response.json(await town().admin(o.argv as string[], (o.stdin as string | null | undefined) ?? null, url.origin, key));
  }
  const waiting = /^\/admin\/consent\/([^/]+)$/.exec(path);
  if (method === "GET" && waiting) {
    if (!operator(request, env)) return Response.json({ error: OPERATOR_REFUSED }, { status: 401 });
    return Response.json(await town().waitConsent(decodeURIComponent(waiting[1]!)));
  }
  const landing = /^\/consent(?:\/([^/]+))?$/.exec(path);
  if (method === "GET" && landing) {
    const state = landing[1] !== undefined ? decodeURIComponent(landing[1]) : url.searchParams.get("state");
    const answer = await town().landing(state, url.search);
    return new Response(answer.body === "" ? null : answer.body, { status: answer.status, headers: answer.body === "" ? {} : { "content-type": "text/plain; charset=utf-8" } });
  }
  await request.body?.cancel();
  return new Response(null, { status: 404 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const answer = await door(request, env);
    const headers = new Headers(answer.headers);
    headers.set("x-town-build", env.TOWN_BUILD);
    return new Response(answer.body, { status: answer.status, statusText: answer.statusText, headers });
  },
} satisfies ExportedHandler<Env>;
