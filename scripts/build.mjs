#!/usr/bin/env node
// Transforms upstream skills into SkillHub-ready artifacts in <dist-dir>.
// Usage: node scripts/build.mjs <dist-dir> [state-dir]
//
// - Keeps the skill's own `name` (agents invoke each other by it); adds
//   SkillHub fields (slug/displayName/version/summary/license/homepage/tags).
// - Copies the whole skill directory and embeds a LICENSE + mirror notice.
// - slug/version/content-hash bookkeeping lives in state.json (on the
//   `skillhub` branch) so only changed skills get republished.
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';

const UPSTREAM_REPO = 'mattpocock/skills';
const UPSTREAM_URL = `https://github.com/${UPSTREAM_REPO}`;
const SLUG_PREFIX = process.env.SLUG_PREFIX ?? 'mp-';
const CATEGORIES = (process.env.CATEGORIES ?? 'engineering,productivity,misc').split(',');
const distDir = process.argv[2] ?? 'dist';
const stateDir = process.argv[3] ?? '';
const upstreamVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;
let upstreamSha;
try {
  upstreamSha = process.env.GITHUB_SHA ?? execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
} catch {
  upstreamSha = 'unknown';
}

function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { data: {}, body: text };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(line);
    if (kv) data[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return { data, body: text.slice(m[0].length) };
}

const yamlStr = (v) => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const trim160 = (s) => (s.length <= 160 ? s : s.slice(0, 159).replace(/\s+\S*$/, '') + '…');

function hashDir(dir) {
  const h = createHash('sha256');
  const walk = (d) => {
    const entries = readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        h.update(relative(dir, p));
        h.update(readFileSync(p));
      }
    }
  };
  walk(dir);
  return h.digest('hex');
}

function parseVer(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [1, 0, 0];
}
const maxVer = (a, b) => {
  const [pa, pb] = [parseVer(a), parseVer(b)];
  return pa > pb ? a : b;
};
function bumpPatch(v) {
  const [x, y, z] = parseVer(v);
  return `${x}.${y}.${z + 1}`;
}

function loadState() {
  const p = stateDir && join(stateDir, 'state.json');
  if (p && existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  return { skills: {} };
}

const state = loadState();
const license = readFileSync('LICENSE', 'utf8');
const out = {
  generatedAt: new Date().toISOString(),
  upstreamRepo: UPSTREAM_REPO,
  upstreamSha,
  upstreamVersion,
  skills: {},
};
const rows = [];

for (const category of CATEGORIES) {
  const catDir = join('skills', category);
  if (!existsSync(catDir)) continue;
  for (const dir of readdirSync(catDir)) {
    const skillDir = join(catDir, dir);
    if (!statSync(skillDir).isDirectory()) continue;
    const sfPath = join(skillDir, 'SKILL.md');
    if (!existsSync(sfPath)) continue;

    const { data, body } = parseFrontmatter(readFileSync(sfPath, 'utf8'));
    const name = data.name || dir;
    const slug = SLUG_PREFIX + name;
    const hash = hashDir(skillDir);
    const prev = state.skills?.[slug];
    let version;
    let changed;
    if (!prev) {
      version = upstreamVersion;
      changed = true;
    } else if (prev.hash === hash) {
      version = prev.version;
      changed = false;
    } else {
      version = bumpPatch(maxVer(prev.version, upstreamVersion));
      changed = true;
    }

    const upstreamPath = `skills/${category}/${dir}`;
    const homepage = `${UPSTREAM_URL}/tree/${upstreamSha.slice(0, 7)}/${upstreamPath}`;
    const description = data.description ?? '';

    const outDir = join(distDir, 'skills', category, dir);
    mkdirSync(outDir, { recursive: true });
    cpSync(skillDir, outDir, { recursive: true });
    // SkillHub rejects LICENSE files ("不允许的文件类型"), so the MIT text is
    // embedded in SKILL.md instead — still satisfies MIT's notice requirement.
    const notice =
      `> **Mirror notice:** This skill is mirrored from [${UPSTREAM_REPO} · ${upstreamPath}](${homepage}) ` +
      `at commit \`${String(upstreamSha).slice(0, 7)}\` (MIT License, see the License section at the end of this file). ` +
      `由 SkillHub 社区搬运,非作者官方维护;更新与反馈请见上游仓库。此镜像由 @jaredshuai 维护。\n`;

    const fm =
      `---\n` +
      `name: ${yamlStr(name)}\n` +
      `description: ${yamlStr(description)}\n` +
      `slug: ${yamlStr(slug)}\n` +
      `displayName: ${yamlStr(name)}\n` +
      `version: ${version}\n` +
      `summary: ${yamlStr(trim160(description))}\n` +
      `license: MIT\n` +
      `homepage: ${yamlStr(homepage)}\n` +
      `tags: [mattpocock, mirror, ${category}]\n` +
      `---\n\n`;
    writeFileSync(
      join(outDir, 'SKILL.md'),
      fm + notice + '\n' + body.replace(/^\s+/, '').replace(/\s+$/, '') + '\n\n---\n\n## License\n\n' + license.trim() + '\n',
    );

    out.skills[slug] = { hash, version, changed, category, dir, upstreamPath };
    rows.push({ slug, name, category, version, changed, upstreamPath });
  }
}

rows.sort((a, b) => (a.slug < b.slug ? -1 : 1));
const table = rows
  .map((r) => `| ${r.slug} | ${r.version} | ${r.category} | [${r.upstreamPath}](${UPSTREAM_URL}/tree/${String(upstreamSha).slice(0, 7)}/${r.upstreamPath}) |`)
  .join('\n');
writeFileSync(
  join(distDir, 'README.md'),
  `# mattpocock/skills → SkillHub 镜像\n\n` +
    `非官方镜像,来源 [${UPSTREAM_REPO}](${UPSTREAM_URL}) @ \`${String(upstreamSha).slice(0, 7)}\`,MIT License。\n\n` +
    `| slug | version | category | upstream |\n|---|---|---|---|\n${table}\n`,
);

writeFileSync(join(distDir, 'state.json'), JSON.stringify(out, null, 2));
const changedCount = rows.filter((r) => r.changed).length;
console.log(`built ${rows.length} skills -> ${distDir} (upstream ${String(upstreamSha).slice(0, 7)}, v${upstreamVersion}); ${changedCount} changed, ${rows.length - changedCount} unchanged`);
for (const r of rows) console.log(`  ${r.changed ? '*' : '='} ${r.slug}@${r.version}`);
