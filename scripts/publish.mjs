#!/usr/bin/env node
// Publishes skills whose content changed since the last successful publish,
// using the SkillHub CLI. Requires SKILLHUB_TOKEN; DRY_RUN=1 for preflight.
//
// Platform realities this script works around:
// - real publishes are rate limited per rolling window (dry runs are not);
//   after ~10 publishes in a short burst the quota drains, so the script
//   waits 70s between retries and STOPS EARLY (exit 0, state saved) when the
//   quota looks exhausted — the next scheduled run resumes the remainder.
// - a "version already exists" error means an earlier partial run took that
//   version; the script bumps the patch version in SKILL.md and retries.
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

const env = {
  ...process.env,
  PATH: `${process.env.HOME ?? ''}/.local/bin:${process.env.PATH ?? ''}`,
};
const run = (args) => spawnSync('skillhub', args, { encoding: 'utf8', env, shell: process.platform === 'win32' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const changelog = `upstream v${state.upstreamVersion}`;
const VERSION_EXISTS = /已存在|already exists|版本冲突|409/;
const RATE_LIMITED = /频繁|429|rate.?limit/i;

// version taken -> bump mirror revision (1.2.3+r4 -> 1.2.3+r5);
// legacy three-segment versions fall back to a plain patch bump
function bumpVersion(v) {
  const m = /^(.*\+r)(\d+)$/.exec(String(v));
  if (m) return `${m[1]}${Number(m[2]) + 1}`;
  const p = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v));
  if (p) return `${p[1]}.${p[2]}.${Number(p[3]) + 1}`;
  return `${v}+r2`;
}
function setSfVersion(sfPath, version) {
  writeFileSync(sfPath, readFileSync(sfPath, 'utf8').replace(/^version: .*$/m, `version: ${version}`));
}
const persist = () => writeFileSync(statePath, JSON.stringify(state, null, 2));

let published = 0;
let failed = 0;
let skipped = 0;
let quotaStop = false;

outer: for (const [slug, s] of Object.entries(state.skills)) {
  if (s.hash === s.publishedHash) {
    skipped++;
    continue;
  }
  const dir = join(dist, 'skills', s.category, s.dir);
  let rateWaits = 0;
  let ok = false;
  for (let attempt = 1; attempt <= 8 && !ok; attempt++) {
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
        persist(); // save immediately so an early stop never republishes successes
      }
      console.log(`ok  ${slug} -> ${s.version}${dryRun ? ' (dry run)' : ''}`);
    } else if (VERSION_EXISTS.test(out)) {
      s.version = bumpVersion(s.version);
      setSfVersion(join(dir, 'SKILL.md'), s.version);
      console.log(`... ${slug}: version taken, retrying as ${s.version}`);
    } else if (RATE_LIMITED.test(out)) {
      rateWaits++;
      if (rateWaits >= 3) {
        quotaStop = true;
        console.log(`... ${slug}: still rate limited after repeated waits - publish quota likely drained. Stopping early; state is saved and the next scheduled run resumes.`);
        break outer;
      }
      console.log(`... ${slug}: rate limited, waiting 70s (attempt ${attempt})`);
      await sleep(70000);
    } else {
      failed++;
      console.error(`FAIL ${slug} (exit ${r.status}):\n${out}\n`);
      break;
    }
  }
  if (!ok && !quotaStop) failed++;
  if (!dryRun && !quotaStop) await sleep(15000);
}

persist();
console.log(`done: ${published} published, ${failed} failed, ${skipped} unchanged${dryRun ? ' (dry run, state not updated)' : ''}${quotaStop ? ' [stopped early: rate limit]' : ''}`);
process.exit(failed > 0 ? 1 : 0);
