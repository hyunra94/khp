/* ==================================================================
 * [Claude 추가] claude-05-cert.js — "수료 관리" 화면(수료증 발급 관리, 자회사/대규모/
 * 일반 구분 집계, 과정별·회차별 요약, 필터, 수료증 번호 자동 증가).
 * ================================================================== */

  /* ==================================================================
   * [Claude 추가] 수료 관리 탭 — 상태가 "수료"인 신청 건을 모아 수료증 발급을
   * 관리. certificate_issued/certificate_number/certificate_issued_at
   * (applications 테이블, 이번에 추가)을 사용.
   * ================================================================== */
  let claudeCompletions = [];
  /* [Claude 추가] 요청: "수료생 전체 목록(정보까지) + 필터별 보기 + 대규모/자회사 등으로
     집계된 요약본"을 같이 볼 수 있어야 함. 필터는 상세 목록에만 적용되고, 요약 집계는
     항상 전체 기준으로 계산함(둘을 헷갈리지 않게). */
  let claudeCertFilter = { typeId: '', round: '', category: '', q: '' };

  /* "자회사" = 전주MBC/전주문화방송 소속(회사 필드로 판별). 고용형태(employment_category)는
     applications 테이블 값(대규모/우선지원기업/고용보험미가입)을 그대로 씀 — "자회사"가
     고용형태보다 우선하는 구분이라, 자회사 소속이면 고용형태와 무관하게 "자회사"로 집계함.
     회사명 표기가 다르면(예: "(주)전주문화방송") 여기 키워드만 추가해주면 됨. */
  const CLAUDE_ZAIHOESA_KEYWORDS = ['전주mbc', '전주문화방송'];
  function claudeCertCategory(c) {
    const company = (c.trainees?.company || '').toLowerCase().replace(/\s+/g, '');
    if (CLAUDE_ZAIHOESA_KEYWORDS.some(k => company.includes(k))) return '자회사';
    if (c.employment_category === '대규모') return '대규모';
    return '일반';
  }

  /* [Claude 추가] 요청: "발급 체크하면 현재 입력된 번호 기준 +1로" — 지금까지 입력된
     수료증 번호 중 숫자로 끝나는 것들 중 가장 큰 값을 찾아 1을 더해서 반환함.
     "2026-004"처럼 숫자 앞에 다른 글자가 붙어있으면 그 접두사와 자릿수(0 채움)를
     가장 큰 번호 기준으로 그대로 이어받음. 기존 번호가 하나도 없으면 "1"부터 시작. */
  function claudeNextCertificateNumber() {
    let best = null;
    claudeCompletions.forEach(c => {
      const v = (c.certificate_number || '').trim();
      if (!v) return;
      const m = v.match(/^(.*?)(\d+)$/);
      if (!m) return;
      const num = parseInt(m[2], 10);
      if (Number.isNaN(num)) return;
      if (!best || num > best.num) best = { prefix: m[1], width: m[2].length, num };
    });
    if (!best) return '1';
    return `${best.prefix}${String(best.num + 1).padStart(best.width, '0')}`;
  }

  async function claudeLoadCompletions() {
    const tbody = document.getElementById('claudeCertRows');
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="empty-row">불러오는 중...</td></tr>';
    const { data, error } = await sb
      .from('applications')
      /* [Claude 추가] part_a_completed/part_b_completed(신청 건별 A/B 파트 수료 여부) +
         course_types.has_parts/part_a_label/part_b_label(이 과목이 A/B 파트로 나뉘어
         있는지, 파트 이름은 뭔지)을 추가로 불러옴 — "드론 교육"처럼 한 과목이 실질적으로
         두 파트로 나뉘어 있어서 한쪽만 수료하는 경우를 구분해서 보여주기 위함. */
      .select('id, status_updated_at, certificate_issued, certificate_number, certificate_issued_at, trainee_id, employment_category, part_a_completed, part_b_completed, trainees(name, phone, company, email), courses(id, name, round, course_type_id, course_types(id, name, has_parts, part_a_label, part_b_label))')
      .eq('status', '수료')
      .order('status_updated_at', { ascending: false });
    if (error) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="empty-row">불러오기 실패: ${escapeHtml(error.message)}</td></tr>`;
      return;
    }
    claudeCompletions = data || [];
    claudeRenderCertFilterOptions();
    claudeRenderCompletions();
    claudeRenderPartSummary();
  }

  /* ==================================================================
   * [Claude 추가] 과정(과정 유형)별 · 회차별 수료생 집계 — 일반/대규모/자회사로
   * 나눠서 "A과목 총 수료생(대규모,자회사 제외) N / 대규모 N / 자회사 N / 합계 N",
   * 그 밑에 회차별로도 같은 4가지 숫자를 보여줌.
   * ================================================================== */
  function claudeComputeCertSummary(list) {
    const byType = new Map();
    list.forEach(c => {
      const course = c.courses || {};
      const typeId = course.course_type_id || '__unknown__';
      const typeName = course.course_types?.name || '과정 미지정';
      const round = (course.round === null || course.round === undefined) ? '미지정' : String(course.round);
      const cat = claudeCertCategory(c);
      if (!byType.has(typeId)) byType.set(typeId, { name: typeName, total: 0, 일반: 0, 대규모: 0, 자회사: 0, rounds: new Map() });
      const t = byType.get(typeId);
      t.total++; t[cat]++;
      if (!t.rounds.has(round)) t.rounds.set(round, { round, total: 0, 일반: 0, 대규모: 0, 자회사: 0 });
      const r = t.rounds.get(round);
      r.total++; r[cat]++;
    });
    return byType;
  }

  function claudeCertSummaryRowHtml(typeId, t) {
    const roundRows = [...t.rounds.values()]
      .sort((a, b) => (parseFloat(a.round) || 0) - (parseFloat(b.round) || 0))
      .map(r => `
        <tr>
          <td class="claude-cert-summary-round">${escapeHtml(r.round)}회차</td>
          <td>${r.일반.toLocaleString('ko-KR')}</td>
          <td>${r.대규모.toLocaleString('ko-KR')}</td>
          <td>${r.자회사.toLocaleString('ko-KR')}</td>
          <td><b>${r.total.toLocaleString('ko-KR')}</b></td>
        </tr>
      `).join('');
    return `
      <tr class="claude-cert-summary-row" data-type-id="${escapeHtml(typeId)}">
        <td><button type="button" class="claude-cert-summary-toggle">▸ ${escapeHtml(t.name)}</button></td>
        <td>${t.일반.toLocaleString('ko-KR')}</td>
        <td>${t.대규모.toLocaleString('ko-KR')}</td>
        <td>${t.자회사.toLocaleString('ko-KR')}</td>
        <td><b>${t.total.toLocaleString('ko-KR')}</b></td>
      </tr>
      <tr class="claude-cert-summary-detail" data-type-id="${escapeHtml(typeId)}" hidden>
        <td colspan="5">
          <table class="claude-cert-summary-subtable">
            <thead><tr><th>회차</th><th>일반</th><th>대규모</th><th>자회사</th><th>합계</th></tr></thead>
            <tbody>${roundRows}</tbody>
          </table>
        </td>
      </tr>
    `;
  }

  function claudeRenderCertSummary() {
    const wrap = document.getElementById('claudeCertSummaryBody');
    if (!wrap) return;
    const byType = claudeComputeCertSummary(claudeCompletions);
    if (!byType.size) {
      wrap.innerHTML = '<tr><td colspan="5" class="empty-row">집계할 수료생이 없습니다</td></tr>';
      return;
    }
    const types = (typeof allCourseTypes !== 'undefined' && Array.isArray(allCourseTypes)) ? allCourseTypes : [];
    const order = types.map(t => t.id);
    const entries = [...byType.entries()].sort((a, b) => {
      const ai = order.indexOf(a[0]); const bi = order.indexOf(b[0]);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
    wrap.innerHTML = entries.map(([typeId, t]) => claudeCertSummaryRowHtml(typeId, t)).join('');
  }

  function claudeBindCertSummaryToggle() {
    const wrap = document.getElementById('claudeCertSummaryBody');
    if (!wrap || wrap.dataset.claudeBound) return;
    wrap.dataset.claudeBound = 'true';
    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.claude-cert-summary-toggle');
      if (!btn) return;
      const row = btn.closest('.claude-cert-summary-row');
      const typeId = row?.dataset.typeId;
      const detail = wrap.querySelector(`.claude-cert-summary-detail[data-type-id="${CSS.escape(typeId || '')}"]`);
      if (!detail) return;
      const willShow = detail.hidden;
      detail.hidden = !willShow;
      btn.textContent = btn.textContent.replace(/^[▸▾]/, willShow ? '▾' : '▸');
    });
  }

  /* ==================================================================
   * [Claude 추가] "A/B 파트 이수 현황" — 요청: "우리가 한 과목이지만 실질적으로는
   * 2과목(A/B)으로 나눠져 있는데, 수료생이 A는 수료했는데 B는 못한 경우도 있고
   * 3회차에 B, 4회차에 A를 듣는 경우도 있다. 이걸 수료에서 어떻게 확인할 수 있을까?"
   * 위 목록(claudeRenderCompletions)은 신청 건(=회차 등록) 1개당 1행이라 같은 훈련생이
   * 여러 회차에 나뉘어 들은 걸 한눈에 보기 어려움. 그래서 A/B 파트가 있는 과목만
   * 골라서(course_types.has_parts) 훈련생별로 다시 묶어, 그 훈련생이 참여한 모든 회차를
   * 통틀어 A파트/B파트를 한 번이라도 이수했는지(여러 회차에 걸쳐 나눠 들었어도 합산)를
   * 보여줌. 필터와 무관하게 항상 전체 수료생 기준으로 계산함(위 과정별 요약과 같은 방식).
   * ================================================================== */
  function claudeComputePartSummary() {
    const byType = new Map();
    claudeCompletions.forEach(c => {
      const course = c.courses || {};
      const ct = course.course_types || {};
      if (!ct.has_parts) return;
      const typeId = course.course_type_id || '__unknown__';
      if (!byType.has(typeId)) {
        byType.set(typeId, { name: ct.name || '과정', partALabel: ct.part_a_label || 'A', partBLabel: ct.part_b_label || 'B', trainees: new Map() });
      }
      const t = byType.get(typeId);
      const traineeId = c.trainee_id;
      if (!t.trainees.has(traineeId)) {
        t.trainees.set(traineeId, { name: c.trainees?.name || '-', phone: c.trainees?.phone || '-', rounds: new Set(), aOk: false, bOk: false });
      }
      const tr = t.trainees.get(traineeId);
      if (course.round !== null && course.round !== undefined) tr.rounds.add(course.round);
      if (c.part_a_completed) tr.aOk = true;
      if (c.part_b_completed) tr.bOk = true;
    });
    return byType;
  }

  function claudeRenderPartSummary() {
    const panel = document.getElementById('claudeCertPartPanel');
    const tbody = document.getElementById('claudeCertPartRows');
    if (!panel || !tbody) return;
    const byType = claudeComputePartSummary();
    if (!byType.size) { panel.hidden = true; tbody.innerHTML = ''; return; }
    panel.hidden = false;

    const rows = [];
    byType.forEach(t => {
      const sortedTrainees = [...t.trainees.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      sortedTrainees.forEach(tr => {
        const roundsText = [...tr.rounds].sort((a, b) => a - b).map(r => `${r}회차`).join(', ') || '-';
        let overall;
        if (tr.aOk && tr.bOk) overall = `<span class="claude-part-overall claude-part-overall-both">${escapeHtml(t.partALabel)}+${escapeHtml(t.partBLabel)} 모두 이수</span>`;
        else if (tr.aOk) overall = `<span class="claude-part-overall claude-part-overall-partial">${escapeHtml(t.partALabel)}만 이수</span>`;
        else if (tr.bOk) overall = `<span class="claude-part-overall claude-part-overall-partial">${escapeHtml(t.partBLabel)}만 이수</span>`;
        else overall = `<span class="claude-part-overall claude-part-overall-none">둘 다 미이수</span>`;
        rows.push(`
          <tr>
            <td>${escapeHtml(t.name)}</td>
            <td>${escapeHtml(tr.name)}</td>
            <td>${escapeHtml(tr.phone)}</td>
            <td>${escapeHtml(roundsText)}</td>
            <td style="text-align:center;">${tr.aOk ? '✓' : '-'}</td>
            <td style="text-align:center;">${tr.bOk ? '✓' : '-'}</td>
            <td>${overall}</td>
          </tr>
        `);
      });
    });
    tbody.innerHTML = rows.join('') || '<tr><td colspan="7" class="empty-row">데이터가 없습니다</td></tr>';
  }

  /* [Claude 추가] 필터(과정/회차/구분/검색) — 상세 목록에만 적용됨 */
  function claudeRenderCertFilterOptions() {
    const typeSel = document.getElementById('claudeCertTypeFilter');
    const roundSel = document.getElementById('claudeCertRoundFilter');
    if (!typeSel || !roundSel) return;

    const types = new Map();
    const rounds = new Set();
    claudeCompletions.forEach(c => {
      const course = c.courses || {};
      const typeId = course.course_type_id || '__unknown__';
      if (!types.has(typeId)) types.set(typeId, course.course_types?.name || '과정 미지정');
      if (!claudeCertFilter.typeId || claudeCertFilter.typeId === typeId) {
        rounds.add(course.round === null || course.round === undefined ? '미지정' : String(course.round));
      }
    });

    const prevType = typeSel.value;
    typeSel.innerHTML = '<option value="">전체 과정</option>' +
      [...types.entries()].map(([id, name]) => `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`).join('');
    typeSel.value = prevType && types.has(prevType) ? prevType : '';

    const prevRound = roundSel.value;
    const sortedRounds = [...rounds].sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));
    roundSel.innerHTML = '<option value="">전체 회차</option>' +
      sortedRounds.map(r => `<option value="${escapeHtml(r)}">${escapeHtml(r)}회차</option>`).join('');
    roundSel.value = sortedRounds.includes(prevRound) ? prevRound : '';
  }

  function claudeFilteredCompletions() {
    const { typeId, round, category, q } = claudeCertFilter;
    const query = q.trim().toLowerCase();
    return claudeCompletions.filter(c => {
      const course = c.courses || {};
      if (typeId && (course.course_type_id || '__unknown__') !== typeId) return false;
      if (round) {
        const r = course.round === null || course.round === undefined ? '미지정' : String(course.round);
        if (r !== round) return false;
      }
      if (category && claudeCertCategory(c) !== category) return false;
      if (query) {
        const hay = `${c.trainees?.name || ''} ${c.trainees?.company || ''} ${c.trainees?.phone || ''}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }

  function claudeRenderCompletions() {
    const tbody = document.getElementById('claudeCertRows');
    const statsEl = document.getElementById('claudeCertStats');
    if (!tbody) return;

    const total = claudeCompletions.length;
    const issued = claudeCompletions.filter(c => c.certificate_issued).length;
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="claude-cert-stat"><b>${total.toLocaleString('ko-KR')}</b><span>전체 수료생</span></div>
        <div class="claude-cert-stat"><b>${issued.toLocaleString('ko-KR')}</b><span>수료증 발급 완료</span></div>
        <div class="claude-cert-stat"><b>${(total - issued).toLocaleString('ko-KR')}</b><span>미발급</span></div>
      `;
    }
    claudeRenderCertSummary();

    const filtered = claudeFilteredCompletions();
    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty-row">${total ? '필터 조건에 맞는 수료생이 없습니다' : '수료 상태인 신청자가 없습니다'}</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(c => {
      const course = c.courses || {};
      const cat = claudeCertCategory(c);
      const ct = course.course_types || {};
      /* [Claude 추가] A/B 파트가 있는 과목이면 신청 건(=이 회차 등록)별로 각 파트
         수료 여부를 체크박스 2개로 보여줌. 없는 과목은 "-"만 표시. */
      const partCell = ct.has_parts
        ? `
          <label class="claude-part-cb"><input type="checkbox" class="claude-part-a-cb" data-id="${escapeHtml(c.id)}" ${c.part_a_completed ? 'checked' : ''}> ${escapeHtml(ct.part_a_label || 'A')}</label>
          <label class="claude-part-cb"><input type="checkbox" class="claude-part-b-cb" data-id="${escapeHtml(c.id)}" ${c.part_b_completed ? 'checked' : ''}> ${escapeHtml(ct.part_b_label || 'B')}</label>
        `
        : '-';
      return `
      <tr data-id="${escapeHtml(c.id)}">
        <td>${escapeHtml(c.trainees?.name || '-')}</td>
        <td>${escapeHtml(c.trainees?.phone || '-')}</td>
        <td>${escapeHtml(c.trainees?.company || '-')}</td>
        <td><span class="claude-cert-cat-badge claude-cert-cat-${escapeHtml(cat)}">${escapeHtml(cat)}</span></td>
        <td>${escapeHtml((course.course_types?.name || '') + (course.round ? ` ${course.round}회차` : ''))}</td>
        <td>${escapeHtml(formatDateTime(c.status_updated_at))}</td>
        <td class="claude-part-cell">${partCell}</td>
        <td><input type="text" class="claude-cert-num-input" data-id="${escapeHtml(c.id)}" placeholder="수료증 번호" value="${escapeHtml(c.certificate_number || '')}"></td>
        <td style="text-align:center;"><input type="checkbox" class="claude-cert-issued-cb" data-id="${escapeHtml(c.id)}" ${c.certificate_issued ? 'checked' : ''}></td>
      </tr>
    `;
    }).join('');
  }

  function claudeBindCompletionsTable() {
    const tbody = document.getElementById('claudeCertRows');
    if (!tbody || tbody.dataset.claudeBound) return;
    tbody.dataset.claudeBound = 'true';

    tbody.addEventListener('change', async (e) => {
      /* [Claude 추가] A/B 파트 수료 체크박스 저장 */
      const partCb = e.target.closest('.claude-part-a-cb, .claude-part-b-cb');
      if (partCb) {
        partCb.disabled = true;
        const field = partCb.classList.contains('claude-part-a-cb') ? 'part_a_completed' : 'part_b_completed';
        const { error } = await sb.from('applications').update({ [field]: partCb.checked }).eq('id', partCb.dataset.id);
        partCb.disabled = false;
        if (error) { alert(`저장 실패: ${error.message}`); partCb.checked = !partCb.checked; return; }
        const item = claudeCompletions.find(c => c.id === partCb.dataset.id);
        if (item) item[field] = partCb.checked;
        claudeRenderPartSummary();
        return;
      }
      const cb = e.target.closest('.claude-cert-issued-cb');
      if (cb) {
        cb.disabled = true;
        const issued = cb.checked;
        const item = claudeCompletions.find(c => c.id === cb.dataset.id);
        /* [Claude 추가] 요청: "발급을 체크하면 현재 입력된 번호 기준 +1로" — 발급 체크할 때
           그 행의 수료증 번호가 비어있으면, 지금까지 입력된 수료증 번호 중 가장 큰 숫자에서
           1을 더한 값을 자동으로 채워서 같이 저장함(번호가 이미 있으면 그대로 두고 건드리지 않음). */
        const payload = {
          certificate_issued: issued,
          certificate_issued_at: issued ? new Date().toISOString() : null,
        };
        let autoNumber = null;
        if (issued && item && !item.certificate_number) {
          autoNumber = claudeNextCertificateNumber();
          payload.certificate_number = autoNumber;
        }
        const { error } = await sb.from('applications').update(payload).eq('id', cb.dataset.id);
        cb.disabled = false;
        if (error) { alert(`저장 실패: ${error.message}`); cb.checked = !issued; return; }
        if (item) {
          item.certificate_issued = issued;
          item.certificate_issued_at = payload.certificate_issued_at;
          if (autoNumber) item.certificate_number = autoNumber;
        }
        claudeRenderCompletions();
      }
    });

    tbody.addEventListener('blur', async (e) => {
      const input = e.target.closest('.claude-cert-num-input');
      if (!input) return;
      const item = claudeCompletions.find(c => c.id === input.dataset.id);
      const newVal = input.value.trim() || null;
      if (item && item.certificate_number === newVal) return;
      const { error } = await sb.from('applications').update({ certificate_number: newVal }).eq('id', input.dataset.id);
      if (error) { alert(`저장 실패: ${error.message}`); return; }
      if (item) item.certificate_number = newVal;
    }, true);
  }

  function buildCertSectionMarkup() {
    return `
      <div class="view-header">
        <h2>수료 관리</h2>
        <p>상태가 "수료"로 변경된 신청자를 모아 수료증 발급 여부와 번호를 관리합니다. "자회사"는 소속(회사명)에 전주MBC/전주문화방송이 포함된 경우로 자동 구분됩니다.</p>
      </div>
      <div class="claude-cert-stats" id="claudeCertStats"></div>

      <section class="panel claude-cert-summary-panel">
        <div class="section-title"><div><h2>과정별 · 회차별 요약</h2><p>과정명을 눌러 회차별 세부 인원을 펼쳐볼 수 있습니다.</p></div></div>
        <div class="table-shell simple-table">
          <table class="claude-cert-summary-table">
            <thead><tr><th>과정</th><th>일반</th><th>대규모</th><th>자회사</th><th>합계</th></tr></thead>
            <tbody id="claudeCertSummaryBody"><tr><td colspan="5" class="empty-row">불러오는 중...</td></tr></tbody>
          </table>
        </div>
      </section>

      <section class="panel claude-cert-part-panel" id="claudeCertPartPanel" hidden>
        <div class="section-title"><div><h2>A/B 파트 이수 현황</h2><p>한 과목이 A/B 두 파트로 나뉘어 있어, 회차와 무관하게 훈련생별로 두 파트를 각각 이수했는지 모아서 보여줍니다(여러 회차에 걸쳐 나눠 들은 경우도 합산됩니다).</p></div></div>
        <div class="table-shell simple-table">
          <table>
            <thead><tr><th>과목</th><th>이름</th><th>연락처</th><th>참여 회차</th><th>A 이수</th><th>B 이수</th><th>종합</th></tr></thead>
            <tbody id="claudeCertPartRows"></tbody>
          </table>
        </div>
      </section>

      <section class="panel claude-cert-list-panel">
        <div class="section-title"><div><h2>수료생 전체 목록</h2><p>필터를 걸어 특정 과정·회차·구분만 모아볼 수 있습니다.</p></div></div>
        <div class="claude-cert-filters">
          <select id="claudeCertTypeFilter" aria-label="과정 필터"><option value="">전체 과정</option></select>
          <select id="claudeCertRoundFilter" aria-label="회차 필터"><option value="">전체 회차</option></select>
          <select id="claudeCertCategoryFilter" aria-label="구분 필터">
            <option value="">전체 구분</option>
            <option value="일반">일반</option>
            <option value="대규모">대규모</option>
            <option value="자회사">자회사</option>
          </select>
          <input type="text" id="claudeCertSearch" placeholder="이름/소속/연락처 검색">
        </div>
        <div class="table-shell simple-table">
          <table>
            <thead><tr><th>이름</th><th>연락처</th><th>소속</th><th>구분</th><th>과정</th><th>수료 확정일</th><th>A/B 파트</th><th>수료증 번호</th><th>발급</th></tr></thead>
            <tbody id="claudeCertRows"><tr><td colspan="9" class="empty-row">불러오는 중...</td></tr></tbody>
          </table>
        </div>
      </section>
    `;
  }

  function claudeBindCertFilters() {
    const typeSel = document.getElementById('claudeCertTypeFilter');
    const roundSel = document.getElementById('claudeCertRoundFilter');
    const catSel = document.getElementById('claudeCertCategoryFilter');
    const search = document.getElementById('claudeCertSearch');
    if (typeSel && !typeSel.dataset.claudeBound) {
      typeSel.dataset.claudeBound = 'true';
      typeSel.addEventListener('change', () => {
        claudeCertFilter.typeId = typeSel.value;
        claudeCertFilter.round = ''; // 과정이 바뀌면 회차 선택은 초기화
        claudeRenderCertFilterOptions();
        claudeRenderCompletions();
      });
    }
    if (roundSel && !roundSel.dataset.claudeBound) {
      roundSel.dataset.claudeBound = 'true';
      roundSel.addEventListener('change', () => {
        claudeCertFilter.round = roundSel.value;
        claudeRenderCompletions();
      });
    }
    if (catSel && !catSel.dataset.claudeBound) {
      catSel.dataset.claudeBound = 'true';
      catSel.addEventListener('change', () => {
        claudeCertFilter.category = catSel.value;
        claudeRenderCompletions();
      });
    }
    if (search && !search.dataset.claudeBound) {
      search.dataset.claudeBound = 'true';
      search.addEventListener('input', () => {
        claudeCertFilter.q = search.value;
        claudeRenderCompletions();
      });
    }
  }

  function buildCertNavAndSection() {
    const nav = document.querySelector('.nav');
    const main = document.querySelector('.admin-main');
    if (!nav || !main || document.getElementById('view-claude-cert')) return;

    const navBtn = document.createElement('button');
    navBtn.className = 'nav-item';
    navBtn.type = 'button';
    navBtn.dataset.view = 'claude-cert';
    navBtn.innerHTML = '<span>05</span>수료 관리'; /* [Claude 추가] 요청: 수료 관리=5번, 알림 관리=6번으로 순서 변경 */
    nav.appendChild(navBtn);

    const section = document.createElement('section');
    section.className = 'view';
    section.id = 'view-claude-cert';
    section.innerHTML = buildCertSectionMarkup();
    main.appendChild(section);
    claudeBindCompletionsTable();
    claudeBindCertFilters();
    claudeBindCertSummaryToggle();

    navBtn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
      document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
      navBtn.classList.add('active');
      section.classList.add('active');
      claudeLoadCompletions();
    });
  }

