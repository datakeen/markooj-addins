#!/usr/bin/env node
// Markooj add-in registry: builds dist/index.json, the one file Markooj reads for File > Add-ins > Browse.
// Copyright (C) 2026 Ahmed Bilal and contributors. AGPL-3.0-or-later.
//
//   node tools/build-index.js [--registry community-addins.json] [--out dist/index.json]
//                             [--previous index.json] [--report dist/build-report.md]
//
// For each entry it reads the latest GitHub release, checks it like validate.js --remote, downloads every file of
// the add-in and records its size and SHA-256. Entries with problems are left out and reported; with --previous
// (the index.json that is online now) the last good version of such an add-in is kept instead.
// GITHUB_TOKEN, when set, is used for the GitHub API. Exit code 1 only when nothing could be built.
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./lib');

function parseArgs(argv) {
  const a = { registry: path.join(L.ROOT, 'community-addins.json'), out: path.join(L.ROOT, 'dist', 'index.json'), previous: null, report: null };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--registry') a.registry = argv[++i];
    else if (x === '--out') a.out = argv[++i];
    else if (x === '--previous') a.previous = argv[++i];
    else if (x === '--report') a.report = argv[++i];
    else throw new Error(`Unknown option ${x}.`);
  }
  return a;
}

function report({ index, problems, kept }, count) {
  const md = ['## Add-in index', ''];
  if (!index) md.push('**index.json was not built.**', '');
  else md.push(`**${index.addins.length} of ${count} add-in${count === 1 ? '' : 's'} in index.json** (built ${index.updated}).`, '');
  if (index && index.addins.length) {
    md.push('| Add-in | Version | Release | Files | Verified |', '| --- | --- | --- | --- | --- |');
    for (const a of index.addins) {
      const size = a.assets.reduce((s, x) => s + (x.size || 0), 0);
      md.push(`| ${L.mdText(a.id)} | ${L.mdText(a.version)} | ${L.mdText(a.tag)}${kept.includes(a.id) ? ' (kept)' : ''} | ${a.assets.length}, ${L.fmtSize(size)} | ${a.verified ? 'yes' : ''} |`);
    }
    md.push('');
  }
  if (problems.length) {
    md.push('### Left out or kept at the last good version', '');
    for (const p of problems) {
      md.push(`- **${L.mdText(p.id || '(no id)')}** (${L.mdText(p.repo || 'no repo')})${kept.includes(p.id) ? ', kept at the last good version' : ', left out'}:`);
      for (const e of p.errors) md.push(`  - ${L.mdText(e)}`);
    }
    md.push('');
  }
  return md.join('\n') + '\n';
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const list = L.readJson(a.registry);
  let previous = null;
  if (a.previous) {
    try { previous = L.readJson(a.previous); console.log(`Previous index: ${a.previous}`); } catch { console.log('No previous index; building from scratch.'); }
  }
  const res = await L.buildIndex(list, { previous, token: process.env.GITHUB_TOKEN });
  const count = Array.isArray(list) ? list.length : 0;
  const md = report(res, count);
  if (a.report) { fs.mkdirSync(path.dirname(a.report), { recursive: true }); fs.writeFileSync(a.report, md); }
  if (process.env.GITHUB_STEP_SUMMARY) { try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n'); } catch {} }
  for (const p of res.problems) console.log(`${res.kept.includes(p.id) ? 'kept' : 'skip'} ${p.id} (${p.repo}): ${p.errors.join(' ')}`);
  if (!res.index || (count > 0 && res.index.addins.length === 0)) {
    console.error('Nothing could be built, so index.json was not written. The index online stays as it is.');
    return 1;
  }
  fs.mkdirSync(path.dirname(a.out), { recursive: true });
  fs.writeFileSync(a.out, JSON.stringify(res.index, null, 2) + '\n');
  console.log(`Wrote ${a.out}: ${res.index.addins.length} of ${count} add-in(s).`);
  return 0;
}

if (require.main === module) {
  main().then(code => { process.exitCode = code; }, e => { console.error(e && e.message ? e.message : e); process.exitCode = 2; });
}
module.exports = { report };
