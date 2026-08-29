#!/usr/bin/env node
// scripts/lib/adapters/sync-persona.js
//
// Translates a Copilot-style persona file (.github/agents/<stem>.agent.md)
// into a Claude Code project subagent (.claude/agents/<stem>.md) AND an
// OpenCode project agent (.opencode/agent/<stem>.md), so all three CLI
// backends run the exact same persona body from one canonical source.
//
// --- Claude Code target ---
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
// name on all backends.
//
// --- OpenCode target ---
// Confirmed by direct local testing against the `opencode` CLI (1.18.21):
// a custom agent is a markdown file with YAML frontmatter, and (unlike
// Claude Code) the agent's name is ALWAYS the filename stem — there is no
// frontmatter name field at all. Also confirmed directly: BOTH
// `.opencode/agent/<stem>.md` (singular) and `.opencode/agents/<stem>.md`
// (plural) are picked up by `opencode agent list` — this script writes the
// singular form since that's what's documented, but either works.
//
// Unlike Claude Code/Copilot, `opencode run` has no --allowedTools/
// --disallowedTools-style CLI flag — tool permission is config-driven only,
// via a `permission:` block in the agent's own frontmatter (confirmed by
// direct testing: a hand-written permission block with nested
// pattern->action maps round-trips exactly through `opencode agent list`'s
// JSON dump). So the resolved task's tools.* policy — which the Claude Code
// backend applies via CLI flags at invocation time — has to be baked into
// this regenerated file instead. See docs/opencode-adapter.md for what's
// NOT verified about this (the actual glob-matching/precedence semantics at
// runtime, as opposed to just parsing correctly).
//
// Regenerated on every run (not hand-maintained), so the personas can never
// drift out of sync with each other.
//
// Usage: node sync-persona.js <persona-stem> <resolved-task.json>
// Reads:  .github/agents/<persona-stem>.agent.md
//         <resolved-task.json>  (for the OpenCode permission block only)
// Writes: .claude/agents/<persona-stem>.md
//         .opencode/agent/<persona-stem>.md

const fs = require('fs');
const path = require('path');

const stem = process.argv[2];
const resolvedTaskPath = process.argv[3];
if (!stem || !resolvedTaskPath) {
  console.error('Usage: sync-persona.js <persona-stem> <resolved-task.json>');
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

const claudeDestDir = path.join('.claude', 'agents');
fs.mkdirSync(claudeDestDir, { recursive: true });
fs.writeFileSync(
  path.join(claudeDestDir, `${stem}.md`),
  `---\nname: ${stem}\ndescription: ${description}\n---\n${body}`
);

// --- OpenCode permission block, derived from the same tools.* policy the
// Claude Code backend passes as --allowedTools/--disallowedTools flags.
const task = JSON.parse(fs.readFileSync(resolvedTaskPath, 'utf8'));
const tools = task.tools || {};

function yamlPatternMap(map, indent) {
  const pad = '  '.repeat(indent);
  return Object.entries(map)
    .map(([pattern, action]) => `${pad}${JSON.stringify(pattern)}: ${action}`)
    .join('\n');
}

const permissionLines = ['permission:'];

if (tools.shell && tools.shell.allow) {
  const bash = { '*': 'allow' };
  for (const cmd of tools.shell.deny || []) bash[`${cmd} *`] = 'deny';
  permissionLines.push('  bash:', yamlPatternMap(bash, 2));
} else {
  permissionLines.push('  bash: deny');
}

permissionLines.push(`  edit: ${tools.write && tools.write.allow ? 'allow' : 'deny'}`);

const readDeny = (tools.read && tools.read.deny) || [];
if (readDeny.length) {
  const read = { '*': 'allow' };
  for (const p of readDeny) read[p] = 'deny';
  permissionLines.push('  read:', yamlPatternMap(read, 2));
}

const opencodeDestDir = path.join('.opencode', 'agent');
fs.mkdirSync(opencodeDestDir, { recursive: true });
fs.writeFileSync(
  path.join(opencodeDestDir, `${stem}.md`),
  `---\ndescription: ${description}\nmode: subagent\n${permissionLines.join('\n')}\n---\n${body}`
);

console.log(stem);
