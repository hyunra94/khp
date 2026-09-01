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
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="empty-row">불러오는 중...</td></tr>';
    const { data, error } = await sb
      .from('applications')
      .select('id, status_updated_at, certificate_issued, certificate_number, certificate_issued_at, trainee_id, employment_category, trainees(name, phone, company, email), courses(id, name, round, course_type_id, course_types(id, name))')
      .eq('status', '수료')
      .order('status_updated_at', { ascending: false });
    if (error) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="empty-row">불러오기 실패: ${escapeHtml(error.message)}</td></tr>`;
      return;
    }
    claudeCompletions = data || [];
    claudeRenderCertFilterOptions();
    claudeRenderCompletions();
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
      tbody.innerHTML = `<tr><td colspan="8" class="empty-row">${total ? '필터 조건에 맞는 수료생이 없습니다' : '수료 상태인 신청자가 없습니다'}</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(c => {
      const course = c.courses || {};
      const cat = claudeCertCategory(c);
      return `
      <tr data-id="${escapeHtml(c.id)}">
        <td>${escapeHtml(c.trainees?.name || '-')}</td>
        <td>${escapeHtml(c.trainees?.phone || '-')}</td>
        <td>${escapeHtml(c.trainees?.company || '-')}</td>
        <td><span class="claude-cert-cat-badge claude-cert-cat-${escapeHtml(cat)}">${escapeHtml(cat)}</span></td>
        <td>${escapeHtml((course.course_types?.name || '') + (course.round ? ` ${course.round}회차` : ''))}</td>
        <td>${escapeHtml(formatDateTime(c.status_updated_at))}</td>
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
            <thead><tr><th>이름</th><th>연락처</th><th>소속</th><th>구분</th><th>과정</th><th>수료 확정일</th><th>수료증 번호</th><th>발급</th></tr></thead>
            <tbody id="claudeCertRows"><tr><td colspan="8" class="empty-row">불러오는 중...</td></tr></tbody>
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

