(() => {
  const normalize = value => String(value || '').toUpperCase().replace(/"[^\n]*"|'[^']*'/g, ' ').replace(/\s+/g, ' ').replace(/\s*([,.()=<>])\s*/g, '$1').trim();
  const getWhere = source => {
    const m = String(source || '').match(/\bWHERE\s+([\s\S]*?)(?=\b(?:ORDER\s+BY|INTO|UP\s+TO|ENDSELECT)\b|\.)/i);
    const value = m && m[1] ? m[1].trim().replace(/\s+/g, ' ') : '';
    return value.length <= 130 ? value : '';
  };
  const variants = project => getWhere(project.source) ? ['projection', 'focused', 'ordering', 'conditions'] : ['projection', 'focused', 'ordering'];
  const build = (project, seed, variant = 'projection') => {
    const table = project.primaryTable || (project.tables || [])[0] || 'SFLIGHT';
    const fields = project.fields && project.fields.length ? project.fields : ['CARRID', 'CONNID'];
    const resultVar = project.resultVar || 'GT_DATA';
    const where = getWhere(project.source);
    const offset = parseInt(String(seed).slice(0, 2), 16) % fields.length;
    const focusedFields = fields.length === 1 ? [fields[0]] : fields.length === 2 ? [fields[offset]] : [fields[offset], fields[(offset + 1) % fields.length]];
    let cols = [...fields], orderField = '', useWhere = !!where;
    if (variant === 'focused') { cols = focusedFields; useWhere = false; }
    if (variant === 'ordering') { cols = focusedFields; useWhere = false; orderField = cols[0]; }
    if (variant === 'conditions') { cols = focusedFields; useWhere = !!where; }
    const whereClause = useWhere ? '\n  WHERE ' + where : '';
    const orderClause = orderField ? '\n  ORDER BY ' + orderField + ' ASCENDING' : '';
    const answer = 'SELECT ' + cols.join(', ') + '\n  FROM ' + table + whereClause + orderClause + '\n  INTO TABLE @' + resultVar + '.';
    const checks = [
      code => normalize(code).includes('SELECT'),
      code => normalize(code).includes('FROM ' + table),
      ...cols.map(col => code => normalize(code).includes(col.toUpperCase())),
      code => normalize(code).includes('INTO TABLE @' + resultVar),
      ...(useWhere ? [code => normalize(code).includes(normalize(where))] : []),
      ...(orderField ? [code => normalize(code).includes('ORDER BY ' + orderField + ' ASCENDING')] : [])
    ];
    let title, request, hints;
    if (variant === 'focused') {
      title = project.name + ' · 필요한 열만 조회하기';
      request = '프로젝트 “' + project.name + '”의 ' + table + '에서 ' + cols.join(', ') + ' 열만 조회해 @' + resultVar + '에 저장하세요. 전체 필드 대신 문제에서 요구한 열만 선택하세요.';
      hints = ['문제에서 요구한 열만 SELECT 목록에 두세요.', '테이블은 ' + table + ', 결과 내부 테이블은 @' + resultVar + '입니다.', answer];
    } else if (variant === 'ordering') {
      title = project.name + ' · 정렬 조건 추가하기';
      request = '프로젝트 “' + project.name + '”의 ' + table + '에서 ' + cols.join(', ') + ' 열을 조회하고, ' + orderField + ' 오름차순으로 정렬해 @' + resultVar + '에 저장하세요.';
      hints = ['정렬 기준은 DB 열 이름이며 @를 붙이지 않습니다.', 'ORDER BY ' + orderField + ' ASCENDING을 추가하세요.', answer];
    } else if (variant === 'conditions') {
      title = project.name + ' · 기존 WHERE 조건 살리기';
      request = '프로젝트 코드에서 사용한 조건을 유지하며 ' + table + '에서 ' + cols.join(', ') + ' 열을 조회하세요. WHERE 조건의 DB 열과 ABAP 호스트 변수를 구분하고 결과를 @' + resultVar + '에 저장하세요. 조건: ' + where;
      hints = ['프로젝트 원본의 WHERE 조건을 먼저 확인하세요.', 'DB 열 이름에는 @를 붙이지 않고 ABAP 변수에는 붙입니다.', answer];
    } else {
      title = project.name + ' · 조회 패턴 다시 작성하기';
      request = '프로젝트 “' + project.name + '”의 조회를 재구성하세요. ' + table + '에서 ' + cols.join(', ') + ' 열을 조회해 @' + resultVar + '에 저장하세요.' + (useWhere ? ' 기존 WHERE 조건도 유지하세요: ' + where : '');
      hints = ['이 프로젝트의 전체 코드에서 SELECT, FROM, WHERE 절을 확인하세요.', '필요한 DB 열을 SELECT에, ' + table + '을 FROM에 적으세요.', answer];
    }
    return {
      topic: '프로젝트 코드 연습', level: '기초', title, table, cols, hints, answer, check: code => checks.map(fn => fn(code)), req: request,
      run: () => [Object.fromEntries(cols.map((col, i) => [col, '가상 예시 ' + (i + 1)]))],
      projectId: project.id, resultVar, sourceContext: project.source || '', variant,
      id: 'SQL-' + String(seed).slice(0, 6).toUpperCase(), seed, created: new Date().toISOString(), params: {}, hintLevel: 0
    };
  };
  window.openSqlProjectProblem = { build, variants };
})();
