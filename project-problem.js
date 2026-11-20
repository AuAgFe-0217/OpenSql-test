/* Open SQL Lab · 프로젝트 기반 문제 생성기
 *
 * 구조
 *  1) 코어  : 스키마 인식, 시드 난수, 정규화(canon), 체크 헬퍼(K), 결과셋 비교 채점, build()/variants()
 *  2) 카탈로그: def('id', 주제, 난이도, 유형, 사용가능조건, 생성함수) 한 줄로 문제 유형을 추가
 *  3) 프로젝트 소스 문제: 사용자가 등록한 ABAP 코드의 SELECT를 그대로 재작성/빈칸 채우기
 *
 * 새 유형을 추가하려면 아래 "카탈로그" 구역에 def(...)를 하나 더 적으면 됩니다.
 * 기존 variant id(오답노트에 저장된 값)는 모두 그대로 유지됩니다.
 */
(() => {
  'use strict';

  /* ================= 1. 코어 ================= */
  const T = { basic: 'SELECT 기초', cond: '조건과 범위', agg: '집계와 그룹', join: 'JOIN과 서브쿼리', syn: 'ABAP 7.4 문법', res: '결과 처리', perf: '성능과 코드 리뷰' };

  const SCHEMA = {
    SCARR: { key: ['CARRID'], group: [], f: { CARRID: 'id', CARRNAME: 'text', CURRCODE: 'cur', URL: 'text' } },
    SPFLI: { key: ['CARRID', 'CONNID'], group: ['COUNTRYFR', 'CITYFROM', 'COUNTRYTO', 'DISTID'], f: { CARRID: 'id', CONNID: 'id', COUNTRYFR: 'id', CITYFROM: 'text', AIRPFROM: 'id', COUNTRYTO: 'id', CITYTO: 'text', AIRPTO: 'id', FLTIME: 'num', DEPTIME: 'time', ARRTIME: 'time', DISTANCE: 'num', DISTID: 'id', FLTYPE: 'flag', PERIOD: 'num' } },
    SFLIGHT: { key: ['CARRID', 'CONNID', 'FLDATE'], group: ['CARRID', 'PLANETYPE', 'CURRENCY', 'CONNID'], f: { CARRID: 'id', CONNID: 'id', FLDATE: 'date', PRICE: 'num', CURRENCY: 'cur', PLANETYPE: 'id', SEATSMAX: 'num', SEATSOCC: 'num', PAYMENTSUM: 'num', SEATSMAX_B: 'num', SEATSOCC_B: 'num', SEATSMAX_F: 'num', SEATSOCC_F: 'num' } },
    SBOOK: { key: ['CARRID', 'CONNID', 'FLDATE', 'BOOKID'], group: ['CARRID', 'CLASS', 'CUSTTYPE', 'FORCURKEY'], f: { MANDT: 'id', CARRID: 'id', CONNID: 'id', FLDATE: 'date', BOOKID: 'id', CUSTOMID: 'id', CUSTTYPE: 'id', SMOKER: 'flag', LUGGWEIGHT: 'num', WUNIT: 'id', INVOICE: 'flag', CLASS: 'id', FORCURAM: 'num', FORCURKEY: 'cur', LOCCURAM: 'num', LOCCURKEY: 'cur', ORDER_DATE: 'date', COUNTER: 'id', AGENCYNUM: 'id', CANCELLED: 'flag', RESERVED: 'flag', PASSNAME: 'text', PASSFORM: 'text', PASSBIRTH: 'date' } }
  };
  const LABEL = { MANDT: '클라이언트', CARRID: '항공사 코드', CONNID: '항공편 번호', FLDATE: '운항 날짜', PRICE: '운임', CURRENCY: '통화', PLANETYPE: '기종', SEATSMAX: '최대 좌석', SEATSOCC: '예약 좌석', PAYMENTSUM: '결제 합계', CITYFROM: '출발 도시', CITYTO: '도착 도시', DISTANCE: '거리', FLTIME: '비행 시간', COUNTRYFR: '출발 국가', COUNTRYTO: '도착 국가', CARRNAME: '항공사 이름', CURRCODE: '통화 코드', BOOKID: '예약 번호', CUSTOMID: '고객 번호', CUSTTYPE: '고객 유형', CLASS: '좌석 등급', FORCURAM: '외화 금액', LOCCURAM: '현지 통화 금액', ORDER_DATE: '예약 일자', COUNTER: '판매 카운터', AGENCYNUM: '여행사 번호', CANCELLED: '취소 여부', RESERVED: '예약 상태', SMOKER: '흡연 여부', PASSNAME: '탑승자 이름', PASSFORM: '호칭', PASSBIRTH: '생년월일', LUGGWEIGHT: '수하물 무게', WUNIT: '무게 단위', FLTYPE: '전세기 여부', INVOICE: '청구서 발행 여부' };
  const ALIAS = { CARRID: 'AIRLINE', CONNID: 'FLIGHT_NO', FLDATE: 'FLIGHT_DATE', PRICE: 'TICKET_PRICE', CITYFROM: 'ORIGIN', CITYTO: 'DESTINATION', CARRNAME: 'AIRLINE_NAME', SEATSMAX: 'SEATS_TOTAL', SEATSOCC: 'SEATS_TAKEN', DISTANCE: 'DIST', CLASS: 'CABIN', BOOKID: 'BOOKING_NO', CUSTOMID: 'CUSTOMER', FORCURAM: 'FOREIGN_AMT', CURRENCY: 'CURR', PLANETYPE: 'PLANE' };
  const TA = { SCARR: 'C', SPFLI: 'P', SFLIGHT: 'F', SBOOK: 'B' };
  const L = f => (LABEL[f] ? LABEL[f] + '(' + f + ')' : f);

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const rxEsc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const uniq = a => [...new Set(a)];
  const DB = () => window.OPEN_SQL_DATA || {};
  const kindOf = (t, f) => (SCHEMA[t] && SCHEMA[t].f[f]) || (/PRICE|AMOUNT|AM$|SEATS|DISTANCE|TIME|COUNT|QUANT|QTY|MENGE|BETRG|WEIGHT|SUM/i.test(f) ? 'num' : /DATE|DAT$/i.test(f) ? 'date' : 'text');
  const colVals = (t, f) => uniq((DB()[t] || []).map(r => r[f]).filter(v => v !== undefined && v !== null && v !== ''));
  const quant = (t, f, p) => { const v = (DB()[t] || []).map(r => Number(r[f])).filter(Number.isFinite).sort((a, b) => a - b); return v.length ? v[Math.min(v.length - 1, Math.floor(v.length * p))] : 0; };
  const quantStr = (t, f, p) => { const v = colVals(t, f).sort(); return v.length ? v[Math.min(v.length - 1, Math.floor(v.length * p))] : ''; };

  const rng = seed => {
    let a = (parseInt(String(seed).slice(0, 8), 16) || 1) >>> 0;
    const next = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    return { next, int: n => Math.floor(next() * n), pick: list => list[Math.floor(next() * list.length)] };
  };

  /* ABAP 소스 정규화: 주석 제거 → 대문자 → 토큰을 한 칸 공백으로 연결
     예) COUNT( * ) / COUNT(*)  →  "COUNT ( * )"  → 공백 차이로 오답 처리되지 않음 */
  const strip = src => String(src || '').split(/\r?\n/).map(line => {
    if (/^\*/.test(line)) return '';
    let q = '';
    for (let i = 0; i < line.length; i++) { const ch = line[i]; if (q) { if (ch === q) q = ''; continue; } if (ch === "'" || ch === '`') { q = ch; continue; } if (ch === '"') return line.slice(0, i); }
    return line;
  }).join('\n');
  const TOK = /'(?:[^']|'')*'|`[^`]*`|<[A-Z_][A-Z0-9_]*>|<>|<=|>=|!=|@?[A-Z_][A-Z0-9_]*(?:~[A-Z_*][A-Z0-9_]*)?(?:-[A-Z_][A-Z0-9_]*)*|\d+(?:\.\d+)?|\S/g;
  const canon = src => (strip(src).toUpperCase().match(TOK) || []).join(' ');

  /* 체크 헬퍼: [라벨, 함수(정규화된 코드)] */
  const K = {
    sel: ['SELECT 구문 작성', c => /\bSELECT\b/.test(c)],
    from: t => [t + ' 테이블에서 조회', c => new RegExp('\\bFROM ' + t + '\\b').test(c)],
    cols: (list, label) => [label || list.join(', ') + ' 열 포함', c => list.every(f => new RegExp('(^|[^A-Z0-9_])' + rxEsc(f) + '(?![A-Z0-9_])').test(c))],
    has: (label, ...alts) => [label, c => alts.some(a => c.includes(canon(a)))],
    re: (label, re) => [label, c => re.test(c)],
    no: (label, re) => [label, c => !re.test(c)],
    intoTable: rv => ['결과를 @' + rv + ' 내부 테이블에 저장', c => new RegExp('\\bINTO (?:CORRESPONDING FIELDS OF )?TABLE @' + rv + '(?![A-Z0-9_])').test(c)],
    intoVar: v => ['결과를 @' + v + ' 변수에 저장', c => new RegExp('\\bINTO @' + v + '(?![A-Z0-9_])').test(c)],
    upTo: n => ['UP TO ' + n + ' ROWS로 건수 제한', c => new RegExp('\\bUP TO ' + n + ' ROWS\\b').test(c)],
    orderBy: (items, label) => ['ORDER BY ' + items.map(([f, d]) => f + (d ? ' DESCENDING' : '')).join(', ') + (label || ''),
      c => new RegExp('\\bORDER BY ' + items.map(([f, d]) => '(?:\\w+~)?' + f + '(?![A-Z0-9_~])' + (d ? ' (?:DESCENDING|DESC)' : '(?: ASCENDING| ASC)?(?! DESC)')).join(' , ')).test(c)],
    fn: (name, arg, label) => [label || name + '( ' + arg + ' ) 집계', c => new RegExp('\\b' + name + ' \\( (?:DISTINCT )?(?:\\w+~)?' + rxEsc(arg) + ' \\)').test(c)]
  };

  /* 결과셋 비교: 열 이름이 같으면 이름 기준, 열 수가 같으면 위치 기준으로 비교(별칭 차이 허용) */
  const cv = v => (typeof v === 'number' || /^-?\d+(\.\d+)?$/.test(String(v)) ? String(Number(v)) : String(v == null ? '' : v).replace(/\s+$/, ''));
  const sameRows = (ref, got, ordered) => {
    if (ref.length !== got.length) return false;
    if (!ref.length) return true;
    const rc = Object.keys(ref[0]), gc = Object.keys(got[0]);
    const proj = (rows, cols) => rows.map(r => cols.map(k => cv(r[k])).join('\u0001'));
    const eqList = (a, b) => { const x = ordered ? a : [...a].sort(), y = ordered ? b : [...b].sort(); return x.every((v, i) => v === y[i]); };
    if (rc.every(k => gc.includes(k)) && eqList(proj(ref, rc), proj(got, rc))) return true;
    return rc.length === gc.length && eqList(proj(ref, rc), proj(got, gc));
  };

  const getWhere = source => {
    const m = String(source || '').match(/\bWHERE\s+([\s\S]*?)(?=\b(?:GROUP\s+BY|HAVING|ORDER\s+BY|INTO|UP\s+TO|ENDSELECT)\b|\.)/i);
    return m && m[1] ? m[1].trim().replace(/\s+/g, ' ') : '';
  };
  const fmt = o => [
    'SELECT ' + (o.single ? 'SINGLE ' : '') + (o.distinct ? 'DISTINCT ' : '') + o.cols.join(', '),
    '  FROM ' + o.from,
    ...(o.joins || []).map(j => '  ' + j),
    o.where && '  WHERE ' + o.where,
    o.group && '  GROUP BY ' + o.group,
    o.having && '  HAVING ' + o.having,
    o.order && '  ORDER BY ' + o.order,
    o.into && '  INTO ' + o.into,
    o.upTo && '  UP TO ' + o.upTo + ' ROWS'
  ].filter(Boolean).join('\n') + '.';

  function ctxOf(project, seed) {
    const table = String(project.primaryTable || (project.tables || [])[0] || 'SFLIGHT').toUpperCase();
    const info = SCHEMA[table] || null;
    // A project's SELECT list can include AS aliases (for example SMOKER_CNT).
    // Keep only real DDIC columns when generating source-column exercises.
    const declaredFields = (project.fields || []).map(x => String(x).toUpperCase());
    const sourceFields = info ? declaredFields.filter(x => x in info.f) : declaredFields;
    const fields = (sourceFields.length ? sourceFields : (info ? Object.keys(info.f).slice(0, 6) : ['CARRID', 'CONNID']));
    const r = rng(seed);
    const offset = parseInt(String(seed).slice(0, 2), 16) % fields.length;
    const pick = (start, count = 1) => Array.from({ length: Math.min(count, fields.length) }, (_, i) => fields[(start + i) % fields.length]);
    const kindFields = k => { const own = fields.filter(f => kindOf(table, f) === k); return own.length ? own : (info ? Object.keys(info.f).filter(f => info.f[f] === k) : []); };
    const c = { project, seed, r, table, info, fields, offset, pick, kindFields, rv: String(project.resultVar || 'GT_DATA').toUpperCase(), focused: pick(offset, Math.min(2, fields.length)), keyField: fields[offset], where: getWhere(project.source), cvars: project.conditionVars || [] };
    c.num = kindFields('num')[0];
    const gcand = info ? uniq([...fields.filter(f => info.group.includes(f)), ...info.group]) : [];
    c.gf = gcand.length ? gcand[offset % gcand.length] : c.keyField;
    return c;
  }
  const dv = (c, t, f, fb) => { const v = colVals(t, f); return v.length ? c.r.pick(v) : fb; };

  /* ================= 문제 객체 조립 ================= */
  const REG = {}; const ORDER = [];
  const def = (id, topic, level, kind, ok, make) => { REG[id] = { id, topic, level, kind, ok: ok || (() => true), make }; ORDER.push(id); };

  function finalize(c, spec, d, variant) {
    const bindings = spec.bindings || {};
    const run = code => window.openSqlRunner ? window.openSqlRunner.run(code, { data: DB(), project: c.project, bindings }) : { ok: false };
    const checks = spec.checks.slice();
    let ref = null;
    if (spec.expects != null) {
      const want = String(spec.expects);
      if (spec.snippet) ref = run(spec.snippet);
      checks.push(['결과 값이 ' + (spec.expectsLabel || '기대 값') + '과 일치', code => new RegExp('(^|[^0-9A-Za-z.])' + rxEsc(want) + '($|[^0-9A-Za-z])', 'i').test(String(code)), true]);
    } else if (spec.semantic !== false) {
      ref = run(spec.answer);
      if (ref.ok) checks.push(['가상 실행 결과가 기대 결과와 일치', code => { const g = run(code); return g.ok && sameRows(ref.rows, g.rows, !!spec.ordered); }, true]);
    }
    const flat = String(spec.answer || '').replace(/\s+/g, ' ');
    const answerFields = (spec.cols || []).join(', ') || '문제에서 요청한 열';
    const keyClause = String(spec.answer || '').split('\n').map(line => line.trim()).find(line => /^(?:WHERE|INNER JOIN|LEFT OUTER JOIN|GROUP BY|HAVING|ORDER BY|UP TO)\b/i.test(line)) || '추가 조건이 없다면 FROM 뒤에 INTO TABLE을 배치합니다.';
    return {
      topic: d.topic, level: spec.level || d.level, kind: d.kind, title: c.project.name + ' · ' + spec.name,
      table: spec.table || c.table, cols: spec.cols || [], schemaText: spec.schemaText || '',
      hints: [
        `1단계: ${c.table}에서 ${answerFields}를 조회하는 SELECT 열 목록을 만드세요. 결과는 내부 테이블 @${c.rv}에 담습니다.`,
        `2단계: 이번 문제의 핵심 절은 다음과 같습니다: ${keyClause} DB 열에는 @를 붙이지 않고 ABAP 호스트 변수에만 @를 붙이세요.${spec.h1 ? ' 참고: ' + spec.h1 : ''}${spec.h2 ? ' ' + spec.h2 : ''}`,
        spec.expects != null ? `3단계: 기대 값은 ${spec.expects}입니다. 조건을 조정해 가상 실행 결과와 맞춰 보세요.` : `3단계: 완성된 Open SQL SELECT 예시입니다.\n${flat}`
      ],
      answer: spec.expects != null ? spec.expects + '\n\n' + (spec.snippet || '') : spec.answer,
      criteria: checks.map(x => x[0]),
      check: code => { const p = canon(code); return checks.map(([, fn, raw]) => { try { return !!fn(raw ? code : p); } catch (e) { return false; } }); },
      plain: !!spec.plain, req: spec.req, snippet: spec.snippet || '', preview: spec.preview || null, note: spec.note || '', bindings, expects: spec.expects != null ? String(spec.expects) : null,
      run: () => (ref && ref.ok ? ref.rows : [{ 안내: '이 문제는 가상 실행 결과를 제공하지 않습니다.' }]),
      projectId: c.project.id, resultVar: c.rv, sourceContext: c.project.source || '', variant,
      id: 'SQL-' + String(c.seed).slice(0, 6).toUpperCase(), seed: c.seed, created: new Date().toISOString(), params: {}, hintLevel: 0
    };
  }

  /* ================= 2. 카탈로그 ================= */
  const okInfo = c => !!c.info;
  const intoT = c => 'TABLE @' + c.rv;
  const NUM = { SFLIGHT: 'PRICE', SPFLI: 'DISTANCE', SBOOK: 'FORCURAM' };
  const DISP = { SFLIGHT: ['CARRID', 'CONNID', 'FLDATE', 'PRICE'], SPFLI: ['CARRID', 'CONNID', 'CITYFROM', 'DISTANCE'], SBOOK: ['BOOKID', 'PASSNAME', 'FORCURAM'] };
  const minCnt = (c, f) => { const rows = DB()[c.table]; if (!rows) return 2; const m = {}; rows.forEach(r => { m[r[f]] = (m[r[f]] || 0) + 1; }); return Math.min(2, Math.max(1, ...Object.values(m))); };
  const baseChecks = (c, cols, extra = []) => [K.sel, K.from(c.table), K.cols(cols), ...extra, K.intoTable(c.rv)];
  const anyCol = f => '(?:\\w+~)?' + f + '(?![A-Z0-9_])';

  /* ---------- SELECT 기초 ---------- */
  def('projection', T.basic, '기초', '작성', null, c => { const cols = c.fields.slice(0, 6); return { name: '프로젝트 열 조회하기', cols, req: `${c.table}에서 ${cols.join(', ')} 열을 조회해 @${c.rv}에 저장하세요.`, answer: fmt({ cols, from: c.table, into: intoT(c) }), checks: baseChecks(c, cols) }; });

  def('focused', T.basic, '기초', '작성', null, c => { const cols = c.focused; return { name: '필요한 열만 조회하기', cols, req: `${c.table}에서 ${cols.join(', ')} 열만 조회해 @${c.rv}에 저장하세요.`, answer: fmt({ cols, from: c.table, into: intoT(c) }), checks: baseChecks(c, cols) }; });

  def('distinct', T.basic, '기초', '작성', null, c => { const f = c.gf; return { name: '중복 없이 값 조회하기', cols: [f], req: `${c.table}에서 ${f}의 중복을 제거해 조회하세요.`, answer: fmt({ distinct: true, cols: [f], from: c.table, into: intoT(c) }), checks: [K.sel, K.from(c.table), K.re('DISTINCT로 중복 제거', /\bSELECT DISTINCT\b/), K.cols([f]), K.intoTable(c.rv)] }; });

  const ordDef = desc => c => {
    const f = c.num || c.keyField, other = c.fields.find(x => x !== f) || f, cols = uniq([other, f]), dir = desc ? 'DESCENDING' : 'ASCENDING';
    return { name: desc ? '내림차순 정렬' : '오름차순 정렬', cols, ordered: true, req: `${c.table}에서 ${cols.join(', ')}를 조회하고 ${f} 기준 ${desc ? '내림차순' : '오름차순'}으로 정렬하세요.`, answer: fmt({ cols, from: c.table, order: `${f} ${dir}`, into: intoT(c) }), checks: baseChecks(c, cols, [K.orderBy([[f, desc]])]) };
  };
  def('ordering', T.basic, '기초', '작성', null, ordDef(false));
  def('ordering_desc', T.basic, '기초', '작성', null, ordDef(true));

  const limDef = n => c => { const cols = c.pick(c.offset, Math.min(2, c.fields.length)); return { name: `${n}건만 조회하기`, cols, req: `${c.table}에서 ${cols.join(', ')}를 ${n}건까지만 조회하세요.`, answer: fmt({ cols, from: c.table, into: intoT(c), upTo: n }), checks: baseChecks(c, cols, [K.upTo(n)]) }; };
  def('limit_one', T.basic, '기초', '작성', null, limDef(1));
  def('limit_three', T.basic, '기초', '작성', null, limDef(3));

  def('select_single_key', T.basic, '기초', '작성', okInfo, c => {
    const keys = c.info.key, row = c.r.pick(DB()[c.table] || [{}]);
    const cols = c.fields.filter(f => !keys.includes(f)).slice(0, 2), cc = cols.length ? cols : keys.slice(0, 1);
    const where = keys.map(k => `${k} = @LV_${k}`).join(' AND ');
    return {
      name: '키로 한 건 조회하기 (SELECT SINGLE)', cols: cc, bindings: Object.fromEntries(keys.map(k => [`LV_${k}`, row[k]])),
      req: `${c.table}의 키 필드 ${keys.join(', ')}를 모두 ABAP 변수(@LV_키이름)와 비교해 한 건을 읽고, ${cc.join(', ')}를 @DATA(LS_RESULT)에 받으세요.`,
      answer: fmt({ single: true, cols: cc, from: c.table, where, into: '@DATA(LS_RESULT)' }),
      h1: 'SELECT SINGLE은 전체 키를 = 로 지정할 때 한 건이 확정됩니다.', note: 'SELECT SINGLE은 키를 전부 지정해야 “정확히 한 행”이 보장됩니다. 일부 키만 쓰면 어느 행이 나올지 불분명해 확장 문법 검사에서 경고가 납니다.',
      checks: [K.sel, K.from(c.table), K.re('SELECT SINGLE 사용', /\bSELECT SINGLE\b/), K.cols(cc), ...keys.map(k => K.re(`키 ${k}를 호스트 변수와 비교`, new RegExp(anyCol(k) + ' = @\\w+'))), K.re('결과를 @DATA(구조) 또는 @변수에 저장', /\bINTO (?:@DATA \( \w+ \)|@\w+)/)]
    };
  });

  def('alias_columns', T.basic, '기초', '작성', null, c => {
    const cols = c.focused.length > 1 ? c.focused : [c.fields[0]], al = cols.map(f => ALIAS[f] || f + '_VAL');
    return { name: '열에 별칭(AS) 붙이기', cols: al, req: `${c.table}에서 ${cols.map((f, i) => `${f}는 ${al[i]}`).join(', ')} 이름으로 바꿔 조회하세요(AS 사용). 결과는 @${c.rv}에 저장합니다.`, answer: fmt({ cols: cols.map((f, i) => `${f} AS ${al[i]}`), from: c.table, into: intoT(c) }), checks: [K.sel, K.from(c.table), ...cols.map((f, i) => K.re(`${f} AS ${al[i]}`, new RegExp(anyCol(f) + ' AS ' + al[i] + '(?![A-Z0-9_])'))), K.intoTable(c.rv)] };
  });

  def('order_multi', T.basic, '중급', '작성', c => c.fields.length > 1, c => {
    const a = c.gf, b = c.num && c.num !== a ? c.num : (c.fields.find(x => x !== a) || a), cols = uniq([a, b]);
    return { name: '두 기준으로 정렬하기', cols, ordered: true, req: `${c.table}에서 ${cols.join(', ')}를 조회하고 ${a}는 오름차순, ${b}는 내림차순으로 정렬하세요.`, answer: fmt({ cols, from: c.table, order: `${a} ASCENDING, ${b} DESCENDING`, into: intoT(c) }), checks: baseChecks(c, cols, [K.orderBy([[a, false], [b, true]])]) };
  });

  def('primary_key_order', T.basic, '기초', '작성', okInfo, c => ({ name: '기본 키 순서로 정렬하기', cols: c.focused, ordered: true, req: `${c.table}에서 ${c.focused.join(', ')}를 조회하되 테이블의 기본 키 순서(PRIMARY KEY)로 정렬하세요.`, answer: fmt({ cols: c.focused, from: c.table, order: 'PRIMARY KEY', into: intoT(c) }), checks: baseChecks(c, c.focused, [K.re('ORDER BY PRIMARY KEY', /\bORDER BY PRIMARY KEY\b/)]) }));

  /* ---------- 조건과 범위 ---------- */
  def('conditions', T.cond, '기초', '작성', c => !!c.where, c => ({ name: '프로젝트 WHERE 조건 적용하기', cols: c.focused, req: `프로젝트 코드의 조건을 유지해 ${c.table}에서 ${c.focused.join(', ')}를 조회하세요: ${esc(c.where)}`, answer: fmt({ cols: c.focused, from: c.table, where: c.where, into: intoT(c) }), checks: baseChecks(c, c.focused, [K.has('프로젝트의 WHERE 조건 유지', c.where)]) }));

  def('where_project_variable', T.cond, '기초', '작성', c => c.cvars.length > 0, c => {
    const variable = c.cvars[0], f = c.cvars.map(v => c.fields.find(x => v.endsWith(x))).find(Boolean) || c.keyField, isRange = /^S_/i.test(variable);
    const pred = isRange ? `${f} IN @${variable}` : `${f} = @${variable}`, val = dv(c, c.table, f, 'AA');
    return { name: isRange ? '선택 범위로 필터링하기' : '호스트 변수로 필터링하기', cols: c.focused, bindings: { [variable]: isRange ? [val] : val }, req: `${c.table}에서 ${f} 조건을 적용하세요. 프로젝트 변수 @${variable}을 사용해 ${c.focused.join(', ')}를 조회하세요.`, answer: fmt({ cols: c.focused, from: c.table, where: pred, into: intoT(c) }), note: isRange ? '선택 범위(SELECT-OPTIONS)가 비어 있으면 IN 조건은 제한이 없어 전체가 조회됩니다.' : '', checks: baseChecks(c, c.focused, [K.re(pred, new RegExp(anyCol(f) + (isRange ? ' IN ' : ' = ') + '@' + variable + '(?![A-Z0-9_])'))]) };
  });

  def('where_between', T.cond, '중급', '작성', c => !!c.num, c => {
    const f = c.num;
    return { name: 'BETWEEN 범위 조건', cols: c.focused, bindings: { LV_LOW: quant(c.table, f, 0.25), LV_HIGH: quant(c.table, f, 0.75) }, req: `${c.table}에서 ${f} 값이 @LV_LOW와 @LV_HIGH 사이인 행만 조회하세요. 열은 ${c.focused.join(', ')}로 제한하세요.`, answer: fmt({ cols: c.focused, from: c.table, where: `${f} BETWEEN @LV_LOW AND @LV_HIGH`, into: intoT(c) }), note: 'BETWEEN은 양 끝 값을 포함합니다.', checks: baseChecks(c, c.focused, [K.re(`${f} BETWEEN @LV_LOW AND @LV_HIGH`, new RegExp(anyCol(f) + ' BETWEEN @LV_LOW AND @LV_HIGH'))]) };
  });

  def('where_like', T.cond, '중급', '작성', null, c => {
    const f = c.kindFields('text')[0] || c.keyField, v = String(dv(c, c.table, f, 'AA')), pat = v.slice(0, Math.max(1, Math.min(2, v.length - 1))) + '%';
    return { name: 'LIKE 패턴 검색', cols: uniq([f, ...c.focused]), bindings: { LV_PATTERN: pat }, req: `${c.table}에서 ${f}가 ABAP 호스트 변수 @LV_PATTERN 패턴과 일치하는 행을 조회하세요.`, answer: fmt({ cols: uniq([f, ...c.focused]), from: c.table, where: `${f} LIKE @LV_PATTERN`, into: intoT(c) }), note: 'LIKE에서 %는 임의 문자열, _는 한 글자입니다. 대소문자를 구분합니다.', checks: baseChecks(c, uniq([f, ...c.focused]), [K.re(`${f} LIKE @LV_PATTERN`, new RegExp(anyCol(f) + ' LIKE @LV_PATTERN'))]) };
  });

  def('where_not_initial', T.cond, '중급', '작성', null, c => ({ name: '초기값이 아닌 행 찾기', cols: c.focused, req: `${c.table}에서 ${c.keyField}가 초기값이 아닌 행만 조회하세요.`, answer: fmt({ cols: c.focused, from: c.table, where: `${c.keyField} IS NOT INITIAL`, into: intoT(c) }), checks: baseChecks(c, c.focused, [K.re(`${c.keyField} IS NOT INITIAL`, new RegExp(anyCol(c.keyField) + ' IS NOT INITIAL'))]) }));

  def('where_numeric', T.cond, '기초', '작성', c => !!c.num, c => {
    const f = c.num, [op, ko] = c.r.pick([['>', '초과'], ['>=', '이상'], ['<', '미만'], ['<=', '이하']]), cols = uniq([c.fields.find(x => x !== f) || f, f]);
    return { name: `숫자 비교 (${ko})`, cols, bindings: { LV_VALUE: quant(c.table, f, 0.5) }, req: `${c.table}에서 ${L(f)}가 @LV_VALUE ${ko}인 행의 ${cols.join(', ')}를 조회하세요.`, answer: fmt({ cols, from: c.table, where: `${f} ${op} @LV_VALUE`, into: intoT(c) }), note: '비교 연산자의 경계(초과/이상, 미만/이하)를 정확히 구분하세요.', checks: baseChecks(c, cols, [K.re(`${f} ${op} @LV_VALUE`, new RegExp(anyCol(f) + ' ' + rxEsc(op) + ' @LV_VALUE(?![A-Z0-9_])'))]) };
  });

  def('where_and_or', T.cond, '중급', '작성', c => c.info && c.kindFields('id').length > 0 && !!c.num, c => {
    const idf = c.kindFields('id').includes('CARRID') ? 'CARRID' : c.kindFields('id')[0], vals = colVals(c.table, idf).map(String);
    const a = vals.length ? vals[c.r.int(vals.length)] : 'AA', b = vals.length > 1 ? vals[(vals.indexOf(a) + 1 + c.r.int(vals.length - 1)) % vals.length] : 'LH', n = c.num;
    const cols = uniq([idf, c.fields.find(x => x !== idf && x !== n) || idf, n]), A = a.toUpperCase(), B = b.toUpperCase();
    const orRe = new RegExp(`\\( ${anyCol(idf)} = '${A}' OR ${anyCol(idf)} = '${B}' \\)|\\( ${anyCol(idf)} = '${B}' OR ${anyCol(idf)} = '${A}' \\)|${anyCol(idf)} IN \\( '${A}' , '${B}' \\)|${anyCol(idf)} IN \\( '${B}' , '${A}' \\)`);
    return { name: 'AND/OR 괄호 우선순위', cols, bindings: { LV_MIN: quant(c.table, n, 0.4) }, req: `${c.table}에서 ${idf}가 '${a}' 또는 '${b}'이면서, ${n}이 @LV_MIN 이상인 행의 ${cols.join(', ')}를 조회하세요.`, answer: fmt({ cols, from: c.table, where: `( ${idf} = '${a}' OR ${idf} = '${b}' )\n    AND ${n} >= @LV_MIN`, into: intoT(c) }), h2: 'AND가 OR보다 먼저 계산됩니다. OR 조건은 괄호로 묶거나 IN을 사용하세요.', note: 'AND는 OR보다 우선합니다. 괄호 없이 쓰면 의도와 다른 행이 조회될 수 있습니다.', checks: baseChecks(c, cols, [K.re('OR 조건을 괄호로 묶거나 IN 사용', orRe), K.re(`${n} >= @LV_MIN 조건`, new RegExp(anyCol(n) + ' >= @LV_MIN'))]) };
  });

  def('where_in_literal', T.cond, '기초', '작성', okInfo, c => {
    const idf = c.gf, vals = colVals(c.table, idf).map(String), a = vals[0] || 'AA', b = vals[Math.min(2, vals.length - 1)] || 'LH';
    const cols = uniq([idf, ...c.focused]);
    return { name: '여러 값 중 하나 (IN 목록)', cols, req: `${c.table}에서 ${idf}가 '${a}' 또는 '${b}'인 행의 ${cols.join(', ')}를 조회하세요. IN 목록을 사용하세요.`, answer: fmt({ cols, from: c.table, where: `${idf} IN ( '${a}', '${b}' )`, into: intoT(c) }), checks: baseChecks(c, cols, [K.re(`${idf} IN ( ... ) 목록`, new RegExp(anyCol(idf) + ' IN \\(')), K.re(`값 '${a}', '${b}' 포함`, new RegExp(`'${a.toUpperCase()}'.*'${b.toUpperCase()}'|'${b.toUpperCase()}'.*'${a.toUpperCase()}'`))]) };
  });

  def('where_not_in', T.cond, '중급', '작성', okInfo, c => {
    const idf = c.gf, vals = colVals(c.table, idf).map(String), v = vals[0] || 'AA', cols = uniq([idf, ...c.focused]);
    return { name: '특정 값 제외하기', cols, req: `${c.table}에서 ${idf}가 '${v}'가 아닌 행의 ${cols.join(', ')}를 조회하세요. (<> 또는 NOT IN)`, answer: fmt({ cols, from: c.table, where: `${idf} <> '${v}'`, into: intoT(c) }), checks: baseChecks(c, cols, [K.re(`'${v}' 제외 조건(<> 또는 NOT IN)`, new RegExp(anyCol(idf) + ` (?:<> '${v.toUpperCase()}'|NOT IN \\()`))]) };
  });

  const PAIRS = { SFLIGHT: [['SEATSOCC', 'SEATSMAX', '<', '좌석 여유가 있는'], ['SEATSOCC', 'SEATSMAX', '=', '만석인'], ['SEATSOCC_B', 'SEATSMAX_B', '<', '비즈니스석 여유가 있는']] };
  def('where_column_compare', T.cond, '중급', '작성', c => !!PAIRS[c.table], c => {
    const [a, b, op, ko] = c.r.pick(PAIRS[c.table]), cols = ['CARRID', 'CONNID', a, b];
    return { name: `열끼리 비교 (${ko} 항공편)`, cols, req: `${c.table}에서 ${ko} 운항 일정의 ${cols.join(', ')}를 조회하세요. 두 열을 서로 비교하는 조건이 필요합니다.`, answer: fmt({ cols, from: c.table, where: `${a} ${op} ${b}`, into: intoT(c) }), h2: '두 항목이 모두 DB 열이면 @를 붙이지 않습니다.', note: 'DB 열끼리 비교할 때는 @를 쓰지 않습니다. @는 ABAP 변수 전용입니다.', checks: baseChecks(c, cols, [K.re(`${a} ${op} ${b} 열 비교`, new RegExp(anyCol(a) + ' ' + rxEsc(op) + ' ' + anyCol(b))), K.no('DB 열에 @를 붙이지 않음', new RegExp('@(?:' + a + '|' + b + ')(?![A-Z0-9_])'))]) };
  });

  def('where_date', T.cond, '중급', '작성', c => c.info && !!c.kindFields('date')[0], c => {
    const f = c.kindFields('date')[0], cols = uniq([...c.info.key.slice(0, 2), f]);
    return { name: '날짜 범위로 조회하기', cols, bindings: { LV_FROM: quantStr(c.table, f, 0.25), LV_TO: quantStr(c.table, f, 0.75) }, req: `${c.table}에서 ${L(f)}가 @LV_FROM부터 @LV_TO 사이인 행의 ${cols.join(', ')}를 조회하세요.`, answer: fmt({ cols, from: c.table, where: `${f} BETWEEN @LV_FROM AND @LV_TO`, into: intoT(c) }), checks: baseChecks(c, cols, [K.re(`${f} BETWEEN @LV_FROM AND @LV_TO`, new RegExp(anyCol(f) + ' BETWEEN @LV_FROM AND @LV_TO'))]) };
  });

  def('where_flag', T.cond, '중급', '작성', c => c.info && !!c.kindFields('flag')[0], c => {
    const f = c.kindFields('flag')[0], pos = c.r.next() < 0.5, cols = uniq([...c.info.key.slice(0, 2), ...(c.info.key[3] ? [c.info.key[3]] : []), f]);
    const re = pos ? new RegExp(anyCol(f) + " = (?:'X'|@ABAP_TRUE)") : new RegExp(anyCol(f) + " (?:= (?:' '|''|@ABAP_FALSE)|<> (?:'X'|@ABAP_TRUE)|IS INITIAL)");
    return { name: pos ? '플래그가 설정된 행' : '플래그가 비어 있는 행', cols, req: `${c.table}에서 ${L(f)}가 ${pos ? "'X'(설정됨)" : '초기값(설정되지 않음)'}인 행의 ${cols.join(', ')}를 조회하세요.`, answer: fmt({ cols, from: c.table, where: pos ? `${f} = 'X'` : `${f} = ' '`, into: intoT(c) }), note: "ABAP의 플래그 필드는 'X'(참)와 초기값(공백, 거짓)으로 표현합니다.", checks: baseChecks(c, cols, [K.re(pos ? `${f} = 'X'` : `${f}가 공백/초기값`, re)]) };
  });

  /* ---------- 집계와 그룹 ---------- */
  def('count_all', T.agg, '중급', '작성', null, c => ({ name: '전체 행 개수 세기', cols: [], req: `${c.table}의 전체 행 개수를 집계해 @LV_COUNT에 받으세요.`, answer: `SELECT COUNT( * )\n  FROM ${c.table}\n  INTO @LV_COUNT.`, checks: [K.sel, K.from(c.table), K.fn('COUNT', '*'), K.intoVar('LV_COUNT')] }));

  def('count_distinct', T.agg, '고급', '작성', null, c => ({ name: '고유 값 개수 세기', cols: [c.gf], req: `${c.table}에서 서로 다른 ${c.gf} 값의 개수를 COUNT DISTINCT로 구해 @LV_COUNT에 받으세요.`, answer: `SELECT COUNT( DISTINCT ${c.gf} )\n  FROM ${c.table}\n  INTO @LV_COUNT.`, checks: [K.sel, K.from(c.table), K.re(`COUNT( DISTINCT ${c.gf} )`, new RegExp('\\bCOUNT \\( DISTINCT ' + anyCol(c.gf) + ' \\)')), K.intoVar('LV_COUNT')] }));

  def('count_where', T.agg, '중급', '작성', okInfo, c => {
    const f = c.gf, v = String(dv(c, c.table, f, 'AA'));
    return { name: '조건에 맞는 행 개수 세기', cols: [f], req: `${c.table}에서 ${f}가 '${v}'인 행이 몇 건인지 집계해 @LV_COUNT에 받으세요. 행 전체를 읽어 오지 마세요.`, answer: `SELECT COUNT( * )\n  FROM ${c.table}\n  WHERE ${f} = '${v}'\n  INTO @LV_COUNT.`, checks: [K.sel, K.from(c.table), K.fn('COUNT', '*'), K.re(`WHERE ${f} = '${v}'`, new RegExp(anyCol(f) + ` = '${v.toUpperCase()}'`)), K.intoVar('LV_COUNT')] };
  });

  def('group_count', T.agg, '중급', '작성', null, c => { const cols = [c.gf, 'COUNT( * ) AS ROW_COUNT']; return { name: 'GROUP BY별 건수 집계', cols, req: `${c.table}에서 ${c.gf}별 행 개수를 세어 ${c.gf}와 ROW_COUNT를 @${c.rv}에 저장하세요.`, answer: fmt({ cols, from: c.table, group: c.gf, into: intoT(c) }), checks: baseChecks(c, [c.gf], [K.re('COUNT( * ) AS ROW_COUNT', /\bCOUNT \( \* \) AS ROW_COUNT\b/), K.re(`GROUP BY ${c.gf}`, new RegExp('\\bGROUP BY ' + anyCol(c.gf)))]) }; });

  def('group_having', T.agg, '고급', '작성', null, c => { const cols = [c.gf, 'COUNT( * ) AS ROW_COUNT']; return { name: 'HAVING으로 그룹 걸러내기', cols, bindings: { LV_MIN_COUNT: minCnt(c, c.gf) }, req: `${c.table}에서 ${c.gf}별로 그룹화하고, 그룹 건수가 @LV_MIN_COUNT 이상인 그룹만 남기세요.`, answer: fmt({ cols, from: c.table, group: c.gf, having: 'COUNT( * ) >= @LV_MIN_COUNT', into: intoT(c) }), note: '행을 거르는 조건은 WHERE, 그룹 결과(집계값)를 거르는 조건은 HAVING에 둡니다.', checks: baseChecks(c, [c.gf], [K.re(`GROUP BY ${c.gf}`, new RegExp('\\bGROUP BY ' + anyCol(c.gf))), K.re('HAVING COUNT( * ) >= @LV_MIN_COUNT', /\bHAVING COUNT \( \* \) >= @LV_MIN_COUNT\b/)]) }; });

  [['min', 'MIN'], ['max', 'MAX'], ['sum', 'SUM'], ['avg', 'AVG']].forEach(([k, fn]) => def('aggregate_' + k, T.agg, '중급', '작성', c => !!c.num, c => ({ name: `${fn} 집계`, cols: [c.num], req: `${c.table}에서 ${c.num}의 ${fn} 값을 계산해 @LV_${fn}에 받으세요.`, answer: `SELECT ${fn}( ${c.num} )\n  FROM ${c.table}\n  INTO @LV_${fn}.`, checks: [K.sel, K.from(c.table), K.fn(fn, c.num), K.intoVar('LV_' + fn)] })));

  def('group_sum', T.agg, '고급', '작성', c => !!c.num, c => { const cols = [c.gf, `SUM( ${c.num} ) AS TOTAL_VALUE`]; return { name: '그룹별 합계 계산', cols, req: `${c.table}에서 ${c.gf}별 ${c.num} 합계를 구하고 두 결과 열을 @${c.rv}에 저장하세요. 합계 열 이름은 TOTAL_VALUE입니다.`, answer: fmt({ cols, from: c.table, group: c.gf, into: intoT(c) }), checks: baseChecks(c, [c.gf], [K.fn('SUM', c.num), K.re('AS TOTAL_VALUE', /\bAS TOTAL_VALUE\b/), K.re(`GROUP BY ${c.gf}`, new RegExp('\\bGROUP BY ' + anyCol(c.gf)))]) }; });

  def('group_multi', T.agg, '고급', '작성', c => c.info && c.info.group.length >= 2, c => {
    const g = c.info.group, i = c.r.int(g.length), a = g[i], b = g[(i + 1 + c.r.int(g.length - 1)) % g.length], cols = [a, b, 'COUNT( * ) AS ROW_COUNT'];
    return { name: '두 열로 그룹화하기', cols, req: `${c.table}에서 ${a}와 ${b} 조합별 행 개수를 ROW_COUNT로 구해 @${c.rv}에 저장하세요.`, answer: fmt({ cols, from: c.table, group: `${a}, ${b}`, into: intoT(c) }), note: 'SELECT 목록의 집계되지 않은 열은 모두 GROUP BY에 있어야 합니다.', checks: baseChecks(c, [a, b], [K.re('COUNT( * ) AS ROW_COUNT', /\bCOUNT \( \* \) AS ROW_COUNT\b/), K.re(`GROUP BY ${a}, ${b}`, new RegExp(`\\bGROUP BY (?:${anyCol(a)} , ${anyCol(b)}|${anyCol(b)} , ${anyCol(a)})`))]) };
  });

  def('group_where_having', T.agg, '고급', '작성', c => c.info && c.info.group.length > 0 && !!c.num, c => {
    const n = c.num, cols = [c.gf, `SUM( ${n} ) AS TOTAL_VALUE`];
    return { name: 'WHERE → GROUP BY → HAVING', cols, bindings: { LV_MIN: quant(c.table, n, 0.2), LV_MIN_COUNT: minCnt(c, c.gf) }, req: `${c.table}에서 ${n}이 @LV_MIN 이상인 행만 대상으로 ${c.gf}별 ${n} 합계(TOTAL_VALUE)를 구하고, 그룹 건수가 @LV_MIN_COUNT 이상인 그룹만 @${c.rv}에 저장하세요.`, answer: fmt({ cols, from: c.table, where: `${n} >= @LV_MIN`, group: c.gf, having: 'COUNT( * ) >= @LV_MIN_COUNT', into: intoT(c) }), note: 'WHERE는 그룹을 만들기 전에 행을, HAVING은 그룹을 만든 뒤 집계 결과를 거릅니다.', checks: baseChecks(c, [c.gf], [K.fn('SUM', n), K.re(`WHERE ${n} >= @LV_MIN`, new RegExp('\\bWHERE ' + anyCol(n) + ' >= @LV_MIN')), K.re('HAVING COUNT( * ) >= @LV_MIN_COUNT', /\bHAVING COUNT \( \* \) >= @LV_MIN_COUNT\b/), K.re('절 순서: WHERE → GROUP BY → HAVING', /\bWHERE\b.*\bGROUP BY\b.*\bHAVING\b/)]) };
  });

  def('topn_group', T.agg, '고급', '작성', c => c.info && c.info.group.length > 0 && !!c.num, c => {
    const n = c.num, cols = [c.gf, `SUM( ${n} ) AS TOTAL_VALUE`];
    return { name: '그룹 합계 상위 3개', cols, ordered: true, req: `${c.table}에서 ${c.gf}별 ${n} 합계(TOTAL_VALUE)를 구하고, 합계가 큰 순서로 상위 3개 그룹만 @${c.rv}에 저장하세요.`, answer: fmt({ cols, from: c.table, group: c.gf, order: 'TOTAL_VALUE DESCENDING', into: intoT(c), upTo: 3 }), checks: baseChecks(c, [c.gf], [K.fn('SUM', n), K.re(`GROUP BY ${c.gf}`, new RegExp('\\bGROUP BY ' + anyCol(c.gf))), K.orderBy([['TOTAL_VALUE', true]], ' (별칭 기준)'), K.upTo(3)]) };
  });

  def('aggregate_multi', T.agg, '중급', '작성', c => !!c.num, c => {
    const n = c.num;
    return { name: '여러 집계를 한 번에', cols: ['MIN_V', 'MAX_V', 'AVG_V'], req: `${c.table}에서 ${n}의 최소(MIN_V), 최대(MAX_V), 평균(AVG_V)을 한 번의 SELECT로 구해 @DATA(LS_STATS)에 받으세요.`, answer: `SELECT MIN( ${n} ) AS MIN_V,\n       MAX( ${n} ) AS MAX_V,\n       AVG( ${n} ) AS AVG_V\n  FROM ${c.table}\n  INTO @DATA(LS_STATS).`, note: '집계 함수 여러 개를 한 SELECT에 쓰면 DB를 한 번만 읽습니다.', checks: [K.sel, K.from(c.table), K.fn('MIN', n), K.fn('MAX', n), K.fn('AVG', n), K.re('결과를 @DATA(구조) 또는 @변수에 저장', /\bINTO @(?:DATA \( \w+ \)|\w+)/)] };
  });

  /* ---------- JOIN과 서브쿼리 ---------- */
  def('subquery', T.join, '고급', '작성', null, c => {
    const k = c.keyField, o = c.fields.length > 1 ? c.fields[(c.offset + 1) % c.fields.length] : k, val = dv(c, c.table, o, 'AA');
    return { name: 'IN 서브쿼리 작성', cols: [k, o], bindings: { LV_VALUE: val }, req: `${c.table}을 별칭 A와 B로 두 번 사용하세요. 내부 조회에서 @LV_VALUE와 일치하는 ${o}의 ${k}를 찾고, 그 키에 해당하는 바깥 행의 ${k}, ${o}를 조회하세요.`, answer: `SELECT A~${k}, A~${o}\n  FROM ${c.table} AS A\n  WHERE A~${k} IN ( SELECT B~${k}\n    FROM ${c.table} AS B\n    WHERE B~${o} = @LV_VALUE )\n  INTO TABLE @${c.rv}.`, checks: [K.sel, K.re('IN ( SELECT ... ) 서브쿼리', /\bIN \( SELECT\b/), K.re(`FROM ${c.table} AS A 와 AS B`, new RegExp(`\\bFROM ${c.table} AS \\w+ .*\\bFROM ${c.table} AS \\w+`)), K.re(`내부 조건 ${o} = @LV_VALUE`, new RegExp(anyCol(o) + ' = @LV_VALUE')), K.intoTable(c.rv)] };
  });

  const REL = [
    { a: 'SCARR', b: 'SPFLI', on: ['CARRID'], aCols: ['CARRID', 'CARRNAME'], bCols: ['CONNID', 'CITYFROM', 'CITYTO'], ko: ['항공사', '운항 노선'], bNum: 'DISTANCE', cond: '{B}~DISTANCE > @LV_MIN', condKo: '거리가 @LV_MIN보다 긴', bind: () => ({ LV_MIN: quant('SPFLI', 'DISTANCE', 0.5) }) },
    { a: 'SCARR', b: 'SFLIGHT', on: ['CARRID'], aCols: ['CARRID', 'CARRNAME'], bCols: ['CONNID', 'FLDATE', 'PRICE'], ko: ['항공사', '운항 일정'], bNum: 'PRICE', cond: '{B}~PRICE > @LV_MIN', condKo: '운임이 @LV_MIN보다 높은', bind: () => ({ LV_MIN: quant('SFLIGHT', 'PRICE', 0.5) }) },
    { a: 'SPFLI', b: 'SFLIGHT', on: ['CARRID', 'CONNID'], aCols: ['CARRID', 'CONNID', 'CITYFROM', 'CITYTO'], bCols: ['FLDATE', 'PRICE'], ko: ['운항 노선', '운항 일정'], bNum: 'PRICE', cond: '{B}~PRICE > @LV_MIN', condKo: '운임이 @LV_MIN보다 높은', bind: () => ({ LV_MIN: quant('SFLIGHT', 'PRICE', 0.5) }) },
    { a: 'SFLIGHT', b: 'SBOOK', on: ['CARRID', 'CONNID', 'FLDATE'], aCols: ['CARRID', 'CONNID', 'FLDATE', 'PRICE'], bCols: ['BOOKID', 'CUSTOMID', 'CLASS'], ko: ['운항 일정', '예약'], bNum: 'FORCURAM', cond: "{B}~CANCELLED = ' '", condKo: '취소되지 않은', bind: () => ({}) }
  ];
  const onTxt = (rel, A, B) => rel.on.map(k => `${B}~${k} = ${A}~${k}`).join('\n      AND ');
  const onChecks = rel => rel.on.map(k => K.re(`ON 조건: ${k} 연결`, new RegExp(`\\b\\w+~${k} = \\w+~${k}\\b`)));
  const condRe = cond => new RegExp(rxEsc(canon(cond.replace(/\{B\}/g, 'ZZ'))).replace(/ZZ~/g, '\\w+~'));
  const pickRel = (c, filter) => { const all = REL.filter(filter || (() => true)), mine = c.info ? all.filter(x => x.a === c.table || x.b === c.table) : all; return c.r.pick(mine.length ? mine : all); };
  const relMeta = rel => { const A = TA[rel.a], B = TA[rel.b]; return { A, B, schemaText: `${rel.a} AS ${A}: ${rel.aCols.join(', ')} · ${rel.b} AS ${B}: ${uniq([...rel.on, ...rel.bCols]).join(', ')}`, table: `${rel.a} + ${rel.b}` }; };
  const q = (A, cols) => cols.map(f => `${A}~${f}`);

  def('join_inner', T.join, '중급', '작성', okInfo, c => {
    const rel = pickRel(c), { A, B, schemaText, table } = relMeta(rel), cols = [...q(A, rel.aCols), ...q(B, rel.bCols)];
    return { name: `${rel.a}·${rel.b} INNER JOIN`, table, schemaText, cols, req: `${rel.ko[0]}(${rel.a})와 ${rel.ko[1]}(${rel.b})를 키로 연결해 ${cols.join(', ')}를 @${c.rv}에 저장하세요. 별칭은 ${rel.a} AS ${A}, ${rel.b} AS ${B}를 쓰세요.`, answer: fmt({ cols, from: `${rel.a} AS ${A}`, joins: [`INNER JOIN ${rel.b} AS ${B}\n    ON ${onTxt(rel, A, B)}`], into: intoT(c) }), h2: '두 테이블에 같은 이름의 열이 있으므로 별칭~열 형태로 구분합니다. 키 열을 모두 ON에서 연결하세요.', checks: [K.sel, K.re(`INNER JOIN ${rel.b}`, new RegExp(`\\b(?:INNER )?JOIN ${rel.b}\\b`)), ...onChecks(rel), K.cols([...rel.aCols, ...rel.bCols]), K.intoTable(c.rv)] };
  });

  def('join_left_null', T.join, '고급', '작성', okInfo, c => {
    const rel = pickRel(c), { A, B, schemaText, table } = relMeta(rel), cols = q(A, rel.aCols);
    return { name: `${rel.b}가 없는 ${rel.a} 찾기`, table, schemaText, cols, req: `${rel.ko[0]}(${rel.a}) 중 ${rel.ko[1]}(${rel.b})가 한 건도 없는 행의 ${cols.join(', ')}를 @${c.rv}에 저장하세요. LEFT OUTER JOIN과 IS NULL을 사용하세요.`, answer: fmt({ cols, from: `${rel.a} AS ${A}`, joins: [`LEFT OUTER JOIN ${rel.b} AS ${B}\n    ON ${onTxt(rel, A, B)}`], where: `${B}~${rel.on[0]} IS NULL`, into: intoT(c) }), h2: 'LEFT OUTER JOIN은 짝이 없으면 오른쪽 열을 NULL로 채웁니다. 오른쪽 키가 NULL인 행이 “짝 없는” 행입니다.', note: '짝이 없는 행 찾기는 LEFT OUTER JOIN + IS NULL 또는 NOT EXISTS로 풉니다.', checks: [K.sel, K.re(`LEFT OUTER JOIN ${rel.b}`, new RegExp(`\\bLEFT OUTER JOIN ${rel.b}\\b`)), ...onChecks(rel), K.re(`${rel.on[0]} IS NULL (오른쪽 테이블)`, new RegExp(`\\b\\w+~${rel.on[0]} IS NULL\\b`)), K.intoTable(c.rv)] };
  });

  def('join_group', T.join, '고급', '작성', okInfo, c => {
    const rel = pickRel(c), { A, B, schemaText, table } = relMeta(rel), g = q(A, rel.aCols.slice(0, 2)), cols = [...g, 'COUNT( * ) AS ROW_COUNT', `SUM( ${B}~${rel.bNum} ) AS TOTAL_VALUE`];
    return { name: `${rel.a}별 ${rel.b} 집계`, table, schemaText, cols, req: `${rel.a}와 ${rel.b}를 INNER JOIN하고 ${rel.aCols.slice(0, 2).join(', ')}별로 행 개수(ROW_COUNT)와 ${rel.bNum} 합계(TOTAL_VALUE)를 구해 @${c.rv}에 저장하세요.`, answer: fmt({ cols, from: `${rel.a} AS ${A}`, joins: [`INNER JOIN ${rel.b} AS ${B}\n    ON ${onTxt(rel, A, B)}`], group: g.join(', '), into: intoT(c) }), checks: [K.sel, K.re(`INNER JOIN ${rel.b}`, new RegExp(`\\b(?:INNER )?JOIN ${rel.b}\\b`)), ...onChecks(rel), K.fn('COUNT', '*'), K.fn('SUM', rel.bNum), ...rel.aCols.slice(0, 2).map(f => K.re(`GROUP BY에 ${f} 포함`, new RegExp('\\bGROUP BY .*' + anyCol(f)))), K.intoTable(c.rv)] };
  });

  def('left_join_count', T.join, '고급', '작성', okInfo, c => {
    const rel = pickRel(c), { A, B, schemaText, table } = relMeta(rel), g = q(A, rel.aCols.slice(0, 2)), cnt = `${B}~${rel.bCols[0]}`, cols = [...g, `COUNT( ${cnt} ) AS ROW_COUNT`];
    return { name: `${rel.b} 개수를 0건까지 포함해 세기`, table, schemaText, cols, ordered: true, req: `모든 ${rel.a}(${rel.ko[0]})에 대해 ${rel.b}가 몇 건인지 ROW_COUNT로 구하세요. ${rel.b}가 없는 행도 0건으로 나와야 하며, ${g.join(', ')} 순서로 정렬해 @${c.rv}에 저장합니다.`, answer: fmt({ cols, from: `${rel.a} AS ${A}`, joins: [`LEFT OUTER JOIN ${rel.b} AS ${B}\n    ON ${onTxt(rel, A, B)}`], group: g.join(', '), order: g.join(', '), into: intoT(c) }), h2: 'COUNT( * )는 NULL 확장 행도 1로 세므로 0건이 나오지 않습니다. 오른쪽 테이블의 열을 COUNT( 열 )로 세어 보세요.', note: 'LEFT OUTER JOIN 뒤 COUNT( * )는 짝이 없는 행도 1건으로 셉니다. 오른쪽 열을 세면 NULL이 제외되어 0이 됩니다.', checks: [K.sel, K.re(`LEFT OUTER JOIN ${rel.b}`, new RegExp(`\\bLEFT OUTER JOIN ${rel.b}\\b`)), ...onChecks(rel), K.re('COUNT( 오른쪽 열 )', /\bCOUNT \( \w+~\w+ \)/), K.no('COUNT( * )는 짝 없는 행도 1로 셈', /\bCOUNT \( \* \)/), K.re('GROUP BY', /\bGROUP BY\b/), K.intoTable(c.rv)] };
  });

  def('join_on_filter', T.join, '고급', '작성', okInfo, c => {
    const rel = pickRel(c), { A, B, schemaText, table } = relMeta(rel), cond = rel.cond, cols = [...q(A, rel.aCols.slice(0, 2)), `${B}~${rel.bNum}`], real = cond.replace(/\{B\}/g, B);
    return { name: 'LEFT JOIN에서 조건 위치 (ON vs WHERE)', table, schemaText, cols, bindings: rel.bind(), req: `모든 ${rel.a}를 유지하면서, ${rel.condKo} ${rel.b}만 결합해 ${cols.join(', ')}를 @${c.rv}에 저장하세요. 조건에 맞는 ${rel.b}가 없는 ${rel.a}도 결과에 남아야 합니다.`, answer: fmt({ cols, from: `${rel.a} AS ${A}`, joins: [`LEFT OUTER JOIN ${rel.b} AS ${B}\n    ON ${onTxt(rel, A, B)}\n      AND ${real}`], into: intoT(c) }), h2: '오른쪽 테이블의 조건을 WHERE에 두면 NULL 확장 행이 걸러져 INNER JOIN처럼 동작합니다. ON 절에 AND로 붙이세요.', note: 'LEFT OUTER JOIN에서 오른쪽 테이블 조건은 ON에 두어야 왼쪽 행이 보존됩니다.', checks: [K.sel, K.re(`LEFT OUTER JOIN ${rel.b}`, new RegExp(`\\bLEFT OUTER JOIN ${rel.b}\\b`)), ...onChecks(rel), K.re('오른쪽 조건을 ON 절에 포함', new RegExp('\\bON .*' + condRe(cond).source)), K.no('오른쪽 조건을 WHERE에 두지 않음', /\bWHERE\b/), K.intoTable(c.rv)] };
  });

  const existsDef = neg => c => {
    const rel = pickRel(c), { A, B, schemaText, table } = relMeta(rel), cols = q(A, rel.aCols), cond = rel.cond.replace(/\{B\}/g, B);
    const where = `${neg ? 'NOT ' : ''}EXISTS ( SELECT ${B}~${rel.on[0]}\n      FROM ${rel.b} AS ${B}\n      WHERE ${onTxt(rel, A, B)}\n        AND ${cond} )`;
    return { name: `${rel.a} ${neg ? 'NOT EXISTS' : 'EXISTS'} 서브쿼리`, table, schemaText, cols, bindings: rel.bind(), req: `${rel.a}(${rel.ko[0]}) 중 ${rel.condKo} ${rel.b}가 ${neg ? '하나도 없는' : '하나 이상 있는'} 행의 ${cols.join(', ')}를 @${c.rv}에 저장하세요. ${neg ? 'NOT EXISTS' : 'EXISTS'} 서브쿼리를 사용하세요.`, answer: fmt({ cols, from: `${rel.a} AS ${A}`, where, into: intoT(c) }), h2: '서브쿼리 안에서 바깥 테이블 별칭(' + A + ')과 키를 연결하는 상관 조건이 필요합니다.', note: neg ? 'NOT EXISTS는 짝이 없는 행을 찾을 때 NULL 처리 실수가 적어 안전합니다.' : '', checks: [K.sel, K.from(rel.a), K.re(neg ? 'NOT EXISTS ( SELECT ... )' : 'EXISTS ( SELECT ... )', new RegExp(`\\b${neg ? 'NOT ' : ''}EXISTS \\( SELECT\\b`)), K.re(`서브쿼리에서 ${rel.b} 조회`, new RegExp(`\\bFROM ${rel.b}\\b`)), ...onChecks(rel), K.re('서브쿼리 조건', condRe(cond)), K.intoTable(c.rv)] };
  };
  def('exists_sub', T.join, '고급', '작성', okInfo, existsDef(false));
  def('not_exists_sub', T.join, '고급', '작성', okInfo, existsDef(true));

  def('in_sub', T.join, '중급', '작성', okInfo, c => {
    const rel = pickRel(c, r => r.on.length === 1), { A, B, schemaText, table } = relMeta(rel), cols = q(A, rel.aCols), k = rel.on[0], cond = rel.cond.replace(/\{B\}/g, B);
    return { name: `${rel.a} IN 서브쿼리`, table, schemaText, cols, bindings: rel.bind(), req: `${rel.a}(${rel.ko[0]}) 중 ${rel.condKo} ${rel.b}가 있는 행의 ${cols.join(', ')}를 @${c.rv}에 저장하세요. ${k}를 IN ( SELECT ... ) 서브쿼리로 비교하세요.`, answer: fmt({ cols, from: `${rel.a} AS ${A}`, where: `${A}~${k} IN ( SELECT ${B}~${k}\n      FROM ${rel.b} AS ${B}\n      WHERE ${cond} )`, into: intoT(c) }), checks: [K.sel, K.from(rel.a), K.re(`${k} IN ( SELECT ... )`, new RegExp(anyCol(k) + ' IN \\( SELECT\\b')), K.re(`서브쿼리에서 ${rel.b} 조회`, new RegExp(`\\bFROM ${rel.b}\\b`)), K.re('서브쿼리 조건', condRe(cond)), K.intoTable(c.rv)] };
  });

  def('scalar_sub', T.join, '고급', '작성', okInfo, c => {
    const t = NUM[c.table] ? c.table : c.r.pick(Object.keys(NUM)), n = NUM[t], cols = DISP[t];
    return { name: '평균보다 큰 행 (스칼라 서브쿼리)', table: t, cols, req: `${t}에서 ${n}이 전체 평균(AVG)보다 큰 행의 ${cols.join(', ')}를 @${c.rv}에 저장하세요. 평균은 서브쿼리로 구하세요.`, answer: fmt({ cols, from: t, where: `${n} > ( SELECT AVG( ${n} ) FROM ${t} )`, into: intoT(c) }), checks: [K.sel, K.from(t), K.cols(cols), K.re('( SELECT AVG( ... ) FROM ... ) 서브쿼리와 비교', new RegExp(anyCol(n) + ' > \\( SELECT AVG \\( ' + anyCol(n) + ' \\) FROM ' + t)), K.intoTable(c.rv)] };
  });

  def('join_three', T.join, '고급', '작성', okInfo, c => {
    const useB = c.table === 'SBOOK' || (c.table !== 'SCARR' && c.r.next() < 0.4), lv = dv(c, useB ? 'SBOOK' : 'SFLIGHT', 'CARRID', 'LH');
    const s = useB
      ? { cols: ['P~CITYFROM', 'P~CITYTO', 'F~FLDATE', 'B~BOOKID', 'B~PASSNAME'], from: 'SPFLI AS P', joins: ['INNER JOIN SFLIGHT AS F\n    ON F~CARRID = P~CARRID\n   AND F~CONNID = P~CONNID', 'INNER JOIN SBOOK AS B\n    ON B~CARRID = F~CARRID\n   AND B~CONNID = F~CONNID\n   AND B~FLDATE = F~FLDATE'], where: 'P~CARRID = @LV_CARRID', tables: ['SPFLI', 'SFLIGHT', 'SBOOK'], keys: ['CARRID', 'CONNID', 'FLDATE'], schemaText: 'SPFLI AS P: CARRID, CONNID, CITYFROM, CITYTO · SFLIGHT AS F: CARRID, CONNID, FLDATE · SBOOK AS B: CARRID, CONNID, FLDATE, BOOKID, PASSNAME', w: 'P~CARRID' }
      : { cols: ['C~CARRNAME', 'P~CITYFROM', 'P~CITYTO', 'F~FLDATE', 'F~PRICE'], from: 'SCARR AS C', joins: ['INNER JOIN SPFLI AS P\n    ON P~CARRID = C~CARRID', 'INNER JOIN SFLIGHT AS F\n    ON F~CARRID = P~CARRID\n   AND F~CONNID = P~CONNID'], where: 'C~CARRID = @LV_CARRID', tables: ['SCARR', 'SPFLI', 'SFLIGHT'], keys: ['CARRID', 'CONNID'], schemaText: 'SCARR AS C: CARRID, CARRNAME · SPFLI AS P: CARRID, CONNID, CITYFROM, CITYTO · SFLIGHT AS F: CARRID, CONNID, FLDATE, PRICE', w: 'C~CARRID' };
    return { name: `${s.tables.join('·')} 3개 테이블 JOIN`, table: s.tables.join(' + '), schemaText: s.schemaText, cols: s.cols, bindings: { LV_CARRID: lv }, req: `${s.tables.join(' → ')} 순서로 키를 따라 연결하고, 항공사 코드가 @LV_CARRID인 행의 ${s.cols.join(', ')}를 @${c.rv}에 저장하세요.`, answer: fmt({ cols: s.cols, from: s.from, joins: s.joins, where: s.where, into: intoT(c) }), h2: '앞 JOIN의 결과에 다음 JOIN을 이어 붙입니다. 복합 키는 AND로 모두 연결하세요.', checks: [K.sel, K.re('JOIN을 2번 사용 (3개 테이블)', /\bJOIN \w+ AS \w+ ON .*\bJOIN \w+ AS \w+ ON\b/), ...s.tables.slice(1).map(t => K.re(`JOIN ${t}`, new RegExp(`\\bJOIN ${t}\\b`))), ...s.keys.map(k => K.re(`ON 조건: ${k} 연결`, new RegExp(`\\b\\w+~${k} = \\w+~${k}\\b`))), K.re('항공사 코드 조건 @LV_CARRID', new RegExp('\\b\\w+~CARRID = @LV_CARRID\\b')), K.intoTable(c.rv)] };
  });

  /* ---------- ABAP 7.4 문법 ---------- */
  def('inline_table', T.syn, '기초', '작성', null, c => ({ name: '인라인 선언으로 결과 받기', cols: c.focused, req: `${c.table}에서 ${c.focused.join(', ')}를 조회해 미리 선언하지 않은 내부 테이블 @DATA(LT_RESULT)에 한 번에 받으세요.`, answer: fmt({ cols: c.focused, from: c.table, into: 'TABLE @DATA(LT_RESULT)' }), note: '@DATA(...) 인라인 선언은 SELECT 결과 구조에 맞는 변수를 자동 생성합니다(7.40 이상).', checks: [K.sel, K.from(c.table), K.cols(c.focused), K.re('INTO TABLE @DATA( 이름 )', /\bINTO TABLE @DATA \( \w+ \)/)] }));

  def('into_corresponding', T.syn, '기초', '작성', null, c => ({ name: 'INTO CORRESPONDING FIELDS', cols: c.focused, req: `${c.table}에서 ${c.focused.join(', ')}를 조회해 열 이름이 같은 필드끼리 매핑되도록 @${c.rv}에 저장하세요. (CORRESPONDING FIELDS OF TABLE)`, answer: fmt({ cols: c.focused, from: c.table, into: `CORRESPONDING FIELDS OF TABLE @${c.rv}` }), note: 'CORRESPONDING은 이름이 같은 열만 옮깁니다. 내부 테이블 구조와 SELECT 열 이름이 어긋나면 값이 비어 있을 수 있습니다.', checks: [K.sel, K.from(c.table), K.cols(c.focused), K.re(`INTO CORRESPONDING FIELDS OF TABLE @${c.rv}`, new RegExp('\\bINTO CORRESPONDING FIELDS OF TABLE @' + c.rv + '(?![A-Z0-9_])'))] }));

  const CASES = {
    SFLIGHT: () => ({ cols: ['CARRID', 'CONNID', 'FLDATE'], cond: 'SEATSOCC = SEATSMAX', yes: 'FULL', no: 'OPEN', alias: 'STATUS', ko: '예약 좌석이 최대 좌석과 같으면' }),
    SBOOK: () => ({ cols: ['BOOKID', 'PASSNAME'], cond: "CANCELLED = 'X'", yes: 'CANCELLED', no: 'ACTIVE', alias: 'STATUS', ko: "취소 여부가 'X'이면" }),
    SPFLI: () => ({ cols: ['CARRID', 'CONNID'], cond: 'DISTANCE >= @LV_LIMIT', yes: 'LONG', no: 'SHORT', alias: 'HAUL', ko: '거리가 @LV_LIMIT 이상이면', bind: { LV_LIMIT: quant('SPFLI', 'DISTANCE', 0.5) } }),
    SCARR: () => ({ cols: ['CARRID', 'CARRNAME'], cond: "CURRCODE = 'USD'", yes: 'US', no: 'OTHER', alias: 'REGION', ko: "통화 코드가 'USD'이면" })
  };
  def('case_expr', T.syn, '중급', '작성', okInfo, c => {
    const s = CASES[c.table]();
    return { name: 'CASE 식으로 값 분류하기', cols: [...s.cols, s.alias], bindings: s.bind || {}, req: `${c.table}에서 ${s.cols.join(', ')}와 함께, ${s.ko} '${s.yes}', 아니면 '${s.no}'를 ${s.alias} 열로 계산해 @${c.rv}에 저장하세요. (CASE WHEN ... THEN ... ELSE ... END)`, answer: fmt({ cols: [...s.cols, `CASE WHEN ${s.cond}\n            THEN '${s.yes}'\n            ELSE '${s.no}'\n       END AS ${s.alias}`], from: c.table, into: intoT(c) }), note: 'Open SQL의 CASE는 DB에서 값을 계산하므로 ABAP LOOP에서 IF로 분류하는 것보다 효율적입니다.', checks: baseChecks(c, s.cols, [K.re(`CASE WHEN ... THEN '${s.yes}' ELSE '${s.no}' END AS ${s.alias}`, new RegExp(`\\bCASE WHEN .+ THEN '${s.yes}' ELSE '${s.no}' END AS ${s.alias}\\b`))]) };
  });

  const ARITH = [
    { t: 'SFLIGHT', cols: ['CARRID', 'CONNID', 'FLDATE'], expr: 'SEATSMAX - SEATSOCC', alias: 'SEATS_FREE', ko: '잔여 좌석 수(SEATSMAX - SEATSOCC)' },
    { t: 'SFLIGHT', cols: ['CARRID', 'CONNID', 'FLDATE'], expr: 'PRICE * SEATSOCC', alias: 'REVENUE', ko: '예상 매출(PRICE * SEATSOCC)' },
    { t: 'SPFLI', cols: ['CARRID', 'CONNID'], expr: 'DISTANCE * 2', alias: 'ROUND_TRIP', ko: '왕복 거리(DISTANCE * 2)' }
  ];
  def('arith_expr', T.syn, '중급', '작성', okInfo, c => {
    const s = c.r.pick(ARITH.filter(x => x.t === c.table).length ? ARITH.filter(x => x.t === c.table) : ARITH);
    return { name: 'SELECT 목록에서 계산하기', table: s.t, cols: [...s.cols, s.alias], req: `${s.t}에서 ${s.cols.join(', ')}와 함께 ${s.ko}을 ${s.alias} 열로 계산해 @${c.rv}에 저장하세요.`, answer: fmt({ cols: [...s.cols, `${s.expr} AS ${s.alias}`], from: s.t, into: intoT(c) }), h2: '연산자 양쪽에 공백이 필요합니다. 계산 결과 열에는 AS로 이름을 붙이세요.', checks: [K.sel, K.from(s.t), K.cols(s.cols), K.re(`${s.expr} AS ${s.alias}`, new RegExp(rxEsc(canon(s.expr + ' AS ' + s.alias)))), K.intoTable(c.rv)] };
  });

  def('from_first', T.syn, '중급', '작성', null, c => {
    const f = c.focused[0];
    return { name: 'FROM 먼저 쓰는 SELECT (FIELDS)', cols: c.focused, ordered: true, req: `SELECT FROM ... FIELDS 형태로 ${c.table}에서 ${c.focused.join(', ')}를 ${f} 기준 오름차순으로 조회해 @${c.rv}에 저장하세요.`, answer: `SELECT FROM ${c.table}\n  FIELDS ${c.focused.join(', ')}\n  ORDER BY ${f} ASCENDING\n  INTO TABLE @${c.rv}.`, note: 'SELECT FROM 테이블 FIELDS 열목록 형태는 7.40 SP05 이상에서 지원하는 새 문법입니다.', checks: [K.sel, K.re(`SELECT FROM ${c.table} FIELDS`, new RegExp(`\\bSELECT FROM ${c.table} FIELDS\\b`)), K.cols(c.focused), K.orderBy([[f, false]]), K.intoTable(c.rv)] };
  });

  /* ---------- 결과 처리 ---------- */
  const keyWhere = (c, row) => ({ where: c.info.key.map(k => `${k} = @LV_${k}`).join(' AND '), bindings: Object.fromEntries(c.info.key.map(k => [`LV_${k}`, row[k]])) });

  def('sy_subrc', T.res, '기초', '작성', okInfo, c => {
    const row = c.r.pick(DB()[c.table] || [{}]), { where, bindings } = keyWhere(c, row), f = c.fields.find(x => !c.info.key.includes(x)) || c.info.key[0];
    return { name: 'sy-subrc로 조회 성공 확인', cols: [f], semantic: false, bindings, req: `${c.table}에서 키(${c.info.key.join(', ')})로 SELECT SINGLE ${f}를 @DATA(LS_RESULT)에 읽고, sy-subrc가 0이면 값을 WRITE, 아니면 'NOT FOUND'를 WRITE하는 IF 블록을 작성하세요.`, answer: `SELECT SINGLE ${f}\n  FROM ${c.table}\n  WHERE ${where}\n  INTO @DATA(LS_RESULT).\nIF sy-subrc = 0.\n  WRITE: / LS_RESULT-${f}.\nELSE.\n  WRITE: / 'NOT FOUND'.\nENDIF.`, note: 'SELECT 직후 sy-subrc를 확인하세요. 0이면 한 건 이상 읽은 것입니다. 다른 문장이 끼면 값이 바뀝니다.', checks: [K.re('SELECT SINGLE 사용', /\bSELECT SINGLE\b/), K.from(c.table), K.re('키 조건 작성', new RegExp(c.info.key.map(k => anyCol(k) + ' = @\\w+').join('.*'))), K.re('IF sy-subrc = 0 으로 성공 여부 확인', /\bIF SY-SUBRC (?:=|EQ) 0\b/), K.re('IF 블록 종료 (ENDIF)', /\bENDIF\b/)] };
  });

  def('sy_dbcnt', T.res, '기초', '작성', null, c => ({ name: '조회 건수 sy-dbcnt로 확인', cols: c.focused, semantic: false, req: `${c.table}에서 ${c.focused.join(', ')}를 @${c.rv}에 조회한 뒤, 조회된 건수를 sy-dbcnt를 이용해 @LV_COUNT 변수에 옮기세요. (LV_COUNT = sy-dbcnt.)`, answer: fmt({ cols: c.focused, from: c.table, into: intoT(c) }) + '\nLV_COUNT = sy-dbcnt.', note: 'sy-dbcnt는 바로 직전 Open SQL이 처리한 행 수입니다. 다른 SQL이 끼기 전에 읽으세요.', checks: baseChecks(c, c.focused, [K.re('sy-dbcnt 사용', /\bSY-DBCNT\b/)]) }));

  def('endselect', T.res, '중급', '작성', null, c => { const [a, b] = c.focused.length > 1 ? c.focused : [c.focused[0], c.focused[0]]; return { name: 'SELECT ... ENDSELECT 루프', cols: c.focused, semantic: false, req: `${c.table}에서 ${c.focused.join(', ')}를 한 행씩 @DATA(LS_ROW)에 받아 WRITE로 출력하는 SELECT ... ENDSELECT 루프를 작성하세요.`, answer: `SELECT ${c.focused.join(', ')}\n  FROM ${c.table}\n  INTO @DATA(LS_ROW).\n  WRITE: / LS_ROW-${a}, LS_ROW-${b}.\nENDSELECT.`, note: 'ENDSELECT 루프는 한 행씩 DB를 가져오므로 건수가 많으면 INTO TABLE 후 LOOP가 더 효율적입니다.', checks: [K.sel, K.from(c.table), K.cols(c.focused), K.re('INTO @DATA( 구조 )로 한 행씩 받기', /\bINTO @DATA \( \w+ \)/), K.re('ENDSELECT로 루프 종료', /\bENDSELECT\b/), K.no('INTO TABLE은 쓰지 않음', /\bINTO (?:CORRESPONDING FIELDS OF )?TABLE\b/)] }; });

  def('loop_result', T.res, '기초', '작성', null, c => { const [a, b] = c.focused.length > 1 ? c.focused : [c.focused[0], c.focused[0]]; return { name: '조회 결과 LOOP로 출력하기', cols: c.focused, semantic: false, plain: true, snippet: fmt({ cols: c.focused, from: c.table, into: intoT(c) }), req: `위 SELECT로 @${c.rv}에 채워진 결과를 LOOP AT으로 한 행씩 읽어 ${a}, ${b}를 WRITE하세요. 필드 심볼(ASSIGNING FIELD-SYMBOL) 또는 INTO DATA(...)를 사용합니다.`, answer: `LOOP AT ${c.rv} ASSIGNING FIELD-SYMBOL(<LS_ROW>).\n  WRITE: / <LS_ROW>-${a}, <LS_ROW>-${b}.\nENDLOOP.`, note: 'ASSIGNING FIELD-SYMBOL은 행을 복사하지 않아 INTO보다 효율적이고, 값을 바꾸면 내부 테이블에도 반영됩니다.', checks: [K.re(`LOOP AT ${c.rv}`, new RegExp('\\bLOOP AT ' + c.rv + '\\b')), K.re('ASSIGNING FIELD-SYMBOL( <fs> ) 또는 INTO 사용', /\bLOOP AT \w+ (?:ASSIGNING FIELD-SYMBOL \( <\w+> \)|INTO (?:DATA \( \w+ \)|\w+))/), K.re('WRITE로 출력', /\bWRITE\b/), K.re('ENDLOOP로 종료', /\bENDLOOP\b/)] }; });

  def('appending', T.res, '중급', '작성', okInfo, c => {
    const f = c.gf, vals = colVals(c.table, f).map(String), a = vals[0] || 'AA', b = vals[1] || 'LH', cols = c.focused;
    return { name: 'APPENDING TABLE로 결과 이어붙이기', cols, semantic: false, req: `${c.table}에서 ${f}가 '${a}'인 행의 ${cols.join(', ')}를 @${c.rv}에 먼저 조회하고, ${f}가 '${b}'인 행은 기존 내용 뒤에 이어 붙이도록 두 개의 SELECT를 작성하세요.`, answer: fmt({ cols, from: c.table, where: `${f} = '${a}'`, into: intoT(c) }) + '\n' + fmt({ cols, from: c.table, where: `${f} = '${b}'`, into: 'APPENDING TABLE @' + c.rv }), note: 'INTO TABLE은 기존 내용을 지우고 채우지만 APPENDING TABLE은 뒤에 추가합니다.', checks: [K.re('SELECT 문 두 개', /\bSELECT\b.*\bSELECT\b/), K.from(c.table), K.re(`첫 조회는 INTO TABLE @${c.rv}`, new RegExp('\\bINTO (?:CORRESPONDING FIELDS OF )?TABLE @' + c.rv + '(?![A-Z0-9_])')), K.re(`두 번째 조회는 APPENDING TABLE @${c.rv}`, new RegExp('\\bAPPENDING (?:CORRESPONDING FIELDS OF )?TABLE @' + c.rv + '(?![A-Z0-9_])')), K.re(`두 값 '${a}', '${b}' 조건`, new RegExp(`'${a.toUpperCase()}'.*'${b.toUpperCase()}'`))] };
  });

  /* ---------- 성능과 코드 리뷰 ---------- */
  def('fae_guard', T.perf, '중급', '코드 리뷰', okInfo, c => {
    const k = c.info.key[0], cols = uniq([k, ...c.fields.filter(f => f !== k).slice(0, 1)]);
    return { name: 'FOR ALL ENTRIES 빈 테이블 방어', cols, semantic: false, snippet: `" LT_KEYS : ${k} 필드를 가진 내부 테이블 (조회 기준, 이미 채워져 있다고 가정)`, req: `LT_KEYS에 있는 ${k}에 해당하는 ${c.table}의 ${cols.join(', ')}를 @${c.rv}에 조회하세요. 기준 테이블이 비어 있을 때 전체 조회가 일어나지 않도록 방어하세요.`, answer: `IF LT_KEYS IS NOT INITIAL.\n  ${fmt({ cols, from: c.table, where: `${k} = @LT_KEYS-${k}`, into: intoT(c) }).replace('\n  FROM', '\n    FROM').replace('\n  WHERE', '\n    FOR ALL ENTRIES IN @LT_KEYS\n    WHERE').replace('\n  INTO', '\n    INTO')}\nENDIF.`, note: '기준 내부 테이블이 비어 있으면 FOR ALL ENTRIES 조건이 무시되어 테이블 전체를 읽을 수 있습니다. 또한 결과의 중복 행은 자동 제거됩니다.', checks: [K.re('IF LT_KEYS IS NOT INITIAL 방어', /\bIF LT_KEYS IS NOT INITIAL\b/), K.re('FOR ALL ENTRIES IN @LT_KEYS', /\bFOR ALL ENTRIES IN @LT_KEYS\b/), K.re(`WHERE ${k} = @LT_KEYS-${k}`, new RegExp(anyCol(k) + ' = @LT_KEYS-' + k + '(?![A-Z0-9_])')), K.re('IF 블록 종료 (ENDIF)', /\bENDIF\b/), K.intoTable(c.rv)] };
  });

  def('rev_star', T.perf, '기초', '코드 리뷰', null, c => {
    const [a, b] = c.focused.length > 1 ? c.focused : [c.focused[0], c.focused[0]];
    return { name: 'SELECT * 줄이기', cols: c.focused, snippet: `SELECT *\n  FROM ${c.table}\n  INTO TABLE @${c.rv}.\nLOOP AT ${c.rv} INTO DATA(LS_ROW).\n  WRITE: / LS_ROW-${a}, LS_ROW-${b}.\nENDLOOP.`, req: `위 코드는 LOOP에서 ${a}, ${b}만 사용하는데 모든 열을 읽습니다. 필요한 열만 읽도록 SELECT 문을 고쳐 작성하세요(결과 @${c.rv}).`, answer: fmt({ cols: c.focused, from: c.table, into: intoT(c) }), note: '필요한 열만 읽으면 DB 전송량과 메모리가 줄어듭니다.', checks: [K.sel, K.no('SELECT * 대신 필요한 열만 지정', /\bSELECT (?:SINGLE |DISTINCT )?\*/), ...baseChecks(c, c.focused).slice(1)] };
  });

  def('rev_loop_select', T.perf, '고급', '코드 리뷰', okInfo, c => {
    const rel = pickRel(c), { A, B, schemaText, table } = relMeta(rel), cols = [...q(A, rel.aCols), ...q(B, rel.bCols)];
    const snippet = `SELECT ${rel.aCols.join(', ')}\n  FROM ${rel.a}\n  INTO TABLE @DATA(LT_PARENT).\nLOOP AT LT_PARENT INTO DATA(LS_PARENT).\n  SELECT ${rel.bCols.join(', ')}\n    FROM ${rel.b}\n    WHERE ${rel.on.map(k => `${k} = @LS_PARENT-${k}`).join('\n      AND ')}\n    APPENDING TABLE @${c.rv}.\nENDLOOP.`;
    return { name: 'LOOP 안의 SELECT를 JOIN으로', table, schemaText, cols, snippet, req: `위 코드는 ${rel.a} 행마다 ${rel.b}를 다시 조회합니다(N+1 문제). 한 번의 INNER JOIN SELECT로 바꿔 ${cols.join(', ')}를 @${c.rv}에 저장하세요. 별칭은 ${A}, ${B}를 쓰세요.`, answer: fmt({ cols, from: `${rel.a} AS ${A}`, joins: [`INNER JOIN ${rel.b} AS ${B}\n    ON ${onTxt(rel, A, B)}`], into: intoT(c) }), note: 'LOOP 안에서 SELECT를 반복하면 DB 왕복 횟수가 행 수만큼 늘어납니다. JOIN이나 FOR ALL ENTRIES로 한 번에 읽으세요.', checks: [K.sel, K.re(`INNER JOIN ${rel.b}`, new RegExp(`\\b(?:INNER )?JOIN ${rel.b}\\b`)), ...onChecks(rel), K.no('LOOP 안의 반복 SELECT 제거', /\bLOOP AT\b/), K.intoTable(c.rv)] };
  });

  def('rev_count_rows', T.perf, '중급', '코드 리뷰', null, c => ({ name: '건수만 필요하면 COUNT', cols: [], snippet: `SELECT *\n  FROM ${c.table}\n  INTO TABLE @${c.rv}.\nDESCRIBE TABLE ${c.rv} LINES LV_COUNT.`, req: `위 코드는 건수만 알면 되는데 모든 행을 내부 테이블로 읽습니다. DB에서 건수만 집계해 @LV_COUNT에 받는 SELECT로 고쳐 쓰세요.`, answer: `SELECT COUNT( * )\n  FROM ${c.table}\n  INTO @LV_COUNT.`, note: '건수나 합계만 필요하면 집계 함수를 DB에서 계산하세요.', checks: [K.sel, K.from(c.table), K.fn('COUNT', '*'), K.no('행 전체를 내부 테이블로 읽지 않음', /\bINTO (?:CORRESPONDING FIELDS OF )?TABLE\b/), K.intoVar('LV_COUNT')] }));

  def('rev_single_order', T.perf, '중급', '코드 리뷰', c => c.info && c.info.key.length > 1 && !!NUM[c.table], c => {
    const k = c.info.key[0], n = NUM[c.table], cols = uniq([...c.info.key.slice(0, 2), n]), v = dv(c, c.table, k, 'AA');
    return { name: 'SELECT SINGLE 대신 ORDER BY + UP TO 1 ROWS', cols, ordered: true, bindings: { [`LV_${k}`]: v }, snippet: `SELECT SINGLE ${cols.join(', ')}\n  FROM ${c.table}\n  WHERE ${k} = @LV_${k}\n  INTO @DATA(LS_ROW).`, req: `위 코드는 ${k}만 지정해(전체 키가 아님) “${n}이 가장 낮은 1건”이 필요한데 SELECT SINGLE을 씁니다. 정렬 후 1건만 읽도록 바꿔 ${cols.join(', ')}를 @${c.rv}에 저장하세요.`, answer: fmt({ cols, from: c.table, where: `${k} = @LV_${k}`, order: `${n} ASCENDING`, into: intoT(c), upTo: 1 }), note: '전체 키가 아닌 조건의 SELECT SINGLE은 어느 행이 선택될지 보장되지 않습니다. 의도한 행은 ORDER BY로 명시하세요.', checks: [K.sel, K.from(c.table), K.no('SELECT SINGLE 사용 안 함', /\bSELECT SINGLE\b/), K.re(`WHERE ${k} = @LV_${k}`, new RegExp(anyCol(k) + ' = @LV_' + k)), K.orderBy([[n, false]]), K.upTo(1), K.intoTable(c.rv)] };
  });

  def('rev_filter_db', T.perf, '중급', '코드 리뷰', okInfo, c => {
    const f = c.gf, cols = uniq([f, ...c.focused]), v = dv(c, c.table, f, 'AA');
    return { name: 'ABAP에서 거르지 말고 WHERE로', cols, bindings: { [`LV_${f}`]: v }, snippet: `SELECT ${cols.join(', ')}\n  FROM ${c.table}\n  INTO TABLE @${c.rv}.\nDELETE ${c.rv} WHERE ${f} <> LV_${f}.`, req: `위 코드는 전체를 읽은 뒤 ABAP에서 DELETE로 걸러 냅니다. ${f}가 @LV_${f}인 행만 DB에서 읽도록 SELECT를 고쳐 @${c.rv}에 저장하세요.`, answer: fmt({ cols, from: c.table, where: `${f} = @LV_${f}`, into: intoT(c) }), note: '조건은 가능한 한 WHERE로 DB에 내려 보내세요. 불필요한 행 전송이 줄어듭니다.', checks: [K.sel, K.from(c.table), K.cols(cols), K.no('DELETE로 걸러내지 않음', /\bDELETE\b/), K.re(`WHERE ${f} = @LV_${f}`, new RegExp(anyCol(f) + ' = @LV_' + f)), K.intoTable(c.rv)] };
  });

  def('rev_sum_abap', T.perf, '중급', '코드 리뷰', okInfo, c => {
    const t = NUM[c.table] ? c.table : c.r.pick(Object.keys(NUM)), n = NUM[t];
    return { name: 'ABAP 합산 대신 SUM', table: t, cols: [n], snippet: `SELECT ${n}\n  FROM ${t}\n  INTO TABLE @DATA(LT_VALUES).\nLOOP AT LT_VALUES INTO DATA(LS_VALUE).\n  LV_SUM = LV_SUM + LS_VALUE-${n}.\nENDLOOP.`, req: `위 코드는 ${n}의 합계를 ABAP LOOP에서 계산합니다. DB에서 합계만 구해 @LV_SUM에 받도록 SELECT 한 문장으로 바꿔 쓰세요.`, answer: `SELECT SUM( ${n} )\n  FROM ${t}\n  INTO @LV_SUM.`, note: '집계는 DB가 가장 빠르게 계산합니다. 많은 행을 읽어 와서 ABAP에서 더하지 마세요.', checks: [K.sel, K.from(t), K.fn('SUM', n), K.no('LOOP 제거', /\bLOOP\b/), K.intoVar('LV_SUM')] };
  });

  /* ---------- 오류 수정 · 문법 변환 ---------- */
  def('fix_missing_at', T.syn, '기초', '오류 수정', okInfo, c => {
    const f = c.gf, cols = uniq([f, ...c.focused]), v = dv(c, c.table, f, 'AA');
    return { name: '@ 빠진 호스트 변수 고치기', cols, bindings: { [`LV_${f}`]: v }, snippet: `SELECT ${cols.join(', ')}\n  FROM ${c.table}\n  WHERE ${f} = LV_${f}\n  INTO TABLE ${c.rv}.`, req: `위 코드는 열 목록에 쉼표를 썼으므로 새 Open SQL(엄격 모드) 규칙이 적용되어 구문 오류가 납니다. 올바르게 고쳐 쓰세요.`, answer: fmt({ cols, from: c.table, where: `${f} = @LV_${f}`, into: intoT(c) }), note: '쉼표 구분 열 목록을 쓰면 엄격 모드가 적용되어 ABAP 변수에는 반드시 @가 필요합니다.', checks: [K.sel, K.from(c.table), K.re(`WHERE ${f} = @LV_${f} (@ 사용)`, new RegExp(anyCol(f) + ' = @LV_' + f)), K.intoTable(c.rv)] };
  });

  def('fix_comma', T.syn, '기초', '오류 수정', c => c.fields.length > 1, c => {
    const cols = uniq([c.gf, ...c.focused]).slice(0, 3), f = c.gf, v = dv(c, c.table, f, 'AA');
    return { name: '쉼표 빠진 열 목록 고치기', cols, bindings: { [`LV_${f}`]: v }, snippet: `SELECT ${cols.join(' ')}\n  FROM ${c.table}\n  WHERE ${f} = @LV_${f}\n  INTO TABLE @${c.rv}.`, req: `위 코드는 @ 호스트 변수를 쓰면서 열 목록에 쉼표가 없어 구문 오류가 납니다. 올바르게 고쳐 쓰세요.`, answer: fmt({ cols, from: c.table, where: `${f} = @LV_${f}`, into: intoT(c) }), note: '@를 쓰는 새 문법에서는 열 목록을 쉼표로 구분해야 합니다.', checks: [K.sel, K.from(c.table), K.re('열 목록을 쉼표로 구분', /\bSELECT (?:SINGLE |DISTINCT )?(?:\w+~)?\w+ , (?:\w+~)?\w+/), K.cols(cols), K.intoTable(c.rv)] };
  });

  def('fix_col_at', T.cond, '중급', '오류 수정', c => !!PAIRS[c.table], c => {
    const [a, b, op] = PAIRS[c.table][0], cols = ['CARRID', 'CONNID', a, b];
    return { name: '열 비교에 붙은 @ 고치기', cols, snippet: `SELECT ${cols.join(', ')}\n  FROM ${c.table}\n  WHERE ${a} ${op} @${b}\n  INTO TABLE @${c.rv}.`, req: `위 코드는 DB 열 ${b}에 @를 붙여 ABAP 변수로 취급해 오류가 납니다. ${a}가 ${b}보다 작은 행을 조회하도록 고쳐 쓰세요.`, answer: fmt({ cols, from: c.table, where: `${a} ${op} ${b}`, into: intoT(c) }), checks: baseChecks(c, cols, [K.re(`${a} ${op} ${b} 열 비교`, new RegExp(anyCol(a) + ' ' + rxEsc(op) + ' ' + anyCol(b))), K.no('DB 열에 @를 붙이지 않음', new RegExp('@(?:' + a + '|' + b + ')(?![A-Z0-9_])'))]) };
  });

  def('fix_single_endselect', T.res, '기초', '오류 수정', okInfo, c => {
    const row = c.r.pick(DB()[c.table] || [{}]), { where, bindings } = keyWhere(c, row), f = c.fields.find(x => !c.info.key.includes(x)) || c.info.key[0];
    return { name: 'SELECT SINGLE과 ENDSELECT 고치기', cols: [f], bindings, snippet: `SELECT SINGLE ${f}\n  FROM ${c.table}\n  WHERE ${where}\n  INTO @DATA(LS_RESULT).\n  WRITE: / LS_RESULT-${f}.\nENDSELECT.`, req: `위 코드는 SELECT SINGLE 뒤에 ENDSELECT를 써서 구문 오류가 납니다. 올바르게 고쳐 쓰세요.`, answer: `SELECT SINGLE ${f}\n  FROM ${c.table}\n  WHERE ${where}\n  INTO @DATA(LS_RESULT).\nWRITE: / LS_RESULT-${f}.`, note: 'SELECT SINGLE은 루프가 아니므로 ENDSELECT가 없습니다. 루프가 필요하면 SINGLE을 빼세요.', checks: [K.re('SELECT SINGLE 사용', /\bSELECT SINGLE\b/), K.from(c.table), K.no('ENDSELECT 제거', /\bENDSELECT\b/), K.re('결과를 @DATA(구조)에 저장', /\bINTO @(?:DATA \( \w+ \)|\w+)/)] };
  });

  def('fix_groupby', T.agg, '중급', '오류 수정', c => c.info && c.info.group.length >= 2, c => {
    const g = c.info.group, a = g[0], b = g[1], cols = [a, b, 'COUNT( * ) AS ROW_COUNT'];
    return { name: 'GROUP BY에서 빠진 열 고치기', cols, snippet: `SELECT ${cols.join(', ')}\n  FROM ${c.table}\n  GROUP BY ${a}\n  INTO TABLE @${c.rv}.`, req: `위 코드는 SELECT 목록의 ${b}가 GROUP BY에 없어 구문 오류가 납니다. ${a}, ${b} 조합별 건수를 구하도록 고쳐 쓰세요.`, answer: fmt({ cols, from: c.table, group: `${a}, ${b}`, into: intoT(c) }), note: '집계되지 않은 SELECT 열은 모두 GROUP BY에 포함해야 합니다.', checks: baseChecks(c, [a, b], [K.fn('COUNT', '*'), K.re(`GROUP BY ${a}, ${b}`, new RegExp(`\\bGROUP BY (?:${anyCol(a)} , ${anyCol(b)}|${anyCol(b)} , ${anyCol(a)})`))]) };
  });

  def('fix_having', T.agg, '중급', '오류 수정', null, c => {
    const cols = [c.gf, 'COUNT( * ) AS ROW_COUNT'];
    return { name: 'WHERE의 집계 함수를 HAVING으로', cols, bindings: { LV_MIN_COUNT: minCnt(c, c.gf) }, snippet: `SELECT ${cols.join(', ')}\n  FROM ${c.table}\n  WHERE COUNT( * ) >= @LV_MIN_COUNT\n  GROUP BY ${c.gf}\n  INTO TABLE @${c.rv}.`, req: `위 코드는 WHERE에서 집계 함수를 써서 오류가 납니다. ${c.gf}별 건수가 @LV_MIN_COUNT 이상인 그룹만 남기도록 고쳐 쓰세요.`, answer: fmt({ cols, from: c.table, group: c.gf, having: 'COUNT( * ) >= @LV_MIN_COUNT', into: intoT(c) }), note: '집계 결과를 거르는 조건은 HAVING에만 쓸 수 있습니다.', checks: baseChecks(c, [c.gf], [K.no('WHERE에 집계 함수를 쓰지 않음', /\bWHERE COUNT\b/), K.re('HAVING COUNT( * ) >= @LV_MIN_COUNT', /\bHAVING COUNT \( \* \) >= @LV_MIN_COUNT\b/), K.re(`GROUP BY ${c.gf}`, new RegExp('\\bGROUP BY ' + anyCol(c.gf)))]) };
  });

  def('fix_range_eq', T.cond, '기초', '오류 수정', okInfo, c => {
    const f = c.gf, name = c.cvars.find(v => /^S_/i.test(v) && v.endsWith(f)) || 'S_' + f, cols = uniq([f, ...c.focused]), vals = colVals(c.table, f).slice(0, 2);
    return { name: '선택 범위에 = 쓴 코드 고치기', cols, bindings: { [name]: vals }, snippet: `SELECT ${cols.join(', ')}\n  FROM ${c.table}\n  WHERE ${f} = @${name}\n  INTO TABLE @${c.rv}.`, req: `@${name}은 SELECT-OPTIONS로 만든 선택 범위(내부 테이블)입니다. 위 코드는 = 로 비교해 오류가 납니다. 범위에 포함된 행만 조회하도록 고쳐 쓰세요.`, answer: fmt({ cols, from: c.table, where: `${f} IN @${name}`, into: intoT(c) }), note: '선택 범위는 = 가 아니라 IN으로 비교합니다. 범위가 비어 있으면 전체가 조회됩니다.', checks: baseChecks(c, cols, [K.re(`WHERE ${f} IN @${name}`, new RegExp(anyCol(f) + ' IN @' + name + '(?![A-Z0-9_])'))]) };
  });

  def('old_to_new', T.syn, '중급', '문법 변환', okInfo, c => {
    const f = c.gf, cols = uniq([f, ...c.focused]).slice(0, 3), v = dv(c, c.table, f, 'AA');
    return { name: '옛 문법을 새 Open SQL로 바꾸기', cols, bindings: { [`LV_${f}`]: v }, snippet: `SELECT ${cols.join(' ')}\n  FROM ${c.table}\n  INTO TABLE ${c.rv}\n  WHERE ${f} = LV_${f}.`, req: `위 클래식 문법의 SELECT를 7.4 이상 새 Open SQL(쉼표 구분 열 목록, @ 호스트 변수, INTO를 마지막에)로 바꿔 쓰세요.`, answer: fmt({ cols, from: c.table, where: `${f} = @LV_${f}`, into: intoT(c) }), note: '새 문법: ① 열은 쉼표로 구분 ② ABAP 변수는 @ ③ INTO는 마지막 절.', checks: [K.sel, K.from(c.table), K.re('열 목록을 쉼표로 구분', /\bSELECT (?:SINGLE |DISTINCT )?(?:\w+~)?\w+ , (?:\w+~)?\w+/), K.cols(cols), K.re(`WHERE ${f} = @LV_${f} (@ 사용)`, new RegExp(anyCol(f) + ' = @LV_' + f)), K.intoTable(c.rv), K.re('INTO를 WHERE 뒤 마지막에 배치', /\bWHERE\b.*\bINTO\b/)] };
  });

  /* ---------- 결과 예측 ---------- */
  const previewRows = (t, cols) => (DB()[t] || []).map(r => Object.fromEntries(cols.map(f => [f, r[f]])));
  const runRows = (t, text, project) => { const r = window.openSqlRunner.run(text, { data: DB(), project }); return r.ok ? r.rows : null; };

  def('predict_count', T.cond, '중급', '결과 예측', c => okInfo(c) && !!window.openSqlRunner, c => {
    const f = c.gf, n = c.num, total = (DB()[c.table] || []).length;
    let best = null;
    for (let i = 0; i < 8 && !best; i++) {
      const v = String(dv(c, c.table, f, 'AA')), th = n ? Math.round(quant(c.table, n, 0.3 + c.r.next() * 0.5)) : 0, mode = n ? c.r.int(3) : 0;
      const where = mode === 0 ? `${f} = '${v}'` : mode === 1 ? `${n} > ${th}` : `${f} = '${v}' AND ${n} > ${th}`;
      const rows = runRows(c.table, `SELECT COUNT( * ) FROM ${c.table} WHERE ${where}.`, c.project), cnt = rows ? Object.values(rows[0])[0] : -1;
      if (cnt > 0 && cnt < total) best = { where, cnt };
    }
    best = best || { where: `${f} = '${colVals(c.table, f)[0] || 'AA'}'`, cnt: (DB()[c.table] || []).filter(r => r[f] === colVals(c.table, f)[0]).length };
    const showCols = uniq([...(c.info.key.length > 1 ? c.info.key.slice(0, 2) : c.info.key), f, ...(n ? [n] : [])]);
    return { name: '실행 결과 건수 예측하기', cols: showCols, expects: best.cnt, expectsLabel: '조회 건수', preview: previewRows(c.table, showCols), snippet: fmt({ cols: showCols, from: c.table, where: best.where, into: intoT(c) }), req: `아래 SELECT가 실행되면 @${c.rv}에 몇 건이 들어갈까요? 아래 가상 데이터를 보고 직접 세어, 입력창에 숫자만 적어 제출하세요.`, checks: [] };
  });

  def('predict_agg', T.agg, '중급', '결과 예측', c => okInfo(c) && !!c.num && !!window.openSqlRunner, c => {
    const f = c.gf, n = c.num, v = String(dv(c, c.table, f, 'AA')), fn = c.r.pick(['SUM', 'MAX', 'MIN']);
    const text = `SELECT ${fn}( ${n} ) FROM ${c.table} WHERE ${f} = '${v}'`, rows = runRows(c.table, text + '.', c.project), val = rows ? Object.values(rows[0])[0] : 0;
    const showCols = uniq([f, n]);
    return { name: `${fn} 결과 값 예측하기`, cols: showCols, expects: val, expectsLabel: `${fn} 값`, preview: previewRows(c.table, showCols).filter(r => String(r[f]) === v), snippet: `SELECT ${fn}( ${n} )\n  FROM ${c.table}\n  WHERE ${f} = '${v}'\n  INTO @LV_RESULT.`, req: `아래 SELECT 실행 후 @LV_RESULT에 들어갈 값은 무엇일까요? (${f}가 '${v}'인 행만 표시했습니다.) 입력창에 숫자만 적어 제출하세요.`, checks: [] };
  });

  def('predict_first', T.basic, '중급', '결과 예측', c => okInfo(c) && !!c.num && !!window.openSqlRunner, c => {
    const n = c.num, lab = c.info.key.find(k => k !== c.info.key[0]) || c.info.key[0], desc = c.r.next() < 0.5;
    const text = `SELECT ${lab} FROM ${c.table} ORDER BY ${n} ${desc ? 'DESCENDING' : 'ASCENDING'} UP TO 1 ROWS`, rows = runRows(c.table, text + '.', c.project), val = rows && rows[0] ? Object.values(rows[0])[0] : '';
    const showCols = uniq([...c.info.key.slice(0, 3), n]);
    return { name: '정렬 후 첫 행 예측하기', cols: showCols, expects: val, expectsLabel: `첫 행의 ${lab}`, preview: previewRows(c.table, showCols), snippet: fmt({ cols: [lab], from: c.table, order: `${n} ${desc ? 'DESCENDING' : 'ASCENDING'}`, into: 'TABLE @GT_RESULT', upTo: 1 }), req: `아래 SELECT 실행 후 @GT_RESULT의 첫(유일한) 행에서 ${lab} 값은 무엇일까요? 아래 가상 데이터를 보고 입력창에 값만 적어 제출하세요.`, checks: [] };
  });

  /* ================= 3. 프로젝트 소스에서 만드는 문제 ================= */
  const sourceQueries = source => strip(source).match(/\bSELECT\b(?!-)[\s\S]*?\./gi) || [];
  const CLAUSES = [
    ['WHERE', /(\bWHERE\s+)([\s\S]*?)(?=\bGROUP\s+BY\b|\bHAVING\b|\bORDER\s+BY\b|\bINTO\b|\bUP\s+TO\b|$)/i],
    ['GROUP BY', /(\bGROUP\s+BY\s+)([\s\S]*?)(?=\bHAVING\b|\bORDER\s+BY\b|\bINTO\b|\bUP\s+TO\b|$)/i],
    ['HAVING', /(\bHAVING\s+)([\s\S]*?)(?=\bORDER\s+BY\b|\bINTO\b|\bUP\s+TO\b|$)/i],
    ['ORDER BY', /(\bORDER\s+BY\s+)([\s\S]*?)(?=\bINTO\b|\bUP\s+TO\b|$)/i],
    ['INTO', /(\bINTO\s+)([\s\S]*?)(?=\bUP\s+TO\b|$)/i]
  ];
  const stmtText = s => String(s).trim().replace(/\.$/, '');
  const hideable = q => CLAUSES.filter(([, re]) => { const m = stmtText(q).match(re); return m && m[2].trim(); }).map(x => x[0]);
  const sqlInfo = sql => /\bJOIN\b/i.test(sql) ? [T.join, '중급'] : /\bGROUP\s+BY\b/i.test(sql) ? [T.agg, '중급'] : /\bSINGLE\b/i.test(sql) ? [T.basic, '기초'] : /\bWHERE\b/i.test(sql) ? [T.cond, '기초'] : [T.basic, '기초'];
  const pieceList = sql => {
    const pieces = [], head = sql.match(/^\s*SELECT\s+(?:SINGLE\s+|DISTINCT\s+)?([\s\S]*?)\s+FROM\s+([A-Z][A-Z0-9_]*)/i);
    if (!head) return [sql];
    const mod = (sql.match(/^\s*SELECT\s+(SINGLE|DISTINCT)\s/i) || [, ''])[1];
    pieces.push(('SELECT ' + (mod ? mod + ' ' : '') + head[1]).replace(/\s+/g, ' ').trim(), 'FROM ' + head[2]);
    const join = sql.match(/\b((?:INNER|LEFT\s+OUTER|LEFT|RIGHT\s+OUTER|RIGHT)\s+JOIN\s+[A-Z][A-Z0-9_]*(?:\s+AS\s+[A-Z][A-Z0-9_]*)?)/i);
    if (join) pieces.push(join[1].replace(/\s+/g, ' '));
    const on = sql.match(/\bON\s+([\s\S]*?)(?=\bWHERE\b|\bGROUP\s+BY\b|\bHAVING\b|\bORDER\s+BY\b|\bINTO\b|\bUP\s+TO\b|$)/i);
    if (on) pieces.push('ON ' + on[1].trim().replace(/\s+/g, ' '));
    CLAUSES.forEach(([name, re]) => { const m = sql.match(re); if (m && m[2].trim()) pieces.push(name + ' ' + m[2].trim().replace(/\s+/g, ' ')); });
    const limit = sql.match(/\bUP\s+TO\s+\d+\s+ROWS/i);
    if (limit) pieces.push(limit[0]);
    return pieces;
  };

  function sourceProblem(c, mode, index, variant) {
    const raw = sourceQueries(c.project.source)[index];
    if (!raw) return build(c.project, c.seed, 'projection');
    const sql = stmtText(raw), [topic, level] = sqlInfo(sql), pieces = pieceList(sql);
    const table = (sql.match(/\bFROM\s+([A-Z][A-Z0-9_]*)/i) || [])[1] || c.table;
    const list = (sql.match(/^\s*SELECT\s+(?:SINGLE\s+|DISTINCT\s+)?([\s\S]*?)\s+FROM\b/i) || [, '*'])[1];
    const cols = list.split(',').map(x => x.trim()).filter(Boolean);
    const answer = sql + '.', checks = [K.sel, ...pieces.map(p => K.has(p, p))];
    let d, spec;
    if (mode === 'blank') {
      const hide = hideable(sql); const name = c.r.pick(hide.length ? hide : ['WHERE']);
      const re = CLAUSES.find(x => x[0] === name)[1];
      const blanked = sql.replace(re, (m, a, b) => a + '____' + (b.match(/\s*$/) || [''])[0]) + '.';
      d = { topic, level, kind: '빈칸 채우기' };
      spec = { name: `프로젝트 코드 빈칸 채우기 ${index + 1} (${name})`, table, cols, snippet: blanked, req: `프로젝트 코드의 SELECT 중 ${name} 부분이 빈칸(____)입니다. 코드를 보고 빈칸을 복원해 SELECT 전체를 작성하세요.`, answer, checks, h1: '프로젝트 코드의 변수명과 조건을 떠올려 보세요. 빈칸은 ' + name + ' 절입니다.' };
    } else {
      const ty = /\bSINGLE\b/i.test(sql) ? 'SELECT SINGLE 연습' : /\bJOIN\b/i.test(sql) ? '프로젝트 JOIN 연습' : /\bGROUP\s+BY\b/i.test(sql) ? '프로젝트 그룹 집계 연습' : /\bORDER\s+BY\b/i.test(sql) ? '정렬과 행 수 제한 연습' : '프로젝트 조회 패턴 연습';
      d = { topic, level, kind: '프로젝트 코드' };
      spec = { name: ty + ' ' + (index + 1), table, cols, req: `프로젝트 코드의 조회 패턴 ${index + 1}을 Open SQL SELECT 구문으로 다시 작성하세요. 이 문제는 ${ty.replace(' 연습', '')}을 포함합니다.`, answer, checks, h1: '프로젝트 전체 코드에서 이 SELECT 패턴의 목적을 먼저 확인하세요.', h2: 'SELECT, FROM, WHERE·JOIN·GROUP BY 등의 절을 코드의 순서대로 작성하세요.' };
    }
    return finalize(c, spec, d, variant);
  }

  /* ================= 4. 공개 API ================= */
  function build(project, seed, variant = 'projection') {
    const c = ctxOf(project, seed);
    const m = String(variant).match(/^source_(query|blank)_(\d+)$/);
    if (m) return sourceProblem(c, m[1], Number(m[2]), variant);
    const d = REG[variant] || REG.projection;
    return finalize(c, d.make(c), d, REG[variant] ? variant : 'projection');
  }
  function variants(project) {
    const c = ctxOf(project, '00000000');
    // Keep the practice pool focused on answers that execute as one Open SQL SELECT.
    const ids = ORDER.filter(id => {
      try {
        if (!REG[id].ok(c)) return false;
        const spec = REG[id].make(c);
        return !!window.openSqlRunner && window.openSqlRunner.run(spec.answer, {
          data: DB(),
          project,
          bindings: spec.bindings || {}
        }).ok;
      } catch (e) { return false; }
    });
    sourceQueries(project.source).forEach((q, i) => { ids.push('source_query_' + i); if (hideable(q).length) ids.push('source_blank_' + i); });
    return ids;
  }
  function meta(project, variant) {
    if (REG[variant]) { const d = REG[variant]; return { topic: d.topic, level: d.level, kind: d.kind }; }
    const m = /^source_(query|blank)_(\d+)$/.exec(String(variant));
    if (m) { const [topic, level] = sqlInfo(stmtText(sourceQueries(project.source)[+m[2]] || '')); return { topic, level, kind: m[1] === 'blank' ? '빈칸 채우기' : '프로젝트 코드' }; }
    return { topic: T.basic, level: '기초', kind: '작성' };
  }
  window.openSqlProjectProblem = { build, variants, meta, topics: Object.values(T) };
})();
