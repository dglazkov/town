// The box: the town as one Worker. In its first form it is the window
// and a door that answers `GET /` alone; the object, the store in it, the
// clerk by host, and the door's other routes are box phase 2's.
//
// The window is a call's one way out. The caller makes one per call with
// `ctx.exports.Window({ props })` and hands it to runIsolate as the
// isolate's `globalOutbound`, so every `fetch` the shop makes arrives here
// with its full URL. A request under `http://window/<nonce>` of one of the
// call's needs is the teller by host: forwarded with this Worker's own
// `fetch` to the need's origin by src/window.ts's rule, the path and
// query after the origin's, the type's header set from the token, the
// hop's headers dropped both ways, and counted. Anything else is refused,
// 403 naming the call, and never leaves the box. The token rides in the
// props, in the town's own isolate, and never in the shop's `env`.

import { timingSafeEqual } from "node:crypto";
import { WorkerEntrypoint } from "cloudflare:workers";
import { WINDOW_HOST, type IsolateCredential } from "./isolate.js";
import { forwardHeaders, forwardPath, parseHeaderTemplate, parseOrigin, signedHeader } from "./window.js";

export interface Env {
  LOADER: WorkerLoader;
  /** The commit the deploy was made from. */
  TOWN_BUILD: string;
}

/** A window's props: the call it was made for, and the needs it forwards, each with its nonce and token. */
export interface WindowProps {
  callId: string;
  needs: IsolateCredential[];
}

/** Requests forwarded, by nonce, until `requestsUnder` takes the count. */
const forwarded = new Map<string, number>();

/** How many requests a window forwarded under `nonce`; the count is taken, so a second read says 0. */
export function requestsUnder(nonce: string): number {
  const n = forwarded.get(nonce) ?? 0;
  forwarded.delete(nonce);
  return n;
}

/** The refusal of a request that is not under one of the call's windows. */
export function windowRefusal(callId: string, method: string, url: URL): string {
  return `refused: ${method} ${url.origin} is not a window of call ${callId}\n`;
}

const encoder = new TextEncoder();

/** Whether `segment`, the first of a path, is `nonce`, compared in constant time. */
function sameNonce(segment: string, nonce: string): boolean {
  const a = encoder.encode(segment);
  const b = encoder.encode(nonce);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class Window extends WorkerEntrypoint<Env, WindowProps> {
  override async fetch(request: Request): Promise<Response> {
    const { callId, needs } = this.ctx.props;
    const url = new URL(request.url);
    const [, segment = "", ...rest] = url.pathname.split("/");
    const need = url.protocol === "http:" && url.host === WINDOW_HOST ? needs.find((n) => sameNonce(segment, n.nonce)) : undefined;
    if (!need) return new Response(windowRefusal(callId, request.method, url), { status: 403 });

    const origin = parseOrigin(need.origin);
    const template = parseHeaderTemplate(need.header);
    const signed = template && signedHeader(template, need.token);
    if (!origin || !signed) return new Response(null, { status: 502 });
    const target = new URL(forwardPath(origin, `${rest.length ? `/${rest.join("/")}` : ""}${url.search}`), origin);
    const headers = forwardHeaders(Object.fromEntries(request.headers), [signed.name]);
    headers[signed.name] = signed.value;

    forwarded.set(need.nonce, (forwarded.get(need.nonce) ?? 0) + 1);
    let answer: Response;
    try {
      answer = await fetch(target, { method: request.method, headers, body: request.body, redirect: "manual" });
    } catch {
      // The origin could not be reached: the shop sees a 502, and nothing is written anywhere.
      return new Response(null, { status: 502 });
    }
    return new Response(answer.body, { status: answer.status, statusText: answer.statusText, headers: forwardHeaders(Object.fromEntries(answer.headers), []) });
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") return new Response("town\n");
    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
