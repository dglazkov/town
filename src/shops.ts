// Shops, as rows: the latest manifest of each shop in the town, who
// published it, and when its tests last passed on its code. The store's
// methods of these names call here; a shop's files are on the store's
// shelf, src/shelf.ts, put there by src/publish.ts.

import type { Manifest } from "./manifest.js";
import { nullableNumber, type Store } from "./store.js";

export interface ShopRow {
  name: string;
  version: string;
  manifest: Manifest;
  addedAt: number;
  /** The user whose agent published it, by id; null for a shop the operator added, and the hall. */
  owner: string | null;
  /** That user's name; null when there is no owner. */
  ownerName: string | null;
  /** When its tests last passed on this code; null for a shop with needs published and not yet approved, so an approval runs them. */
  testedAt: number | null;
}

type Row = Record<string, unknown>;

const SHOP_SELECT = "SELECT s.*, u.name AS owner_name FROM shops s LEFT JOIN users u ON u.id = s.owner";

/**
 * Latest only: the row for `manifest.name`, with `owner` the publishing
 * user's id, or null for the operator's, and `testedAt` when its tests
 * passed on this code, or null when they have not run on it.
 */
export function upsertShop(store: Store, manifest: Manifest, now = Date.now(), owner: string | null = null, testedAt: number | null = now): void {
  store.sql.run(
    `INSERT INTO shops (name, version, manifest, added_at, owner, tested_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET version = excluded.version, manifest = excluded.manifest, added_at = excluded.added_at, owner = excluded.owner, tested_at = excluded.tested_at`,
    manifest.name, manifest.version, JSON.stringify(manifest), now, owner, testedAt,
  );
}

/** Records that the shop's tests passed on its code at `now`. */
export function markTested(store: Store, name: string, now = Date.now()): void {
  store.sql.run("UPDATE shops SET tested_at = ? WHERE name = ?", now, name);
}

export function getShop(store: Store, name: string): ShopRow | null {
  const row = store.sql.get<Row>(`${SHOP_SELECT} WHERE s.name = ?`, name);
  return row ? toShop(row) : null;
}

export function listShops(store: Store): ShopRow[] {
  return store.sql.all<Row>(`${SHOP_SELECT} ORDER BY s.name`).map(toShop);
}

export function removeShop(store: Store, name: string): boolean {
  return store.sql.run("DELETE FROM shops WHERE name = ?", name).changes > 0;
}

function toShop(r: Row): ShopRow {
  const owner = r.owner === null || r.owner === undefined ? null : String(r.owner);
  return {
    name: String(r.name),
    version: String(r.version),
    manifest: JSON.parse(String(r.manifest)) as Manifest,
    addedAt: Number(r.added_at),
    owner,
    ownerName: r.owner_name === null || r.owner_name === undefined ? null : String(r.owner_name),
    testedAt: nullableNumber(r.tested_at),
  };
}
