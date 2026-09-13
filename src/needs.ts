// Needs: a manifest's `credentials`, the credential types a shop calls
// through (spec §8), and the validator's rules for them. The manifest's
// validator calls here; every refusal is in its shape.

import { describe, isRecord, refusal } from "./manifest.js";

const NEED_FIELDS = ["type"];

/** `credentials`: a list of `{ type }`, one per type, each a type the town holds (spec §8). */
export function validateNeeds(needs: unknown, types: readonly string[] | undefined, out: string[]): void {
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
    for (const key of Object.keys(n)) {
      if (!NEED_FIELDS.includes(key)) out.push(refusal(`${at}.${key}`, "is not a need field", `only ${NEED_FIELDS.join(", ")}`, 8));
    }
    if (typeof n.type !== "string" || n.type === "") {
      out.push(refusal(`${at}.type`, describe(n.type, "a type name"), "a type like github-token", 8));
      return;
    }
    if (seen.has(n.type)) {
      out.push(refusal(`${at}.type`, `repeats the type ${n.type}`, "each type once", 8));
      return;
    }
    seen.add(n.type);
    if (types === undefined) {
      out.push(refusal(`${at}.type`, `'${n.type}' cannot be checked with no data directory at hand`, "the verb again with --data <dir>, so the town's types are read,", 8));
    } else if (!types.includes(n.type)) {
      out.push(refusal(`${at}.type`, `'${n.type}' is not a type this town holds`, `one of (${types.join(", ")})`, 8));
    }
  });
}
