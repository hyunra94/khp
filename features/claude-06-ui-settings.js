/* ==================================================================
 * [Claude 추가] claude-06-ui-settings.js — "설정" 메뉴(활동 로그 등 자주 안 쓰는
 * 화면 모음), 탭 활성 상태 유지, 과정 유형별 연도 UI, 다가오는 일정 패널, 가독성
 * 폰트(Pretendard) 로드, 로그인 상태 유지 체크박스(기본값: 매번 로그인).
 * ================================================================== */

  /* ==================================================================
   * [Claude 추가] 설정 메뉴 — "활동 로그"처럼 자주 안 쓰는 화면을 사이드바
   * 메인 목록에서 빼고 "설정" 안으로 넣음. 기존 활동 로그 nav-item은
   * (CSS로) 숨기기만 하고, 그 nav-item의 클릭 이벤트/#view-log/loadAuditLog()는
   * admin.html 코드 그대로 재사용 — 설정 메뉴에서는 그 버튼을 클릭한 것처럼
   * .click()만 대신 호출함.
   * ================================================================== */
  function buildSettingsSectionMarkup() {
    return `
      <div class="view-header">
        <h2>설정</h2>
        <p>자주 쓰지 않는 화면을 모아뒀습니다.</p>
      </div>
      <div class="claude-settings-menu">
        <div class="claude-settings-item" id="claudeSettingsAuditLogItem">
          <div>
            <div class="label">활동 로그</div>
            <div class="sub">관리자가 등록·수정·삭제한 이력을 확인합니다.</div>
          </div>
          <span class="arrow">›</span>
        </div>
      </div>
    `;
  }

  /* [Claude 추가] "설정"은 번호 매겨진 메인 메뉴 목록에 넣지 않고, 사이드바 하단
     이메일 옆에 작은 아이콘 버튼으로만 둠 (요청: "설정은 로그아웃 위쪽 이메일
     오른쪽에 작은 글씨로 아이콘만 올려놔줘"). */
  function buildSettingsSection() {
    const main = document.querySelector('.admin-main');
    if (!main || document.getElementById('view-claude-settings')) return;

    const section = document.createElement('section');
    section.className = 'view';
    section.id = 'view-claude-settings';
    section.innerHTML = buildSettingsSectionMarkup();
    main.appendChild(section);

    const auditItem = document.getElementById('claudeSettingsAuditLogItem');
    const logNavBtn = document.querySelector('.nav-item[data-view="log"]');
    if (auditItem && logNavBtn) {
      auditItem.addEventListener('click', () => logNavBtn.click());
    }
  }

  function claudeShowSettingsSection() {
    const section = document.getElementById('view-claude-settings');
    if (!section) return;
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
    section.classList.add('active');
  }

  function injectSettingsFooterButton() {
    const who = document.getElementById('whoAmI');
    if (!who || document.getElementById('claudeSettingsGearBtn')) return;
    const footer = who.parentElement;
    if (!footer) return;

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;';
    who.parentElement.insertBefore(row, who);
    row.appendChild(who);

    const gearBtn = document.createElement('button');
    gearBtn.id = 'claudeSettingsGearBtn';
    gearBtn.type = 'button';
    gearBtn.title = '설정';
    gearBtn.setAttribute('aria-label', '설정');
    gearBtn.textContent = '⚙';
    gearBtn.style.cssText = 'flex:0 0 auto;background:transparent;border:none;color:#A9B4C0;font-size:14px;cursor:pointer;padding:2px 4px;line-height:1;';
    gearBtn.addEventListener('mouseenter', () => { gearBtn.style.color = '#fff'; });
    gearBtn.addEventListener('mouseleave', () => { gearBtn.style.color = '#A9B4C0'; });
    gearBtn.addEventListener('click', claudeShowSettingsSection);
    row.appendChild(gearBtn);
  }

  /* ==================================================================
   * [Claude 추가] 새로고침(F5) 해도 보고 있던 탭이 유지되도록 함.
   * admin.html은 새로고침될 때마다 항상 "개요" 탭으로 초기화되는데,
   * 마지막으로 클릭한 탭(data-view)을 localStorage에 저장해뒀다가
   * 로그인 후 대시보드가 뜨는 시점에 그 탭을 대신 클릭해줌.
   * (nav-item 클릭 이벤트/뷰 전환 로직은 admin.html 것 그대로 재사용)
   * ================================================================== */
  const CLAUDE_ACTIVE_TAB_KEY = 'claudeActiveTab';

  function claudeBindTabPersistence() {
    const nav = document.querySelector('.nav');
    if (!nav || nav.dataset.claudeTabPersistBound) return;
    nav.dataset.claudeTabPersistBound = 'true';
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-item');
      if (!btn || !btn.dataset.view) return;
      try { localStorage.setItem(CLAUDE_ACTIVE_TAB_KEY, btn.dataset.view); } catch (e2) { /* localStorage 불가 시 조용히 무시 */ }
    });
  }

  function claudeRestoreActiveTab() {
    let saved = null;
    try { saved = localStorage.getItem(CLAUDE_ACTIVE_TAB_KEY); } catch (e) { saved = null; }
    if (!saved) return;
    const btn = [...document.querySelectorAll('.nav-item[data-view]')].find(el => el.dataset.view === saved);
    if (btn && !btn.classList.contains('active')) btn.click();
  }

  function claudeWatchDashboardShow() {
    const dash = document.getElementById('dashboard');
    if (!dash) return;
    if (dash.classList.contains('show')) {
      claudeRestoreActiveTab();
      return;
    }
    const observer = new MutationObserver(() => {
      if (dash.classList.contains('show')) {
        claudeRestoreActiveTab();
        observer.disconnect();
      }
    });
    observer.observe(dash, { attributes: true, attributeFilter: ['class'] });
  }

  /* ==================================================================
   * [Claude 추가] "과정명 목록" 패널 접어두기 + 과정명마다 연도 태그.
   * 자주 안 바뀌는 패널이라 기본은 접어두고, 연도(2024/2025/2026...)를
   * 붙여서 연도별로 운영 과정이 다른 걸 구분할 수 있게 함.
   * admin.html의 renderCourseTypes()는 건드리지 않고, #typeRows가
   * 다시 그려질 때마다(MutationObserver) 연도 칸만 덧붙임.
   * ================================================================== */
  const CLAUDE_TYPE_PANEL_OPEN_KEY = 'claudeTypePanelOpen';

  function claudeFindTypePanel() {
    return [...document.querySelectorAll('#view-courses > .panel')].find(p => p.querySelector('h2')?.textContent.trim() === '과정명 목록') || null;
  }

  function claudeInjectTypeCollapsible() {
    const panel = claudeFindTypePanel();
    if (!panel || panel.dataset.claudeCollapsible) return;
    panel.dataset.claudeCollapsible = 'true';

    const header = panel.querySelector('.section-title') || panel.querySelector('h2')?.parentElement;
    const restNodes = [...panel.children].filter(el => el !== header);
    if (!restNodes.length) return;

    let savedOpen = false;
    try { savedOpen = localStorage.getItem(CLAUDE_TYPE_PANEL_OPEN_KEY) === '1'; } catch (e) { /* 무시 */ }

    const details = document.createElement('details');
    details.id = 'claudeTypePanelDetails';
    if (savedOpen) details.open = true;
    const summary = document.createElement('summary');
    summary.className = 'claude-addfield-toggle';
    summary.style.cssText = 'margin:10px 0 14px;cursor:pointer;list-style:none;';
    summary.textContent = savedOpen ? '과정명 목록 접기' : '과정명 목록 펼치기';
    details.appendChild(summary);
    restNodes.forEach(node => details.appendChild(node));
    panel.appendChild(details);

    details.addEventListener('toggle', () => {
      summary.textContent = details.open ? '과정명 목록 접기' : '과정명 목록 펼치기 (평소엔 안 바꾸는 목록이라 접어뒀어요)';
      try { localStorage.setItem(CLAUDE_TYPE_PANEL_OPEN_KEY, details.open ? '1' : '0'); } catch (e) { /* 무시 */ }
    });
  }

  function claudeInjectTypeYearColumn() {
    const table = document.querySelector('#typeRows')?.closest('table');
    if (!table) return;
    const headRow = table.querySelector('thead tr');
    if (headRow && !headRow.querySelector('.claude-type-year-th')) {
      const th = document.createElement('th');
      th.className = 'claude-type-year-th';
      th.textContent = '연도';
      const lastTh = headRow.lastElementChild;
      if (lastTh) headRow.insertBefore(th, lastTh);
      else headRow.appendChild(th);
    }

    const currentYear = new Date().getFullYear();
    const yearOptions = ['', ...Array.from({ length: 6 }, (_, i) => String(currentYear + 1 - i))];

    document.querySelectorAll('#typeRows tr.type-row-table').forEach(tr => {
      if (tr.querySelector('.claude-type-year-select')) return;
      const typeId = tr.dataset.typeId;
      const type = (typeof allCourseTypes !== 'undefined' ? allCourseTypes : []).find(t => t.id === typeId);
      const td = document.createElement('td');
      td.innerHTML = `
        <select class="claude-type-year-select" data-id="${escapeHtml(typeId)}" style="padding:6px 7px;border:1px solid var(--line);border-radius:6px;font-family:inherit;font-size:12px;">
          ${yearOptions.map(y => `<option value="${y}" ${String(type?.year || '') === y ? 'selected' : ''}>${y ? y + '년' : '미지정'}</option>`).join('')}
        </select>
      `;
      const lastTd = tr.lastElementChild;
      if (lastTd) tr.insertBefore(td, lastTd);
      else tr.appendChild(td);
      tr.dataset.claudeYear = type?.year || '';
    });
  }

  function claudeBindTypeYearSelects() {
    const tbody = document.getElementById('typeRows');
    if (!tbody || tbody.dataset.claudeYearBound) return;
    tbody.dataset.claudeYearBound = 'true';
    tbody.addEventListener('change', async (e) => {
      const sel = e.target.closest('.claude-type-year-select');
      if (!sel) return;
      sel.disabled = true;
      const yearVal = sel.value ? Number(sel.value) : null;
      const { error } = await sb.from('course_types').update({ year: yearVal }).eq('id', sel.dataset.id);
      sel.disabled = false;
      if (error) { alert(`연도 저장 실패: ${error.message}`); return; }
      if (typeof allCourseTypes !== 'undefined') {
        const t = allCourseTypes.find(t => t.id === sel.dataset.id);
        if (t) t.year = yearVal;
      }
      sel.closest('tr').dataset.claudeYear = yearVal || '';
      claudeApplyTypeYearFilter();
    });
  }

  function claudeInjectTypeYearFilter() {
    const details = document.getElementById('claudeTypePanelDetails');
    if (!details || document.getElementById('claudeTypeYearFilter')) return;
    const table = document.querySelector('#typeRows')?.closest('.table-shell');
    if (!table) return;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-bottom:10px;display:flex;align-items:center;gap:8px;';
    wrap.innerHTML = `
      <label style="font-size:12px;font-weight:800;color:var(--ink);">연도로 보기</label>
      <select id="claudeTypeYearFilter" style="padding:6px 8px;border:1px solid var(--line);border-radius:6px;font-family:inherit;font-size:12px;">
        <option value="">전체</option>
      </select>
    `;
    table.parentElement.insertBefore(wrap, table);
    document.getElementById('claudeTypeYearFilter').addEventListener('change', claudeApplyTypeYearFilter);
  }

  function claudeApplyTypeYearFilter() {
    const filterSel = document.getElementById('claudeTypeYearFilter');
    if (!filterSel) return;

    // 옵션 목록을 실제 존재하는 연도들로 최신화
    const years = new Set();
    document.querySelectorAll('#typeRows tr.type-row-table').forEach(tr => {
      if (tr.dataset.claudeYear) years.add(tr.dataset.claudeYear);
    });
    const sortedYears = [...years].sort((a, b) => b - a);
    const prevValue = filterSel.value;
    filterSel.innerHTML = '<option value="">전체</option>' + sortedYears.map(y => `<option value="${y}">${y}년</option>`).join('');
    filterSel.value = sortedYears.includes(prevValue) ? prevValue : '';

    const active = filterSel.value;
    document.querySelectorAll('#typeRows tr.type-row-table').forEach(tr => {
      tr.style.display = (!active || tr.dataset.claudeYear === active) ? '' : 'none';
    });
  }

  function claudeRefreshTypeYearUI() {
    claudeInjectTypeCollapsible();
    claudeInjectTypeYearColumn();
    claudeBindTypeYearSelects();
    claudeInjectTypeYearFilter();
    claudeApplyTypeYearFilter();
  }

  function claudeInitTypeYearUI() {
    claudeRefreshTypeYearUI();
    const tbody = document.getElementById('typeRows');
    if (tbody) {
      const observer = new MutationObserver(() => requestAnimationFrame(claudeRefreshTypeYearUI));
      observer.observe(tbody, { childList: true, subtree: true });
    }
  }

  /* ==================================================================
   * [Claude 추가] 개요 화면 — "최근 활동" 대신 "가장 가까운 교육 · 참석자 명단"을
   * 보여줌. 오늘 이후로 가장 빨리 시작하는 회차를 찾아서, 그 회차에 신청한
   * 사람들(취소/거절 제외)을 이름/연락처/상태와 함께 보여줌.
   * admin.html의 loadRecentActivity()/#recentActivity는 그대로 두고
   * (다른 곳에서도 호출되므로 지우지 않음) 그 패널만 화면에서 숨김.
   * ================================================================== */
  function claudeHideRecentActivityPanel() {
    const panel = [...document.querySelectorAll('.overview-grid > .panel')].find(p => p.querySelector('h2')?.textContent.trim() === '최근 활동');
    if (panel) panel.style.display = 'none';
  }

  function claudeFindNearestUpcomingCourse() {
    const courses = (typeof allCourses !== 'undefined' && Array.isArray(allCourses)) ? allCourses : [];
    const todayKey = claudeTodayDateKey();
    const upcoming = courses
      .filter(c => c.start_date && c.start_date >= todayKey)
      .sort((a, b) => {
        if (a.start_date !== b.start_date) return a.start_date < b.start_date ? -1 : 1;
        return (a.is_open === false ? 1 : 0) - (b.is_open === false ? 1 : 0);
      });
    return upcoming[0] || null;
  }

  function claudeRenderUpcomingPanel() {
    const body = document.getElementById('claudeUpcomingBody');
    if (!body) return;
    const course = claudeFindNearestUpcomingCourse();
    if (!course) {
      body.innerHTML = '<div class="empty-row">예정된 회차가 없습니다</div>';
      return;
    }
    const apps = (typeof allApps !== 'undefined' && Array.isArray(allApps)) ? allApps : [];
    const attendees = apps.filter(a => a.courses?.id === course.id && a.status !== '취소' && a.status !== '거절');

    const header = `
      <div style="margin-bottom:10px;">
        <b style="font-size:14px;color:var(--ink);">${escapeHtml((course.course_types?.name || '') + ' ' + (course.name || ''))}${course.round ? ' · ' + escapeHtml(course.round) + '회차' : ''}</b>
        <div class="compact-info" style="margin-top:2px;">${escapeHtml(course.start_date || '')}${course.end_date && course.end_date !== course.start_date ? ' ~ ' + escapeHtml(course.end_date) : ''} · 신청 ${attendees.length.toLocaleString('ko-KR')}명${course.capacity ? ' / 정원 ' + escapeHtml(course.capacity) : ''}</div>
      </div>
    `;
    if (!attendees.length) {
      body.innerHTML = header + '<div class="empty-row">아직 신청자가 없습니다</div>';
      return;
    }
    const rows = attendees.map(a => `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 0;border-top:1px solid #F1F4F8;font-size:12.5px;">
        <span style="font-weight:800;color:var(--ink);">${escapeHtml(a.trainees?.name || '-')}</span>
        <span style="color:var(--ink-soft);">${escapeHtml(a.trainees?.phone || '-')}</span>
        <span class="status-${escapeHtml(a.status || '')}" style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:800;">${escapeHtml(a.status || '')}</span>
      </div>
    `).join('');
    body.innerHTML = header + rows;
  }

  function claudeInjectUpcomingPanel() {
    const grid = document.querySelector('.overview-grid');
    if (!grid || document.getElementById('claudeUpcomingPanel')) return;
    claudeHideRecentActivityPanel();
    const panel = document.createElement('section');
    panel.className = 'panel';
    panel.id = 'claudeUpcomingPanel';
    panel.innerHTML = `
      <h2>다가오는 교육 · 참석자 명단</h2>
      <div id="claudeUpcomingBody"><div class="empty-row">불러오는 중...</div></div>
    `;
    grid.appendChild(panel);
    claudeRenderUpcomingPanel();

    const overviewNavBtn = document.querySelector('.nav-item[data-view="overview"]');
    if (overviewNavBtn) overviewNavBtn.addEventListener('click', () => claudeRenderUpcomingPanel());
  }

  /* ==================================================================
   * [Claude 추가] "등록된 회차" 상단의 과정 필터 드롭박스 라벨 정리.
   * admin.html의 renderCourseTypeTabs()가 옵션을 "OO 회차만 보기"로 그리는데,
   * 과정별 그룹핑이 생긴 뒤로는 중복/장황해서 "OO"만 남기고 " 회차만 보기"는 뗌.
   * ("전체 회차 보기" 옵션은 값이 없어서(value="") 그대로 둠.)
   * ================================================================== */
  function claudeSimplifyCourseTypeTabs() {
    const tabs = document.getElementById('courseTypeTabs');
    if (!tabs) return;
    Array.from(tabs.options).forEach(opt => {
      if (opt.value && / 회차만 보기$/.test(opt.textContent)) {
        opt.textContent = opt.textContent.replace(/ 회차만 보기$/, '');
      }
    });
  }

  function claudeWatchCourseTypeTabs() {
    const tabs = document.getElementById('courseTypeTabs');
    if (!tabs) return;
    claudeSimplifyCourseTypeTabs();
    const observer = new MutationObserver(() => claudeSimplifyCourseTypeTabs());
    observer.observe(tabs, { childList: true });
  }

  /* ===== [Claude 추가] Pretendard 웹폰트 로드(CDN). body의 font-family는
     injectStyle()의 CSS에서 이미 'Pretendard'를 1순위로 지정해뒀으니, 여기서는
     그 폰트 파일 자체를 <link>로 불러오기만 함. ===== */
  function claudeInjectReadableFont() {
    if (document.getElementById('claudePretendardFont')) return;
    const link = document.createElement('link');
    link.id = 'claudePretendardFont';
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css';
    document.head.appendChild(link);
  }

  /* ==================================================================
   * [Claude 추가] "로그인 상태 유지" 체크박스 — 개인정보(신청자 이름/연락처/
   * 주민등록번호 등)를 다루는 관리자 화면이라, 요청에 따라 기본값을 "매번
   * 로그인 필요"로 바꾸고 체크박스를 켰을 때만 브라우저에 로그인이 남아있게 함.
   * admin.html의 로그인 로직(checkExistingSession/showDashboard/signInWithPassword)
   * 자체는 건드리지 않고, Supabase가 로그인 세션을 저장해두는 localStorage의
   * "sb-...-auth-token" 키를 이 스크립트에서 직접 관리하는 방식으로 구현함:
   *   - 체크박스를 켜고 로그인하면 지금처럼 브라우저를 껐다 켜도 로그인이 유지됨.
   *   - 체크박스를 끄고 로그인하면(기본값) 그 탭에 열려있는 동안은 정상적으로
   *     로그인 상태가 유지되지만, 탭을 닫거나 새로고침하는 순간 저장된 로그인
   *     토큰을 지워서 다음에 다시 열면 로그인 화면부터 시작하게 함.
   *   - 페이지가 열릴 때 "유지"를 선택한 적이 없는데도(=기본값) 예전에 저장된
   *     로그인이 남아있어서 자동으로 대시보드가 떠 있다면, 즉시 로그아웃 처리함.
   * ================================================================== */
  const CLAUDE_KEEP_LOGIN_KEY = 'khp_keep_login';

  function claudeIsKeepLoginOn() {
    return localStorage.getItem(CLAUDE_KEEP_LOGIN_KEY) === '1';
  }

  function claudeClearPersistedAuthToken() {
    Object.keys(localStorage).forEach(key => {
      if (/^sb-.*-auth-token$/.test(key)) localStorage.removeItem(key);
    });
  }

  function claudeInjectKeepLoginCheckbox() {
    if (document.getElementById('claudeKeepLoginRow')) return;
    const loginBtn = document.getElementById('loginBtn');
    if (!loginBtn || !loginBtn.parentNode) return;
    const row = document.createElement('label');
    row.id = 'claudeKeepLoginRow';
    row.className = 'claude-keep-login-row';
    row.innerHTML = '<input type="checkbox" id="claudeKeepLoginChk"><span>이 브라우저에 로그인 상태 유지</span>';
    loginBtn.parentNode.insertBefore(row, loginBtn);
  }

  function claudeBindKeepLoginControls() {
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    if (loginBtn) {
      loginBtn.addEventListener('click', () => {
        const chk = document.getElementById('claudeKeepLoginChk');
        localStorage.setItem(CLAUDE_KEEP_LOGIN_KEY, chk && chk.checked ? '1' : '0');
      });
    }
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        localStorage.removeItem(CLAUDE_KEEP_LOGIN_KEY);
      });
    }
  }

  function claudeEnforceKeepLoginOnLoad() {
    if (claudeIsKeepLoginOn()) return; // "유지"를 선택했으면 손대지 않음(기존 동작 그대로)
    const dashboard = document.getElementById('dashboard');
    const loginScreen = document.getElementById('loginScreen');
    if (dashboard && dashboard.classList.contains('show')) {
      // "유지"를 선택한 적 없는데 예전 로그인이 남아 자동으로 대시보드가 떠 있는 경우 — 즉시 되돌림
      dashboard.classList.remove('show');
      if (loginScreen) loginScreen.style.display = '';
    }
    claudeClearPersistedAuthToken();
    if (typeof sb !== 'undefined' && sb && sb.auth && sb.auth.signOut) {
      sb.auth.signOut().catch(() => {});
    }
  }

  function claudeWipeAuthTokenOnUnload() {
    if (claudeIsKeepLoginOn()) return;
    claudeClearPersistedAuthToken();
  }

  function claudeInitKeepLogin() {
    claudeEnforceKeepLoginOnLoad();
    claudeInjectKeepLoginCheckbox();
    claudeBindKeepLoginControls();
    window.addEventListener('pagehide', claudeWipeAuthTokenOnUnload);
    window.addEventListener('beforeunload', claudeWipeAuthTokenOnUnload);
  }

  /* ==================================================================
   * [Claude 추가] "만족도 관리" 탭(06번) — 요청: "6번을 만족도 관리로 탭 만들어줘."
   * 다만 "당장 구현은 안 해도 되는데... 문자로 만족도 조사 링크를 보내면 지금은
   * 탈리(Tally)로 답을 받고 있어. 연동 가능한지, 아니면 자체적으로 만들지 정해서
   * 수집·분석까지 되면 좋겠다"는 답을 받아, 실제 데이터 수집/분석 기능은 아직
   * 만들지 않고 우선 탭 자리와 앞으로의 방향(선택지)만 안내하는 자리표시 화면으로
   * 둠. DB에도 만족도 관련 테이블이 아직 없음(추후 방향 정해지면 추가 예정).
   * ================================================================== */
  function buildSatisfactionSectionMarkup() {
    return `
      <div class="view-header">
        <h2>만족도 관리</h2>
        <p>아직 준비 중인 화면입니다. 방식을 정하면 실제 수집·집계·분석 기능을 만들어 채울 예정이에요.</p>
      </div>
      <section class="panel">
        <div class="section-title"><div><h2>어떤 방식으로 만들지 정해주세요</h2></div></div>
        <div class="claude-satisfaction-options">
          <div class="claude-satisfaction-option">
            <h3>① 탈리(Tally)와 연동</h3>
            <p>지금처럼 문자로 탈리 설문 링크를 보내고, 탈리에 쌓인 응답을 이 화면에서 불러와 과정별·회차별로 집계해서 보여주는 방식. 탈리 쪽 API/웹훅 연결이 필요해요.</p>
          </div>
          <div class="claude-satisfaction-option">
            <h3>② 자체 제작</h3>
            <p>외부 도구 없이 이 시스템 안에서 만족도 문항을 만들고, 응답 링크를 문자로 보내고, 응답까지 이 시스템 DB(Supabase)에 바로 쌓아서 집계하는 방식. 처음부터 새로 만들어야 하지만 이후엔 완전히 자체 관리 가능해요.</p>
          </div>
        </div>
        <p class="claude-satisfaction-hint">어느 쪽으로 진행할지(또는 다른 방식) 말씀해주시면 그때 실제 기능을 만들어 채워드릴게요.</p>
      </section>
    `;
  }

  function buildSatisfactionNavAndSection() {
    const nav = document.querySelector('.nav');
    const main = document.querySelector('.admin-main');
    if (!nav || !main || document.getElementById('view-claude-satisfaction')) return;

    const navBtn = document.createElement('button');
    navBtn.className = 'nav-item';
    navBtn.type = 'button';
    navBtn.dataset.view = 'claude-satisfaction';
    navBtn.innerHTML = '<span>06</span>만족도 관리';
    nav.appendChild(navBtn);

    const section = document.createElement('section');
    section.className = 'view';
    section.id = 'view-claude-satisfaction';
    section.innerHTML = buildSatisfactionSectionMarkup();
    main.appendChild(section);

    navBtn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
      document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
      navBtn.classList.add('active');
      section.classList.add('active');
    });
  }

