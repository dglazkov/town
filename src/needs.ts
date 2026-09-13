// Needs: a manifest's `credentials`, the credential types a shop calls
// through (spec §8), and the validator's rules for them. A need names a
// type the town holds, or defines one: exactly as the town holds it, or,
// for a type the town lacks, a proposal a person approves. A definition is
// an origin and a header, vault's checks, with `oauth` endpoints and scopes
// for an OAuth type, shape-checked and refused until consent phase 1, and
// `guidance`, the shop's words for the person who makes the secret. A
// registration is never a manifest's. The manifest's validator calls
// here; every refusal cites §8.

import { describe, isRecord, refusal, type Need, type TownType } from "./manifest.js";
import { parseHeaderTemplate, parseOrigin } from "./teller.js";

const NEED_FIELDS = ["type", "origin", "header", "oauth", "guidance"];
const OAUTH_FIELDS = ["authorize", "token", "scopes"];
/** Keys that would carry an OAuth registration, the operator's alone: refused wherever a manifest writes one. */
const REGISTRATION_KEYS = ["client", "client_id", "client_secret", "secret", "redirect", "redirect_uri", "registration"];
const TYPE_NAME = /^[a-z][a-z0-9-]*$/;

/** The most characters a need's guidance may hold. */
export const GUIDANCE_LIMIT = 600;

/** The town's types as the validator reads them; a bare name is a held `token` type whose definition is not at hand. */
function townTypes(types: readonly (string | TownType)[]): TownType[] {
  return types.map((t) => (typeof t === "string" ? { name: t, kind: "token", state: "held", origin: "", header: "", oauth: null } : t));
}

/** Whether a need writes a definition: an origin, a header, or oauth endpoints. */
export function definesType(n: Need): boolean {
  return n.origin !== undefined || n.header !== undefined || n.oauth !== undefined;
}

/** Whether a need's definition is the town's type, field for field, `oauth` included. */
export function sameDefinition(t: TownType, n: Need): boolean {
  return t.origin === n.origin && t.header === n.header && JSON.stringify(t.oauth ?? null) === JSON.stringify(n.oauth ?? null);
}

/** File extensions: a dotted name ending in one is a file's name, like `main.mjs` or `Node.js`, and not a host. */
const FILE_EXTENSIONS = new Set(
  "js mjs cjs ts tsx jsx json jsonl yaml yml toml ini cfg conf env txt md markdown rst html htm css csv tsv xml svg png jpg jpeg gif webp ico pdf doc docx xls xlsx ppt pptx zip tar gz tgz bz2 xz sh bash zsh py rb go rs java kt swift c h cc cpp hpp cs php pl lua sql db sqlite log lock pem key crt cer p12 pfx pub der plist exe dmg pkg deb rpm app bin dll so dylib wasm mp3 mp4 mov wav".split(" "),
);

/**
 * The hosts `text` names, lower-cased, in order, each once: the host of
 * every URL, and every name written bare, a dotted name whose last label is
 * letters only, two or more of them, and not a file's extension. So
 * `paste.example.com` is a host, and `main.mjs`, `client_secret.json`,
 * `Node.js`, `e.g.`, and `1.2.3` are not.
 */
export function namedHosts(text: string): string[] {
  const hosts: string[] = [];
  const add = (host: string) => {
    if (host !== "" && !hosts.includes(host)) hosts.push(host);
  };
  for (const m of text.matchAll(/\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"'`)\]]+/gi)) {
    // A sentence's punctuation after a URL is not the URL's.
    const url = m[0].replace(/[.,;:!?]+$/, "");
    try {
      add(new URL(url).hostname.toLowerCase());
    } catch {
      add(url.replace(/^[^:]*:\/\/([^/?#]*).*$/, "$1").replace(/^[^@]*@/, "").replace(/:\d*$/, "").toLowerCase());
    }
  }
  // Bare names: not a path's segment, a URL's scheme, or a word's middle.
  const label = "[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?";
  for (const m of text.matchAll(new RegExp(`(?<![A-Za-z0-9_./:\\-])${label}(?:\\.${label})+(?![A-Za-z0-9_-]|\\.[A-Za-z0-9]|:\\/\\/)`, "g"))) {
    const last = m[0].split(".").pop()!;
    if (/^[A-Za-z]{2,}$/.test(last) && !FILE_EXTENSIONS.has(last.toLowerCase())) add(m[0].toLowerCase());
  }
  return hosts;
}

/**
 * `credentials`: a list of needs, one per type. Each is `{ type }`,
 * `{ type, origin, header }`, or those with `oauth`, each with an optional
 * `guidance`, and no other key. With `types` at hand, a need naming a type
 * the town holds, held or proposed, is met by it when it writes no
 * definition or the same one, and one naming a type the town lacks must
 * define it; with none at hand, a need is refused naming --data.
 */
export function validateNeeds(needs: unknown, types: readonly (string | TownType)[] | undefined, out: string[]): void {
  if (needs === undefined || needs === null) return;
  if (!Array.isArray(needs)) {
    out.push(refusal("credentials", "is not a list", "a list of needs like - type: github-token, or leave credentials out", 8));
    return;
  }
  const seen = new Set<string>();
  needs.forEach((n, i) => {
    const at = `credentials[${i}]`;
    if (!isRecord(n)) {
      out.push(refusal(at, "is not a mapping", "a need like { type: github-token }", 8));
      return;
    }
    const before = out.length;
    for (const key of Object.keys(n)) {
      if (REGISTRATION_KEYS.includes(key)) out.push(registration(`${at}.${key}`, "type, origin, header, and guidance"));
      else if (!NEED_FIELDS.includes(key)) out.push(refusal(`${at}.${key}`, "is not a need field", `only ${NEED_FIELDS.join(", ")}`, 8));
    }
    if (typeof n.type !== "string" || !TYPE_NAME.test(n.type)) {
      out.push(refusal(`${at}.type`, describe(n.type, "a type name"), 'a type like github-token, lowercase letters, digits, and "-",', 8));
      return;
    }
    if (seen.has(n.type)) {
      out.push(refusal(`${at}.type`, `repeats the type ${n.type}`, "each type once", 8));
      return;
    }
    seen.add(n.type);
    const need = n as unknown as Need;
    validateDefinition(n, at, out);
    if (out.length > before) return;
    if (need.oauth !== undefined) {
      out.push(refusal(`${at}.oauth`, "oauth types come in consent phase 1", "a token type, an origin and a header alone,", 8));
      return;
    }

    if (types === undefined) {
      out.push(refusal(`${at}.type`, `'${need.type}' cannot be checked with no data directory at hand`, "the verb again with --data <dir>, so the town's types are read,", 8));
      return;
    }
    const town = townTypes(types);
    const held = town.find((t) => t.name === need.type);
    if (!definesType(need)) {
      if (!held) {
        out.push(refusal(`${at}.type`, `'${need.type}' is not a type this town holds`, `one of (${town.map((t) => t.name).join(", ")}), or an origin and a header beside it to propose one,`, 8));
      }
      return;
    }
    if (held && !sameDefinition(held, need)) {
      const header = parseHeaderTemplate(held.header)?.name ?? held.header;
      out.push(`${at}: ${need.type} is a type this town holds, at ${held.origin} in ${header}; leave the definition out, or write that (spec §8)`);
    }
  });
}

/** The shape of a need's definition and guidance: origin and header together, oauth beside them, guidance beside a definition, and no host in the guidance the type does not send to. */
function validateDefinition(n: Record<string, unknown>, at: string, out: string[]): void {
  const hosts: string[] = [];
  if (n.origin !== undefined || n.header !== undefined) {
    if (n.origin === undefined) {
      out.push(refusal(`${at}.origin`, "is missing, and origin and header come together", "both, or neither to name a type the town holds,", 8));
    } else if (typeof n.origin !== "string" || !parseOrigin(n.origin)) {
      out.push(refusal(`${at}.origin`, "is not an origin", "an absolute http: or https: URL with no query, fragment, or userinfo, like https://api.figma.com,", 8));
    } else {
      hosts.push(parseOrigin(n.origin)!.hostname.toLowerCase());
    }
    if (n.header === undefined) {
      out.push(refusal(`${at}.header`, "is missing, and origin and header come together", "both, or neither to name a type the town holds,", 8));
    } else if (typeof n.header !== "string" || !parseHeaderTemplate(n.header)) {
      out.push(refusal(`${at}.header`, "is not a header", 'a header like "X-Figma-Token: {token}", its name and a value with {token} where the secret goes,', 8));
    }
  }
  if (n.oauth !== undefined) {
    if (n.origin === undefined && n.header === undefined) out.push(refusal(`${at}.oauth`, "is given with no origin and header", "an origin and a header beside it", 8));
    hosts.push(...validateOAuth(n.oauth, `${at}.oauth`, out));
  }
  if (n.guidance === undefined) return;
  const g = n.guidance;
  if (typeof g !== "string" || g.trim() === "") {
    out.push(refusal(`${at}.guidance`, "is not text", "one paragraph for the person who makes the secret, or leave guidance out,", 8));
  } else if (n.origin === undefined && n.header === undefined && n.oauth === undefined) {
    out.push(refusal(`${at}.guidance`, "is given with no definition, and a type the town holds carries its own", "guidance beside an origin and a header, or leave it out,", 8));
  } else if (/\n[ \t]*\n/.test(g.trim())) {
    out.push(refusal(`${at}.guidance`, "is more than one paragraph", "one paragraph, with no blank line,", 8));
  } else if (g.length > GUIDANCE_LIMIT) {
    out.push(refusal(`${at}.guidance`, `is ${g.length} characters, over ${GUIDANCE_LIMIT}`, `one paragraph of at most ${GUIDANCE_LIMIT} characters`, 8));
  } else {
    const other = namedHosts(g).find((h) => !hosts.includes(h));
    if (other !== undefined) out.push(`${at}.guidance: names ${other}, which is not where this type sends; say where the secret is made, not where to send it (spec §8)`);
  }
}

/** `oauth`: `{ authorize, token, scopes }`, two https: URLs and a non-empty list of strings, and no registration. The endpoints' hosts, of those that parse. */
function validateOAuth(o: unknown, at: string, out: string[]): string[] {
  if (!isRecord(o)) {
    out.push(refusal(at, "is not a mapping", "{ authorize: <https URL>, token: <https URL>, scopes: [<scope>] }", 8));
    return [];
  }
  const hosts: string[] = [];
  for (const key of Object.keys(o)) {
    if (REGISTRATION_KEYS.includes(key)) out.push(registration(`${at}.${key}`, "authorize, token, and scopes"));
    else if (!OAUTH_FIELDS.includes(key)) out.push(refusal(`${at}.${key}`, "is not an oauth field", `only ${OAUTH_FIELDS.join(", ")}`, 8));
  }
  for (const field of ["authorize", "token"] as const) {
    const v = o[field];
    let url: URL | null = null;
    try {
      url = typeof v === "string" ? new URL(v) : null;
    } catch {
      url = null;
    }
    if (!url || url.protocol !== "https:") out.push(refusal(`${at}.${field}`, describe(v, "an https: URL"), `the provider's ${field} endpoint, an https: URL,`, 8));
    else hosts.push(url.hostname.toLowerCase());
  }
  const scopes = o.scopes;
  if (!Array.isArray(scopes) || scopes.length === 0 || !scopes.every((x) => typeof x === "string" && x.trim() !== "")) {
    out.push(refusal(`${at}.scopes`, describe(scopes, "a non-empty list of strings"), "the scopes the shop needs, like [documents.readonly],", 8));
  }
  return hosts;
}

/** A registration key's refusal: the client is the operator's, given at the box, and never a manifest's. */
function registration(field: string, only: string): string {
  return refusal(field, "is a registration, which is the operator's and never a manifest's", `${only} alone, and the operator gives the town its client,`, 8);
}
