-- A store as consent left it: sqlite3 .dump of a data directory the town at
-- 51883e9 (consent's code, with src/store.ts split along its nouns and
-- nothing else changed) made, schema 6 as src/schema.ts wrote it there, by
-- townd admin, townd serve, and town, walled by seatbelt: the memory shop,
-- a user, a github-token credential replaced by a second (the first revoked,
-- replaced by), an oauth type held with its registration sealed, a pass with
-- a hall grant and a memory grant, calls at memory (one denied), a publish
-- of dimitri/figma whose need proposes the figma type (its tests waiting,
-- tested_at null) with its pending permit, and a request with its pending
-- permit, for box's migration test. Made by the script in the message of
-- the commit that added it. Not a copy of the new code: keep it as it
-- was. The credentials were sealed under the key below (vault.key, as
-- hex): the live one opens to consent-fixture-replacement, the
-- registration's secret is consent-fixture-client-secret; all a
-- fixture's, not a secret.
-- vault.key: c08d3749103f1bf8c466144f8ecb75bcfa8051349e38cbdd1148f550c0b32cd3
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
INSERT INTO users VALUES('user_162f8494919055b4','dimitri',1789337968846);
CREATE TABLE passes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  revoked_at INTEGER
);
INSERT INTO passes VALUES('pass_c9f213fa073ad454','user_162f8494919055b4','consent fixture','c4e667163e81a8ffbb76a720e5126c71f33acd829be2100d3894e8f1975c8073',1789337969090,NULL,NULL);
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
INSERT INTO grants VALUES('grant_4364d04ae675ae4b','pass_c9f213fa073ad454','town/hall','["search","show","spec","validate","test","publish","request","requests"]','{}',1789337969153,NULL,NULL,'{}',NULL);
INSERT INTO grants VALUES('grant_a7ed5893883851d2','pass_c9f213fa073ad454','town/memory','["remember","recall","list"]','{}',1789337969214,NULL,NULL,'{}',NULL);
CREATE TABLE shops (
  name TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  manifest TEXT NOT NULL,
  added_at INTEGER NOT NULL
, owner TEXT, tested_at INTEGER);
INSERT INTO shops VALUES('town/hall','0.1.0','{"name":"town/hall","version":"0.1.0","summary":"Where the town''s shops are found, made, and asked for.","guidance":"A shop is a directory holding a manifest.yaml and the entry it names;\nthe manifest specification, printed here, is the whole of how to\nwrite one. A shop travels on stdin as a tar of its directory, made\nwith `tar --format ustar -cf - -C <dir> .`. A shop you put in the\ntown is named `<your user>/<shop>`, and its tests run as you: at the\nshops it depends on, with your grants. A shop that needs a credential\nmay propose its type, and waits for a person: its tests run, and a\ngrant at it is made, when they approve at the box. Tell them what its\nguidance says. What your grants do not allow, ask for; a person\ndecides at the box, and `town --help` shows the answer.\n","runtime":"town","entry":"src/hall.ts","commands":[{"name":"search","summary":"List the town''s shops, and which you hold.","effect":"read","args":[{"name":"query","type":"string","doc":"A word of a name or summary; every shop when omitted."}],"output":"text"},{"name":"show","summary":"Print a shop''s help as a full grant would read it.","effect":"read","args":[{"name":"shop","type":"string","required":true,"doc":"A full name, like town/memory.","constrainable":["equals","one_of","prefix"]}],"output":"text"},{"name":"spec","summary":"Print the manifest specification.","effect":"read","output":"text"},{"name":"validate","summary":"Check a shop on stdin against the specification and this town, and say what to fix.","effect":"read","output":"text"},{"name":"test","summary":"Check a shop on stdin and run its tests as you, keeping nothing.","effect":"write","output":"text"},{"name":"publish","summary":"Check and test a shop on stdin, keep it under your name, and hold a grant at it, or ask for one when it needs a credential.","effect":"write","output":"text"},{"name":"request","summary":"Ask for a grant at a shop, or a wider one; a person decides.","effect":"write","args":[{"name":"shop","type":"string","required":true,"doc":"A full name, like town/memory.","constrainable":["equals","one_of","prefix"]},{"name":"commands","type":"string","doc":"Comma-separated, every one you want at the shop: an approved request replaces the grant you hold there. Every command when omitted."},{"name":"constraint","type":"string","doc":"Limits you propose, `;`-separated, each `<command>.<arg> <kind> <value>`."},{"name":"why","type":"string","doc":"One line a person reads.","constrainable":["max_length"]}],"output":"text"},{"name":"requests","summary":"List what you asked for and what became of each.","effect":"read","output":"text"}],"tests":[{"name":"the specification prints","run":"spec","expect":{"contains":"# Shop manifest v0"}},{"name":"a search lists the hall","run":"search --query hall","expect":{"contains":"town/hall"}}]}',1789337968462,NULL,1789337968462);
INSERT INTO shops VALUES('town/memory','0.1.0','{"name":"town/memory","version":"0.1.0","summary":"Short notes, kept by key.","guidance":"Keys are paths, like `notes/lunch`, and a prefix such as `notes/`\ngathers the keys under it. A value is one line; a longer one comes on\nstdin.\n","runtime":"subprocess","entry":"./main.mjs","commands":[{"name":"remember","summary":"Store a value under a key.","effect":"write","args":[{"name":"key","type":"string","required":true,"doc":"A path-like key.","constrainable":["prefix","regex","max_length"]},{"name":"value","type":"string","doc":"The value. Reads stdin if omitted."}],"output":"text"},{"name":"recall","summary":"Print the value under a key.","effect":"read","args":[{"name":"key","type":"string","required":true,"constrainable":["prefix","regex"]}],"output":"text"},{"name":"list","summary":"List keys, optionally under a prefix.","effect":"read","args":[{"name":"prefix","type":"string","constrainable":["prefix"]}],"output":"text"},{"name":"forget","summary":"Delete a key.","effect":"destructive","args":[{"name":"key","type":"string","required":true,"constrainable":["prefix"]}],"output":"text"}],"tests":[{"name":"roundtrip","run":"remember --key t/a --value hello\nrecall --key t/a\n","expect":{"contains":"hello"}},{"name":"forget removes","run":"remember --key t/b --value x\nforget --key t/b\nrecall --key t/b\n","expect":{"exit":1}},{"name":"list under a prefix","run":"remember --key notes/lunch --value soup\nremember --key notes/dinner --value rice\nremember --key todo/call --value mom\nlist --prefix notes/\n","expect":{"equals":"notes/dinner\nnotes/lunch"}},{"name":"recall of a missing key fails","run":"recall --key never/set\n","expect":{"exit":1}},{"name":"a key outside the state is refused","run":"remember --key ../escape --value x\n","expect":{"exit":1}}]}',1789337968462,NULL,1789337968462);
INSERT INTO shops VALUES('dimitri/figma','0.1.0','{"name":"dimitri/figma","version":"0.1.0","summary":"Reads Figma documents and what people said on them, for consent''s tests.","runtime":"subprocess","entry":"./main.mjs","credentials":[{"type":"figma","origin":"https://api.figma.com","header":"X-Figma-Token: {token}","guidance":"Make a personal access token at Figma > Settings > Security, with file_content:read, and paste it."}],"commands":[{"name":"file","summary":"Print a file as Figma answers for it, after the status.","effect":"read","args":[{"name":"key","type":"string","required":true,"doc":"The file''s key, from its URL."}],"output":"text"},{"name":"comments","summary":"Print a file''s comments as Figma answers for them, after the status.","effect":"read","args":[{"name":"key","type":"string","required":true,"doc":"The file''s key, from its URL."}],"output":"text"}],"tests":[{"name":"a file answers","run":"file --key fixture","expect":{"contains":"200"}}]}',1789337971495,'user_162f8494919055b4',NULL);
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
, credentials TEXT NOT NULL DEFAULT '[]', call_id TEXT, parent TEXT, wall TEXT);
INSERT INTO calls VALUES(1,1789337971302,'pass_c9f213fa073ad454','grant_a7ed5893883851d2','town/memory','remember','66d6d2afee38df9f3dc9d497a53b8e27859c860f3c547cc8e710f7c12e6b4773','ok',0,0,34,'[]','',NULL,'[]','call_a06cc37e823d203a',NULL,'seatbelt');
INSERT INTO calls VALUES(2,1789337971378,'pass_c9f213fa073ad454','grant_a7ed5893883851d2','town/memory','recall','669c9c6002a2b1e0ce5b630783e6cece934456eb4da15eb9f3c9ae159641e3b9','ok',0,0,29,'[]','',NULL,'[]','call_99ac8996f7bde098',NULL,'seatbelt');
INSERT INTO calls VALUES(3,1789337971448,'pass_c9f213fa073ad454','grant_a7ed5893883851d2','town/memory','forget','d03c0c09eb437524aca5f12881039a00f57ee4c47de32c1a935832cfd5fd8c5b','denied',2,NULL,0,'[]',NULL,'command','[]','call_ecd5087337f0e141',NULL,NULL);
INSERT INTO calls VALUES(4,1789337971495,'pass_c9f213fa073ad454','grant_4364d04ae675ae4b','town/hall','publish','41fcd3c33933410621c540d82db535602955a9ba0545ff5861c1d5bb96fe3382','ok',0,NULL,7,'[]',NULL,'published dimitri/figma 0.1.0; requested prm_449764fdff1a319e','[]','call_68be27333cee7cd0',NULL,NULL);
INSERT INTO calls VALUES(5,1789337971542,'pass_c9f213fa073ad454','grant_4364d04ae675ae4b','town/hall','request','998d35640220bb492b73ce4398c6ba15a7683a324bcf9ae0f2fa42a579475a6d','ok',0,NULL,1,'[]',NULL,'requested prm_277a81fa99a53a3c','[]','call_3db3cccc02dedccb',NULL,NULL);
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO meta VALUES('schema','6');
INSERT INTO meta VALUES('address','http://127.0.0.1:7431');
CREATE TABLE credential_types (
  name TEXT PRIMARY KEY,
  origin TEXT NOT NULL,
  header TEXT NOT NULL,
  added_at INTEGER NOT NULL
, kind TEXT NOT NULL DEFAULT 'token', state TEXT NOT NULL DEFAULT 'held', proposed_by TEXT, guidance TEXT NOT NULL DEFAULT '', oauth TEXT, client BLOB);
INSERT INTO credential_types VALUES('github-token','https://api.github.com','Authorization: Bearer {token}',1789337968460,'token','held',NULL,'',NULL,NULL);
INSERT INTO credential_types VALUES('docs-oauth','https://docs.googleapis.com','Authorization: Bearer {token}',1789337969030,'oauth','held',NULL,'Sign in with the Google account whose documents the agent reads.','{"authorize":"https://accounts.google.com/o/oauth2/v2/auth","token":"https://oauth2.googleapis.com/token","scopes":["https://www.googleapis.com/auth/documents.readonly"]}',X'ccb75355dc14c09f61ba7fc23dd8e6d8ee16625be51f4895b4a634530ad2401d0a78d2d467ed7bf86e74a5582c146481575f2b27b664e8785a2209a0b0ff96fa12269cc1ae429008de09401c8afcc759738eb992ef37a04353807ccdcd8d9a006e49');
INSERT INTO credential_types VALUES('figma','https://api.figma.com','X-Figma-Token: {token}',1789337971495,'token','proposed','dimitri/figma','Make a personal access token at Figma > Settings > Security, with file_content:read, and paste it.',NULL,NULL);
CREATE TABLE credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  sealed BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
, scopes TEXT, revoked_why TEXT);
INSERT INTO credentials VALUES('credential_6eafffe404e20b5c','user_162f8494919055b4','github-token','dimitri''s PAT',X'3c34ab1bcc8dd38b7faca9c93d13723ed7a65c94c8431b4d642eb45986144bee2af96ca1dff897f9d21d34ecf15748bea26e8f2000f193',1789337968906,1789337968969,NULL,'replaced by credential_7d1adf17bb54bc17');
INSERT INTO credentials VALUES('credential_7d1adf17bb54bc17','user_162f8494919055b4','github-token','dimitri''s new PAT',X'3ed3d4d32022b5a2e918b2e6cb1902a39001d770539b50d7023d7bd601b95f7c732f664fccaad3acab9d5e7e47f2e4185641b5b15ff1c3',1789337968969,NULL,NULL,NULL);
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
INSERT INTO permits VALUES('prm_449764fdff1a319e','pass_c9f213fa073ad454','dimitri/figma','["file","comments"]','{}','published dimitri/figma 0.1.0',1789337971495,NULL,NULL,NULL);
INSERT INTO permits VALUES('prm_277a81fa99a53a3c','pass_c9f213fa073ad454','town/memory','["forget"]','{}','to clear finished notes',1789337971542,NULL,NULL,NULL);
INSERT INTO sqlite_sequence VALUES('calls',5);
CREATE INDEX calls_pass ON calls(pass_id, at);
CREATE INDEX calls_grant ON calls(grant_id, at);
CREATE INDEX credentials_user ON credentials(user_id, type);
CREATE UNIQUE INDEX calls_call_id ON calls(call_id);
CREATE INDEX calls_parent ON calls(parent);
CREATE INDEX permits_pass ON permits(pass_id, created_at);
CREATE UNIQUE INDEX permits_pending ON permits(pass_id, shop) WHERE decision IS NULL;
COMMIT;
