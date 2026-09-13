-- A store as hall left it: sqlite3 .dump of a data directory the town at
-- 4a8e89c made, schema 4 as src/schema.ts wrote it there, by townd serve
-- and townd admin: the memory shop, a user, a sealed credential, a pass
-- with a hall grant and a memory grant, calls at memory (one denied), a
-- publish of dimitri/todo with its tests' two calls under it, a call of
-- the published shop with its own call under it, a request, and its
-- pending permit, for wall's migration test. Not a copy of the new code:
-- keep it as it was. The credential was sealed under the key below
-- (vault.key, as hex) and opens to hall-fixture-not-a-token; both are a
-- fixture's, not a secret.
-- vault.key: 8b8c67704d13fc851c68a531792f23fcac239a50026a1d1af4158bcb3ddbf003
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
INSERT INTO users VALUES('user_d181158b7b9243df','dimitri',1789277122783);
CREATE TABLE passes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  revoked_at INTEGER
);
INSERT INTO passes VALUES('pass_1f3bbc75032b5b4e','user_d181158b7b9243df','the agent','e06f6bf05bcac683733ab014611ef6cd0cfc74ee53f74f994971ee94d639010f',1789277122896,NULL,NULL);
CREATE TABLE grants (
  id TEXT PRIMARY KEY,
  pass_id TEXT NOT NULL REFERENCES passes(id),
  shop TEXT NOT NULL,
  commands TEXT NOT NULL,
  constraints TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  revoked_at INTEGER
, credentials TEXT NOT NULL DEFAULT '{}', source TEXT);
INSERT INTO grants VALUES('grant_262494c4abbc02ce','pass_1f3bbc75032b5b4e','town/hall','["search","show","spec","validate","test","publish","request","requests"]','{}',1789277122952,NULL,NULL,'{}',NULL);
INSERT INTO grants VALUES('grant_61227cb5681825ee','pass_1f3bbc75032b5b4e','town/memory','["remember","recall","list"]','{"remember.key":{"prefix":"notes/"}}',1789277123006,NULL,NULL,'{}',NULL);
INSERT INTO grants VALUES('grant_4eb197dc2c06d47f','pass_1f3bbc75032b5b4e','dimitri/todo','["add","list"]','{}',1789277123582,NULL,NULL,'{}','publish');
CREATE TABLE shops (
  name TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  manifest TEXT NOT NULL,
  added_at INTEGER NOT NULL
, owner TEXT);
INSERT INTO shops VALUES('town/hall','0.1.0','{"name":"town/hall","version":"0.1.0","summary":"Where the town''s shops are found, made, and asked for.","guidance":"A shop is a directory holding a manifest.yaml and the entry it names;\nthe manifest specification, printed here, is the whole of how to\nwrite one. A shop travels on stdin as a tar of its directory, made\nwith `tar --format ustar -cf - -C <dir> .`. A shop you put in the\ntown is named `<your user>/<shop>`, declares no credentials of its\nown, and its tests run as you: at the shops it depends on, with your\ngrants. What your grants do not allow, ask for; a person decides at\nthe box, and `town --help` shows the answer.\n","runtime":"town","entry":"src/hall.ts","commands":[{"name":"search","summary":"List the town''s shops, and which you hold.","effect":"read","args":[{"name":"query","type":"string","doc":"A word of a name or summary; every shop when omitted."}],"output":"text"},{"name":"show","summary":"Print a shop''s help as a full grant would read it.","effect":"read","args":[{"name":"shop","type":"string","required":true,"doc":"A full name, like town/memory.","constrainable":["equals","one_of","prefix"]}],"output":"text"},{"name":"spec","summary":"Print the manifest specification.","effect":"read","output":"text"},{"name":"validate","summary":"Check a shop on stdin against the specification and this town, and say what to fix.","effect":"read","output":"text"},{"name":"test","summary":"Check a shop on stdin and run its tests as you, keeping nothing.","effect":"write","output":"text"},{"name":"publish","summary":"Check and test a shop on stdin, keep it under your name, and hold a grant at it.","effect":"write","output":"text"},{"name":"request","summary":"Ask for a grant at a shop, or a wider one; a person decides.","effect":"write","args":[{"name":"shop","type":"string","required":true,"doc":"A full name, like town/memory.","constrainable":["equals","one_of","prefix"]},{"name":"commands","type":"string","doc":"Comma-separated, every one you want at the shop: an approved request replaces the grant you hold there. Every command when omitted."},{"name":"constraint","type":"string","doc":"Limits you propose, `;`-separated, each `<command>.<arg> <kind> <value>`."},{"name":"why","type":"string","doc":"One line a person reads.","constrainable":["max_length"]}],"output":"text"},{"name":"requests","summary":"List what you asked for and what became of each.","effect":"read","output":"text"}],"tests":[{"name":"the specification prints","run":"spec","expect":{"contains":"# Shop manifest v0"}},{"name":"a search lists the hall","run":"search --query hall","expect":{"contains":"town/hall"}}]}',1789277107223,NULL);
INSERT INTO shops VALUES('town/memory','0.1.0','{"name":"town/memory","version":"0.1.0","summary":"Short notes, kept by key.","guidance":"Keys are paths, like `notes/lunch`, and a prefix such as `notes/`\ngathers the keys under it. A value is one line; a longer one comes on\nstdin.\n","runtime":"subprocess","entry":"./main.mjs","commands":[{"name":"remember","summary":"Store a value under a key.","effect":"write","args":[{"name":"key","type":"string","required":true,"doc":"A path-like key.","constrainable":["prefix","regex","max_length"]},{"name":"value","type":"string","doc":"The value. Reads stdin if omitted."}],"output":"text"},{"name":"recall","summary":"Print the value under a key.","effect":"read","args":[{"name":"key","type":"string","required":true,"constrainable":["prefix","regex"]}],"output":"text"},{"name":"list","summary":"List keys, optionally under a prefix.","effect":"read","args":[{"name":"prefix","type":"string","constrainable":["prefix"]}],"output":"text"},{"name":"forget","summary":"Delete a key.","effect":"destructive","args":[{"name":"key","type":"string","required":true,"constrainable":["prefix"]}],"output":"text"}],"tests":[{"name":"roundtrip","run":"remember --key t/a --value hello\nrecall --key t/a\n","expect":{"contains":"hello"}},{"name":"forget removes","run":"remember --key t/b --value x\nforget --key t/b\nrecall --key t/b\n","expect":{"exit":1}},{"name":"list under a prefix","run":"remember --key notes/lunch --value soup\nremember --key notes/dinner --value rice\nremember --key todo/call --value mom\nlist --prefix notes/\n","expect":{"equals":"notes/dinner\nnotes/lunch"}},{"name":"recall of a missing key fails","run":"recall --key never/set\n","expect":{"exit":1}},{"name":"a key outside the state is refused","run":"remember --key ../escape --value x\n","expect":{"exit":1}}]}',1789277122476,NULL);
INSERT INTO shops VALUES('dimitri/todo','0.1.0','{"name":"dimitri/todo","version":"0.1.0","summary":"Things to do, kept in the town''s notes.","runtime":"subprocess","entry":"./main.mjs","depends":[{"shop":"town/memory","commands":["remember","list"]}],"commands":[{"name":"add","summary":"Add an item.","effect":"write","args":[{"name":"item","type":"string","required":true,"doc":"One word."}],"output":"text"},{"name":"list","summary":"Show every item.","effect":"read","output":"text"}],"tests":[{"name":"an added item is listed","run":"add --item milk\nlist\n","expect":{"contains":"notes/todo/milk"}}]}',1789277123582,'user_d181158b7b9243df');
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
INSERT INTO calls VALUES(1,1789277123393,'pass_1f3bbc75032b5b4e','grant_61227cb5681825ee','town/memory','remember','3f49ad9d80de9bc6481572241d0047e57d5fe4eb18dfc9ac40b2c37a73604aaf','ok',0,0,29,'[]','',NULL,'[]','call_1da0fea61473b8b9',NULL);
INSERT INTO calls VALUES(2,1789277123468,'pass_1f3bbc75032b5b4e','grant_61227cb5681825ee','town/memory','recall','669c9c6002a2b1e0ce5b630783e6cece934456eb4da15eb9f3c9ae159641e3b9','ok',0,0,23,'[]','',NULL,'[]','call_3ec08c7dffa92847',NULL);
INSERT INTO calls VALUES(3,1789277123533,'pass_1f3bbc75032b5b4e','grant_61227cb5681825ee','town/memory','forget','d03c0c09eb437524aca5f12881039a00f57ee4c47de32c1a935832cfd5fd8c5b','denied',2,NULL,0,'[]',NULL,'command','[]','call_57db223beb5eeb41',NULL);
INSERT INTO calls VALUES(4,1789277123582,'pass_1f3bbc75032b5b4e','grant_61227cb5681825ee','town/memory','remember','b6541b499c964fd2dc91d9d2e63ceabf4c01c9b64d471f1bac04d9169e4ded60','ok',0,0,27,'[]','',NULL,'[]','call_be96ff97e1d576a3','call_870c75345727b30e');
INSERT INTO calls VALUES(5,1789277123582,'pass_1f3bbc75032b5b4e','grant_61227cb5681825ee','town/memory','list','9970cc1578302ee31871c95b7d850418994cd7fdea7af78712c0675af44db650','ok',0,0,27,'[]','',NULL,'[]','call_a097f582df21c1bb','call_870c75345727b30e');
INSERT INTO calls VALUES(6,1789277123582,'pass_1f3bbc75032b5b4e','grant_262494c4abbc02ce','town/hall','publish','41fcd3c33933410621c540d82db535602955a9ba0545ff5861c1d5bb96fe3382','ok',0,NULL,570,'[]',NULL,'published dimitri/todo 0.1.0','[]','call_870c75345727b30e',NULL);
INSERT INTO calls VALUES(7,1789277124403,'pass_1f3bbc75032b5b4e','grant_61227cb5681825ee','town/memory','remember','1bc9f3faae290d6f0af5ad6fecd11dce41d023a31f12b32393bce5b48e0a8cd6','ok',0,0,26,'[]','',NULL,'[]','call_1078cb69b3c399b5','call_a1e8690f4bb38db5');
INSERT INTO calls VALUES(8,1789277124195,'pass_1f3bbc75032b5b4e','grant_4eb197dc2c06d47f','dimitri/todo','add','57868666bcc1ba8971e3b3f9052a929f8b55fbbb634e9d63ba866533aded0e53','ok',0,0,241,'[]','',NULL,'[]','call_a1e8690f4bb38db5',NULL);
INSERT INTO calls VALUES(9,1789277124480,'pass_1f3bbc75032b5b4e','grant_262494c4abbc02ce','town/hall','request','0506504912ae8feea06f39b17d2d4bd9ad8d05861351f56068b9be62e10c95eb','ok',0,NULL,1,'[]',NULL,'requested prm_629de8040307537d','[]','call_f3bbfd4d53707a59',NULL);
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO meta VALUES('schema','4');
INSERT INTO meta VALUES('address','http://127.0.0.1:58736');
CREATE TABLE credential_types (
  name TEXT PRIMARY KEY,
  origin TEXT NOT NULL,
  header TEXT NOT NULL,
  added_at INTEGER NOT NULL
);
INSERT INTO credential_types VALUES('github-token','https://api.github.com','Authorization: Bearer {token}',1789277107223);
CREATE TABLE credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  sealed BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);
INSERT INTO credentials VALUES('credential_1328a2ab850bca9b','user_d181158b7b9243df','github-token','dimitri''s PAT',X'50ee4ce4e90a9fd06ed4c004f839316962053ca8e4f071a0824f59de3c434acce9fa4749d65b28755f770c685ef96708d1bbf170',1789277122839,NULL);
CREATE TABLE permits (
  id TEXT PRIMARY KEY,
  pass_id TEXT NOT NULL REFERENCES passes(id),
  shop TEXT NOT NULL,
  commands TEXT NOT NULL,
  constraints TEXT NOT NULL,
  why TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  decided_at INTEGER,
  decision TEXT,
  grant_id TEXT
);
INSERT INTO permits VALUES('prm_629de8040307537d','pass_1f3bbc75032b5b4e','town/memory','["forget"]','{}','to clear finished items',1789277124480,NULL,NULL,NULL);
INSERT INTO sqlite_sequence VALUES('calls',9);
CREATE INDEX calls_pass ON calls(pass_id, at);
CREATE INDEX calls_grant ON calls(grant_id, at);
CREATE INDEX credentials_user ON credentials(user_id, type);
CREATE UNIQUE INDEX calls_call_id ON calls(call_id);
CREATE INDEX calls_parent ON calls(parent);
CREATE INDEX permits_pass ON permits(pass_id, created_at);
CREATE UNIQUE INDEX permits_pending ON permits(pass_id, shop) WHERE decision IS NULL;
COMMIT;
