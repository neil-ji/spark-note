#!/usr/bin/env node
/**
 * Run the pi agent (Embed SDK) to produce a full 《听过》 weekly issue via the
 * tingguo-weekly SKILL: 选题 → manuscript.txt → index.html → pngs/.
 *
 * Skills: loaded from `.claude/skills` via DefaultResourceLoader skillsOverride
 *         (plus `.pi/settings.json` "skills" entry — both paths).
 * Model:  routed through the local gateway via `.pi/models.json` baseUrl override
 *         (ANTHROPIC_AUTH_TOKEN is valid for http://127.0.0.1:8787).
 * cwd:    repo root, so SKILL tools' relative paths (content/听过/…, tools/*.mjs) resolve.
 *
 * Usage:
 *   node .pi/run-tingguo-weekly.mjs "<task prompt>"
 *   env: PI_MODEL=claude-opus-4-5|claude-sonnet-4-5|claude-haiku-4-5
 *        PI_THINKING=off|low|medium|high
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  ModelRuntime,
  DefaultResourceLoader,
  SessionManager,
  createAgentSession,
  loadSkillsFromDir,
  getAgentDir,
} from '@earendil-works/pi-coding-agent';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODELS_PATH = resolve(ROOT, '.pi/models.json');
const SKILLS_DIR = resolve(ROOT, '.claude/skills');
const LOG_DIR = resolve(ROOT, '.pi/run-logs');
mkdirSync(LOG_DIR, { recursive: true });

const modelId = process.env.PI_MODEL || 'claude-opus-4-5';
const thinkingLevel = process.env.PI_THINKING || 'low';
const taskPrompt = process.argv[2]?.trim();
if (!taskPrompt) {
  console.error('Usage: node .pi/run-tingguo-weekly.mjs "<task prompt>"');
  process.exit(1);
}

const logLines = [];
const log = (line) => {
  logLines.push(line);
  console.log(line);
};

// ── 1. Model runtime — anthropic baseUrl → local gateway ──
const modelRuntime = await ModelRuntime.create({ modelsPath: MODELS_PATH });

let model = modelRuntime.getModel('anthropic', modelId);
if (!model) {
  const available = await modelRuntime.getAvailable();
  log(`[runner] model ${modelId} not found. available: ${available.map((m) => `${m.provider}/${m.id}`).join(', ')}`);
  model = available.find((m) => m.provider === 'anthropic');
  if (!model) throw new Error('no anthropic model available');
}
log(`[runner] model=${model.provider}/${model.id} thinkingLevel=${thinkingLevel}`);

// ── 2. Resource loader — ensure .claude/skills are loaded ──
const fromClaude = loadSkillsFromDir({ dir: SKILLS_DIR, source: 'claude-skills' });
const loader = new DefaultResourceLoader({
  cwd: ROOT,
  agentDir: getAgentDir(),
  skillsOverride: (base) => {
    const names = new Set(base.skills.map((s) => s.name));
    const merged = [...base.skills];
    for (const s of fromClaude.skills) {
      if (!names.has(s.name)) merged.push(s);
    }
    return { skills: merged, diagnostics: base.diagnostics };
  },
});
await loader.reload();

const discovered = loader.getSkills();
log(`[runner] skills loaded (${discovered.skills.length}):`);
for (const s of discovered.skills) log(`  - ${s.name}  →  ${s.filePath}`);

// ── 3. Agent session ──
const { session } = await createAgentSession({
  cwd: ROOT,
  modelRuntime,
  model,
  thinkingLevel,
  resourceLoader: loader,
  sessionManager: SessionManager.inMemory(),
});

let settledResolve;
let settledReject;
const settled = new Promise((res, rej) => { settledResolve = res; settledReject = rej; });

let turnCount = 0;
let toolCount = 0;
let textBuf = '';
const textChunks = [];
let seenAny = false;

const unsubscribe = session.subscribe((event) => {
  seenAny = true;
  switch (event.type) {
    case 'agent_start':
      log(`[agent] start — model ${modelId}`);
      break;
    case 'turn_start':
      turnCount += 1;
      log(`[agent] ── turn ${turnCount} ──`);
      break;
    case 'message_update':
      if (event.assistantMessageEvent?.type === 'text_delta') {
        textBuf += event.assistantMessageEvent.delta;
        process.stdout.write(event.assistantMessageEvent.delta);
      } else if (event.assistantMessageEvent?.type === 'thinking_delta') {
        // suppress thinking noise
      }
      break;
    case 'message_end':
      if (textBuf) {
        textChunks.push(textBuf);
        textBuf = '';
        process.stdout.write('\n');
      }
      break;
    case 'tool_execution_start':
      toolCount += 1;
      log(`[tool ${toolCount}] ${event.toolName} ${JSON.stringify(event.args)?.slice(0, 180)}`);
      break;
    case 'tool_execution_end':
      if (event.isError) {
        log(`[tool] ❌ error result: ${JSON.stringify(event.result)?.slice(0, 300)}`);
      }
      break;
    case 'agent_settled':
      log(`[agent] settled. turns=${turnCount} tools=${toolCount}`);
      settledResolve();
      break;
    default:
      break;
  }
});

log(`[runner] prompt → ${taskPrompt.split('\n')[0]}…`);
const startedAt = Date.now();
try {
  await session.prompt(taskPrompt);
} catch (err) {
  settledReject(err);
}
await settled;
unsubscribe();
session.dispose();

const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
log(`[runner] DONE in ${elapsed}s. turns=${turnCount} tools=${toolCount} text_chunks=${textChunks.length}`);

writeFileSync(resolve(LOG_DIR, `run-${new Date().toISOString().replace(/[:.]/g, '-')}.log`), logLines.join('\n'), 'utf-8');
