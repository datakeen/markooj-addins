// Markooj add-in registry: the shared checks for community-addins.json, add-in releases and index.json.
// Copyright (C) 2026 Ahmed Bilal and contributors. AGPL-3.0-or-later.
//
// No dependencies: Node 18 or later (for the built-in fetch). Every function that talks to GitHub takes a
// `fetch` option, so the tests can run without a network.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const OFFICIAL_OWNER = 'datakeen';
const API = 'https://api.github.com';
const USER_AGENT = 'markooj-addins-registry';
const MB = 1024 * 1024;
const LIMITS = Object.freeze({ manifest: 64 * 1024, main: 2 * MB, styles: 2 * MB, total: 50 * MB });
const RESERVED = new Set(['manifest.json', 'main.js', 'styles.css', '.install.json']);
// add-ins that come with Markooj (its addons folder): a folder add-in with the same id would take their place
const BUNDLED_IDS = new Set(['readability', 'word-frequency', 'si-units']);
// names Windows cannot save (a trailing dot, device names such as con or nul.txt); Markooj refuses them too
const BAD_FILE_NAME = /\.$|^(?:con|prn|aux|nul|com\d|lpt\d)(?:\..*)?$/i;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

// ------------------------------------------------------------------ small helpers
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
const isSemver = v => typeof v === 'string' && SEMVER.test(v);
const ownerOf = repo => (typeof repo === 'string' && repo.includes('/') ? repo.split('/')[0] : '');
const isOfficial = repo => ownerOf(repo).toLowerCase() === OFFICIAL_OWNER;
const fmtSize = n => (n >= MB ? (n / MB).toFixed(1) + ' MB' : n >= 1024 ? Math.ceil(n / 1024) + ' KB' : n + ' bytes');
const segs = s => String(s).split('/').map(encodeURIComponent).join('/');
/** Text from a submitter (entry fields, manifest values, tags, file names, and messages that quote them) as one line of
 *  plain Markdown: no HTML (an unclosed <!-- would hide the rest of a pull request comment, including the reviewer
 *  hints), no links, images or emphasis, and no @mentions that would notify people. */
const mdText = s => String(s).replace(/[\r\n\u2028\u2029]+/g, ' ')
  .replace(/[\\`*_~[\]<>&|]/g, '\\$&').replace(/@(?=[A-Za-z0-9])/g, '@\u200b');

/** The download address Markooj uses for one release file. */
function assetUrl(repo, tag, name) {
  return `https://github.com/${repo}/releases/download/${segs(tag)}/${encodeURIComponent(name)}`;
}
/** The README of the release, at the release's tag. */
function readmeUrl(repo, tag) {
  return `https://raw.githubusercontent.com/${repo}/${segs(tag)}/README.md`;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
}
const schemaCache = new Map();
function loadSchema(name) {
  if (!schemaCache.has(name)) schemaCache.set(name, readJson(path.join(ROOT, 'schema', name + '.schema.json')));
  return schemaCache.get(name);
}

/** JSON with sorted keys, so two entries compare equal whatever the key order. */
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (isObj(v)) return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v);
}

// ------------------------------------------------------------------ a small JSON Schema checker
// Covers the keywords our two schemas use: type, enum, required, properties, additionalProperties (false),
// items, minItems, maxItems, uniqueItems, minLength, maxLength, pattern, minimum, maximum.
// Other keywords ($schema, $id, title, description) are notes for people and editors.
function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}
const article = t => (/^[aeiou]/.test(t) ? 'an ' : 'a ') + (t === 'array' ? 'list' : t === 'object' ? 'object ({ ... })' : t);

function checkSchema(value, schema, at = '', root = 'The entry') {
  const out = [];
  const where = at ? `"${at}"` : root;
  const t = typeOf(value);
  if (schema.type) {
    const types = [].concat(schema.type);
    if (!types.some(x => x === t || (x === 'number' && t === 'integer'))) {
      out.push(`${where} should be ${types.map(article).join(' or ')}, not ${t === 'null' ? 'null' : article(t)}.`);
      return out;
    }
  }
  if (schema.enum && !schema.enum.some(e => e === value)) out.push(`${where} is "${value}", but it should be one of: ${schema.enum.join(', ')}.`);
  if (t === 'string') {
    const len = [...value].length;
    if (schema.minLength != null && len < schema.minLength) out.push(`${where} is too short (${len} characters; at least ${schema.minLength}).`);
    if (schema.maxLength != null && len > schema.maxLength) out.push(`${where} is too long (${len} characters; at most ${schema.maxLength}).`);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) {
      const shown = len > 60 ? [...value].slice(0, 57).join('') + '...' : value;
      out.push(`${where} is "${shown}", which is not in the right form. ${schema.description || ''}`.trim());
    }
  }
  if (t === 'integer' || t === 'number') {
    if (schema.minimum != null && value < schema.minimum) out.push(`${where} should be at least ${schema.minimum}.`);
    if (schema.maximum != null && value > schema.maximum) out.push(`${where} should be at most ${schema.maximum}.`);
  }
  if (t === 'array') {
    if (schema.minItems != null && value.length < schema.minItems) out.push(`${where} needs at least ${schema.minItems} items.`);
    if (schema.maxItems != null && value.length > schema.maxItems) out.push(`${where} has ${value.length} items; at most ${schema.maxItems}.`);
    if (schema.uniqueItems) {
      const seen = new Set();
      for (const item of value) { const k = stable(item); if (seen.has(k)) { out.push(`${where} lists ${JSON.stringify(item)} twice.`); break; } seen.add(k); }
    }
    if (schema.items) value.forEach((item, i) => out.push(...checkSchema(item, schema.items, `${at || root}[${i}]`, root)));
  }
  if (t === 'object') {
    for (const k of schema.required || []) if (!(k in value)) out.push(`${where} is missing "${k}".`);
    const props = schema.properties || {};
    for (const k of Object.keys(value)) {
      if (props[k]) out.push(...checkSchema(value[k], props[k], at ? `${at}.${k}` : k, root));
      else if (schema.additionalProperties === false) out.push(`${where} has "${k}", which is not a known field. Check the spelling, or remove it.`);
    }
  }
  return out;
}

// ------------------------------------------------------------------ the registry file
/**
 * Checks community-addins.json without the network.
 * Returns [{level: 'error'|'warning', index, id, msg}]; index -1 is about the whole file.
 */
function validateRegistry(list, schema = loadSchema('community-addins')) {
  const problems = [];
  if (!Array.isArray(list)) {
    problems.push({ level: 'error', index: -1, id: '', msg: 'community-addins.json should be a list: it starts with [ and ends with ].' });
    return problems;
  }
  const ids = new Map();
  const repos = new Map();
  list.forEach((e, i) => {
    const id = isObj(e) && typeof e.id === 'string' ? e.id : '';
    const add = (level, msg) => problems.push({ level, index: i, id, msg });
    for (const m of checkSchema(e, schema.items, '', 'The entry')) add('error', m);
    if (!isObj(e)) return;
    if (id) {
      const k = id.toLowerCase();
      if (ids.has(k)) add('error', `The id "${id}" is already used by entry ${ids.get(k) + 1}. Pick another id (and use it in manifest.json too).`);
      else ids.set(k, i);
    }
    if (typeof e.repo === 'string') {
      const k = e.repo.toLowerCase().replace(/\.git$/, '');
      if (repos.has(k)) add('error', `The repository ${e.repo} is already listed in entry ${repos.get(k) + 1}. One repository holds one add-in.`);
      else repos.set(k, i);
    }
    for (const f of ['name', 'author', 'description']) {
      if (typeof e[f] === 'string' && e[f] !== e[f].trim()) add('error', `"${f}" has spaces at the start or the end.`);
    }
    if (typeof e.repo === 'string' && !isOfficial(e.repo)) {
      if (BUNDLED_IDS.has(id)) add('error', `The id "${id}" belongs to an add-in that comes with Markooj. Pick another id (and use it in manifest.json too).`);
      for (const f of ['id', 'name', 'author']) {
        if (typeof e[f] === 'string' && /markooj/i.test(e[f])) {
          add('error', `"${f}" uses the word Markooj. Only add-ins from the Markooj team (repositories under ${OFFICIAL_OWNER}) may, so users can tell them apart. Markooj already shows your add-in inside the app.`);
        }
      }
    }
    if (typeof e.description === 'string' && /^(an? )?(markooj )?add-?in\b/i.test(e.description)) {
      add('warning', 'The description starts with "add-in". Say what it does instead, such as "Insert a table of ...".');
    }
  });
  return problems;
}

/** What a pull request adds, changes and removes, compared with the list on main. */
function diffEntries(base, next) {
  const key = e => (isObj(e) && typeof e.id === 'string' ? e.id : null);
  const before = new Map((Array.isArray(base) ? base : []).filter(key).map(e => [e.id, e]));
  const after = new Map((Array.isArray(next) ? next : []).filter(key).map(e => [e.id, e]));
  const added = [];
  const changed = [];
  for (const [id, e] of after) {
    if (!before.has(id)) added.push(e);
    else if (stable(before.get(id)) !== stable(e)) changed.push(e);
  }
  const removed = [...before.keys()].filter(id => !after.has(id));
  return { added, changed, removed };
}

// ------------------------------------------------------------------ GitHub
async function ghApi(fetchFn, token, route) {
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': USER_AGENT };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetchFn(API + route, { headers });
  if (res.status === 404) return { status: 404, data: null };
  if (!res.ok) {
    const left = res.headers && typeof res.headers.get === 'function' ? res.headers.get('x-ratelimit-remaining') : null;
    if ((res.status === 403 || res.status === 429) && left === '0') {
      throw new Error('The GitHub API rate limit was reached. Set GITHUB_TOKEN and try again.');
    }
    throw new Error(`GitHub answered ${res.status} for ${route}.`);
  }
  return { status: res.status, data: await res.json() };
}

async function download(fetchFn, url, maxBytes) {
  // No token here: release files of public repositories need none, and it must never follow a redirect elsewhere.
  const res = await fetchFn(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/octet-stream' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`could not download ${url} (${res.status}).`);
  const len = res.headers && typeof res.headers.get === 'function' ? Number(res.headers.get('content-length')) : NaN;
  if (len > maxBytes) throw new Error(`${url} is larger than ${fmtSize(maxBytes)}.`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error(`${url} is larger than ${fmtSize(maxBytes)}.`);
  return buf;
}

async function urlExists(fetchFn, url) {
  try {
    const res = await fetchFn(url, { method: 'HEAD', headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' });
    return res.ok;
  } catch { return false; }
}

// ------------------------------------------------------------------ main.js
/** Compiles main.js the way Markooj runs it (the body of a function with app, markooj and addin), without running it. */
function syntaxError(code) {
  try {
    // compileFunction parses main.js as a function body on its own, as Markooj's new Function(...) does: text that
    // closes the wrapper early, such as "}); ... (function () {", is a syntax error there and so here too
    vm.compileFunction(String(code), ['app', 'markooj', 'addin'], { filename: 'main.js' });
    return null;
  } catch (e) {
    return e && e.message ? e.message : String(e);
  }
}

const HINTS = [
  [/\beval\s*\(/, 'calls eval()'],
  [/\bnew\s+Function\s*\(|(?<![\w.$])Function\s*\(/, 'builds code with Function()'],
  [/\bfetch\s*\(|XMLHttpRequest|\bWebSocket\b|\bEventSource\b|sendBeacon/, 'uses the network'],
  [/(?<![\w.$])require\s*\(|\bprocess\.(?:env|exit|versions)|child_process|(?<![\w.$])import\s*\(/, 'tries to load Node.js modules or code'],
  [/\b(?:atob|btoa)\s*\(|(?:\\x[0-9a-fA-F]{2}){24,}|(?:\\u[0-9a-fA-F]{4}){24,}|[A-Za-z0-9+/]{400,}={0,2}/, 'decodes or carries encoded text'],
  [/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|document\.cookie/, 'keeps data in browser storage'],
  [/\bwindow\.mk\b|\bmk\.(?:invoke|send|on)\s*\(|ipcRenderer/, 'calls Markooj\'s file and system bridge directly'],
  [/\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML/, 'writes HTML directly (check that document text is escaped)'],
  [/<script\b|\bsetTimeout\s*\(\s*['"`]|\bsetInterval\s*\(\s*['"`]/, 'runs code from text'],
];

/** Things a reviewer should read closely. They are not errors: many good add-ins need one of them. */
function reviewHints(code) {
  const lines = String(code).split(/\r?\n/);
  const out = [];
  for (const [re, what] of HINTS) {
    const at = [];
    lines.forEach((l, i) => { if (at.length < 3 && re.test(l)) at.push(i + 1); });
    if (at.length) out.push(`main.js ${what} (line ${at.join(', ')}).`);
  }
  const long = lines.filter(l => l.length > 500).length;
  if (long) out.push(`main.js has ${long} line${long > 1 ? 's' : ''} longer than 500 characters. Minified or obfuscated code is not accepted; the readable source must be in the release.`);
  return out;
}

// ------------------------------------------------------------------ one add-in's latest release
/**
 * Looks at the latest release of an entry's repository.
 * opts: fetch, token, download (true: download every file and compute sha256), checkReadme, limits, manifestSchema.
 * Returns {errors[], warnings[], review[], notes[], repoInfo, release {tag, publishedAt, url}, manifest, assets [{name, size, sha256?}]}.
 */
async function inspectAddin(entry, opts = {}) {
  const f = opts.fetch || globalThis.fetch;
  const token = opts.token === undefined ? process.env.GITHUB_TOKEN : opts.token;
  const limits = { ...LIMITS, ...(opts.limits || {}) };
  const schema = opts.manifestSchema || loadSchema('manifest');
  const r = { id: entry.id, repo: entry.repo, errors: [], warnings: [], review: [], notes: [], repoInfo: null, release: null, manifest: null, assets: [] };
  const [owner, name] = String(entry.repo || '').split('/');
  if (!owner || !name) { r.errors.push('"repo" should be owner/name.'); return r; }
  const repoRoute = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  try {
    // 1. the repository
    const repo = await ghApi(f, token, repoRoute);
    if (repo.status === 404 || !repo.data) {
      r.errors.push(`The repository ${entry.repo} was not found. Check the spelling, and make sure the repository is public.`);
      return r;
    }
    const full = String(repo.data.full_name || entry.repo);
    if (ownerOf(full).toLowerCase() !== owner.toLowerCase()) {
      r.errors.push(`The repository now belongs to ${ownerOf(full)} (${full}). Update "repo" in the entry.`);
    } else if (full.toLowerCase() !== entry.repo.toLowerCase()) {
      r.warnings.push(`The repository was renamed to ${full}. Please update "repo" in the entry.`);
    }
    if (repo.data.private) r.errors.push('The repository is private. Make it public so Markooj can download the add-in.');
    if (repo.data.archived) r.warnings.push('The repository is archived, so the add-in will get no more updates.');
    if (!repo.data.license) r.warnings.push('No license file was found in the repository. Add a LICENSE file so people know how they may use the add-in.');
    r.repoInfo = { fullName: full, htmlUrl: `https://github.com/${entry.repo}` };
    if (r.errors.length) return r;

    // 2. the latest release (drafts and pre-releases are not "latest")
    const rel = await ghApi(f, token, `${repoRoute}/releases/latest`);
    if (rel.status === 404 || !rel.data) {
      r.errors.push(`${entry.repo} has no published release yet. Drafts and pre-releases do not count: publish a full release with manifest.json and main.js.`);
      return r;
    }
    const tag = String(rel.data.tag_name || '');
    r.release = { tag, publishedAt: rel.data.published_at || rel.data.created_at || null, url: rel.data.html_url || '' };
    const assets = new Map((rel.data.assets || []).map(a => [a.name, a]));
    for (const need of ['manifest.json', 'main.js']) {
      if (!assets.has(need)) r.errors.push(`The release ${tag} has no ${need}. Attach manifest.json and main.js to the release as files.`);
    }
    // Markooj only installs from tags without spaces or slashes (such as v1.0.0)
    if (!tag || tag.length > 100 || /[\s/\\]/.test(tag)) r.errors.push(`The release tag "${tag}" has a space or a slash, so Markooj cannot install from it. Use a tag such as v1.0.0.`);
    if (r.errors.length) return r;

    // 3. manifest.json
    const mAsset = assets.get('manifest.json');
    if (mAsset.size > limits.manifest) { r.errors.push(`manifest.json is ${fmtSize(mAsset.size)}; at most ${fmtSize(limits.manifest)}.`); return r; }
    const mBytes = await download(f, assetUrl(entry.repo, tag, 'manifest.json'), limits.manifest);
    let manifest;
    try { manifest = JSON.parse(mBytes.toString('utf8').replace(/^﻿/, '')); } catch (e) {
      r.errors.push(`manifest.json is not valid JSON: ${e.message}`);
      return r;
    }
    r.manifest = manifest;
    for (const m of checkSchema(manifest, schema, '', 'manifest.json')) r.errors.push(m.startsWith('manifest.json') ? m : `manifest.json: ${m}`);
    if (!isObj(manifest)) return r;
    if (manifest.id !== entry.id) r.errors.push(`manifest.json says the id is "${manifest.id}", but the entry says "${entry.id}". They must be the same.`);
    if (!isSemver(manifest.version)) r.errors.push(`The version "${manifest.version}" in manifest.json should look like 1.0.0.`);
    if (!isSemver(manifest.minMarkooj)) r.errors.push(`minMarkooj "${manifest.minMarkooj}" in manifest.json should look like 1.1.0.`);
    if (isSemver(manifest.version) && tag.replace(/^v/i, '') !== manifest.version) {
      r.warnings.push(`The release tag is ${tag}, but manifest.json says version ${manifest.version}. Use the tag v${manifest.version} so people can find the release.`);
    }
    if (typeof manifest.name === 'string' && typeof entry.name === 'string' && manifest.name !== entry.name) {
      r.notes.push(`manifest.json calls the add-in "${manifest.name}"; the store shows the name from the entry, "${entry.name}".`);
    }

    // 4. the files and their sizes
    const parts = [mAsset, assets.get('main.js')];
    if (assets.has('styles.css')) parts.push(assets.get('styles.css'));
    const listed = Array.isArray(manifest.files) ? manifest.files.filter(isObj) : [];
    const seen = new Set();
    for (const file of listed) {
      const n = String(file.name || '');
      if (RESERVED.has(n.toLowerCase())) { r.errors.push(`manifest.json lists "${n}" under files. That name is taken by Markooj; rename the file.`); continue; }
      if (BAD_FILE_NAME.test(n)) { r.errors.push(`manifest.json lists "${n}" under files. Windows cannot save a file with that name; rename it.`); continue; }
      if (seen.has(n.toLowerCase())) { r.errors.push(`manifest.json lists "${n}" twice under files.`); continue; }
      seen.add(n.toLowerCase());
      const a = assets.get(n);
      if (!a) { r.errors.push(`manifest.json lists the file "${n}", but the release ${tag} does not have it.`); continue; }
      if (file.size != null && file.size !== a.size) r.warnings.push(`manifest.json says ${n} is ${file.size} bytes, but the release file is ${a.size} bytes.`);
      parts.push(a);
    }
    const main = assets.get('main.js');
    if (main.size > limits.main) r.errors.push(`main.js is ${fmtSize(main.size)}; at most ${fmtSize(limits.main)}.`);
    if (assets.has('styles.css') && assets.get('styles.css').size > limits.styles) r.errors.push(`styles.css is ${fmtSize(assets.get('styles.css').size)}; at most ${fmtSize(limits.styles)}.`);
    const total = parts.reduce((s, a) => s + (Number(a.size) || 0), 0);
    if (total > limits.total) r.errors.push(`The add-in's files add up to ${fmtSize(total)}; at most ${fmtSize(limits.total)}.`);
    const used = new Set(parts.map(a => a.name));
    const other = [...assets.keys()].filter(n => !used.has(n));
    if (other.length) r.notes.push(`Other files on the release are not part of the add-in and are not installed: ${other.join(', ')}.`);
    r.assets = parts.map(a => ({ name: a.name, size: Number(a.size) || 0 }));
    if (r.errors.length) return r;

    // 5. main.js: compile it (never run it) and point out what a reviewer should read
    const mainBytes = await download(f, assetUrl(entry.repo, tag, 'main.js'), limits.main);
    const code = mainBytes.toString('utf8').replace(/^﻿/, '');
    const bad = syntaxError(code);
    if (bad) r.errors.push(`main.js has a syntax error: ${bad}`);
    r.review.push(...reviewHints(code));
    if (manifest.permissions) r.notes.push(`The add-in says: "${manifest.permissions}"`);

    // 6. README at the tag (the store shows it on the add-in's page)
    if (opts.checkReadme && !(await urlExists(f, readmeUrl(entry.repo, tag)))) {
      r.warnings.push(`No README.md was found at the tag ${tag}. Markooj shows the README on the add-in's page; add one.`);
    }

    // 7. every file's size and SHA-256, for index.json
    if (opts.download) {
      for (const a of r.assets) {
        const buf = a.name === 'manifest.json' ? mBytes : a.name === 'main.js' ? mainBytes
          : await download(f, assetUrl(entry.repo, tag, a.name), limits.total);
        if (buf.length !== a.size) { r.errors.push(`${a.name} downloaded as ${buf.length} bytes, but GitHub lists ${a.size} bytes. Try again later.`); continue; }
        a.sha256 = sha256(buf);
      }
    }
  } catch (e) {
    r.errors.push(e && e.message ? e.message : String(e));
  }
  return r;
}

// ------------------------------------------------------------------ index.json
/** One add-in in index.json. The keys follow the contract in README.md ("For developers"). */
function indexEntry(entry, r) {
  const m = r.manifest;
  const tag = r.release.tag;
  const out = {
    id: entry.id,
    name: entry.name,
    author: entry.author,
    description: entry.description,
    repo: entry.repo,
    category: entry.category,
    tags: entry.tags.slice(),
    verified: isOfficial(entry.repo) && isOfficial(r.repoInfo ? r.repoInfo.fullName : entry.repo),
    version: m.version,
    minMarkooj: m.minMarkooj,
    tag,
    assets: r.assets.map(a => ({ name: a.name, url: assetUrl(entry.repo, tag, a.name), size: a.size, sha256: a.sha256 })),
    readmeUrl: readmeUrl(entry.repo, tag),
    homepage: `https://github.com/${entry.repo}`,
    updatedAt: r.release.publishedAt,
  };
  // From the manifest, for the cards in Browse (optional; Markooj reads the installed manifest too).
  if (m.icon) out.icon = m.icon;
  if (m.color) out.color = m.color;
  if (m.authorUrl) out.authorUrl = m.authorUrl;
  if (m.permissions) out.permissions = m.permissions;
  return out;
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
}

/**
 * Builds index.json from the registry list.
 * opts: fetch, token, previous (the index.json now online), now (Date), concurrency.
 * Entries with problems are skipped; when the previous index had them (same repository), the last good version is kept.
 * Returns {index, problems: [{id, repo, errors[]}], kept: [id]}.
 */
async function buildIndex(list, opts = {}) {
  const regProblems = validateRegistry(list);
  const badRows = new Set(regProblems.filter(p => p.level === 'error').map(p => p.index));
  const problems = [];
  if (regProblems.some(p => p.index === -1 && p.level === 'error')) {
    return { index: null, problems: [{ id: '', repo: '', errors: regProblems.map(p => p.msg) }], kept: [] };
  }
  const prev = new Map(isObj(opts.previous) && Array.isArray(opts.previous.addins) ? opts.previous.addins.filter(isObj).map(a => [a.id, a]) : []);
  const results = await pool(list, opts.concurrency || 4, async (e, i) => {
    if (badRows.has(i)) return { entry: e, r: { errors: regProblems.filter(p => p.index === i && p.level === 'error').map(p => p.msg) } };
    return { entry: e, r: await inspectAddin(e, { ...opts, download: true }) };
  });
  const addins = [];
  const kept = [];
  for (const { entry: e, r } of results) {
    if (!r.errors.length) { addins.push(indexEntry(e, r)); continue; }
    problems.push({ id: isObj(e) ? e.id : '', repo: isObj(e) ? e.repo : '', errors: r.errors });
    const p = isObj(e) && !badRows.has(list.indexOf(e)) ? prev.get(e.id) : null;
    if (p && typeof p.repo === 'string' && p.repo.toLowerCase() === String(e.repo).toLowerCase()) {
      addins.push({ ...p, name: e.name, author: e.author, description: e.description, category: e.category, tags: e.tags.slice(), verified: !!p.verified && isOfficial(e.repo) });
      kept.push(e.id);
    }
  }
  addins.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const now = opts.now || new Date();
  return { index: { format: 1, updated: now.toISOString(), addins }, problems, kept };
}

module.exports = {
  ROOT, OFFICIAL_OWNER, LIMITS, RESERVED, SEMVER,
  isObj, sha256, isSemver, ownerOf, isOfficial, fmtSize, mdText, assetUrl, readmeUrl, readJson, loadSchema, stable,
  checkSchema, validateRegistry, diffEntries, ghApi, download, syntaxError, reviewHints, inspectAddin, indexEntry, buildIndex,
};
