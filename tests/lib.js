const { launch } = require('./harness');
const { seed } = require('./seed');
const assert = require('assert');

const results = [];
async function test(name, fn, opts = {}) {
  const idx = process.env.INDEX || require('path').join(__dirname, '..', 'index.html');
  let app;
  try {
    app = await launch(idx, opts.seed ? opts.seed() : seed(), opts);
    await app.page.waitForTimeout(800);
    await fn(app);
    if (app.errors.length && !opts.allowErrors) throw new Error('페이지 오류 발생: ' + app.errors.join(' | '));
    results.push([name, true]);
    console.log('  PASS', name);
  } catch (e) {
    results.push([name, false, e.message]);
    console.log('  FAIL', name, '\n       ', String(e.message).split('\n').slice(0, 4).join('\n        '));
    if (app && process.env.SHOT) { try { await app.page.screenshot({ path: `fail-${results.length}.png` }); } catch (_) {} }
  } finally {
    if (app) await app.close();
  }
}
function summary() {
  const failed = results.filter(r => !r[1]);
  console.log(`\n결과: ${results.length - failed.length}/${results.length} 통과`);
  if (failed.length) { console.log('실패 목록:'); failed.forEach(f => console.log(' -', f[0])); process.exitCode = 1; }
}

const goTab = async (page, label) => { await page.locator('nav button, button').filter({ hasText: label }).last().click(); await page.waitForTimeout(400); };
const gotoEntries = page => goTab(page, '업무일지');
const gotoQuick = page => goTab(page, '빠른 기록');
const gotoTodos = page => goTab(page, '할 일');
const settle = page => page.waitForTimeout(700);

module.exports = { test, summary, assert, goTab, gotoEntries, gotoQuick, gotoTodos, settle, seed };
