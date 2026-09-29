// 실제 index.html을 그대로 돌리기 위한 테스트 하네스
// - React/Babel/Tailwind는 npm에서 받은 로컬 파일로 대체 (CDN 차단 환경이라서)
// - GitHub API는 메모리 기반 가짜 서버로 대체 (sha 충돌/서버 오류 주입 가능)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const NM = path.join(__dirname, 'node_modules');
const FILE_MAP = {
  '/vendor/react.js': path.join(NM, 'react/umd/react.production.min.js'),
  '/vendor/react-dom.js': path.join(NM, 'react-dom/umd/react-dom.production.min.js'),
  '/vendor/babel.js': path.join(NM, '@babel/standalone/babel.min.js'),
  '/vendor/tailwind.js': path.join(NM, '@tailwindcss/browser/dist/index.global.js'),
};

function transformHtml(html) {
  return html
    .replace(/<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>/, '<style type="text/tailwindcss">@custom-variant dark (&:where(.dark, .dark *));</style><script>window.tailwind={};</script><script src="/vendor/tailwind.js"></script>')
    .replace(/https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/react\/18\.3\.1\/umd\/react\.production\.min\.js/, '/vendor/react.js')
    .replace(/https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/react-dom\/18\.3\.1\/umd\/react-dom\.production\.min\.js/, '/vendor/react-dom.js')
    .replace(/https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/babel-standalone\/7\.24\.7\/babel\.min\.js/, '/vendor/babel.js')
    .replace(/<script src="https:\/\/cdn\.sheetjs\.com[^"]*"><\/script>/, '<script>window.XLSX={};</script>');
}

function startServer(indexPath) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const url = req.url.split('?')[0];
      if (url === '/' || url === '/index.html') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(transformHtml(fs.readFileSync(indexPath, 'utf8')));
      } else if (FILE_MAP[url]) {
        res.writeHead(200, { 'content-type': 'application/javascript' });
        res.end(fs.readFileSync(FILE_MAP[url]));
      } else if (url === '/sw.js') {
        res.writeHead(200, { 'content-type': 'application/javascript' });
        res.end('// disabled in tests');
      } else { res.writeHead(404); res.end(); }
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

// ---- 가짜 GitHub Contents API ----
class FakeGitHub {
  constructor(seed = {}) {
    this.files = {}; // 'repo/path' -> { text, sha }
    this.counter = 1;
    this.puts = [];
    this.delayMs = 0;      // PUT 응답 지연(느린 네트워크 흉내)
    this.conflicts = 0;    // 409를 돌려준 횟수 — stale sha 사용 여부 확인용        // 기록: {path, message, count}
    this.failNext = [];    // [{path, status}] — 다음 PUT을 실패시킴
    this.conflictNext = new Set(); // path — 다음 PUT을 409로 (다른 기기가 먼저 쓴 상황)
    this.externalWrite = {}; // path -> fn(currentArray)=>newArray : 409 발생 직전에 "다른 기기"가 수정
    for (const [p, data] of Object.entries(seed)) this.set(p, data);
  }
  newSha() { return 'sha' + (this.counter++); }
  set(p, data, repo = 'r') { this.files[repo + '/' + p] = { text: JSON.stringify(data, null, 2), sha: this.newSha() }; }
  get(p, repo = 'r') { const f = this.files[repo + '/' + p]; return f ? JSON.parse(f.text) : null; }
  async handle(route) {
    const req = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const u = new URL(req.url());
    const m = u.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/);
    const json = (status, body) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!m) {
      if (/^\/repos\/[^/]+\/[^/]+$/.test(u.pathname)) return json(200, { size: 100 });
      return json(404, { message: 'Not Found' });
    }
    const repo = m[2]; const p = decodeURIComponent(m[3]); const key = repo + '/' + p;
    if (req.method() === 'GET') {
      const f = this.files[key];
      if (!f) return json(404, { message: 'Not Found' });
      return json(200, { sha: f.sha, size: f.text.length, content: Buffer.from(f.text, 'utf8').toString('base64') });
    }
    if (req.method() === 'PUT') {
      if (this.delayMs) await new Promise(r => setTimeout(r, this.delayMs));
      const body = JSON.parse(req.postData());
      const fi = this.failNext.findIndex(x => x.path === p);
      if (fi !== -1) { const { status } = this.failNext.splice(fi, 1)[0]; return json(status, { message: 'Injected failure' }); }
      if (this.conflictNext.has(p)) {
        this.conflicts++;
        this.conflictNext.delete(p);
        if (this.externalWrite[p]) { this.set(p, this.externalWrite[p](this.get(p, repo) || []), repo); delete this.externalWrite[p]; }
        return json(409, { message: 'sha does not match' });
      }
      const cur = this.files[key];
      if (cur && body.sha !== cur.sha) { this.conflicts++; return json(409, { message: `${p} does not match ${cur.sha}` }); }
      const text = Buffer.from(body.content, 'base64').toString('utf8');
      this.files[key] = { text, sha: this.newSha() };
      this.puts.push({ repo, path: p, message: body.message, count: (() => { try { return JSON.parse(text).length; } catch (e) { return null; } })() });
      return json(200, { content: { sha: this.files[key].sha } });
    }
    return json(405, { message: 'no' });
  }
}

const CFG = { owner: 'o', repo: 'r', branch: 'main', token: 'test-token' };

async function launch(indexPath, seed, opts = {}) {
  const { server, base } = await startServer(indexPath);
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : (fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}));
  const cfgUse = { ...CFG, ...(opts.cfg || {}) };
  const context = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 900 } });
  const fake = new FakeGitHub(seed);
  for (const [repo, files] of Object.entries(opts.extraRepos || {})) for (const [p, d] of Object.entries(files)) fake.set(p, d, repo);
  await context.route('https://api.github.com/**', r => fake.handle(r));
  await context.route(/^https?:\/\/(?!127\.0\.0\.1).*/, r => { if (r.request().url().startsWith('https://api.github.com')) return r.fallback(); return r.abort(); });
  await context.addInitScript(({ cfg, theme }) => { try { localStorage.setItem('workjournal.ghconfig.v1', JSON.stringify(cfg)); localStorage.setItem('workjournal.theme.v1', theme); } catch (e) {} }, { cfg: cfgUse, theme: opts.theme || 'light' });
  const page = await context.newPage();
  const dialogs = [];
  let dialogAnswer = true;
  page.on('dialog', d => { dialogs.push(d.message()); dialogAnswer ? d.accept() : d.dismiss(); });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|favicon/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=업무일지', { timeout: 20000 });
  return {
    page, fake, dialogs, errors, base,
    setDialogAnswer: v => { dialogAnswer = v; },
    close: async () => { await browser.close(); server.close(); },
  };
}

module.exports = { launch, FakeGitHub };
