#!/usr/bin/env node
// scripts/lib/adapters/sync-persona.js
//
// Translates a Copilot-style persona file (.github/agents/<stem>.agent.md)
// into a Claude Code project subagent (.claude/agents/<stem>.md), so both
// CLI backends run the exact same persona body from one canonical source.
//
// Confirmed by direct local testing against the Claude Code CLI (2.1.229),
// not inferred from docs: `claude -p --agent <name>` resolves a project
// subagent by its frontmatter `name:` field, NOT by filename — creating
// .claude/agents/mismatch-filename.md with frontmatter `name:
// mismatch-frontmatter-name` and running `--agent mismatch-filename` failed
// ("not found. Available agents: ..."), while `--agent
// mismatch-frontmatter-name` succeeded. There is also no flag to point
// --agent at an arbitrary file path (absent from `claude --help`), so the
// file has to physically live under .claude/agents/.
//
// Claude Code additionally requires the name to be lowercase-hyphens
// (code.claude.com/docs/en/sub-agents), which the source .agent.md files
// don't follow (e.g. `name: PlaywrightTestGenerator`). Rather than reuse
// that field, this script sets `name:` to the source file's own kebab-case
// filename stem — the same value scripts/lib/tasks/*.json already store in
// "persona" and pass to the Copilot backend as `--agent <stem>` (which keys
// off that filename already, per this repo's existing working setup) — so
// one "persona" value in the task JSON means the same --agent invocation
// name on both backends.
//
// Regenerated on every run (not hand-maintained), so the two personas can
// never drift out of sync with each other.
//
// Usage: node sync-persona.js <persona-stem>
// Reads:  .github/agents/<persona-stem>.agent.md
// Writes: .claude/agents/<persona-stem>.md

const fs = require('fs');
const path = require('path');

const stem = process.argv[2];
if (!stem) {
  console.error('Usage: sync-persona.js <persona-stem>');
  process.exit(1);
}

const srcPath = path.join('.github', 'agents', `${stem}.agent.md`);
const raw = fs.readFileSync(srcPath, 'utf8');

const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
if (!match) {
  console.error(`${srcPath}: expected YAML frontmatter (--- ... ---) followed by a body`);
  process.exit(1);
}
const [, frontmatter, body] = match;

const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
if (!descMatch) {
  console.error(`${srcPath}: frontmatter has no 'description:' field`);
  process.exit(1);
}
const description = descMatch[1].trim();

const destDir = path.join('.claude', 'agents');
fs.mkdirSync(destDir, { recursive: true });
fs.writeFileSync(
  path.join(destDir, `${stem}.md`),
  `---\nname: ${stem}\ndescription: ${description}\n---\n${body}`
);

console.log(stem);
