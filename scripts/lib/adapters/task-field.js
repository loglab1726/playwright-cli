#!/usr/bin/env node
// scripts/lib/adapters/task-field.js
//
// Pulls one field out of a resolved task JSON file (see resolve-task.js) so
// the bash backends can read structured data without a jq dependency.
//
// Usage: node task-field.js <resolved-task.json> '<js-expression-on-t>'
// Prints nothing if the expression evaluates to undefined/null (so bash
// call sites can test `[ -n "$(...)" ]` or `[ "$(...)" = "true" ]`). A
// string value prints as-is; anything else (arrays, objects, booleans)
// prints as JSON.

const fs = require('fs');

const [, , jsonPath, expr] = process.argv;
if (!jsonPath || !expr) {
  console.error("Usage: task-field.js <resolved-task.json> '<js-expression-on-t>'");
  process.exit(1);
}

const t = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
// Direct (not indirect) eval is required here so the expression can see the
// local `t` above — expr is a hardcoded string authored in the adapter .sh
// files in this repo, never user/session input.
// eslint-disable-next-line no-eval
const v = eval(expr);
if (v === undefined || v === null) process.exit(0);
process.stdout.write(typeof v === 'string' ? v : JSON.stringify(v));
