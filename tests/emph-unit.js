// 강조(==) 순수 로직 테스트: index.html 안의 실제 코드를 그대로 꺼내서 돌림(복사본이 아님)
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const html = fs.readFileSync(process.env.INDEX || path.join(__dirname, '..', 'index.html'), 'utf8');
const a = html.indexOf('const EMPH_RE');
const b = html.indexOf('// 입력칸 위의 [강조] 버튼 동작');
if (a < 0 || b < 0 || b < a) throw new Error('index.html에서 강조 로직 구간을 찾지 못했음(주석 경계가 바뀌었나?)');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(html.slice(a, b) + '\nthis.api = { parseEmph, stripEmph, hasEmph, emphInfo, toggleEmph };', ctx);
const { parseEmph, stripEmph, hasEmph, emphInfo, toggleEmph } = ctx.api;

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  PASS', name); } catch (e) { fail++; console.log('  FAIL', name, '\n       ', e.message.split('\n')[0]); } };
const segs = s => parseEmph(s).segs.map(g => (g.emph ? '[' + g.text + ']' : g.text)).join('');

console.log('\n[강조 로직 단위 테스트]');

t('기본: ==말== 이 강조로 인식되고 마커는 글에서 빠짐', () => {
  assert.strictEqual(parseEmph('가 ==나== 다').plain, '가 나 다');
  assert.strictEqual(segs('가 ==나== 다'), '가 [나] 다');
});
t('여러 개', () => assert.strictEqual(segs('==a== b ==c=='), '[a] b [c]'));
t('붙어 있어도: ==a====b==', () => assert.strictEqual(parseEmph('==a====b==').plain.length >= 1, true));
t('강조가 없으면 그대로', () => { assert.strictEqual(parseEmph('그냥 글').plain, '그냥 글'); assert.strictEqual(hasEmph('그냥 글'), false); });
t('비교식 "a == b"는 강조가 아님(공백 붙은 ==)', () => { assert.strictEqual(hasEmph('a == b and c == d'), false); assert.strictEqual(stripEmph('a == b'), 'a == b'); });
t('짝이 안 맞는 ==는 글자로 남음', () => { assert.strictEqual(stripEmph('앞 ==뒤'), '앞 ==뒤'); assert.strictEqual(hasEmph('앞 ==뒤'), false); });
t('빈 강조 ==== 는 글자로 남음', () => assert.strictEqual(stripEmph('a ==== b'), 'a ==== b'));
t('안쪽 앞뒤가 공백이면 강조 아님: "== a =="', () => assert.strictEqual(hasEmph('== a =='), false));
t('여러 줄에 걸친 강조', () => { const p = parseEmph('x ==줄1\n줄2== y'); assert.strictEqual(p.plain, 'x 줄1\n줄2 y'); assert.strictEqual(hasEmph('x ==줄1\n줄2== y'), true); });
t('null/undefined/숫자 입력에 안 깨짐', () => { assert.strictEqual(stripEmph(null), ''); assert.strictEqual(stripEmph(undefined), ''); assert.strictEqual(stripEmph(12), '12'); assert.strictEqual(hasEmph(null), false); });
t('검색용: stripEmph는 마커를 지움', () => assert.strictEqual(stripEmph('서버 ==백업== 필수').includes('백업 필수'), true));
t('이모지/한글/영문 섞여도', () => assert.strictEqual(stripEmph('😀 ==한글abc🙂== 끝'), '😀 한글abc🙂 끝'));

// toggle: 선택 위치는 원문 기준
const sel = (raw, sub, nth = 0) => { let i = -1; for (let k = 0; k <= nth; k++) i = raw.indexOf(sub, i + 1); return [i, i + sub.length]; };
t('선택한 글자를 강조로 감쌈', () => { const [s, e] = sel('서버 점검 전 백업', '백업'); const r = toggleEmph('서버 점검 전 백업', s, e); assert.strictEqual(r.value, '서버 점검 전 ==백업=='); assert.strictEqual(r.value.slice(r.s, r.e), '백업'); });
t('이미 강조된 글자를 선택해 누르면 해제', () => { const raw = '서버 ==백업== 필수'; const [s, e] = sel(raw, '백업'); const r = toggleEmph(raw, s, e); assert.strictEqual(r.value, '서버 백업 필수'); });
t('마커까지 포함해 선택해도 해제됨', () => { const raw = '서버 ==백업== 필수'; const [s, e] = sel(raw, '==백업=='); assert.strictEqual(toggleEmph(raw, s, e).value, '서버 백업 필수'); });
t('강조 일부만 선택해 누르면 그 부분만 해제(나머지는 유지)', () => { const raw = '==abcdef=='; const r = toggleEmph(raw, 4, 6); assert.strictEqual(parseEmph(r.value).plain, 'abcdef'); assert.strictEqual(segs(r.value), '[ab]cd[ef]'); });
t('강조와 일반이 섞인 선택 → 전체가 강조로 합쳐짐', () => { const raw = 'a ==b== c'; const r = toggleEmph(raw, 0, raw.length); assert.strictEqual(r.value, '==a b c=='); });
t('선택 양끝 공백은 강조 밖으로 빠짐(안 그러면 인식 안 됨)', () => { const r = toggleEmph('가 나 다', 1, 4); assert.strictEqual(r.value, '가 ==나== 다'); assert.strictEqual(hasEmph(r.value), true); });
t('선택이 공백뿐/비어 있으면 null', () => { assert.strictEqual(toggleEmph('가  나', 1, 3), null); assert.strictEqual(toggleEmph('가나', 1, 1), null); assert.strictEqual(toggleEmph('', 0, 0), null); });
t('선택 방향이 거꾸로(end<start)여도 동작', () => assert.strictEqual(toggleEmph('가나다', 2, 0).value, '==가나==다'));
t('범위를 벗어난 선택 위치도 안 깨짐', () => { assert.strictEqual(toggleEmph('가나', -5, 99).value, '==가나=='); assert.doesNotThrow(() => emphInfo('가나', 50, 99)); });
t('이웃한 두 강조를 통째로 선택하면(전부 강조 상태) 해제됨', () => { const raw = '==a== ==b=='; assert.strictEqual(toggleEmph(raw, 0, raw.length).value, 'a b'); });
t('여러 줄 선택 강조 → 파싱해도 줄바꿈 보존', () => { const raw = '첫줄\n둘째줄'; const r = toggleEmph(raw, 0, raw.length); assert.strictEqual(r.value, '==첫줄\n둘째줄=='); assert.strictEqual(stripEmph(r.value), raw); });
t('emphInfo: 선택 없음 → can=false', () => assert.strictEqual(JSON.stringify(emphInfo('가나다', 1, 1)), JSON.stringify({ can: false, active: false })));
t('emphInfo: 일반 글자 선택 → can, active=false', () => assert.strictEqual(JSON.stringify(emphInfo('가나다', 0, 2)), JSON.stringify({ can: true, active: false })));
t('emphInfo: 강조 안 선택 → active=true', () => assert.strictEqual(JSON.stringify(emphInfo('==가나다==', 3, 5)), JSON.stringify({ can: true, active: true })));
t('emphInfo: 빈 문자열/없는 값', () => { assert.strictEqual(JSON.stringify(emphInfo('', 0, 0)), JSON.stringify({ can: false, active: false })); assert.strictEqual(JSON.stringify(emphInfo(null, 0, 1)), JSON.stringify({ can: false, active: false })); });

// 무작위 검증: 어떤 글/선택에서도 (1) 글 내용은 안 바뀌고 (2) 두 번 누르면 원래 강조 상태로 돌아오고 (3) 선택 위치가 유효
t('무작위 3000회: 글 내용 보존 + 토글 두 번이면 원상복구 + 선택 위치 유효', () => {
  let seed = 12345; const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const alpha = ['가', '나', '다', 'a', 'b', ' ', ' ', '\n', '=', '1'];
  for (let it = 0; it < 3000; it++) {
    let raw = ''; const len = rnd(14);
    for (let k = 0; k < len; k++) raw += alpha[rnd(alpha.length)];
    if (rnd(3) === 0) { const i = rnd(raw.length + 1); raw = raw.slice(0, i) + '==' + raw.slice(i); }
    const s = rnd(raw.length + 1), e = rnd(raw.length + 1);
    const before = parseEmph(raw).plain;
    const r = toggleEmph(raw, s, e);
    if (r === null) continue;
    assert.ok(r.s >= 0 && r.e <= r.value.length && r.s <= r.e, `선택 위치 이상 raw=${JSON.stringify(raw)} s=${s} e=${e} -> ${JSON.stringify(r)}`);
    // 내용 보존은 "마커를 뺀 글"이 같아야 함. 단, 원문에 남아 있던 짝 안 맞는 ==가 새 마커와 짝지어지면 달라질 수 있어 그런 경우는 제외
    if (!/==/.test(before)) {
      assert.strictEqual(parseEmph(r.value).plain, before, `글 내용이 바뀜 raw=${JSON.stringify(raw)} s=${s} e=${e} -> ${JSON.stringify(r.value)}`);
      const r2 = toggleEmph(r.value, r.s, r.e);
      if (!r2) { assert.ok(before.includes('='), '= 가 없는데 두 번째 토글이 null raw=' + JSON.stringify(raw)); continue; } // '='로 시작/끝나는 글자는 ==로 감쌀 수 없어 거절하는 게 정상
      assert.ok(r2, '두 번째 토글이 null raw=' + JSON.stringify(raw) + ' s=' + s + ' e=' + e + ' r=' + JSON.stringify(r));
      assert.strictEqual(parseEmph(r2.value).plain, before);
      // 첫 번째로 강조가 됐다면 두 번째는 해제, 반대도 성립
      const i1 = emphInfo(raw, s, e).active, i2 = emphInfo(r.value, r.s, r.e).active;
      assert.notStrictEqual(i1, i2, `상태가 안 뒤집힘 raw=${JSON.stringify(raw)}`);
    }
  }
});

console.log(`\n결과: ${pass}/${pass + fail} 통과`);
if (fail) { process.exitCode = 1; }
