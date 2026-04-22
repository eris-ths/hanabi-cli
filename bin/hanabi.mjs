#!/usr/bin/env node
import { main } from '../dist/src/interface/cli/dispatch.js';

const code = await main(process.argv.slice(2));
process.exit(code);
