#!/usr/bin/env node
import { main } from "../dist/townd.js";

process.exitCode = await main(process.argv.slice(2));
