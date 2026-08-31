#!/usr/bin/env node
// Publishes skills whose content changed since the last successful publish,
// using the SkillHub CLI. Requires SKILLHUB_TOKEN; DRY_RUN=1 for preflight.
// Usage: node scripts/publish.mjs <dist-dir>
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const dryRun = !!process.env.DRY_RUN;
const statePath = join(dist, 'state.json');
const state = JSON.parse(readFileSync(statePath, 'utf8'));
const token = process.env.SKILLHUB_TOKEN;

if (!token) {
  console.log('SKILLHUB_TOKEN not set - skipping publish step (artifacts are still pushed to the skillhub branch).');
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = {
  ...process.env,
  PATH: `${process.env.HOME ?? ''}/.local/bin:${process.env.PATH ?? ''}`,
};
const run = (args) => spawnSync('skillhub', args, { encoding: 'utf8', env, shell: process.platform === 'win32' });

if (run(['--version']).status !== 0) {
  console.log('installing skillhub CLI...');
  spawnSync('bash', ['-c', 'curl -fsSL https://skillhub.cn/install/install.sh | bash -s -- --cli-only'], { stdio: 'inherit', env });
}
const ver = run(['--version']);
console.log(`skillhub CLI: ${(ver.stdout || ver.stderr || '').trim()}`);

const login = run(['login', '--key', token, '--host', 'https://api.skillhub.cn']);
if (login.status !== 0) {
  console.error('skillhub login failed:\n' + ((login.stderr || '') + (login.stdout || '')));
  process.exit(1);
}

const changelog = `sync upstream ${String(state.upstreamSha).slice(0, 7)}`;
const VERSION_EXISTS = /已存在|already exists|版本冲突|409/;
const RATE_LIMITED = /频繁|429|rate.?limit/i;

function bumpPatch(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v));
  return m ? `${m[1]}.${m[2]}.${Number(m[3]) + 1}` : String(v);
}
function setSfVersion(sfPath, version) {
  const text = readFileSync(sfPath, 'utf8');
  writeFileSync(sfPath, text.replace(/^version: .*$/m, `version: ${version}`));
}

let published = 0;
let failed = 0;
let skipped = 0;

for (const [slug, s] of Object.entries(state.skills)) {
  if (s.hash === s.publishedHash) {
    skipped++;
    continue;
  }
  const dir = join(dist, 'skills', s.category, s.dir);
  let ok = false;
  for (let attempt = 1; attempt <= 6 && !ok; attempt++) {
    const args = ['publish', dir];
    if (dryRun) args.push('--dry-run');
    args.push('--changelog', changelog);
    const r = run(args);
    const out = ((r.stdout || '') + (r.stderr || '')).trim();
    if (r.status === 0) {
      ok = true;
      published++;
      if (!dryRun) {
        s.publishedHash = s.hash;
        s.publishedVersion = s.version;
      }
      console.log(`ok  ${slug} -> ${s.version}${dryRun ? ' (dry run)' : ''}`);
    } else if (VERSION_EXISTS.test(out)) {
      // that version is already taken (e.g. earlier partial run) - bump and retry
      s.version = bumpPatch(s.version);
      setSfVersion(join(dir, 'SKILL.md'), s.version);
      console.log(`... ${slug}: version taken, retrying as ${s.version}`);
    } else if (RATE_LIMITED.test(out) && attempt < 6) {
      console.log(`... ${slug}: rate limited, waiting 70s (attempt ${attempt})`);
      await sleep(70000);
    } else {
      failed++;
      console.error(`FAIL ${slug} (exit ${r.status}):\n${out}\n`);
      break;
    }
  }
  if (!dryRun) await sleep(15000); // real publishes are rate limited much harder than dry runs
}

writeFileSync(statePath, JSON.stringify(state, null, 2));
console.log(`done: ${published} published, ${failed} failed, ${skipped} unchanged${dryRun ? ' (dry run, state not updated)' : ''}`);
process.exit(failed ? 1 : 0);
