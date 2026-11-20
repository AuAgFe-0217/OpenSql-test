/* Open SQL Lab · 가상 SQL 실행기 (브라우저 전용, SAP 미연결)
 * 지원: SELECT [SINGLE|DISTINCT] 목록 FROM 테이블 [AS 별칭] [INNER|LEFT OUTER JOIN ... ON ...]*
 *       WHERE(AND/OR/NOT/괄호, 비교, BETWEEN, LIKE, IN, IS [NOT] NULL|INITIAL, [NOT] EXISTS, IN/스칼라 서브쿼리)
 *       GROUP BY / HAVING, 집계(COUNT SUM AVG MIN MAX), CASE, 산술식, COALESCE/ABS/CEIL/FLOOR/ROUND/DIV/MOD
 *       ORDER BY [PRIMARY KEY], UP TO n ROWS, SELECT FROM ... FIELDS ... (From-first 문법)
 * 미지원: FOR ALL ENTRIES, RIGHT OUTER JOIN, UNION, WITH, 윈도우 함수 → 오류 메시지로 안내
 */
(() => {
  'use strict';
  const KEYS = { SCARR: ['CARRID'], SPFLI: ['CARRID', 'CONNID'], SFLIGHT: ['CARRID', 'CONNID', 'FLDATE'], SBOOK: ['CARRID', 'CONNID', 'FLDATE', 'BOOKID'] };
  const AGG = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'];
  const MARK = new Set(['FROM', 'FIELDS', 'WHERE', 'GROUP', 'HAVING', 'ORDER', 'INTO', 'APPENDING', 'UP', 'FOR', 'OFFSET']);
  const NOTFOUND = Symbol('nf');

  /* ---------- 전처리 ---------- */
  function stripComments(src) {
    return String(src || '').split(/\r?\n/).map(line => {
      if (/^\*/.test(line)) return '';
      let q = '';
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (q) { if (c === q) q = ''; continue; }
        if (c === "'" || c === '`') { q = c; continue; }
        if (c === '"') return line.slice(0, i);
      }
      return line;
    }).join('\n');
  }
  function extractStatement(src) {
    const clean = stripComments(src);
    const m = /\bSELECT\b(?!-)/i.exec(clean);
    if (!m) return null;
    let depth = 0, q = '', i = m.index;
    for (; i < clean.length; i++) {
      const c = clean[i];
      if (q) { if (c === q) q = ''; continue; }
      if (c === "'" || c === '`') { q = c; continue; }
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === '.' && depth <= 0 && !(/\d/.test(clean[i - 1] || '') && /\d/.test(clean[i + 1] || ''))) break;
    }
    return clean.slice(m.index, i);
  }
  function tokenize(s) {
    const out = []; let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === "'" || c === '`') {
        let j = i + 1, v = '';
        while (j < s.length) { if (s[j] === c) { if (s[j + 1] === c) { v += c; j += 2; continue; } break; } v += s[j++]; }
        if (j >= s.length) throw Error('문자열 리터럴이 닫히지 않았습니다.');
        out.push({ t: 'str', v }); i = j + 1; continue;
      }
      const rest = s.slice(i); let m;
      if ((m = /^\d+(?:\.\d+)?/.exec(rest))) { out.push({ t: 'num', v: Number(m[0]) }); i += m[0].length; continue; }
      if ((m = /^@?[A-Za-z_][A-Za-z0-9_]*(?:~(?:[A-Za-z_][A-Za-z0-9_]*|\*))?/.exec(rest))) {
        let w = m[0], j = i + w.length;
        if (w[0] === '@') { const m2 = /^(?:-[A-Za-z_][A-Za-z0-9_]*)+/.exec(s.slice(j)); if (m2) { w += m2[0]; j += m2[0].length; } }
        out.push({ t: 'id', v: w.toUpperCase() }); i = j; continue;
      }
      if ((m = /^(<>|<=|>=|!=|[=<>+\-*/(),])/.exec(rest))) { out.push({ t: 'op', v: m[0] }); i += m[0].length; continue; }
      throw Error('해석할 수 없는 문자입니다: ' + c);
    }
    return out;
  }

  /* ---------- 값 유틸 ---------- */
  const isNumLike = v => typeof v === 'number' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()));
  const sstr = v => String(v).replace(/\s+$/, '');
  function eq(a, b) {
    if (a == null || b == null) return false;
    if ((typeof a === 'number' || typeof b === 'number') && isNumLike(a) && isNumLike(b)) return Number(a) === Number(b);
    return sstr(a) === sstr(b);
  }
  function cmp(a, b) {
    if ((typeof a === 'number' || typeof b === 'number') && isNumLike(a) && isNumLike(b)) return Number(a) - Number(b);
    const x = sstr(a), y = sstr(b); return x < y ? -1 : x > y ? 1 : 0;
  }
  const isInitial = v => v == null || v === '' || v === 0 || v === '00000000' || v === '0000-00-00';
  const round2 = n => (Number.isInteger(n) ? n : Math.round(n * 100) / 100);

  function sample(col, i) {
    const n = col.toUpperCase();
    if (n === 'CARRID') return ['AA', 'LH', 'QF'][i];
    if (n === 'CONNID') return ['0017', '0400', '0012'][i];
    if (n === 'FLDATE') return ['2026-12-02', '2026-12-05', '2026-12-06'][i];
    if (n.includes('CURRENCY') || n.includes('CURR')) return ['USD', 'EUR', 'AUD'][i];
    if (/PRICE|AMOUNT|SEAT|COUNT|DISTANCE/.test(n)) return (i + 1) * 100;
    if (n.includes('NAME')) return ['예시 A', '예시 B', '예시 C'][i];
    return '예시' + (i + 1);
  }
  function virtualRows(table, env) {
    const d = env.data || {};
    if (d[table]) return d[table].map(x => ({ ...x }));
    const p = env.project;
    if (!p || !((p.primaryTable || '').toUpperCase() === table || (p.tables || []).includes(table))) return null;
    const cols = p.fields || [];
    return [0, 1, 2].map(i => Object.fromEntries(cols.map(c => [c, sample(c, i)])));
  }
  function hostValue(raw, env) {
    const name = raw.replace(/^@/, '').toUpperCase();
    const b = env.bindings || {};
    if (name in b) return b[name];
    if (name === 'ABAP_TRUE') return 'X';
    if (name === 'ABAP_FALSE' || name === 'ABAP_UNDEFINED') return '';
    const map = { LV_CARRID: 'AA', S_CARRID: ['AA'], LV_CONNID: '0017', S_CONNID: ['0017'], LV_DATE: '2026-12-02' };
    if (name in map) return map[name];
    if (name.includes('CARR')) return name.startsWith('S_') ? ['AA'] : 'AA';
    if (name.includes('CONN')) return name.startsWith('S_') ? ['0017'] : '0017';
    if (name.includes('DATE')) return '2026-12-02';
    return name.startsWith('S_') ? [] : 0;
  }
  function lookup(scope, name) {
    const k = name.indexOf('~');
    for (let s = scope; s; s = s.outer) {
      const rows = s.rows || {};
      if (k >= 0) {
        const a = name.slice(0, k), f = name.slice(k + 1);
        if (a in rows) { if (f in rows[a]) return rows[a][f]; throw Error(a + ' 데이터 소스에 ' + f + ' 열이 없습니다.'); }
      } else {
        const hits = Object.keys(rows).filter(a => name in rows[a]);
        if (hits.length > 1) throw Error('열 이름이 모호합니다: ' + name + ' → 별칭~열 형태(예: ' + hits[0] + '~' + name + ')로 쓰세요.');
        if (hits.length === 1) return rows[hits[0]][name];
      }
    }
    return NOTFOUND;
  }

  /* ---------- 파서 ---------- */
  class P {
    constructor(t) { this.t = t; this.i = 0; this.agg = false; }
    peek(o = 0) { return this.t[this.i + o]; }
    isId(v, o = 0) { const k = this.peek(o); return !!k && k.t === 'id' && k.v === v; }
    isOp(v, o = 0) { const k = this.peek(o); return !!k && k.t === 'op' && k.v === v; }
    eatId(v) { if (this.isId(v)) { this.i++; return true; } return false; }
    eatOp(v) { if (this.isOp(v)) { this.i++; return true; } return false; }
    expectOp(v) { if (!this.eatOp(v)) throw Error("'" + v + "' 가 필요합니다."); }
    expectId(v) { if (!this.eatId(v)) throw Error(v + ' 키워드가 필요합니다.'); }
    end() { return this.i >= this.t.length; }
    sliceParen() { // '(' 직후 위치에서 짝이 맞는 ')' 직전까지의 토큰을 반환하고 ')' 뒤로 이동
      let d = 1, j = this.i;
      for (; j < this.t.length; j++) { const k = this.t[j]; if (k.t === 'op') { if (k.v === '(') d++; else if (k.v === ')') { d--; if (!d) break; } } }
      if (d) throw Error("')' 가 필요합니다.");
      const out = this.t.slice(this.i, j); this.i = j + 1; return out;
    }
    subquery() { const toks = this.sliceParen(); const ast = parseSelect(toks); return scope => exec(ast, scope.env, scope); }

    /* 조건식 */
    or() { let l = this.and(); while (this.eatId('OR')) { const a = l, b = this.and(); l = s => a(s) || b(s); } return l; }
    and() { let l = this.not(); while (this.eatId('AND')) { const a = l, b = this.not(); l = s => a(s) && b(s); } return l; }
    not() { if (this.isId('NOT')) { this.i++; const c = this.not(); return s => !c(s); } return this.pred(); }
    pred() {
      if (this.isId('EXISTS') && this.isOp('(', 1) && this.isId('SELECT', 2)) {
        this.i += 2; const sq = this.subquery(); return s => sq(s).length > 0;
      }
      if (this.isOp('(') && !this.isId('SELECT', 1)) {
        const save = this.i;
        try { this.i++; const c = this.or(); this.expectOp(')'); if (!/^(=|<>|<|>|<=|>=|!=|\+|-|\*|\/)$/.test((this.peek() || {}).v || '') && !(this.peek() && this.peek().t === 'id' && /^(EQ|NE|LT|GT|LE|GE|IS|IN|NOT|BETWEEN|LIKE)$/.test(this.peek().v))) return c; } catch (e) { /* 산술식 괄호로 재해석 */ }
        this.i = save;
      }
      const left = this.add();
      let neg = false;
      if (this.isId('IS')) {
        this.i++; neg = this.eatId('NOT');
        if (this.eatId('NULL')) return s => { const v = left(s); return neg ? v != null : v == null; };
        if (this.eatId('INITIAL')) return s => { const v = left(s); return neg ? !isInitial(v) : isInitial(v); };
        throw Error('IS 뒤에는 [NOT] NULL 또는 [NOT] INITIAL 이 필요합니다.');
      }
      if (this.isId('NOT') && /^(IN|BETWEEN|LIKE)$/.test((this.peek(1) || {}).v)) { this.i++; neg = true; }
      if (this.eatId('BETWEEN')) {
        const a = this.add(); this.expectId('AND'); const b = this.add();
        return s => { const v = left(s), x = a(s), y = b(s); if (v == null) return false; const r = cmp(v, x) >= 0 && cmp(v, y) <= 0; return neg ? !r : r; };
      }
      if (this.eatId('LIKE')) {
        const pat = this.add();
        return s => {
          const v = left(s); if (v == null) return false;
          const re = new RegExp('^' + String(pat(s)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$');
          const r = re.test(sstr(v)); return neg ? !r : r;
        };
      }
      if (this.eatId('IN')) {
        if (this.peek() && this.peek().t === 'id' && this.peek().v[0] === '@') {
          const nm = this.peek().v; this.i++;
          return s => { let r = hostValue(nm, s.env); if (!Array.isArray(r)) r = [r]; const v = left(s); const ok = r.length === 0 || r.some(x => eq(v, x)); return neg ? !ok : ok; };
        }
        this.expectOp('(');
        if (this.isId('SELECT')) {
          const sq = this.subquery();
          return s => { const v = left(s); const ok = sq(s).some(row => eq(v, Object.values(row)[0])); return neg ? !ok : ok; };
        }
        const items = [];
        do { items.push(this.add()); } while (this.eatOp(','));
        this.expectOp(')');
        return s => { const v = left(s); const ok = items.some(f => { const x = f(s); return Array.isArray(x) ? x.some(y => eq(v, y)) : eq(v, x); }); return neg ? !ok : ok; };
      }
      const t = this.peek(); let op = null;
      if (t && t.t === 'op' && /^(=|<>|<|>|<=|>=|!=)$/.test(t.v)) op = t.v;
      else if (t && t.t === 'id' && /^(EQ|NE|LT|GT|LE|GE)$/.test(t.v)) op = { EQ: '=', NE: '<>', LT: '<', GT: '>', LE: '<=', GE: '>=' }[t.v];
      if (!op) throw Error('비교 연산자(=, <>, <, >, <=, >=, BETWEEN, LIKE, IN, IS ...)가 필요합니다.');
      this.i++;
      const right = this.add();
      return s => {
        const a = left(s), b = right(s);
        if (a == null || b == null) return false;
        switch (op) { case '=': return eq(a, b); case '<>': case '!=': return !eq(a, b); case '<': return cmp(a, b) < 0; case '>': return cmp(a, b) > 0; case '<=': return cmp(a, b) <= 0; default: return cmp(a, b) >= 0; }
      };
    }

    /* 산술식 */
    add() {
      let l = this.mul();
      while (this.isOp('+') || this.isOp('-')) { const op = this.peek().v; this.i++; const a = l, b = this.mul(); l = s => { const x = a(s), y = b(s); return x == null || y == null ? null : op === '+' ? Number(x) + Number(y) : Number(x) - Number(y); }; }
      return l;
    }
    mul() {
      let l = this.unary();
      while (this.isOp('*') || this.isOp('/')) { const op = this.peek().v; this.i++; const a = l, b = this.unary(); l = s => { const x = a(s), y = b(s); if (x == null || y == null) return null; if (op === '/' && Number(y) === 0) throw Error('0으로 나눌 수 없습니다.'); return op === '*' ? Number(x) * Number(y) : Number(x) / Number(y); }; }
      return l;
    }
    unary() { if (this.eatOp('-')) { const f = this.unary(); return s => -Number(f(s)); } return this.primary(); }
    primary() {
      const t = this.peek();
      if (!t) throw Error('식이 끝났습니다. 값이 더 필요합니다.');
      if (t.t === 'num') { this.i++; return () => t.v; }
      if (t.t === 'str') { this.i++; return () => t.v; }
      if (t.t === 'op' && t.v === '(') {
        this.i++;
        if (this.isId('SELECT')) { const sq = this.subquery(); return s => { const r = sq(s); if (!r.length) return null; return Object.values(r[0])[0]; }; }
        const e = this.add(); this.expectOp(')'); return e;
      }
      if (t.t !== 'id') throw Error('예상하지 못한 기호입니다: ' + t.v);
      this.i++;
      const v = t.v;
      if (v === 'CASE') return this.caseExpr();
      if (this.isOp('(') && !v.includes('~') && v[0] !== '@') return this.func(v);
      if (v[0] === '@') return s => hostValue(v, s.env);
      if (v === 'ABAP_TRUE' || v === 'ABAP_FALSE') return s => hostValue(v, s.env);
      return s => {
        const r = lookup(s, v);
        if (r !== NOTFOUND) return r;
        const b = (s.env.bindings || {});
        if (v in b) return b[v];
        throw Error('데이터 소스에서 열을 찾지 못했습니다: ' + v + '. 실제 테이블 열인지 확인하세요. 계산 결과나 로컬 구조의 필드라면 SELECT 목록에서 CASE·집계식 등으로 값을 만든 뒤 AS ' + v + ' 별칭을 지정해야 합니다. ABAP 호스트 변수라면 @' + v + '처럼 @를 붙이세요.');
      };
    }
    caseExpr() {
      let base = null;
      if (!this.isId('WHEN')) base = this.add();
      const whens = [];
      while (this.eatId('WHEN')) {
        let cond;
        if (base) { const val = this.add(); const b = base; cond = s => eq(b(s), val(s)); } else cond = this.or();
        this.expectId('THEN'); whens.push([cond, this.add()]);
      }
      let els = () => null;
      if (this.eatId('ELSE')) els = this.add();
      this.expectId('END');
      if (!whens.length) throw Error('CASE에는 WHEN이 하나 이상 필요합니다.');
      return s => { for (const [c, v] of whens) if (c(s)) return v(s); return els(s); };
    }
    func(name) {
      this.expectOp('(');
      if (AGG.includes(name)) {
        this.agg = true;
        let distinct = this.eatId('DISTINCT'), arg = null;
        if (this.isOp('*')) { this.i++; if (name !== 'COUNT') throw Error(name + '( * ) 는 사용할 수 없습니다.'); } else arg = this.add();
        this.expectOp(')');
        return s => {
          if (!s.bucket) throw Error('집계 함수는 SELECT 목록·HAVING·ORDER BY에서만 사용할 수 있습니다.');
          if (!arg) return s.bucket.length;
          let vals = s.bucket.map(sc => arg(sc)).filter(x => x != null);
          if (distinct) { const seen = new Set(); vals = vals.filter(x => { const k = typeof x + String(x); if (seen.has(k)) return false; seen.add(k); return true; }); }
          if (name === 'COUNT') return vals.length;
          if (!vals.length) return name === 'SUM' || name === 'AVG' ? 0 : null;
          if (name === 'SUM') return round2(vals.reduce((a, b) => a + Number(b), 0));
          if (name === 'AVG') return round2(vals.reduce((a, b) => a + Number(b), 0) / vals.length);
          return vals.reduce((a, b) => (name === 'MIN' ? (cmp(b, a) < 0 ? b : a) : (cmp(b, a) > 0 ? b : a)));
        };
      }
      const args = [];
      if (!this.isOp(')')) do { args.push(this.add()); } while (this.eatOp(','));
      this.expectOp(')');
      const fn = {
        COALESCE: (...a) => a.find(x => x != null) ?? null,
        ABS: x => x == null ? null : Math.abs(Number(x)),
        CEIL: x => x == null ? null : Math.ceil(Number(x)),
        FLOOR: x => x == null ? null : Math.floor(Number(x)),
        ROUND: (x, n = 0) => x == null ? null : Math.round(Number(x) * 10 ** n) / 10 ** n,
        DIV: (a, b) => a == null || b == null ? null : Math.trunc(Number(a) / Number(b)),
        MOD: (a, b) => a == null || b == null ? null : Number(a) % Number(b)
      }[name];
      if (!fn) throw Error(name + ' 함수는 이 가상 실행기에서 지원하지 않습니다. (지원: COUNT SUM AVG MIN MAX COALESCE ABS CEIL FLOOR ROUND DIV MOD)');
      return s => fn(...args.map(f => f(s)));
    }
  }

  function splitTop(tokens) {
    const out = [[]]; let d = 0;
    for (const k of tokens) {
      if (k.t === 'op' && k.v === '(') d++;
      if (k.t === 'op' && k.v === ')') d--;
      if (k.t === 'op' && k.v === ',' && d === 0) out.push([]); else out[out.length - 1].push(k);
    }
    return out.filter(x => x.length);
  }

  function parseSelect(tokens) {
    if (!tokens.length || !tokens[0] || tokens[0].v !== 'SELECT') throw Error('SELECT 문을 찾지 못했습니다.');
    const segs = []; let d = 0;
    for (let i = 0; i < tokens.length; i++) {
      const k = tokens[i];
      if (k.t === 'op') { if (k.v === '(') d++; else if (k.v === ')') d--; continue; }
      if (d !== 0 || k.t !== 'id') continue;
      const nx = tokens[i + 1] && tokens[i + 1].v, pv = tokens[i - 1] && tokens[i - 1].v;
      const hit = i === 0 ? 'SELECT'
        : k.v === 'FIELDS' ? (pv === 'CORRESPONDING' ? null : 'FIELDS')
        : k.v === 'GROUP' ? (nx === 'BY' ? 'GROUP' : null)
        : k.v === 'ORDER' ? (nx === 'BY' ? 'ORDER' : null)
        : k.v === 'UP' ? (nx === 'TO' ? 'UP' : null)
        : k.v === 'FOR' ? (nx === 'ALL' ? 'FOR' : null)
        : MARK.has(k.v) && !['FIELDS', 'GROUP', 'ORDER', 'UP', 'FOR'].includes(k.v) ? k.v : null;
      if (hit) segs.push({ name: hit, start: i });
    }
    segs.forEach((s, n) => { s.toks = tokens.slice(s.start + 1, n + 1 < segs.length ? segs[n + 1].start : tokens.length); });
    const get = nm => (segs.find(s => s.name === nm) || {}).toks;
    if (get('FOR')) throw Error('FOR ALL ENTRIES는 기준 내부 테이블이 필요해 가상 실행하지 않습니다. 문법 구조 채점만 제공합니다.');
    if (get('OFFSET')) throw Error('OFFSET은 가상 실행에서 지원하지 않습니다.');

    let head = segs[0].toks.slice(), single = false, distinct = false;
    if (head[0] && head[0].v === 'SINGLE') { single = true; head.shift(); }
    if (head[0] && head[0].v === 'DISTINCT') { distinct = true; head.shift(); }
    let listToks;
    if (get('FROM') && !head.length) listToks = get('FIELDS');   // SELECT FROM ... FIELDS ... (From-first)
    else listToks = head;
    if (!get('FROM')) throw Error('FROM 뒤에 테이블 이름이 필요합니다.');
    if (!listToks || !listToks.length) throw Error('SELECT 열 목록을 해석하지 못했습니다.');

    const fromP = new P(get('FROM'));
    const sources = [];
    const readTable = () => { const t = fromP.peek(); if (!t || t.t !== 'id') throw Error('FROM 뒤에 테이블 이름이 필요합니다.'); fromP.i++; let alias = t.v; if (fromP.eatId('AS')) { const a = fromP.peek(); if (!a || a.t !== 'id') throw Error('AS 뒤에 별칭이 필요합니다.'); fromP.i++; alias = a.v; } return { table: t.v, alias }; };
    sources.push({ ...readTable(), type: 'BASE' });
    while (!fromP.end()) {
      let type = 'INNER';
      if (fromP.eatId('INNER')) type = 'INNER';
      else if (fromP.eatId('LEFT')) { fromP.eatId('OUTER'); type = 'LEFT'; }
      else if (fromP.isId('RIGHT')) throw Error('RIGHT OUTER JOIN은 가상 실행에서 지원하지 않습니다. LEFT OUTER JOIN으로 바꿔 보세요.');
      fromP.expectId('JOIN');
      const src = readTable();
      fromP.expectId('ON');
      src.on = fromP.or(); src.type = type; sources.push(src);
    }

    const sel = new P([]); let aggUsed = false;
    const items = [];
    const noComma = listToks.length > 1 && !listToks.some(k => k.t === 'op') && listToks.every(k => k.t === 'id');
    const parts = noComma ? listToks.map(k => [k]) : splitTop(listToks);
    parts.forEach((pt, n) => {
      if (pt.length === 1 && pt[0].t === 'op' && pt[0].v === '*') { items.push({ star: '' }); return; }
      if (pt.length === 1 && pt[0].t === 'id' && /~\*$/.test(pt[0].v)) { items.push({ star: pt[0].v.slice(0, -2) }); return; }
      let name = null, body = pt;
      const ai = pt.length >= 3 ? pt.length - 2 : -1;
      if (ai > 0 && pt[ai].t === 'id' && pt[ai].v === 'AS' && pt[ai + 1].t === 'id') { name = pt[ai + 1].v; body = pt.slice(0, ai); }
      const p = new P(body); const f = p.add(); if (!p.end()) throw Error('SELECT 항목을 해석하지 못했습니다: ' + body.map(x => x.v).join(' '));
      aggUsed = aggUsed || p.agg;
      let auto = null;
      if (body.length === 1 && body[0].t === 'id') auto = body[0].v.replace(/^[^~]*~/, '');
      else if (body[0].t === 'id' && AGG.includes(body[0].v)) { const fld = body.length > 4 ? body[body.length - 2] : null; auto = body[0].v.toLowerCase() + (fld && fld.t === 'id' ? '_' + fld.v.replace(/^[^~]*~/, '').toLowerCase() : ''); }
      items.push({ f, name: name || auto || 'EXPR_' + (n + 1) });
    });

    const whereP = get('WHERE') ? new P(get('WHERE')) : null;
    const where = whereP ? whereP.or() : null;
    if (whereP && !whereP.end()) throw Error('WHERE 조건을 끝까지 해석하지 못했습니다: ' + whereP.t.slice(whereP.i).map(x => x.v).join(' '));
    if (whereP && whereP.agg) throw Error('WHERE에는 집계 함수를 쓸 수 없습니다. 그룹 조건은 HAVING을 사용하세요.');
    const gp = get('GROUP') ? new P(get('GROUP').slice(1)) : null;
    const group = [];
    if (gp) do { group.push(gp.add()); } while (gp.eatOp(','));
    const hp = get('HAVING') ? new P(get('HAVING')) : null;
    const having = hp ? hp.or() : null;
    const order = [];
    if (get('ORDER')) {
      const ot = get('ORDER').slice(1);
      if (ot.length === 2 && ot[0].v === 'PRIMARY' && ot[1].v === 'KEY') order.push({ pk: true });
      else splitTop(ot).forEach(pt => {
        let desc = false, body = pt; const last = pt[pt.length - 1];
        if (last && last.t === 'id' && /^(ASCENDING|ASC|DESCENDING|DESC)$/.test(last.v)) { desc = /^DESC/.test(last.v); body = pt.slice(0, -1); }
        const p = new P(body); const f = p.add(); if (!p.end()) throw Error('ORDER BY 항목을 해석하지 못했습니다.');
        order.push({ f, desc, ref: body.length === 1 && body[0].t === 'id' ? body[0].v : null });
      });
    }
    let upTo = null;
    if (get('UP')) { const t = get('UP')[1]; if (!t) throw Error('UP TO 뒤에 행 수가 필요합니다.'); upTo = t.t === 'num' ? () => t.v : s => Number(hostValue(t.v, s.env)); }
    const agg = aggUsed || (hp && hp.agg) || false;
    if (!group.length && !agg && having) throw Error('HAVING은 GROUP BY 또는 집계 함수와 함께 사용하세요.');
    void sel;
    return { single, distinct, items, sources, where, group, having, order, upTo, agg: agg || group.length > 0 };
  }

  /* ---------- 실행 ---------- */
  function exec(ast, env, outer) {
    const base = ast.sources[0];
    const load = src => { const r = virtualRows(src.table, env); if (!r) throw Error('허용된 가상 테이블이 아닙니다: ' + src.table + ' (SCARR, SPFLI, SFLIGHT, SBOOK 또는 등록 프로젝트 테이블만 사용 가능)'); return r; };
    let combos = load(base).map(r => ({ [base.alias]: r }));
    for (const j of ast.sources.slice(1)) {
      const rr = load(j), nullRow = Object.fromEntries(Object.keys(rr[0] || {}).map(k => [k, null])), next = [];
      for (const left of combos) {
        let hit = false;
        for (const r of rr) { const rows = { ...left, [j.alias]: r }; if (j.on({ rows, outer, env })) { next.push(rows); hit = true; } }
        if (!hit && j.type === 'LEFT') next.push({ ...left, [j.alias]: nullRow });
      }
      combos = next;
    }
    let scopes = combos.map(rows => ({ rows, outer, env }));
    if (ast.where) scopes = scopes.filter(s => ast.where(s));

    if (ast.agg) {
      const buckets = new Map();
      if (ast.group.length) for (const s of scopes) { const k = JSON.stringify(ast.group.map(g => g(s))); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(s); }
      else buckets.set('ALL', scopes);
      scopes = [...buckets.values()].map(b => ({ rows: b[0] ? b[0].rows : Object.fromEntries(ast.sources.map(x => [x.alias, {}])), outer, env, bucket: b }));
      if (ast.having) scopes = scopes.filter(s => ast.having(s));
    }

    const cols = [];
    const star = alias => {
      const a = alias || '';
      ast.sources.filter(x => !a || x.alias === a).forEach(x => {
        const sample = (scopes[0] && scopes[0].rows[x.alias]) || (virtualRows(x.table, env) || [{}])[0] || {};
        Object.keys(sample).forEach(k => cols.push({ f: s => s.rows[x.alias][k], name: k, src: x.alias }));
      });
    };
    ast.items.forEach(it => { if ('star' in it) star(it.star); else cols.push(it); });
    const seen = new Set();
    cols.forEach(c => { let n = c.name; if (seen.has(n)) n = (c.src ? c.src + '~' : '') + n; if (seen.has(n)) n += '_2'; seen.add(n); c.out = n; });

    let rows = scopes.map(s => ({ out: Object.fromEntries(cols.map(c => [c.out, c.f(s)])), s }));
    if (ast.distinct) { const k = new Set(); rows = rows.filter(r => { const key = JSON.stringify(r.out); if (k.has(key)) return false; k.add(key); return true; }); }
    if (ast.order.length) {
      const keyOf = (r, o) => {
        if (o.pk) return KEYS[base.table] || [];
        if (o.ref && o.ref in r.out) return r.out[o.ref];
        return o.f(r.s);
      };
      rows.sort((a, b) => {
        for (const o of ast.order) {
          if (o.pk) { for (const k of KEYS[base.table] || []) { const c = cmp(a.s.rows[base.alias][k] ?? '', b.s.rows[base.alias][k] ?? ''); if (c) return c; } continue; }
          const x = keyOf(a, o), y = keyOf(b, o);
          const c = x == null && y == null ? 0 : x == null ? -1 : y == null ? 1 : cmp(x, y);
          if (c) return o.desc ? -c : c;
        }
        return 0;
      });
    }
    let out = rows.map(r => r.out);
    if (ast.upTo) { const n = ast.upTo({ env, outer }); if (n >= 0) out = out.slice(0, n); }
    if (ast.single) out = out.slice(0, 1);
    return out;
  }

  function run(code, ctx = {}) {
    try {
      // The practice runner accepts one Open SQL SELECT statement, not a full ABAP report.
      const clean = stripComments(code);
      const selectMatch = /\bSELECT\b(?!-)/i.exec(clean);
      if (!selectMatch) throw Error('Open SQL SELECT 문을 입력해 주세요. 이 실행기는 ABAP 전체 프로그램은 실행하지 않습니다.');
      const text = extractStatement(code);
      const before = clean.slice(0, selectMatch.index).trim();
      const after = clean.slice(selectMatch.index + text.length).trim().replace(/^\./, '').trim();
      if (before || after) throw Error('순수 Open SQL SELECT 한 문장만 실행할 수 있습니다. SELECT 앞뒤의 ABAP 문장은 제거해 주세요.');
      const ast = parseSelect(tokenize(text));
      const env = { data: ctx.data || {}, project: ctx.project || null, bindings: Object.fromEntries(Object.entries(ctx.bindings || {}).map(([k, v]) => [k.toUpperCase(), v])) };
      const rows = exec(ast, env, null);
      const table = ast.sources[0].table;
      return { ok: true, table, rows, count: rows.length, note: '가상 데이터 실행 · ' + ast.sources.map(s => s.table).join(' + ') + ' · ' + (rows.length ? '결과 ' + rows.length + '행' : '결과 없음') + ' · 실제 SAP DB에 연결하지 않음' };
    } catch (e) {
      return { ok: false, error: e.message, note: '이 SQL 부분집합에서 지원하지 않는 구문이거나 조건 형식입니다.' };
    }
  }
  window.openSqlRunner = { run };
})();
