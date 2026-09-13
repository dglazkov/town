// The spike's Worker: a Town object with SQL, a Window entrypoint made per call with props, and a Runner that loads a shop.
import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ENTRY_MODULE, ENTRY_SOURCE } from "./entry.ts";

export interface Env { TOWN: DurableObjectNamespace<Town>; LOADER: WorkerLoader }

export class Town extends DurableObject<Env> {
  exec(query: string, ...bindings: unknown[]): Record<string, unknown>[] {
    return this.ctx.storage.sql.exec(query, ...bindings).toArray() as Record<string, unknown>[];
  }
  /** Two writes in one transaction, the second failing: does the first stay? */
  atomic(): string {
    try {
      this.ctx.storage.transactionSync(() => {
        this.ctx.storage.sql.exec("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)", "u_tx", "tx", 1);
        this.ctx.storage.sql.exec("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)", "u_tx", "tx-dup", 1);
      });
    } catch (e) {
      return `rolled back: ${(e as Error).message.slice(0, 40)}; rows=${this.exec("SELECT COUNT(*) AS n FROM users WHERE id = 'u_tx'")[0]!.n}`;
    }
    return "no error";
  }
  seal(): string {
    const key = randomBytes(32);
    const nonce = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", key, nonce, { authTagLength: 16 });
    c.setAAD(Buffer.from("cred_1"));
    const body = Buffer.concat([c.update("secret-value", "utf8"), c.final()]);
    const tag = c.getAuthTag();
    const d = createDecipheriv("aes-256-gcm", key, nonce, { authTagLength: 16 });
    d.setAAD(Buffer.from("cred_1"));
    d.setAuthTag(tag);
    const open = Buffer.concat([d.update(body), d.final()]).toString("utf8");
    const bad = createDecipheriv("aes-256-gcm", key, nonce, { authTagLength: 16 });
    bad.setAAD(Buffer.from("cred_2"));
    bad.setAuthTag(tag);
    let wrongId = "opened";
    try { Buffer.concat([bad.update(body), bad.final()]); } catch { wrongId = "refused"; }
    return `${open} ${wrongId}`;
  }
}

export interface WindowProps { callId: string; nonce: string; type: string; origin: string; header: string; token: string }

/** The call's one way out: every fetch of the isolate arrives here; a window URL is forwarded signed, anything else refused. */
export class Window extends WorkerEntrypoint<Env, WindowProps> {
  override async fetch(request: Request): Promise<Response> {
    const p = this.ctx.props;
    const url = new URL(request.url);
    const seen = `${request.method} ${url.href}`;
    if (url.host === "window" && url.pathname.startsWith(`/${p.nonce}/`)) {
      const rest = url.pathname.slice(p.nonce.length + 1) + url.search;
      // The forward: origin + rest, the header set from the token. Here answered in place, so no network is needed.
      if (rest.startsWith("/repos/") && rest.includes("/issues")) return Response.json([{ number: 7, title: "a real-looking issue", state: "open", html_url: "https://github.com/octocat/hello/issues/7", user: { login: "octocat" } }]);
      const [name, tmpl] = p.header.split(": ");
      const headers = new Headers(request.headers);
      headers.set(name!, tmpl!.replace("{token}", p.token));
      return Response.json({ forwarded: `${p.origin}${rest}`, header: `${name}: ${headers.get(name!)!.replace(p.token, "<token>")}`, callId: p.callId, seen });
    }
    return new Response(`refused: ${seen} is not a window of call ${p.callId}`, { status: 403 });
  }
}

export interface RunRequest { entry: string; source: string; argv: string[]; stdin: string; user: string; state: Record<string, string>; window: Omit<WindowProps, "nonce"> | null; grant?: { town: string; token: string } }

export class Runner extends WorkerEntrypoint<Env> {
  async run(req: RunRequest): Promise<Record<string, unknown>> {
    const nonce = randomBytes(8).toString("hex");
    const env: Record<string, unknown> = { TOWN_USER: req.user, TOWN_ENTRY: req.entry };
    let outbound: Fetcher | null = null;
    if (req.window) {
      outbound = (this.ctx.exports as unknown as { Window(o: { props: WindowProps }): Fetcher }).Window({ props: { ...req.window, nonce } });
      env[`TOWN_CREDENTIAL_${req.window.type.toUpperCase().replace(/-/g, "_")}`] = `http://window/${nonce}`;
    }
    const worker = this.env.LOADER.load({
      compatibilityDate: "2026-08-22",
      mainModule: ENTRY_MODULE,
      modules: { [ENTRY_MODULE]: { js: ENTRY_SOURCE }, [req.entry]: { js: req.source } },
      env,
      globalOutbound: outbound,
      limits: { cpuMs: 5000, subRequests: 50 },
    });
    const stub = worker.getEntrypoint() as unknown as { run(argv: string[], stdin: string, state: Record<string, string>, grant?: unknown): Promise<Record<string, unknown>> };
    const started = performance.now();
    try {
      const r = await stub.run(req.argv, req.stdin, req.state, req.grant);
      return { ...r, ms: Math.round(performance.now() - started) };
    } catch (e) {
      return { loadError: (e as Error).message, ms: Math.round(performance.now() - started) };
    }
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/run") {
      const req = (await request.json()) as RunRequest;
      return Response.json(await new Runner(ctx, env).run(req));
    }
    return new Response("town-spike\n");
  },
};
