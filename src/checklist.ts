// The checklist: a permit's needs, read from the shop's manifest and the
// user's credentials when they are listed and never stored, and the
// things a person types at the box to get from a pending permit to a
// grant, in order, each the exact command with its ids filled in. The
// words about where a secret is made are a type's guidance, the proposing
// shop's, attributed to it wherever a person or an agent reads them; with
// a permit or a shop's needs, the words are that shop's own manifest's,
// falling back to the type's when it writes none. For a need the user
// already holds, the checklist offers the line that replaces the
// credential with a new secret, never required and never done. The
// agent's view says whether a need is connected and never names a
// credential, which is the operator's.

import type { Credential, CredentialType } from "./credentials.js";
import type { Permit } from "./permits.js";
import type { Store } from "./store.js";

/** One need of a shop, as the town stands: its type, or null when the town no longer holds it, the user's live credentials of it, and the guidance shown with it. */
export interface NeedState {
  type: string;
  t: CredentialType | null;
  held: Credential[];
  /** The shop's own words for the need under its name, or the type's under its author's; null when neither has any. */
  said: string | null;
}

/** The shop's needs for `userName`, in manifest order; empty for a shop with none or not in the town. */
export function needStates(store: Store, shop: string, userName: string): NeedState[] {
  const user = store.userByName(userName);
  return (store.getShop(shop)?.manifest.credentials ?? []).map(({ type, guidance }) => {
    const t = store.getType(type);
    const own = (guidance ?? "").trim();
    return { type, t, held: user ? store.liveCredentials(user.id, type) : [], said: own === "" ? guidanceLine(t) : saying(shop, own) };
  });
}

/** Words under their author's name, on one line. */
const saying = (by: string, words: string) => `${by} says: ${words.trim().replace(/\s+/g, " ")}`;

/** Who wrote a type's guidance: the shop that proposed it, or the operator. */
export function guidanceBy(t: CredentialType): string {
  return t.proposedBy ?? "the operator";
}

/** A type's guidance as one line under its author's name, `dimitri/figma says: …`; null when it has none. */
export function guidanceLine(t: CredentialType | null): string | null {
  if (!t || t.guidance.trim() === "") return null;
  return saying(guidanceBy(t), t.guidance);
}

/**
 * A permit's needs as one cell, `; `-separated: `figma: proposed
 * (https://api.figma.com), none connected`, `figma: held, none connected`,
 * and, connected, the credential's id for the operator and `connected`
 * for the agent.
 */
export function needsText(states: readonly NeedState[], forAgent: boolean): string {
  return states
    .map(({ type, t, held }) => {
      if (!t) return `${type}: not in this town`;
      if (t.state === "proposed") return `${type}: proposed (${t.origin}), none connected`;
      if (held.length === 0) return `${type}: held, none connected`;
      return `${type}: ${forAgent ? "connected" : held.map((c) => c.id).join(",")}`;
    })
    .join("; ");
}

/** A shop's needs as `town hall show` and `search` say them: `needs figma (none connected)`; empty for a shop with none. */
export function needsPhrase(states: readonly NeedState[]): string {
  if (states.length === 0) return "";
  return `needs ${states.map((s) => `${s.type} (${s.held.length ? "connected" : "none connected"})`).join(", ")}`;
}

/** The heading of the lines that replace a credential the user holds with a new secret. */
export const INSTEAD = "or, to use a new secret instead:";

/** One thing to do: the exact command, and whether the town already shows it done. */
export interface Todo {
  done: boolean;
  line: string;
}

/**
 * What a person types to get the permit to a grant, in the order `permit
 * approve` checks it: for each need of a type a shop proposed, the type
 * approved and a credential added; for a need of the operator's type, a
 * credential when the user holds none; an `oauth` type approved with its
 * registration from $CLIENT_ID and $CLIENT_SECRET, and connected; then
 * above the approval, for each need the user holds, INSTEAD and the line
 * replacing each such credential, never done; then the approval, saying
 * the tests it runs first when the shop's tests have not run on its code.
 * A permit with nothing to do or offer but approval is that one line.
 */
export function todos(store: Store, permit: Permit): Todo[] {
  const out: Todo[] = [];
  const states = needStates(store, permit.shop, permit.userName);
  for (const { type, t, held } of states) {
    if (!t) {
      out.push({ done: false, line: `townd admin type add ${type} --origin <url> --header '<Name>: <value with {token}>'` });
    } else if (t.proposedBy !== null) {
      // An oauth type's registration is the operator's: its id and secret ride in the shell's names, as a token does.
      out.push({ done: t.state === "held", line: t.kind === "oauth" ? `printf '%s\\n' "$CLIENT_SECRET" | townd admin type approve ${type} --client-id "$CLIENT_ID"` : `townd admin type approve ${type}` });
    }
    if (!t || t.proposedBy !== null || held.length === 0) {
      out.push({ done: held.length > 0, line: credentialLine(t, type, permit.userName) });
    }
  }
  const instead = states.flatMap(({ type, t, held }) => held.map((c) => ({ done: false, line: `${credentialLine(t, type, permit.userName)} --replace ${c.id}` })));
  if (instead.length) out.push({ done: false, line: INSTEAD }, ...instead);
  const shop = store.getShop(permit.shop);
  const tests = shop && states.length && shop.testedAt === null ? shop.manifest.tests.length : 0;
  // The note rides as a shell comment, so the line runs as printed.
  const runs = tests ? `  # runs ${permit.shop}'s ${tests} test${tests === 1 ? "" : "s"} on ${states.length === 1 ? "it" : "them"} first` : "";
  out.push({ done: false, line: `townd admin permit approve ${permit.id}${runs}` });
  return out;
}

/** The line that gives the user a credential of the type: pasted for a `token` type, connected in a browser for an `oauth` one. */
export function credentialLine(t: CredentialType | null, type: string, userName: string): string {
  if (t?.kind === "oauth") return `townd admin credential connect --user ${userName} --type ${type} --label ${type}`;
  return `printf '%s\\n' "$TOKEN" | townd admin credential add --user ${userName} --type ${type} --label ${type}`;
}

/** The `to do:` block: every line with its done mark, or, for a refused approval, the lines that remain. */
export function todoBlock(store: Store, permit: Permit, remaining: boolean): string {
  const lines = todos(store, permit).filter((x) => !remaining || !x.done);
  return `to do:\n${lines.map((x) => `  ${x.done ? "done  " : "      "}${x.line}\n`).join("")}`;
}

/**
 * `permit show <id>`'s body below the permit's row: the shop's summary,
 * each need with its state, origin, header, guidance, and the user's
 * credential or none, then the `to do:` block; a decided permit has
 * nothing to do.
 */
export function checklist(store: Store, permit: Permit): string {
  const shop = store.getShop(permit.shop);
  const lines: string[] = [shop ? `${shop.name}: ${shop.manifest.summary}` : `${permit.shop}: not in this town`];
  const states = needStates(store, permit.shop, permit.userName);
  lines.push(states.length ? "needs:" : "needs: none");
  for (const s of states) {
    const { type, t, held } = s;
    if (!t) {
      lines.push(`  ${type}: not in this town`);
      continue;
    }
    lines.push(`  ${type}: ${t.state}, ${t.kind}, sent to ${t.origin} in ${t.header}`);
    if (t.oauth) lines.push(`    consent at ${t.oauth.authorize}, scopes ${t.oauth.scopes.join(", ")}`);
    if (s.said) lines.push(`    ${s.said}`);
    lines.push(`    ${held.length ? `${permit.userName}'s: ${held.map((c) => c.id).join(", ")}` : "none connected"}`);
  }
  const body = `${lines.join("\n")}\n`;
  if (permit.decision !== null) return `${body}to do: nothing; it was ${permit.decision}\n`;
  return body + todoBlock(store, permit, false);
}
