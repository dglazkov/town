-- A store as vault left it: sqlite3 .dump of a data directory the town at
-- 3c5422c made, with a user, a pass, a grant, the memory shop, the seeded
-- type, a sealed credential, and three audit rows, for compose's migration
-- test. Not a copy of the new code: keep it as it was. The credential was
-- sealed under the key below (vault.key, as hex) and opens to
-- vault-fixture-not-a-token; both are a fixture's, not a secret.
-- vault.key: 238353786333f57de5c4838c94a0095f595a146970cc7b1989041cbe4414efa4
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
INSERT INTO users VALUES('user_77d9a83d236eb0ef','dimitri',1789254656849);
CREATE TABLE passes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  revoked_at INTEGER
);
INSERT INTO passes VALUES('pass_a648d98fa018fc7c','user_77d9a83d236eb0ef','research assistant','fe26de33b1391d22df4027af83ec3d5f48a0a47be7d65384e9d2f2005605dd0b',1789254657301,NULL,NULL);
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
INSERT INTO grants VALUES('grant_030cbc25002da6c4','pass_a648d98fa018fc7c','town/memory','["remember","recall"]','{"remember.key":{"prefix":"notes/"}}',1789254657359,NULL,NULL,'{}');
CREATE TABLE shops (
  name TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  manifest TEXT NOT NULL,
  added_at INTEGER NOT NULL
);
INSERT INTO shops VALUES('town/memory','0.1.0','{"name":"town/memory","version":"0.1.0","summary":"Short notes, kept by key.","guidance":"Keys are paths, like `notes/lunch`, and a prefix such as `notes/`\ngathers the keys under it. A value is one line; a longer one comes on\nstdin.\n","runtime":"subprocess","entry":"./main.mjs","commands":[{"name":"remember","summary":"Store a value under a key.","effect":"write","args":[{"name":"key","type":"string","required":true,"doc":"A path-like key.","constrainable":["prefix","regex","max_length"]},{"name":"value","type":"string","doc":"The value. Reads stdin if omitted."}],"output":"text"},{"name":"recall","summary":"Print the value under a key.","effect":"read","args":[{"name":"key","type":"string","required":true,"constrainable":["prefix","regex"]}],"output":"text"},{"name":"list","summary":"List keys, optionally under a prefix.","effect":"read","args":[{"name":"prefix","type":"string","constrainable":["prefix"]}],"output":"text"},{"name":"forget","summary":"Delete a key.","effect":"destructive","args":[{"name":"key","type":"string","required":true,"constrainable":["prefix"]}],"output":"text"}],"tests":[{"name":"roundtrip","run":"remember --key t/a --value hello\nrecall --key t/a\n","expect":{"contains":"hello"}},{"name":"forget removes","run":"remember --key t/b --value x\nforget --key t/b\nrecall --key t/b\n","expect":{"exit":1}},{"name":"list under a prefix","run":"remember --key notes/lunch --value soup\nremember --key notes/dinner --value rice\nremember --key todo/call --value mom\nlist --prefix notes/\n","expect":{"equals":"notes/dinner\nnotes/lunch"}},{"name":"recall of a missing key fails","run":"recall --key never/set\n","expect":{"exit":1}},{"name":"a key outside the state is refused","run":"remember --key ../escape --value x\n","expect":{"exit":1}}]}',1789254656956);
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
, credentials TEXT NOT NULL DEFAULT '[]');
INSERT INTO calls VALUES(1,1789254657402,'pass_a648d98fa018fc7c','grant_030cbc25002da6c4','town/memory','remember','f8676f2fa47538c6b643534fc0af0ba73f5992fc364acd65983396bdb4ca0603','ok',0,0,27,'[]','',NULL,'[]');
INSERT INTO calls VALUES(2,1789254657474,'pass_a648d98fa018fc7c','grant_030cbc25002da6c4','town/memory','recall','9540c423cf5bd2c6f10798303d211f1f5f6a71be0fa9dc6ba178cc06bae3a19c','ok',0,0,26,'[]','',NULL,'[]');
INSERT INTO calls VALUES(3,1789254657543,'pass_a648d98fa018fc7c','grant_030cbc25002da6c4','town/memory','forget','62a53eda366347450319bd988cbc6f71d272cf47c7eae32bce3ee347c1c1061b','denied',2,NULL,0,'[]',NULL,'command','[]');
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO meta VALUES('schema','2');
INSERT INTO meta VALUES('address','http://127.0.0.1:61110');
CREATE TABLE credential_types (
  name TEXT PRIMARY KEY,
  origin TEXT NOT NULL,
  header TEXT NOT NULL,
  added_at INTEGER NOT NULL
);
INSERT INTO credential_types VALUES('github-token','https://api.github.com','Authorization: Bearer {token}',1789254655342);
CREATE TABLE credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  sealed BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);
INSERT INTO credentials VALUES('credential_8022cf4f70caccdb','user_77d9a83d236eb0ef','github-token','dimitri''s PAT',X'1c800f0b9928d0cc9fdf230d2704cc6920244dce0c8156d89d9ef2ddc10ce57484bfa383e6b23d21c60dd6f9a7e082a467ac98f06d',1789254656902,NULL);
INSERT INTO sqlite_sequence VALUES('calls',3);
CREATE INDEX calls_pass ON calls(pass_id, at);
CREATE INDEX calls_grant ON calls(grant_id, at);
CREATE INDEX credentials_user ON credentials(user_id, type);
COMMIT;
