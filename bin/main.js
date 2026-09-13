#!/usr/bin/env node
// A `runtime: worker` shop's process: node bin/main.js <entry> <argv>. The runtime starts it; nothing else does.
import { flushed, launch } from "../dist/main.js";

const code = await launch(process.argv[2], process.argv.slice(3));
await flushed();
process.exit(code);
