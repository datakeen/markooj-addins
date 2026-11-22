#!/usr/bin/env node
// Markooj add-in registry: checks community-addins.json, and with --remote the latest release of each add-in.
// Copyright (C) 2026 Ahmed Bilal and contributors. AGPL-3.0-or-later.
//
//   node tools/validate.js                         check community-addins.json (no network)
//   node tools/validate.js --remote                also check every add-in's latest GitHub release
//   node tools/validate.js new.json --remote --base old.json
//                                                  check only the entries that new.json adds or changes
//   --report file.md                               also write the result as Markdown (for a pull request comment)
//
// GITHUB_TOKEN, when set, is used for the GitHub API (more requests per hour). Exit code 1 when there are problems.
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./lib');

function parseArgs(argv) {
  const a = { file: path.join(L.ROOT, 'community-addins.json'), remote: false, base: null, report: null };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--remote') a.remote = true;
    else if (x === '--base') a.base = argv[++i];
    else if (x === '--report') a.report = argv[++i];
    else if (x === '--help' || x === '-h') a.help = true;
    else if (!x.startsWith('--')) a.file = x;
    else throw new Error(`Unknown option ${x}. Try --help.`);
  }
  return a;
}

function loadList(file) {
  try { return { list: L.readJson(file) }; } catch (e) {
    return { error: e.code === 'ENOENT' ? `${file} was not found.` : `${path.basename(file)} is not valid JSON: ${e.message}` };
  }
}

/**
 * Runs the checks and returns {ok, text, markdown}. Used by the command line and the tests.
 * opts: list, base (list or null), remote, fetch, token.
 */
async function run(opts) {
  const fileProblems = [];
  const entries = [];
  const list = opts.list;
  const problems = L.validateRegistry(list);
  for (const p of problems.filter(p => p.index === -1)) fileProblems.push(p);

  let targets = Array.isArray(list) ? list.filter(L.isObj) : [];
  let diff = null;
  if (opts.base !== undefined && opts.base !== null && Array.isArray(list)) {
    diff = L.diffEntries(opts.base, list);
    const ids = new Set([...diff.added, ...diff.changed].map(e => e.id));
    targets = targets.filter(e => ids.has(e.id));
    const n = diff.added.length + diff.changed.length;
    if (n > 1) fileProblems.push({ level: 'warning', msg: `This pull request adds or changes ${n} entries. Please send one add-in per pull request.` });
    if (n === 0 && !diff.removed.length) fileProblems.push({ level: 'warning', msg: 'This pull request does not add or change any entry.' });
    for (const id of diff.removed) fileProblems.push({ level: 'warning', msg: `The entry "${id}" is removed. A maintainer will confirm this with its author.` });
  }

  // entries with problems in the file itself (all of them without --base, otherwise only the new and changed ones,
  // plus any problem such as a duplicate id that a new entry causes elsewhere)
  const shown = new Set(targets);
  if (Array.isArray(list)) list.forEach((e, i) => { if (problems.some(p => p.index === i)) shown.add(e); });
  for (const e of Array.isArray(list) ? list : []) {
    if (!shown.has(e)) continue;
    const i = list.indexOf(e);
    const own = problems.filter(p => p.index === i);
    const item = {
      entry: e,
      label: L.isObj(e) && e.id ? e.id : `entry ${i + 1}`,
      status: diff ? (diff.added.includes(e) ? 'new' : diff.changed.includes(e) ? 'changed' : 'unchanged') : '',
      errors: own.filter(p => p.level === 'error').map(p => p.msg),
      warnings: own.filter(p => p.level === 'warning').map(p => p.msg),
      review: [], notes: [], release: null, manifest: null, assets: [],
    };
    if (opts.remote && targets.includes(e) && !item.errors.length) {
      const r = await L.inspectAddin(e, { fetch: opts.fetch, token: opts.token, checkReadme: true });
      item.errors.push(...r.errors);
      item.warnings.push(...r.warnings);
      item.review.push(...r.review);
      item.notes.push(...r.notes);
      item.release = r.release;
      item.manifest = r.manifest;
      item.assets = r.assets;
    }
    entries.push(item);
  }

  const errors = fileProblems.filter(p => p.level === 'error').length + entries.reduce((s, x) => s + x.errors.length, 0);
  const warnings = fileProblems.filter(p => p.level === 'warning').length + entries.reduce((s, x) => s + x.warnings.length, 0);
  const count = Array.isArray(list) ? list.length : 0;
  return { ok: errors === 0, errors, warnings, ...render({ fileProblems, entries, errors, warnings, count, remote: opts.remote, diff }) };
}

function summaryLine(x) {
  if (!x.release || !x.manifest) return '';
  const size = x.assets.reduce((s, a) => s + a.size, 0);
  return `Release ${x.release.tag}: version ${x.manifest.version}, needs Markooj ${x.manifest.minMarkooj} or later, ` +
    `${x.assets.length} file${x.assets.length === 1 ? '' : 's'} (${x.assets.map(a => a.name).join(', ')}), ${L.fmtSize(size)}.`;
}

function render({ fileProblems, entries, errors, warnings, count, remote, diff }) {
  const t = [];
  const md = ['<!-- markooj-addins-check -->', '## Add-in check', ''];
  const result = errors ? `${errors} problem${errors > 1 ? 's' : ''} to fix` : 'passed';
  md.push(`**Result: ${result}.**` + (warnings ? ` ${warnings} warning${warnings > 1 ? 's' : ''}.` : ''), '');
  t.push(`community-addins.json: ${count} entr${count === 1 ? 'y' : 'ies'}${remote ? ', releases checked on GitHub' : ''}.`);
  for (const p of fileProblems) {
    const tag = p.level === 'error' ? 'Problem' : 'Warning';
    t.push(`  ${tag}: ${p.msg}`);
    md.push(`- **${tag}:** ${L.mdText(p.msg)}`);
  }
  if (fileProblems.length) md.push('');
  for (const x of entries) {
    const head = `${x.label}${L.isObj(x.entry) && x.entry.repo ? ` (${x.entry.repo})` : ''}${x.status ? `, ${x.status}` : ''}`;
    t.push(`${x.errors.length ? 'FAIL' : 'ok  '} ${head}`);
    // everything below can quote the submitter's own text, so it goes into the comment as plain text (L.mdText)
    md.push(`### ${x.errors.length ? 'Needs changes' : 'Looks good'}: ${L.mdText(head)}`, '');
    const line = summaryLine(x);
    if (line) { t.push(`     ${line}`); md.push(L.mdText(line), ''); }
    for (const m of x.errors) { t.push(`     Problem: ${m}`); md.push(`- **Problem:** ${L.mdText(m)}`); }
    for (const m of x.warnings) { t.push(`     Warning: ${m}`); md.push(`- **Warning:** ${L.mdText(m)}`); }
    for (const m of x.notes) { t.push(`     Note: ${m}`); md.push(`- Note: ${L.mdText(m)}`); }
    if (x.review.length) {
      t.push('     For the reviewer:');
      md.push('', '<details><summary>For the reviewer</summary>', '');
      for (const m of x.review) { t.push(`       - ${m}`); md.push(`- ${L.mdText(m)}`); }
      md.push('', '</details>');
    }
    md.push('');
  }
  if (diff && !entries.length && !fileProblems.length) md.push('No entries to check.', '');
  if (errors) md.push('Fix the problems above and push again; this check runs on every push. See [SUBMITTING.md](https://github.com/datakeen/markooj-addins/blob/main/SUBMITTING.md).');
  else md.push('A maintainer will read the code and merge the pull request. See [REVIEW-CHECKLIST.md](https://github.com/datakeen/markooj-addins/blob/main/REVIEW-CHECKLIST.md) for what they check.');
  t.push(errors ? `${errors} problem(s), ${warnings} warning(s).` : `Passed${warnings ? ` with ${warnings} warning(s)` : ''}.`);
  return { text: t.join('\n'), markdown: md.join('\n') + '\n' };
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.help) {
    const lines = fs.readFileSync(__filename, 'utf8').split(/\r?\n/).slice(3);
    const head = lines.slice(0, lines.findIndex(l => !l.startsWith('//')));
    console.log(head.map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
    return 0;
  }
  const cur = loadList(a.file);
  let res;
  if (cur.error) {
    res = { ok: false, text: `Problem: ${cur.error}`, markdown: `<!-- markooj-addins-check -->\n## Add-in check\n\n**Result: 1 problem to fix.**\n\n- **Problem:** ${L.mdText(cur.error)}\n` };
  } else {
    let base = null;
    if (a.base) {
      const b = loadList(a.base);
      base = b.error ? [] : b.list;
    }
    res = await run({ list: cur.list, base, remote: a.remote, token: process.env.GITHUB_TOKEN });
  }
  console.log(res.text);
  if (a.report) fs.writeFileSync(a.report, res.markdown);
  if (process.env.GITHUB_STEP_SUMMARY) { try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, res.markdown + '\n'); } catch {} }
  return res.ok ? 0 : 1;
}

if (require.main === module) {
  main().then(code => { process.exitCode = code; }, e => { console.error(e && e.message ? e.message : e); process.exitCode = 2; });
}
module.exports = { run, parseArgs };
