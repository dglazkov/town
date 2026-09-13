// ring: checkout
// The vault: a value sealed for one credential id opens under the same key
// and id and nothing else, the key file is made with mode 600 on first
// need, and a data directory with sealed rows and no key is refused.

import { mkdtempSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer } from "../src/server.js";
import { openStore } from "../src/store.js";
import { KEY_BYTES, VaultError, ensureKey, keyPath, openCredential, readKey, requireKey, sealCredential } from "../src/vault.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "town-vault-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const VALUE = "ghp_not_a_real_token_0123456789";

describe("sealing", () => {
  it("opens what it sealed, under the same key and id", () => {
    const key = ensureKey(dir);
    const sealed = sealCredential(key, "credential_a", VALUE);
    expect(openCredential(key, "credential_a", sealed)).toBe(VALUE);
    expect(sealed.includes(Buffer.from(VALUE))).toBe(false);
    expect(sealed.length).toBe(12 + Buffer.byteLength(VALUE) + 16);
  });

  it("seals with a fresh nonce each time", () => {
    const key = ensureKey(dir);
    expect(sealCredential(key, "credential_a", VALUE).equals(sealCredential(key, "credential_a", VALUE))).toBe(false);
  });

  it("refuses to open a row under another credential's id", () => {
    const key = ensureKey(dir);
    const sealed = sealCredential(key, "credential_a", VALUE);
    expect(() => openCredential(key, "credential_b", sealed)).toThrow(VaultError);
  });

  it("refuses a row with any one byte flipped, nonce, body, or tag", () => {
    const key = ensureKey(dir);
    const sealed = sealCredential(key, "credential_a", VALUE);
    for (const i of [0, 11, 12, sealed.length - 17, sealed.length - 16, sealed.length - 1]) {
      const bad = Buffer.from(sealed);
      bad[i] = bad[i]! ^ 0x01;
      expect(() => openCredential(key, "credential_a", bad), `byte ${i}`).toThrow(VaultError);
    }
  });

  it("refuses a row under another key, and never says the value", () => {
    const sealed = sealCredential(ensureKey(dir), "credential_a", VALUE);
    const other = Buffer.alloc(KEY_BYTES, 7);
    const err = (() => {
      try {
        openCredential(other, "credential_a", sealed);
        return null;
      } catch (e) {
        return e as Error;
      }
    })();
    expect(err).toBeInstanceOf(VaultError);
    expect(err!.message).not.toContain(VALUE);
  });
});

describe("the key file", () => {
  it("is made on first need with mode 600, 32 bytes, and read back the same after", () => {
    expect(readKey(dir)).toBeNull();
    const key = ensureKey(dir);
    const st = statSync(keyPath(dir));
    expect(st.mode & 0o777).toBe(0o600);
    expect(st.size).toBe(KEY_BYTES);
    expect(ensureKey(dir).equals(key)).toBe(true);
    expect(readKey(dir)!.equals(key)).toBe(true);
    expect(keyPath(dir)).toBe(path.join(dir, "vault.key"));
  });

  it("is refused when it is not 32 bytes", () => {
    writeFileSync(keyPath(dir), Buffer.alloc(16), { mode: 0o600 });
    expect(() => readKey(dir)).toThrow(/is 16 bytes, not the 32 of a vault key/);
    expect(() => ensureKey(dir)).toThrow(VaultError);
  });
});

describe("the missing key", () => {
  function storeWithOneCredential(): void {
    const store = openStore(dir);
    store.addUser("dimitri");
    store.addCredential({ userName: "dimitri", type: "github-token", label: "", value: VALUE }, ensureKey(dir));
    store.close();
  }

  it("is no refusal while nothing is sealed", () => {
    const store = openStore(dir);
    expect(requireKey(dir, store.sealedRows())).toBeNull();
    store.close();
  });

  it("is refused in one line naming <data>/vault.key when the credentials table has rows", () => {
    storeWithOneCredential();
    unlinkSync(keyPath(dir));
    const store = openStore(dir);
    const err = (() => {
      try {
        requireKey(dir, store.sealedRows());
        return null;
      } catch (e) {
        return e as Error;
      } finally {
        store.close();
      }
    })();
    expect(err).toBeInstanceOf(VaultError);
    expect(err!.message).not.toContain("\n");
    expect(err!.message).toBe(`${path.join(dir, "vault.key")} is missing, and the credentials table has 1 row sealed by it; restore the key file that came with this data directory`);
  });

  it("stops townd serve from starting", async () => {
    storeWithOneCredential();
    unlinkSync(keyPath(dir));
    await expect(startServer({ dataDir: dir, port: 0, wall: "none" })).rejects.toThrow(/vault\.key is missing, and the credentials table has 1 row/);
  });
});
