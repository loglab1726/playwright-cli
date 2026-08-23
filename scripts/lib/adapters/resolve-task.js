#!/usr/bin/env node
// scripts/lib/adapters/resolve-task.js
//
// Reads a CLI-agnostic agent task descriptor (scripts/lib/tasks/*.json) and
// substitutes its promptTemplate's {{KEY}} placeholders, printing the fully
// resolved task as JSON to stdout. The bash backends (copilot.sh,
// claude-code.sh) each pull the one or two fields they need out of that via
// scripts/lib/adapters/task-field.js — the same file-based node-helper
// pattern scripts/run-regression-heal-locally.sh already uses elsewhere in
// this repo, so no jq dependency is introduced.
//
// Usage: node resolve-task.js <task.json> [KEY=VALUE ...]

const fs = require('fs');

const taskPath = process.argv[2];
if (!taskPath) {
  console.error('Usage: resolve-task.js <task.json> [KEY=VALUE ...]');
  process.exit(1);
}

const vars = {};
for (const arg of process.argv.slice(3)) {
  const eq = arg.indexOf('=');
  if (eq === -1) {
    console.error(`Bad KEY=VALUE arg: ${arg}`);
    process.exit(1);
  }
  vars[arg.slice(0, eq)] = arg.slice(eq + 1);
}

const task = JSON.parse(fs.readFileSync(taskPath, 'utf8'));

let prompt = task.promptTemplate;
for (const [key, value] of Object.entries(vars)) {
  prompt = prompt.split(`{{${key}}}`).join(value);
}
const unresolved = prompt.match(/\{\{[A-Z_]+\}\}/g);
if (unresolved) {
  console.error(`Unresolved template placeholder(s) in promptTemplate: ${unresolved.join(', ')}`);
  process.exit(1);
}

console.log(JSON.stringify({ ...task, prompt }));
