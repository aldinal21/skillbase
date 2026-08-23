#!/usr/bin/env node
import('../dist/cli.js').then((m) => m.createProgram().parseAsync(process.argv));
