(() => {
  const normalize = value => String(value || '').toUpperCase().replace(/"[^\n]*"|'[^']*'/g, ' ').replace(/\s+/g, ' ').replace(/\s*([,.()=<>])\s*/g, '$1').trim();
  const getWhere = source => {
    const match = String(source || '').match(/\bWHERE\s+([\s\S]*?)(?=\b(?:GROUP\s+BY|HAVING|ORDER\s+BY|INTO|UP\s+TO|ENDSELECT)\b|\.)/i);
    return match && match[1] ? match[1].trim().replace(/\s+/g, ' ') : '';
  };
  const numericField = fields => fields.find(field => /PRICE|AMOUNT|VALUE|DISTANCE|TIME|SEATS|COUNT|QUANTITY|QTY|TOTAL|SALDO|BETRG|MENGE/i.test(field));
  const sourceQueries = source => String(source || '').split(/\r?\n/).filter(line => !/^\s*"/.test(line)).join('\n').match(/\bSELECT\b[\s\S]*?\./gi) || [];
  const sourceProblem = (project, seed, variant, index) => {
    const statement = sourceQueries(project.source)[index];
    if (!statement) return null;
    const sql = statement.trim().replace(/\.$/, '');
    const table = (sql.match(/\bFROM\s+([A-Z][A-Z0-9_]*)/i) || [])[1] || project.primaryTable || 'SFLIGHT';
    const list = (sql.match(/^\s*SELECT\s+(?:SINGLE\s+|DISTINCT\s+)?([\s\S]*?)\s+FROM\b/i) || [])[1] || '*';
    const pieces = [`SELECT ${sql.match(/^\s*SELECT\s+(?:SINGLE\s+|DISTINCT\s+)?/i)?.[0]?.trim().replace(/\s+$/,'') || 'SELECT'} ${list}`, `FROM ${table}`];
    const pushClause = (label, expression) => { const match = sql.match(expression); if (match) pieces.push(`${label} ${match[1].trim().replace(/\s+/g, ' ')}`); };
    const join = sql.match(/\b((?:INNER|LEFT\s+OUTER|LEFT|RIGHT\s+OUTER|RIGHT)\s+JOIN\s+[A-Z][A-Z0-9_]*(?:\s+AS\s+[A-Z][A-Z0-9_]*)?)/i);
    if (join) pieces.push(join[1].replace(/\s+/g, ' '));
    pushClause('ON', /\bON\s+([\s\S]*?)(?=\bWHERE\b|\bGROUP\s+BY\b|\bHAVING\b|\bORDER\s+BY\b|\bINTO\b|\bUP\s+TO\b|$)/i);
    pushClause('WHERE', /\bWHERE\s+([\s\S]*?)(?=\bGROUP\s+BY\b|\bHAVING\b|\bORDER\s+BY\b|\bINTO\b|\bUP\s+TO\b|$)/i);
    pushClause('GROUP BY', /\bGROUP\s+BY\s+([\s\S]*?)(?=\bHAVING\b|\bORDER\s+BY\b|\bINTO\b|\bUP\s+TO\b|$)/i);
    pushClause('HAVING', /\bHAVING\s+([\s\S]*?)(?=\bORDER\s+BY\b|\bINTO\b|\bUP\s+TO\b|$)/i);
    pushClause('ORDER BY', /\bORDER\s+BY\s+([\s\S]*?)(?=\bINTO\b|\bUP\s+TO\b|$)/i);
    const into = sql.match(/\bINTO\s+([\s\S]*?)(?=\bUP\s+TO\b|$)/i);
    if (into) pieces.push(`INTO ${into[1].trim().replace(/\s+/g, ' ')}`);
    const limit = sql.match(/\bUP\s+TO\s+\d+\s+ROWS/i);
    if (limit) pieces.push(limit[0]);
    const type = /\bSINGLE\b/i.test(sql) ? ['SELECT SINGLE 연습', '기초'] : /\bJOIN\b/i.test(sql) ? ['프로젝트 JOIN 연습', '중급'] : /\bGROUP\s+BY\b/i.test(sql) ? ['프로젝트 그룹 집계 연습', '중급'] : /\bSEATSOCC\s*</i.test(sql) ? ['열 비교 조건 연습', '중급'] : /\bORDER\s+BY\b/i.test(sql) ? ['정렬과 행 수 제한 연습', '기초'] : ['프로젝트 조회 패턴 연습', '기초'];
    const answer = sql + '.';
    return {
      topic: 'SELECT 구문 연습', level: type[1], title: project.name + ' · ' + type[0] + ' ' + (index + 1), table,
      cols: list.split(',').map(x => x.trim()).filter(Boolean),
      hints: ['프로젝트 전체 코드에서 이 SELECT 패턴의 목적을 먼저 확인하세요.', 'SELECT, FROM, WHERE·JOIN·GROUP BY 등의 절을 코드의 순서대로 작성하세요.', answer],
      answer, criteria: pieces, check: code => pieces.map(part => normalize(code).includes(normalize(part))),
      req: `프로젝트 코드의 조회 패턴 ${index + 1}을 Open SQL SELECT 구문으로 다시 작성하세요. 이 문제는 ${type[0].replace(' 연습','')}을 포함합니다.`,
      run: () => [{ 안내: '프로젝트 코드에서 추출한 SELECT 구문 연습입니다. 실제 SAP DB를 조회하지 않습니다.' }],
      projectId: project.id, resultVar: project.resultVar || 'GT_DATA', sourceContext: project.source || '', variant,
      id: 'SQL-' + String(seed).slice(0, 6).toUpperCase(), seed, created: new Date().toISOString(), params: {}, hintLevel: 0
    };
  };
  const variants = project => {
    const fields = project.fields && project.fields.length ? project.fields : ['CARRID', 'CONNID'];
    const ids = ['projection', 'focused', 'distinct', 'ordering', 'ordering_desc', 'limit_one', 'limit_three', 'group_count', 'group_having', 'count_all', 'count_distinct', 'subquery', 'where_not_initial'];
    const valueField = numericField(fields);
    if (valueField) ids.push('aggregate_min', 'aggregate_max', 'aggregate_sum', 'aggregate_avg', 'group_sum', 'where_between');
    const where = getWhere(project.source);
    if (where) ids.push('conditions');
    if ((project.conditionVars || []).length) ids.push('where_project_variable');
    ids.push('where_like');
    sourceQueries(project.source).forEach((_, index) => ids.push(`source_query_${index}`));
    return ids;
  };
  const build = (project, seed, variant = 'projection') => {
    const table = project.primaryTable || (project.tables || [])[0] || 'SFLIGHT';
    const fields = project.fields && project.fields.length ? project.fields : ['CARRID', 'CONNID'];
    const resultVar = project.resultVar || 'GT_DATA';
    const where = getWhere(project.source);
    const offset = parseInt(String(seed).slice(0, 2), 16) % fields.length;
    const pick = (start, count = 1) => Array.from({ length: Math.min(count, fields.length) }, (_, i) => fields[(start + i) % fields.length]);
    const focused = pick(offset, Math.min(2, fields.length));
    const keyField = fields[offset];
    const valueField = numericField(fields) || fields[fields.length - 1];
    const variable = (project.conditionVars || [])[0] || 'LV_VALUE';
    const sourceMatch = String(variant).match(/^source_query_(\d+)$/);
    if (sourceMatch) return sourceProblem(project, seed, variant, Number(sourceMatch[1]));
    let title = '', level = '기초', request = '', answer = '', required = [], selected = focused;
    const selectInto = `INTO TABLE @${resultVar}`;
    const simpleAnswer = (cols, clauses = [], ending = [selectInto]) => `SELECT ${cols.join(', ')}\n  FROM ${table}${clauses.length ? '\n  ' + clauses.join('\n  ') : ''}\n  ${ending.join('\n  ')}.`;
    const setup = (name, tier, req, sql, checks, cols = selected) => {
      title = project.name + ' · ' + name;
      level = tier;
      request = req;
      answer = sql;
      required = checks;
      selected = cols;
    };

    switch (variant) {
      case 'focused':
        setup('필요한 열만 조회하기', '기초', `${table}에서 ${focused.join(', ')} 열만 조회해 @${resultVar}에 저장하세요.`, simpleAnswer(focused), [`FROM ${table}`, ...focused, selectInto]);
        break;
      case 'distinct':
        setup('중복 없이 값 조회하기', '기초', `${table}에서 ${keyField}의 중복을 제거해 조회하세요.`, simpleAnswer([`DISTINCT ${keyField}`]), [`DISTINCT ${keyField}`, `FROM ${table}`, selectInto], [keyField]);
        break;
      case 'ordering':
      case 'ordering_desc': {
        const direction = variant === 'ordering' ? 'ASCENDING' : 'DESCENDING';
        const cols = pick(offset, Math.min(2, fields.length));
        setup(`${direction === 'ASCENDING' ? '오름차순' : '내림차순'} 정렬`, '기초', `${table}에서 ${cols.join(', ')}를 조회하고 ${cols[0]} 기준 ${direction === 'ASCENDING' ? '오름차순' : '내림차순'}으로 정렬하세요.`, simpleAnswer(cols, [`ORDER BY ${cols[0]} ${direction}`]), [`FROM ${table}`, ...cols, `ORDER BY ${cols[0]} ${direction}`, selectInto], cols);
        break;
      }
      case 'limit_one':
      case 'limit_three': {
        const count = variant === 'limit_one' ? 1 : 3;
        const cols = pick(offset, Math.min(2, fields.length));
        setup(`${count}건만 조회하기`, '기초', `${table}에서 ${cols.join(', ')}를 ${count}건까지만 조회하세요.`, simpleAnswer(cols, [], [selectInto, `UP TO ${count} ROWS`]), [`FROM ${table}`, ...cols, selectInto, `UP TO ${count} ROWS`], cols);
        break;
      }
      case 'conditions':
        setup('프로젝트 WHERE 조건 적용하기', '기초', `프로젝트 코드의 조건을 유지해 ${table}에서 ${focused.join(', ')}를 조회하세요: ${where}`, simpleAnswer(focused, [`WHERE ${where}`]), [`FROM ${table}`, ...focused, normalize(where), selectInto], focused);
        break;
      case 'where_project_variable': {
        const inferredField = (project.conditionVars || []).map(v => fields.find(f => v.toUpperCase().endsWith(f))).find(Boolean) || keyField;
        const isRange = /^S_/i.test(variable);
        const predicate = isRange ? `${inferredField} IN @${variable}` : `${inferredField} = @${variable}`;
        setup(isRange ? '선택 범위로 필터링하기' : '호스트 변수로 필터링하기', '기초', `${table}에서 ${inferredField} 조건을 적용하세요. 프로젝트 변수 @${variable}을 사용해 ${focused.join(', ')}를 조회하세요.`, simpleAnswer(focused, [`WHERE ${predicate}`]), [`FROM ${table}`, ...focused, predicate, selectInto], focused);
        break;
      }
      case 'where_between':
        setup('BETWEEN 범위 조건', '중급', `${table}에서 ${valueField} 값이 @LV_LOW와 @LV_HIGH 사이인 행만 조회하세요. 열은 ${focused.join(', ')}로 제한하세요.`, simpleAnswer(focused, [`WHERE ${valueField} BETWEEN @LV_LOW AND @LV_HIGH`]), [`FROM ${table}`, ...focused, `${valueField} BETWEEN @LV_LOW AND @LV_HIGH`, selectInto], focused);
        break;
      case 'where_like':
        setup('LIKE 패턴 검색', '중급', `${table}에서 ${keyField}가 ABAP 호스트 변수 @LV_PATTERN 패턴과 일치하는 행을 조회하세요.`, simpleAnswer(focused, [`WHERE ${keyField} LIKE @LV_PATTERN`]), [`FROM ${table}`, ...focused, `${keyField} LIKE @LV_PATTERN`, selectInto], focused);
        break;
      case 'where_not_initial':
        setup('초기값이 아닌 행 찾기', '중급', `${table}에서 ${keyField}가 초기값이 아닌 행만 조회하세요.`, simpleAnswer(focused, [`WHERE ${keyField} IS NOT INITIAL`]), [`FROM ${table}`, ...focused, `${keyField} IS NOT INITIAL`, selectInto], focused);
        break;
      case 'count_all':
        setup('전체 행 개수 세기', '중급', `${table}의 전체 행 개수를 집계해 @LV_COUNT에 받으세요.`, `SELECT COUNT( * )\n  FROM ${table}\n  INTO @LV_COUNT.`, [`COUNT(*)`, `FROM ${table}`, 'INTO @LV_COUNT'], []);
        break;
      case 'count_distinct':
        setup('고유 값 개수 세기', '고급', `${table}에서 서로 다른 ${keyField} 값의 개수를 COUNT DISTINCT로 구해 @LV_COUNT에 받으세요.`, `SELECT COUNT( DISTINCT ${keyField} )\n  FROM ${table}\n  INTO @LV_COUNT.`, [`COUNT(DISTINCT ${keyField})`, `FROM ${table}`, 'INTO @LV_COUNT'], [keyField]);
        break;
      case 'group_count': {
        const cols = [keyField, 'COUNT( * ) AS ROW_COUNT'];
        setup('GROUP BY별 건수 집계', '중급', `${table}에서 ${keyField}별 행 개수를 세어 ${keyField}와 ROW_COUNT를 @${resultVar}에 저장하세요.`, simpleAnswer(cols, [`GROUP BY ${keyField}`]), [`FROM ${table}`, keyField, 'COUNT(*)', `GROUP BY ${keyField}`, selectInto], cols);
        break;
      }
      case 'group_having': {
        const cols = [keyField, 'COUNT( * ) AS ROW_COUNT'];
        setup('HAVING으로 그룹 걸러내기', '고급', `${table}에서 ${keyField}별로 그룹화하고, 그룹 건수가 @LV_MIN_COUNT 이상인 그룹만 남기세요.`, simpleAnswer(cols, [`GROUP BY ${keyField}`, 'HAVING COUNT( * ) >= @LV_MIN_COUNT']), [`FROM ${table}`, keyField, 'COUNT(*)', `GROUP BY ${keyField}`, 'HAVING COUNT(*) >= @LV_MIN_COUNT', selectInto], cols);
        break;
      }
      case 'aggregate_min':
      case 'aggregate_max':
      case 'aggregate_sum':
      case 'aggregate_avg': {
        const fn = ({ aggregate_min: 'MIN', aggregate_max: 'MAX', aggregate_sum: 'SUM', aggregate_avg: 'AVG' })[variant];
        const target = ({ MIN: 'LV_MIN', MAX: 'LV_MAX', SUM: 'LV_SUM', AVG: 'LV_AVG' })[fn];
        setup(`${fn} 집계`, '중급', `${table}에서 ${valueField}의 ${fn} 값을 계산해 @${target}에 받으세요.`, `SELECT ${fn}( ${valueField} )\n  FROM ${table}\n  INTO @${target}.`, [`${fn}(${valueField})`, `FROM ${table}`, `INTO @${target}`], [valueField]);
        break;
      }
      case 'group_sum': {
        const cols = [keyField, `SUM( ${valueField} ) AS TOTAL_VALUE`];
        setup('그룹별 합계 계산', '고급', `${table}에서 ${keyField}별 ${valueField} 합계를 구하고 두 결과 열을 @${resultVar}에 저장하세요.`, simpleAnswer(cols, [`GROUP BY ${keyField}`]), [`FROM ${table}`, keyField, `SUM(${valueField})`, `GROUP BY ${keyField}`, selectInto], cols);
        break;
      }
      case 'subquery': {
        const otherField = fields.length > 1 ? fields[(offset + 1) % fields.length] : keyField;
        const sql = `SELECT A~${keyField}, A~${otherField}\n  FROM ${table} AS A\n  WHERE A~${keyField} IN ( SELECT B~${keyField}\n    FROM ${table} AS B\n    WHERE B~${otherField} = @LV_VALUE )\n  INTO TABLE @${resultVar}.`;
        setup('IN 서브쿼리 작성', '고급', `${table}을 별칭 A와 B로 두 번 사용하세요. 내부 조회에서 @LV_VALUE와 일치하는 ${otherField}의 ${keyField}를 찾고, 그 키에 해당하는 바깥 행의 ${keyField}, ${otherField}를 조회하세요.`, sql, [`IN ( SELECT B~${keyField}`, `FROM ${table} AS A`, `FROM ${table} AS B`, `B~${otherField} = @LV_VALUE`, `INTO TABLE @${resultVar}`], [keyField, otherField]);
        break;
      }
      default:
        setup('프로젝트 열 조회하기', '기초', `${table}에서 ${focused.join(', ')}만 조회해 @${resultVar}에 저장하세요.`, simpleAnswer(focused), [`FROM ${table}`, ...focused, selectInto]);
    }

    const checks = required.map(part => code => normalize(code).includes(normalize(part)));
    return {
      topic: 'SELECT 구문 연습', level, title, table, cols: selected,
      hints: [
        '문제에서 요구한 SELECT 열과 FROM 테이블부터 작성하세요.',
        '필터는 WHERE, 그룹 조건은 HAVING, 정렬은 ORDER BY에 둡니다. ABAP 변수에는 @를 붙이세요.',
        answer
      ],
      answer,
      check: code => checks.map(fn => fn(code)), criteria: required,
      req: request,
      run: () => [Object.fromEntries((selected.length ? selected : ['결과']).map((col, i) => [col, `가상 결과 ${i + 1}`]))],
      projectId: project.id, resultVar, sourceContext: project.source || '', variant,
      id: 'SQL-' + String(seed).slice(0, 6).toUpperCase(), seed,
      created: new Date().toISOString(), params: {}, hintLevel: 0
    };
  };
  window.openSqlProjectProblem = { build, variants };
})();
