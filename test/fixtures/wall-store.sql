-- A store as wall left it: sqlite3 .dump of a data directory the town at
-- e829844 (wall's code, 1aac7d9's src) made, schema 5 as src/schema.ts wrote
-- it there, by townd serve, townd admin, and town, walled by seatbelt: the
-- memory shop, a user, a sealed credential, a pass with a hall grant and a
-- memory grant, calls at memory (one denied), a publish of dimitri/todo
-- with its tests' two calls under it, a call of the published shop with its
-- own call under it, a request, and its pending permit, for consent's
-- migration test. Made by the script in consent phase 0's report. Not a
-- copy of the new code: keep it as it was. The credential was sealed under
-- the key below (vault.key, as hex) and opens to wall-fixture-not-a-token;
-- both are a fixture's, not a secret.
-- vault.key: f6dd57a5778c7004ada0bdb45c63461813504c3dd4ee4024909595d2f74e9b76
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
INSERT INTO users VALUES('user_078b20f9f5e0c98e','dimitri',1789322081828);
CREATE TABLE passes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  revoked_at INTEGER
);
INSERT INTO passes VALUES('pass_923432417c8d5a39','user_078b20f9f5e0c98e','the agent','8a1ea71ba5742611bd237372ac8edc145fc2fd4242c5714a6e5ad02f6a2313d9',1789322081949,NULL,NULL);
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
INSERT INTO grants VALUES('grant_70f9fe0542076ca2','pass_923432417c8d5a39','town/hall','["search","show","spec","validate","test","publish","request","requests"]','{}',1789322082011,NULL,NULL,'{}',NULL);
INSERT INTO grants VALUES('grant_ebffcd94588b4a33','pass_923432417c8d5a39','town/memory','["remember","recall","list"]','{}',1789322082071,NULL,NULL,'{}',NULL);
INSERT INTO grants VALUES('grant_236957f29a9e0bc1','pass_923432417c8d5a39','dimitri/todo','["add","list"]','{}',1789322082559,NULL,NULL,'{}','publish');
CREATE TABLE shops (
  name TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  manifest TEXT NOT NULL,
  added_at INTEGER NOT NULL
, owner TEXT);
INSERT INTO shops VALUES('town/hall','0.1.0','{"name":"town/hall","version":"0.1.0","summary":"Where the town''s shops are found, made, and asked for.","guidance":"A shop is a directory holding a manifest.yaml and the entry it names;\nthe manifest specification, printed here, is the whole of how to\nwrite one. A shop travels on stdin as a tar of its directory, made\nwith `tar --format ustar -cf - -C <dir> .`. A shop you put in the\ntown is named `<your user>/<shop>`, declares no credentials of its\nown, and its tests run as you: at the shops it depends on, with your\ngrants. What your grants do not allow, ask for; a person decides at\nthe box, and `town --help` shows the answer.\n","runtime":"town","entry":"src/hall.ts","commands":[{"name":"search","summary":"List the town''s shops, and which you hold.","effect":"read","args":[{"name":"query","type":"string","doc":"A word of a name or summary; every shop when omitted."}],"output":"text"},{"name":"show","summary":"Print a shop''s help as a full grant would read it.","effect":"read","args":[{"name":"shop","type":"string","required":true,"doc":"A full name, like town/memory.","constrainable":["equals","one_of","prefix"]}],"output":"text"},{"name":"spec","summary":"Print the manifest specification.","effect":"read","output":"text"},{"name":"validate","summary":"Check a shop on stdin against the specification and this town, and say what to fix.","effect":"read","output":"text"},{"name":"test","summary":"Check a shop on stdin and run its tests as you, keeping nothing.","effect":"write","output":"text"},{"name":"publish","summary":"Check and test a shop on stdin, keep it under your name, and hold a grant at it.","effect":"write","output":"text"},{"name":"request","summary":"Ask for a grant at a shop, or a wider one; a person decides.","effect":"write","args":[{"name":"shop","type":"string","required":true,"doc":"A full name, like town/memory.","constrainable":["equals","one_of","prefix"]},{"name":"commands","type":"string","doc":"Comma-separated, every one you want at the shop: an approved request replaces the grant you hold there. Every command when omitted."},{"name":"constraint","type":"string","doc":"Limits you propose, `;`-separated, each `<command>.<arg> <kind> <value>`."},{"name":"why","type":"string","doc":"One line a person reads.","constrainable":["max_length"]}],"output":"text"},{"name":"requests","summary":"List what you asked for and what became of each.","effect":"read","output":"text"}],"tests":[{"name":"the specification prints","run":"spec","expect":{"contains":"# Shop manifest v0"}},{"name":"a search lists the hall","run":"search --query hall","expect":{"contains":"town/hall"}}]}',1789322081330,NULL);
INSERT INTO shops VALUES('town/memory','0.1.0','{"name":"town/memory","version":"0.1.0","summary":"Short notes, kept by key.","guidance":"Keys are paths, like `notes/lunch`, and a prefix such as `notes/`\ngathers the keys under it. A value is one line; a longer one comes on\nstdin.\n","runtime":"subprocess","entry":"./main.mjs","commands":[{"name":"remember","summary":"Store a value under a key.","effect":"write","args":[{"name":"key","type":"string","required":true,"doc":"A path-like key.","constrainable":["prefix","regex","max_length"]},{"name":"value","type":"string","doc":"The value. Reads stdin if omitted."}],"output":"text"},{"name":"recall","summary":"Print the value under a key.","effect":"read","args":[{"name":"key","type":"string","required":true,"constrainable":["prefix","regex"]}],"output":"text"},{"name":"list","summary":"List keys, optionally under a prefix.","effect":"read","args":[{"name":"prefix","type":"string","constrainable":["prefix"]}],"output":"text"},{"name":"forget","summary":"Delete a key.","effect":"destructive","args":[{"name":"key","type":"string","required":true,"constrainable":["prefix"]}],"output":"text"}],"tests":[{"name":"roundtrip","run":"remember --key t/a --value hello\nrecall --key t/a\n","expect":{"contains":"hello"}},{"name":"forget removes","run":"remember --key t/b --value x\nforget --key t/b\nrecall --key t/b\n","expect":{"exit":1}},{"name":"list under a prefix","run":"remember --key notes/lunch --value soup\nremember --key notes/dinner --value rice\nremember --key todo/call --value mom\nlist --prefix notes/\n","expect":{"equals":"notes/dinner\nnotes/lunch"}},{"name":"recall of a missing key fails","run":"recall --key never/set\n","expect":{"exit":1}},{"name":"a key outside the state is refused","run":"remember --key ../escape --value x\n","expect":{"exit":1}}]}',1789322081430,NULL);
INSERT INTO shops VALUES('dimitri/todo','0.1.0','{"name":"dimitri/todo","version":"0.1.0","summary":"Things to do, kept in the town''s notes.","runtime":"subprocess","entry":"./main.mjs","depends":[{"shop":"town/memory","commands":["remember","list"]}],"commands":[{"name":"add","summary":"Add an item.","effect":"write","args":[{"name":"item","type":"string","required":true}],"output":"text"},{"name":"list","summary":"Show every item.","effect":"read","output":"text"}],"tests":[{"name":"an added item is listed","run":"add --item milk\nlist\n","expect":{"contains":"todo/milk"}}]}',1789322082559,'user_078b20f9f5e0c98e');
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
INSERT INTO calls VALUES(1,1789322082116,'pass_923432417c8d5a39','grant_ebffcd94588b4a33','town/memory','remember','f8676f2fa47538c6b643534fc0af0ba73f5992fc364acd65983396bdb4ca0603','ok',0,0,32,'[]','',NULL,'[]','call_890a298192214a14',NULL,'seatbelt');
INSERT INTO calls VALUES(2,1789322082191,'pass_923432417c8d5a39','grant_ebffcd94588b4a33','town/memory','recall','9540c423cf5bd2c6f10798303d211f1f5f6a71be0fa9dc6ba178cc06bae3a19c','ok',0,0,32,'[]','',NULL,'[]','call_b4308caea521af47',NULL,'seatbelt');
INSERT INTO calls VALUES(3,1789322082264,'pass_923432417c8d5a39','grant_ebffcd94588b4a33','town/memory','forget','62a53eda366347450319bd988cbc6f71d272cf47c7eae32bce3ee347c1c1061b','denied',2,NULL,0,'[]',NULL,'command','[]','call_912870c79c373cd1',NULL,NULL);
INSERT INTO calls VALUES(4,1789322082559,'pass_923432417c8d5a39','grant_ebffcd94588b4a33','town/memory','remember','6d1ec4f1e781fda7f6846f547903c3be54b7f27eb4166e444acfd6563a1ccf36','ok',0,0,32,'[]','',NULL,'[]','call_a870a2f6fce4b51b','call_f642421e45a1ec4d','seatbelt');
INSERT INTO calls VALUES(5,1789322082559,'pass_923432417c8d5a39','grant_ebffcd94588b4a33','town/memory','list','881b8cc853c2cd0498057d3dae85b105fd0ac214a6e9bcdf8da122db28821c46','ok',0,0,32,'[]','',NULL,'[]','call_7f003e4ef3e75672','call_f642421e45a1ec4d','seatbelt');
INSERT INTO calls VALUES(6,1789322082559,'pass_923432417c8d5a39','grant_70f9fe0542076ca2','town/hall','publish','41fcd3c33933410621c540d82db535602955a9ba0545ff5861c1d5bb96fe3382','ok',0,NULL,542,'[]',NULL,'published dimitri/todo 0.1.0','[]','call_f642421e45a1ec4d',NULL,NULL);
INSERT INTO calls VALUES(7,1789322083350,'pass_923432417c8d5a39','grant_ebffcd94588b4a33','town/memory','remember','6d1ec4f1e781fda7f6846f547903c3be54b7f27eb4166e444acfd6563a1ccf36','ok',0,0,32,'[]','',NULL,'[]','call_6b07908b8873a830','call_d0c387d4bd376877','seatbelt');
INSERT INTO calls VALUES(8,1789322083143,'pass_923432417c8d5a39','grant_236957f29a9e0bc1','dimitri/todo','add','145edfe16a636668818a80d92f842357fcadebd9616a57e8ae1e83c2c32c2b65','ok',0,0,246,'[]','',NULL,'[]','call_d0c387d4bd376877',NULL,'seatbelt');
INSERT INTO calls VALUES(9,1789322083431,'pass_923432417c8d5a39','grant_70f9fe0542076ca2','town/hall','request','94cfc06320bae52ca2dfc38bb49f7d4d6e6ec5bf7255a6a8812efc0f4529ba9b','ok',0,NULL,1,'[]',NULL,'requested prm_41c7d07080e0fb08','[]','call_20e9716bec70c956',NULL,NULL);
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO meta VALUES('schema','5');
INSERT INTO meta VALUES('address','http://127.0.0.1:57448');
CREATE TABLE credential_types (
  name TEXT PRIMARY KEY,
  origin TEXT NOT NULL,
  header TEXT NOT NULL,
  added_at INTEGER NOT NULL
);
INSERT INTO credential_types VALUES('github-token','https://api.github.com','Authorization: Bearer {token}',1789322081329);
CREATE TABLE credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  sealed BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);
INSERT INTO credentials VALUES('credential_1d40be446a55678b','user_078b20f9f5e0c98e','github-token','dimitri''s PAT',X'b49c36b6d91f1427858e5c83131a47ad98b2a7098c1362c4ee7b1eb706f7228a64aa1874dde972aacaaefc893edd16ab24be9b5c',1789322081888,NULL);
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
INSERT INTO permits VALUES('prm_41c7d07080e0fb08','pass_923432417c8d5a39','town/memory','["remember","recall","list","forget"]','{}','to clear finished items',1789322083431,NULL,NULL,NULL);
INSERT INTO sqlite_sequence VALUES('calls',9);
CREATE INDEX calls_pass ON calls(pass_id, at);
CREATE INDEX calls_grant ON calls(grant_id, at);
CREATE INDEX credentials_user ON credentials(user_id, type);
CREATE UNIQUE INDEX calls_call_id ON calls(call_id);
CREATE INDEX calls_parent ON calls(parent);
CREATE INDEX permits_pass ON permits(pass_id, created_at);
CREATE UNIQUE INDEX permits_pending ON permits(pass_id, shop) WHERE decision IS NULL;
COMMIT;
