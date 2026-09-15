// The vault: every credential's value sealed under one key in
// <data>/vault.key, AES-256-GCM with a fresh nonce per row and the
// credential's id as associated data, so a row moved to another id does
// not open. The sealed form, in `credentials.sealed`, is a BLOB of
// nonce(12) || ciphertext || tag(16). The key is 32 random bytes, made
// with mode 600 by the first verb that needs it. It is a seatbelt on one
// box, not a boundary: whoever reads the directory reads the key. The
// store takes the key from a source: `fileKey`, the file, on a laptop.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { closeSync, openSync, readFileSync, writeSync } from "node:fs";
import path from "node:path";

export const KEY_FILE = "vault.key";
export const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

/** A refusal about the vault, one line, printable as it is; never holds a value. */
export class VaultError extends Error {}

export function keyPath(dataDir: string): string {
  return path.join(path.resolve(dataDir), KEY_FILE);
}

/** Seals `value` for the credential `id`. */
export function sealCredential(key: Buffer, id: string, value: string): Buffer {
  checkKey(key);
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(id, "utf8"));
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([nonce, body, cipher.getAuthTag()]);
}

/** Opens a row sealed for the credential `id`; throws VaultError when the key, the id, or a byte is wrong. */
export function openCredential(key: Buffer, id: string, sealed: Uint8Array): string {
  checkKey(key);
  const row = Buffer.from(sealed);
  if (row.length < NONCE_BYTES + TAG_BYTES) throw new VaultError(`credential ${id} does not open: its sealed row is too short`);
  const nonce = row.subarray(0, NONCE_BYTES);
  const tag = row.subarray(row.length - TAG_BYTES);
  const body = row.subarray(NONCE_BYTES, row.length - TAG_BYTES);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, nonce, { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(id, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    throw new VaultError(`credential ${id} does not open under this vault's key: the row, its id, or the key is not the one it was sealed with`);
  }
}

function checkKey(key: Buffer): void {
  if (key.length !== KEY_BYTES) throw new VaultError(`a vault key is ${KEY_BYTES} bytes, not ${key.length}`);
}

/** The key at <data>/vault.key, or null when there is no file. A file of the wrong size is refused. */
export function readKey(dataDir: string): Buffer | null {
  return readKeyFile(keyPath(dataDir), "a vault key", "restore the key this data directory was sealed with");
}

/** The key in `file`, or null when there is no file; a file of the wrong size is refused as not `what`, saying what to do: `fix`. */
export function readKeyFile(file: string, what: string, fix: string): Buffer | null {
  let key: Buffer;
  try {
    key = readFileSync(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new VaultError(`${file} cannot be read: ${(err as NodeJS.ErrnoException).code ?? "unknown error"}`);
  }
  if (key.length !== KEY_BYTES) throw new VaultError(`${file} is ${key.length} bytes, not the ${KEY_BYTES} of ${what}; ${fix}`);
  return key;
}

/** The key, made on first need: 32 random bytes written with mode 600, or the file already there. */
export function ensureKey(dataDir: string): Buffer {
  const file = keyPath(dataDir);
  let fd: number;
  try {
    fd = openSync(file, "wx", 0o600);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") return readKey(dataDir)!;
    throw err;
  }
  try {
    const key = randomBytes(KEY_BYTES);
    writeSync(fd, key);
    return key;
  } finally {
    closeSync(fd);
  }
}

/**
 * The key when there is one; null when there is none and nothing is
 * sealed. A data directory whose credentials table has rows and whose key
 * is missing is refused, by `townd admin` and `townd serve` alike.
 */
export function requireKey(dataDir: string, sealedRows: number): Buffer | null {
  const key = readKey(dataDir);
  if (key === null && sealedRows > 0) {
    throw new VaultError(
      `${keyPath(dataDir)} is missing, and the credentials table has ${sealedRows} row${sealedRows === 1 ? "" : "s"} sealed by it; restore the key file that came with this data directory`,
    );
  }
  return key;
}

/** Where the store takes the vault's key from: on a laptop, the file under the data directory. */
export interface KeySource {
  /** The key, or null when there is none. */
  read(): Buffer | null;
  /** The key, made on first need where the source makes one. */
  ensure(): Buffer;
  /** The key, or null when there is none and nothing is sealed; refused when `sealedRows` are sealed by a key that is missing. */
  require(sealedRows: number): Buffer | null;
}

/** The key at <data>/vault.key, as `readKey`, `ensureKey`, and `requireKey` read and make it. */
export function fileKey(dataDir: string): KeySource {
  return {
    read: () => readKey(dataDir),
    ensure: () => ensureKey(dataDir),
    require: (sealedRows) => requireKey(dataDir, sealedRows),
  };
}
