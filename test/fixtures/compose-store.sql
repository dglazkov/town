-- A store as compose left it: sqlite3 .dump of a data directory the town at
-- 77318d8 made, schema 3 as src/schema.ts wrote it there, with a user, a
-- pass, a grant, the memory shop, the seeded type, a sealed credential, and
-- four audit rows, one with a parent, for hall's migration test. Not a copy
-- of the new code: keep it as it was. The credential was sealed under the
-- key below (vault.key, as hex) and opens to compose-fixture-not-a-token;
-- both are a fixture's, not a secret.
-- vault.key: f2ec8deac821a05be5de2fc79ec04f8cf74fe16fd37ff404a6ef15a6ad7299c6
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
INSERT INTO users VALUES('user_a0c0a2795ff4af99','dimitri',1789264317374);
CREATE TABLE passes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  revoked_at INTEGER
);
INSERT INTO passes VALUES('pass_e4dca651fb4453dc','user_a0c0a2795ff4af99','research assistant','44b52c1adc10022224fbbf7c57d86ca7eacbea4909955cb7e1e9f900ae05fedb',1789264317730,NULL,NULL);
CREATE TABLE grants (
  id TEXT PRIMARY KEY,
  pass_id TEXT NOT NULL REFERENCES passes(id),
  shop TEXT NOT NULL,
  commands TEXT NOT NULL,
  constraints TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  revoked_at INTEGER
, credentials TEXT NOT NULL DEFAULT '{}');
INSERT INTO grants VALUES('grant_1034b03fbec81982','pass_e4dca651fb4453dc','town/memory','["remember","recall"]','{"remember.key":{"prefix":"notes/"}}',1789264317778,NULL,NULL,'{}');
CREATE TABLE shops (
  name TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  manifest TEXT NOT NULL,
  added_at INTEGER NOT NULL
);
INSERT INTO shops VALUES('town/memory','0.1.0','{"name":"town/memory","version":"0.1.0","summary":"Short notes, kept by key.","guidance":"Keys are paths, like `notes/lunch`, and a prefix such as `notes/`\ngathers the keys under it. A value is one line; a longer one comes on\nstdin.\n","runtime":"subprocess","entry":"./main.mjs","commands":[{"name":"remember","summary":"Store a value under a key.","effect":"write","args":[{"name":"key","type":"string","required":true,"doc":"A path-like key.","constrainable":["prefix","regex","max_length"]},{"name":"value","type":"string","doc":"The value. Reads stdin if omitted."}],"output":"text"},{"name":"recall","summary":"Print the value under a key.","effect":"read","args":[{"name":"key","type":"string","required":true,"constrainable":["prefix","regex"]}],"output":"text"},{"name":"list","summary":"List keys, optionally under a prefix.","effect":"read","args":[{"name":"prefix","type":"string","constrainable":["prefix"]}],"output":"text"},{"name":"forget","summary":"Delete a key.","effect":"destructive","args":[{"name":"key","type":"string","required":true,"constrainable":["prefix"]}],"output":"text"}],"tests":[{"name":"roundtrip","run":"remember --key t/a --value hello\nrecall --key t/a\n","expect":{"contains":"hello"}},{"name":"forget removes","run":"remember --key t/b --value x\nforget --key t/b\nrecall --key t/b\n","expect":{"exit":1}},{"name":"list under a prefix","run":"remember --key notes/lunch --value soup\nremember --key notes/dinner --value rice\nremember --key todo/call --value mom\nlist --prefix notes/\n","expect":{"equals":"notes/dinner\nnotes/lunch"}},{"name":"recall of a missing key fails","run":"recall --key never/set\n","expect":{"exit":1}},{"name":"a key outside the state is refused","run":"remember --key ../escape --value x\n","expect":{"exit":1}}]}',1789264317423);
CREATE TABLE calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  pass_id TEXT,
  grant_id TEXT,
  shop TEXT,
  command TEXT,
  argv_hash TEXT NOT NULL,
  result TEXT NOT NULL,
  exit INTEGER NOT NULL,
  shop_exit INTEGER,
  latency_ms INTEGER NOT NULL,
  notices TEXT NOT NULL,
  stderr TEXT,
  detail TEXT
, credentials TEXT NOT NULL DEFAULT '[]', call_id TEXT, parent TEXT);
INSERT INTO calls VALUES(1,1789300000000,'pass_e4dca651fb4453dc','grant_1034b03fbec81982','town/memory','remember','hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh','ok',0,0,4,'[]','',NULL,'[]','call_00000000000000a1',NULL);
INSERT INTO calls VALUES(2,1789300000100,'pass_e4dca651fb4453dc','grant_1034b03fbec81982','town/memory','recall','hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh','ok',0,0,4,'[]','',NULL,'[]','call_00000000000000a3','call_00000000000000a2');
INSERT INTO calls VALUES(3,1789300000200,'pass_e4dca651fb4453dc',NULL,'test/recipe','run','hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh','ok',0,0,4,'[]','',NULL,'[]','call_00000000000000a2',NULL);
INSERT INTO calls VALUES(4,1789300000300,'pass_e4dca651fb4453dc','grant_1034b03fbec81982','town/memory','forget','hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh','denied',2,NULL,4,'[]',NULL,'command','[]','call_00000000000000a4',NULL);
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO meta VALUES('schema','3');
CREATE TABLE credential_types (
  name TEXT PRIMARY KEY,
  origin TEXT NOT NULL,
  header TEXT NOT NULL,
  added_at INTEGER NOT NULL
);
INSERT INTO credential_types VALUES('github-token','https://api.github.com','Authorization: Bearer {token}',1789264317373);
CREATE TABLE credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  sealed BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);
INSERT INTO credentials VALUES('credential_5827672da5fc655b','user_a0c0a2795ff4af99','github-token','dimitri''s PAT',X'e1cdfffa683619a5e3444a623bd47c87c2620fbe126d0d77654088a72f04774d91356e76859db214d1ae4172fb104ddf6a2003516e6a5f',1789264317828,NULL);
INSERT INTO sqlite_sequence VALUES('calls',4);
CREATE INDEX calls_pass ON calls(pass_id, at);
CREATE INDEX calls_grant ON calls(grant_id, at);
CREATE INDEX credentials_user ON credentials(user_id, type);
CREATE UNIQUE INDEX calls_call_id ON calls(call_id);
CREATE INDEX calls_parent ON calls(parent);
COMMIT;
