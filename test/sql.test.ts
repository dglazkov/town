// ring: checkout
// The sql seam's file driver (box's design, "The seams"): each of the five
// over a file, a transaction that fails on its second write leaving no row,
// and a named parameter refused before the query runs, since the box's
// driver binds positional parameters alone and SQLite binds a named one
// it was not given as null and says nothing. A word that only looks like
// a parameter, in a string or a comment, is not one.

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fileSql, namedParameter, type FileSql } from "../src/sql.js";

let dir: string;
let sql: FileSql;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "town-sql-test-"));
  sql = fileSql(path.join(dir, "t.db"));
  sql.exec("CREATE TABLE notes (id INTEGER PRIMARY KEY, key TEXT NOT NULL UNIQUE, body BLOB);");
});

afterEach(() => {
  sql.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("the five, over a file", () => {
  it("exec makes the tables of many statements, in the file it was given", () => {
    sql.exec("CREATE TABLE a (x TEXT); CREATE TABLE b (y TEXT);");
    expect(sql.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").map((r) => r.name)).toEqual(["a", "b", "notes"]);
    expect(existsSync(path.join(dir, "t.db"))).toBe(true);
  });

  it("run writes with positional parameters and says how many rows changed", () => {
    expect(sql.run("INSERT INTO notes (key, body) VALUES (?, ?)", "lunch", new Uint8Array([1, 2, 3]))).toEqual({ changes: 1 });
    expect(sql.run("INSERT INTO notes (key) VALUES (?), (?)", "a", "b")).toEqual({ changes: 2 });
    expect(sql.run("DELETE FROM notes WHERE key = ?", "nothing")).toEqual({ changes: 0 });
  });

  it("get reads one row, or undefined; all reads every row in order", () => {
    sql.run("INSERT INTO notes (key) VALUES (?), (?)", "b", "a");
    expect(sql.get("SELECT key FROM notes WHERE key = ?", "a")).toEqual({ key: "a" });
    expect(sql.get("SELECT key FROM notes WHERE key = ?", "c")).toBeUndefined();
    expect(sql.all("SELECT key FROM notes ORDER BY key")).toEqual([{ key: "a" }, { key: "b" }]);
    expect(sql.all("SELECT key FROM notes WHERE key = ?", "c")).toEqual([]);
  });

  it("keeps bytes as bytes, and a BLOB comes back as it went in", () => {
    const bytes = new Uint8Array([0, 255, 7]);
    sql.run("INSERT INTO notes (key, body) VALUES (?, ?)", "bytes", bytes);
    expect(Buffer.from(sql.get<{ body: Uint8Array }>("SELECT body FROM notes WHERE key = ?", "bytes")!.body)).toEqual(Buffer.from(bytes));
  });

  it("transaction commits what fn wrote and returns its value", () => {
    const out = sql.transaction(() => {
      sql.run("INSERT INTO notes (key) VALUES (?)", "one");
      sql.run("INSERT INTO notes (key) VALUES (?)", "two");
      return "done";
    });
    expect(out).toBe("done");
    expect(sql.all("SELECT key FROM notes ORDER BY id")).toEqual([{ key: "one" }, { key: "two" }]);
  });

  it("a transaction that fails on its second write leaves no row, and throws what failed", () => {
    expect(() =>
      sql.transaction(() => {
        sql.run("INSERT INTO notes (key) VALUES (?)", "first");
        sql.run("INSERT INTO notes (key) VALUES (?)", "first");
      }),
    ).toThrow(/UNIQUE/);
    expect(sql.all("SELECT * FROM notes")).toEqual([]);
    // And the file takes the next write.
    expect(sql.run("INSERT INTO notes (key) VALUES (?)", "after")).toEqual({ changes: 1 });
  });
});

describe("a named parameter", () => {
  it("is refused in all, get, and run, naming it, before the query runs", () => {
    for (const [query, name] of [["SELECT * FROM notes WHERE key = :key", ":key"], ["SELECT * FROM notes WHERE key = @key", "@key"], ["SELECT * FROM notes WHERE key = $key", "$key"]] as const) {
      expect(() => sql.all(query, "a"), query).toThrow(`the query names a parameter, ${name}; write ? and pass the values in order`);
      expect(() => sql.get(query, "a"), query).toThrow(`names a parameter, ${name}`);
    }
    expect(() => sql.run("INSERT INTO notes (key) VALUES (:key)", "never")).toThrow(/names a parameter, :key/);
    expect(sql.all("SELECT * FROM notes")).toEqual([]);
  });

  it("is not a word in a string, a quoted name, or a comment, and not ? itself", () => {
    expect(namedParameter("SELECT json_extract(x, '$.type') FROM t WHERE a = ?")).toBeNull();
    expect(namedParameter(`SELECT "a:b" FROM t -- :note\nWHERE c = ? /* @x */`)).toBeNull();
    expect(namedParameter("SELECT 'it''s :not' FROM t WHERE b = :yes")).toBe(":yes");
    expect(namedParameter("SELECT * FROM t WHERE a = ?1")).toBeNull();
    expect(sql.all("SELECT json_extract('{\"type\":\"x\"}', '$.type') AS t")).toEqual([{ t: "x" }]);
  });
});
