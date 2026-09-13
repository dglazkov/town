// The window's rule: what the teller has done with a shop's request since
// vault, apart from the listener, so the box's window follows it too. A
// type's origin and header are parsed; a request under the window is sent
// to the origin's path with the request's path and query after it; the
// type's header is set from the token; and the headers that belong to one
// hop, Host, and any Authorization the shop set are dropped. Nothing here
// opens a socket or holds a token past the call it is given.

/** The headers that belong to one hop, dropped both ways. */
export const HOP_BY_HOP: readonly string[] = ["connection", "keep-alive", "te", "trailer", "transfer-encoding", "upgrade"];

/** `<Name>: <value with {token}>` as a name and a value; null when it is not that shape. */
export function parseHeaderTemplate(header: string): { name: string; value: string } | null {
  const m = /^([!#$%&'*+.^_`|~0-9A-Za-z-]+):[ \t]*(.*\S)[ \t]*$/.exec(header);
  if (!m || !m[2]!.includes("{token}") || /[\r\n]/.test(header)) return null;
  return { name: m[1]!, value: m[2]! };
}

/** The origin as a URL, or null when it is not an absolute http: or https: URL without query or fragment. */
export function parseOrigin(origin: string): URL | null {
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.search !== "" || u.hash !== "" || origin.includes("?") || origin.includes("#")) return null;
  if (u.username !== "" || u.password !== "") return null;
  return u;
}

/** The header a forwarded request carries: the template's name, and its value with the token in place of {token}; null when the value could not ride in a header. */
export function signedHeader(template: { name: string; value: string }, token: string): { name: string; value: string } | null {
  const value = template.value.split("{token}").join(token);
  return /[\r\n]/.test(value) ? null : { name: template.name, value };
}

/**
 * The path and query a request is forwarded to: `rest`, what followed the
 * window's own prefix, its path joined onto the origin's base path without
 * doubling a slash and its query after; `/` when both paths are empty.
 */
export function forwardPath(origin: URL, rest: string): string {
  const basePath = origin.pathname.replace(/\/+$/, "");
  const q = rest.indexOf("?");
  const restPath = q === -1 ? rest : rest.slice(0, q);
  const query = q === -1 ? "" : rest.slice(q);
  return `${`${basePath}${restPath}` || "/"}${query}`;
}

/**
 * A message's headers less `Host`, `Authorization`, the hop-by-hop set,
 * every header `Connection` names, any `proxy-` header, and `also`; names
 * lower-cased.
 */
export function forwardHeaders<V>(from: Readonly<Record<string, V | undefined>>, also: readonly string[]): Record<string, V> {
  const lower = Object.fromEntries(Object.entries(from).map(([k, v]) => [k.toLowerCase(), v]));
  const named = String(lower.connection ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const drop = new Set(["host", "authorization", ...HOP_BY_HOP, ...named, ...also.map((a) => a.toLowerCase())]);
  const out: Record<string, V> = {};
  for (const [name, value] of Object.entries(lower)) {
    if (value === undefined || drop.has(name) || name.startsWith("proxy-")) continue;
    out[name] = value;
  }
  return out;
}
