/* ==================================================================
 * [Claude 추가] claude-03-applications.js — "신청 현황" 화면 보완(컬럼 너비 조절/
 * 일괄삭제 바/팝업 겹침 방지), "과정 조회" 인라인 편집+메모, 단체 등록 폼,
 * 오른쪽 아래 플로팅(+) 버튼과 드로어.
 * ================================================================== */

  /* ==================================================================
   * [Claude 추가] 신청현황 테이블 컬럼 너비(간격) 조절 + 기본값 고정 + 팝업 클리핑 방지
   * admin.html의 renderApps()가 그리는 #appHead의 <th data-col="...">를
   * 그대로 이용하며, 기존 렌더 함수는 건드리지 않고 MutationObserver로
   * 다시 그려질 때마다 저장된 너비/드래그 핸들/팝업 위치를 재적용합니다.
   * ================================================================== */
  const CLAUDE_COL_WIDTH_KEY = 'claudeAppColumnWidths';
  let claudeColumnWidths = {};
  let claudeResizeObserverBound = false;
  let claudeMeasureCanvas = null;

  function claudeLoadColumnWidths() {
    try {
      claudeColumnWidths = JSON.parse(localStorage.getItem(CLAUDE_COL_WIDTH_KEY) || '{}') || {};
    } catch (e) {
      claudeColumnWidths = {};
    }
  }

  function claudeSaveColumnWidths() {
    try {
      localStorage.setItem(CLAUDE_COL_WIDTH_KEY, JSON.stringify(claudeColumnWidths));
    } catch (e) {
      // localStorage 사용 불가 시 조용히 무시 (너비 저장만 안 될 뿐 기능은 정상 동작)
    }
  }

  function claudeMeasureTextWidth(text, font) {
    if (!claudeMeasureCanvas) claudeMeasureCanvas = document.createElement('canvas');
    const ctx = claudeMeasureCanvas.getContext('2d');
    ctx.font = font;
    return ctx.measureText(text).width;
  }

  const CLAUDE_CELL_FONT = '13px "Noto Sans KR", sans-serif';
  const CLAUDE_TD_PAD_H = 20; // td{padding:13px 10px} 좌우 합
  const CLAUDE_WIDTH_BUFFER = 10;

  /* 컬럼별 기본(고정) 너비 계산: 이름=3글자, 연락처=11자리, 주민등록번호=14자리(앞6-뒤7), 상태='중복신청'+화살표 */
  function claudeGetDefaultWidth(colId) {
    switch (colId) {
      case 'name':
        return Math.ceil(claudeMeasureTextWidth('가나다', CLAUDE_CELL_FONT) + CLAUDE_TD_PAD_H + CLAUDE_WIDTH_BUFFER);
      case 'phone':
        return Math.ceil(claudeMeasureTextWidth('01012345678', CLAUDE_CELL_FONT) + CLAUDE_TD_PAD_H + CLAUDE_WIDTH_BUFFER);
      case 'rrn': {
        const textW = claudeMeasureTextWidth('123456-*******', CLAUDE_CELL_FONT);
        return Math.ceil(textW + CLAUDE_TD_PAD_H + 18 /* 전체보기 체크박스 */ + 7 /* gap */ + CLAUDE_WIDTH_BUFFER);
      }
      case 'status': {
        // select.status-select{padding:7px 8px;border:1px}, 네이티브 드롭다운 화살표 여유 공간 포함
        const textW = claudeMeasureTextWidth('중복신청', '12.5px "Noto Sans KR", sans-serif');
        return Math.ceil(textW + 16 /* select 좌우 padding */ + 2 /* border */ + 20 /* 드롭다운 화살표 */ + CLAUDE_TD_PAD_H + CLAUDE_WIDTH_BUFFER);
      }
      case 'actions':
        return 78; // ⋯ 버튼(32px) + 셀 여백만 있으면 충분
      default:
        return null;
    }
  }

  function claudeApplyColumnWidths() {
    document.querySelectorAll('#appHead th[data-col]').forEach(th => {
      const colId = th.dataset.col;
      const saved = claudeColumnWidths[colId];
      if (saved) {
        th.style.width = saved + 'px';
        return;
      }
      const fixedDefault = claudeGetDefaultWidth(colId);
      if (fixedDefault) {
        th.style.width = fixedDefault + 'px';
        return;
      }
      if (!th.style.width) {
        const rect = th.getBoundingClientRect();
        if (rect.width > 0) th.style.width = Math.round(rect.width) + 'px';
      }
    });
  }

  function claudeAttachColumnResizers() {
    document.querySelectorAll('#appHead th[data-col]').forEach(th => {
      if (th.querySelector('.claude-col-resizer')) return;
      const handle = document.createElement('div');
      handle.className = 'claude-col-resizer';
      th.appendChild(handle);

      let startX = 0;
      let startWidth = 0;

      const onMouseMove = (e) => {
        const delta = e.clientX - startX;
        const newWidth = Math.max(50, Math.round(startWidth + delta));
        th.style.width = newWidth + 'px';
      };
      const onMouseUp = () => {
        handle.classList.remove('dragging');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        const colId = th.dataset.col;
        const width = parseInt(th.style.width, 10);
        if (colId && width) {
          claudeColumnWidths[colId] = width;
          claudeSaveColumnWidths();
        }
      };
      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startX = e.clientX;
        startWidth = th.getBoundingClientRect().width;
        handle.classList.add('dragging');
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
    });
  }

  /* th의 data-col 순서를 그대로 각 행(tr)의 td에도 표시 -> CSS에서 course/actions 칸만
     클리핑(overflow:hidden)에서 제외할 수 있도록 함. admin.html의 렌더 함수는 건드리지 않음. */
  function claudeTagRowCells() {
    const headCells = [...document.querySelectorAll('#appHead th')];
    const colIds = headCells.map(th => th.dataset.col || '');
    document.querySelectorAll('#appRows > tr').forEach(tr => {
      [...tr.children].forEach((td, i) => {
        if (colIds[i]) td.dataset.col = colIds[i];
      });
    });
  }

  /* ⋯ 메뉴(.menu-pop)와 신청과정 호버 상세(.application-course-detail)가
     테이블 셀의 overflow/스크롤 영역에 갇혀 잘려 보이는 문제를 fixed 포지셔닝으로 해결.
     admin.html의 열기/닫기 로직(class="open" 토글, :hover)은 그대로 두고,
     열리는 시점에 위치만 뷰포트 기준 좌표로 다시 계산해 붙여줌. */
  function claudeFixPopupClipping() {
    document.querySelectorAll('.menu-wrap').forEach(wrap => {
      if (wrap.dataset.claudePopupFix) return;
      wrap.dataset.claudePopupFix = 'true';
      const btn = wrap.querySelector('.menu-btn');
      const pop = wrap.querySelector('.menu-pop');
      if (!btn || !pop) return;
      const reposition = () => {
        requestAnimationFrame(() => {
          if (!wrap.classList.contains('open')) return;
          const r = btn.getBoundingClientRect();
          pop.style.position = 'fixed';
          pop.style.top = (r.bottom + 4) + 'px';
          pop.style.left = 'auto';
          pop.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
        });
      };
      btn.addEventListener('click', reposition);
    });

    document.querySelectorAll('.application-course-item').forEach(item => {
      if (item.dataset.claudePopupFix) return;
      item.dataset.claudePopupFix = 'true';
      const detail = item.querySelector('.application-course-detail');
      if (!detail) return;
      const reposition = () => {
        const r = item.getBoundingClientRect();
        detail.style.position = 'fixed';
        detail.style.left = Math.max(8, r.left) + 'px';
        detail.style.top = (r.bottom + 6) + 'px';
        requestAnimationFrame(() => {
          const dRect = detail.getBoundingClientRect();
          if (dRect.right > window.innerWidth - 8) {
            detail.style.left = Math.max(8, window.innerWidth - dRect.width - 8) + 'px';
          }
        });
      };
      item.addEventListener('mouseenter', reposition);
      item.addEventListener('focus', reposition);
    });
  }

  function claudeRefreshColumnResize() {
    claudeApplyColumnWidths();
    claudeAttachColumnResizers();
    claudeTagRowCells();
    claudeFixPopupClipping();
    claudeInjectRowSelectColumn();
    claudeBindCustomFieldCells();
    claudeAugmentColumnOrderPanel();
    claudeRenderUpcomingPanel();
  }

  /* ==================================================================
   * [Claude 추가] 신청현황 테이블 각 행 맨 왼쪽에 체크박스를 추가함.
   * 평소엔 숨겨져 있다가 그 행에 마우스를 올리면 나타나고, 체크된 행이 있으면
   * 계속 보임. 여러 명을 선택해서 한 번에 삭제할 수 있음 (요청: "왼쪽에 가져다
   * 대면 체크박스 나타나서 체크하면 일괄 삭제 가능하게").
   * 한 행 = 한 신청자(trainee)이므로, 삭제 시 그 신청자의 신청 건 전체를
   * 지움(신청 건이 여러 개로 묶인 신청자도 전부 삭제됨 — 개별 건만 남기고
   * 싶으면 기존의 "이 건 삭제"를 사용해주세요).
   * ================================================================== */
  const claudeSelectedTraineeIds = new Set();

  function claudeUpdateBulkBar() {
    const bar = document.getElementById('claudeBulkBar');
    if (!bar) return;
    const count = claudeSelectedTraineeIds.size;
    bar.style.display = count > 0 ? 'flex' : 'none';
    const countEl = bar.querySelector('.claude-bulk-count');
    if (countEl) countEl.textContent = `${count}명 선택됨`;
  }

  async function claudeBulkDeleteSelected() {
    const ids = [...claudeSelectedTraineeIds];
    if (ids.length === 0) return;
    if (!confirm(`선택한 ${ids.length}명의 신청 내역을 전부 삭제할까요?\n(같은 신청자의 신청 건이 여러 개면 전부 함께 삭제됩니다)`)) return;
    const btn = document.getElementById('claudeBulkDeleteBtn');
    if (btn) { btn.disabled = true; btn.textContent = '삭제 중...'; }
    const results = await Promise.all(ids.map(traineeId => sb.from('applications').delete().eq('trainee_id', traineeId)));
    const failed = results.filter(r => r && r.error);
    claudeSelectedTraineeIds.clear();
    if (btn) { btn.disabled = false; btn.textContent = '선택 삭제'; }
    claudeUpdateBulkBar();
    if (failed.length) {
      alert(`${failed.length}건 삭제 중 실패했습니다: ${failed[0].error.message}`);
    }
    if (typeof loadApplications === 'function') {
      await loadApplications();
    } else if (typeof renderApps === 'function') {
      renderApps();
    }
    if (typeof renderMetrics === 'function') renderMetrics();
    if (typeof loadRecentActivity === 'function') loadRecentActivity();
  }

  function claudeInjectBulkBar() {
    const view = document.getElementById('view-applications');
    if (!view || document.getElementById('claudeBulkBar')) return;
    const anchor = view.querySelector('.table-shell.application-table');
    const bar = document.createElement('div');
    bar.id = 'claudeBulkBar';
    bar.className = 'claude-bulk-bar';
    bar.style.display = 'none';
    bar.innerHTML = `
      <span class="claude-bulk-count">0명 선택됨</span>
      <button type="button" id="claudeBulkDeleteBtn" class="claude-bulk-delete-btn">선택 삭제</button>
      <button type="button" id="claudeBulkClearBtn" class="claude-bulk-clear-btn">선택 해제</button>
    `;
    if (anchor) view.insertBefore(bar, anchor);
    else view.appendChild(bar);
    bar.querySelector('#claudeBulkDeleteBtn').addEventListener('click', claudeBulkDeleteSelected);
    bar.querySelector('#claudeBulkClearBtn').addEventListener('click', () => {
      claudeSelectedTraineeIds.clear();
      document.querySelectorAll('.claude-row-select:checked').forEach(cb => { cb.checked = false; });
      claudeUpdateBulkBar();
    });
  }

  function claudeInjectRowSelectColumn() {
    const headRow = document.querySelector('#appHead tr');
    if (headRow && !headRow.querySelector('.claude-row-select-th')) {
      const th = document.createElement('th');
      th.className = 'claude-row-select-th';
      th.setAttribute('aria-label', '선택');
      headRow.insertBefore(th, headRow.firstChild);
    }
    document.querySelectorAll('#appRows tr[data-trainee-id]').forEach(tr => {
      if (tr.querySelector('.claude-row-select-cell')) return;
      const traineeId = tr.dataset.traineeId;
      if (!traineeId) return;
      const td = document.createElement('td');
      td.className = 'claude-row-select-cell';
      td.innerHTML = `<input type="checkbox" class="claude-row-select" aria-label="이 신청자 선택">`;
      tr.insertBefore(td, tr.firstChild);
      const cb = td.querySelector('.claude-row-select');
      cb.dataset.traineeId = traineeId;
      if (claudeSelectedTraineeIds.has(traineeId)) cb.checked = true;
      cb.addEventListener('click', (e) => e.stopPropagation());
      cb.addEventListener('change', () => {
        if (cb.checked) claudeSelectedTraineeIds.add(traineeId);
        else claudeSelectedTraineeIds.delete(traineeId);
        claudeUpdateBulkBar();
      });
    });
  }

  /* [Claude 추가] 예전에 드래그로 저장해둔 컬럼 너비(localStorage)가 있으면 새 기본값보다
     우선 적용되어, "상태/관리 칸이 버튼보다 훨씬 넓다" 같은 문제가 계속 남아있을 수 있음.
     "컬럼 설정" 패널에 초기화 버튼을 추가해서 저장된 값을 지우고 기본값으로 되돌릴 수 있게 함. */
  function claudeInjectColumnResetButton() {
    const menu = document.getElementById('columnOrderMenu');
    if (!menu || document.getElementById('claudeColWidthResetBtn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'claudeColWidthResetBtn';
    btn.textContent = '컬럼 너비 기본값으로 초기화';
    btn.style.cssText = 'display:block;width:100%;margin-top:10px;padding:8px 10px;border:1px solid var(--line);border-radius:6px;background:#fff;color:var(--accent-dark,#0F465A);font-family:inherit;font-size:11.5px;font-weight:800;cursor:pointer;';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      claudeColumnWidths = {};
      claudeSaveColumnWidths();
      document.querySelectorAll('#appHead th[data-col]').forEach(th => { th.style.width = ''; });
      claudeRefreshColumnResize();
    });
    const panel = document.getElementById('columnOrderPanel');
    if (panel && panel.parentElement) {
      panel.parentElement.appendChild(btn);
    } else {
      menu.appendChild(btn);
    }
  }

  /* ==================================================================
   * [Claude 추가] "신청 현황" 표의 "상태" 컬럼 — 상태 select(pill)가 컬럼 폭에
   * 안 맞아 잘리던 문제 + 그 밑에 항상 떠있던 신청일시가 공간을 잡아먹던 문제.
   * 요청: "컬럼 내에서 콜아웃이 반응형으로 됐으면 좋겠음(지금은 짤리잖아),
   * 날짜도 그냥 마우스 호버했을때 떴으면 좋겠음."
   * admin.html의 renderApplicationStatusList()는 안 건드리고, 이미 그려진
   * .application-status-item 안의 .compact-info(신청일시 텍스트)를 화면에서
   * 빼서(display:none) 상태 select가 컬럼 전체 폭을 반응형으로 쓸 수 있게 하고,
   * 그 텍스트는 select의 title 속성(브라우저 기본 호버 툴팁)으로 옮겨서
   * 마우스를 올렸을 때만 보이게 함. ================================== */
  function claudeHideStatusDatesAsTooltip() {
    document.querySelectorAll('.application-status-item').forEach(item => {
      const info = item.querySelector(':scope > .compact-info');
      if (!info) return;
      if (info.dataset.claudeTooltipped !== '1') {
        const text = info.textContent.trim();
        info.dataset.claudeTooltipped = '1';
        info.style.display = 'none';
        const select = item.querySelector(':scope > select.status-select');
        const titleText = text ? `신청일시: ${text}` : '';
        if (select) select.title = titleText;
        else item.title = titleText;
      }
    });
  }

  /* ==================================================================
   * [Claude 추가] "과정 조회" 화면 — 지금까지는 이름/연락처/소속이 텍스트로만
   * 보여서 정보를 고치려면 "신청 현황" 화면으로 가야 했고, 메모도 아예 안 보였음.
   * 요청: "과정 조회에서도 정보 수정 가능하게 해줘" + "메모도 떠야해".
   * admin.html의 renderLookupRound()가 그리는 테이블(.lookup-round table.lookup-table)에
   * "메모"/"관리" 열을 새로 붙여서, "편집"을 누르면 이름/연락처/소속/메모 칸이 입력창으로
   * 바뀌고 저장하면 trainees 테이블을 바로 업데이트함(신청 현황의 "저장" 버튼과 같은
   * 테이블/같은 방식). 메모 원본 값은 admin.html의 전역 allApps(신청 현황 데이터, 이미
   * trainees.admin_memo를 포함해서 불러옴)에서 같은 신청 건을 찾아 읽어옴. 개설 알림
   * 관심자 표(.lookup-interest)는 신청 데이터가 아니라 건드리지 않음.
   * ================================================================== */
  function claudeAugmentCourseLookupEdit() {
    const container = document.getElementById('courseLookupGroups');
    if (!container) return;
    container.querySelectorAll('.lookup-round table.lookup-table').forEach(table => {
      const headRow = table.querySelector('thead tr');
      if (headRow && !headRow.dataset.claudeEditColAdded) {
        headRow.dataset.claudeEditColAdded = '1';
        ['메모', '관리'].forEach(label => {
          const th = document.createElement('th');
          th.textContent = label;
          headRow.appendChild(th);
        });
      }
      table.querySelectorAll('tbody tr').forEach(tr => {
        if (tr.dataset.claudeEditBound) return;
        const empSelect = tr.querySelector('select.employment-category-select[data-trainee-id]');
        const traineeId = empSelect?.dataset.traineeId;
        const appSelect = tr.querySelector('select.status-select:not(.employment-category-select)[data-id]');
        const appId = appSelect?.dataset.id;
        if (!traineeId) return; // 재직 구분 select를 못 찾으면(구조가 바뀌었으면) 손대지 않고 넘어감
        tr.dataset.claudeEditBound = '1';

        const cells = tr.querySelectorAll('td');
        const nameTd = cells[0], phoneTd = cells[1], companyTd = cells[2];
        if (!nameTd || !phoneTd || !companyTd) return;

        const app = appId && typeof allApps !== 'undefined' ? allApps.find(a => a.id === appId) : null;
        const memoText = app?.trainees?.admin_memo || '';

        const memoTd = document.createElement('td');
        memoTd.dataset.label = '메모';
        memoTd.className = 'claude-lookup-memo-td';
        memoTd.textContent = memoText || '-';
        if (memoText) memoTd.title = memoText;
        tr.appendChild(memoTd);

        const actionTd = document.createElement('td');
        actionTd.dataset.label = '관리';
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'inline-btn claude-lookup-edit-btn';
        editBtn.textContent = '편집';
        actionTd.appendChild(editBtn);
        tr.appendChild(actionTd);

        editBtn.addEventListener('click', () => claudeToggleLookupRowEdit(tr, traineeId, nameTd, phoneTd, companyTd, memoTd, actionTd));
      });
    });
  }

  function claudeToggleLookupRowEdit(tr, traineeId, nameTd, phoneTd, companyTd, memoTd, actionTd) {
    if (tr.dataset.claudeEditing === '1') return; // 이미 편집 중
    tr.dataset.claudeEditing = '1';
    const original = {
      name: nameTd.textContent.trim(),
      phone: phoneTd.textContent.trim(),
      company: companyTd.textContent.trim(),
      memo: memoTd.textContent.trim(),
    };
    nameTd.innerHTML = `<input class="row-input" data-claude-field="name" value="${escapeHtml(original.name === '-' ? '' : original.name)}">`;
    phoneTd.innerHTML = `<input class="row-input" data-claude-field="phone" value="${escapeHtml(original.phone === '-' ? '' : original.phone)}">`;
    companyTd.innerHTML = `<input class="row-input" data-claude-field="company" value="${escapeHtml(original.company === '-' ? '' : original.company)}">`;
    memoTd.innerHTML = `<textarea class="row-memo" data-claude-field="memo" placeholder="메모">${escapeHtml(original.memo === '-' ? '' : original.memo)}</textarea>`;
    actionTd.innerHTML = `
      <button type="button" class="inline-btn claude-lookup-save-btn">저장</button>
      <button type="button" class="inline-btn light claude-lookup-cancel-btn">취소</button>
    `;

    const restore = () => {
      nameTd.textContent = original.name;
      phoneTd.textContent = original.phone;
      companyTd.textContent = original.company;
      memoTd.textContent = original.memo || '-';
      memoTd.title = original.memo || '';
      actionTd.innerHTML = '<button type="button" class="inline-btn claude-lookup-edit-btn">편집</button>';
      tr.dataset.claudeEditing = '';
      actionTd.querySelector('.claude-lookup-edit-btn').addEventListener('click', () => claudeToggleLookupRowEdit(tr, traineeId, nameTd, phoneTd, companyTd, memoTd, actionTd));
    };

    actionTd.querySelector('.claude-lookup-cancel-btn').addEventListener('click', restore);
    actionTd.querySelector('.claude-lookup-save-btn').addEventListener('click', async () => {
      const saveBtn = actionTd.querySelector('.claude-lookup-save-btn');
      const payload = {
        name: nameTd.querySelector('input').value.trim(),
        phone: phoneTd.querySelector('input').value.trim(),
        company: companyTd.querySelector('input').value.trim(),
        admin_memo: memoTd.querySelector('textarea').value.trim() || null,
      };
      if (!payload.name || !payload.phone) {
        alert('이름과 연락처는 비워둘 수 없습니다.');
        return;
      }
      saveBtn.disabled = true;
      saveBtn.textContent = '저장 중...';
      const { error } = await sb.from('trainees').update(payload).eq('id', traineeId);
      if (error) {
        alert(`저장 실패: ${error.message}`);
        saveBtn.disabled = false;
        saveBtn.textContent = '저장';
        return;
      }
      original.name = payload.name || '-';
      original.phone = payload.phone || '-';
      original.company = payload.company || '-';
      original.memo = payload.admin_memo || '';
      /* admin.html의 allApps 전역에도 같이 반영해서, "신청 현황" 화면으로 넘어가도
         방금 고친 메모/정보가 바로 보이게 함 */
      if (typeof allApps !== 'undefined') {
        allApps.forEach(a => {
          if (a.trainee_id === traineeId && a.trainees) {
            a.trainees.name = payload.name;
            a.trainees.phone = payload.phone;
            a.trainees.company = payload.company;
            a.trainees.admin_memo = payload.admin_memo;
          }
        });
      }
      restore();
    });
  }

  function claudeWatchCourseLookup() {
    const container = document.getElementById('courseLookupGroups');
    if (!container) return;
    claudeAugmentCourseLookupEdit();
    const observer = new MutationObserver(() => {
      requestAnimationFrame(claudeAugmentCourseLookupEdit);
    });
    observer.observe(container, { childList: true, subtree: true });
  }

  function claudeInitColumnResize() {
    claudeLoadColumnWidths();
    const head = document.getElementById('appHead');
    const body = document.getElementById('appRows');
    if (!head) return;
    claudeInjectBulkBar();
    claudeRefreshColumnResize();
    claudeInjectColumnResetButton();
    claudeHideStatusDatesAsTooltip();
    if (!claudeResizeObserverBound) {
      const observer = new MutationObserver(() => {
        requestAnimationFrame(() => {
          claudeRefreshColumnResize();
          claudeHideStatusDatesAsTooltip();
        });
      });
      observer.observe(head, { childList: true, subtree: true });
      if (body) observer.observe(body, { childList: true, subtree: true });
      claudeResizeObserverBound = true;
    }
  }

  /* ==================================================================
   * [Claude 추가] 단체 등록 — 회사 하나에 대해 여러 명을 한 번에 등록.
   * 기존 "+ 신청자 수동 등록(1명씩)" 패널의 RPC(claude_admin_add_application)를
   * 행마다 재사용함. 신청 과정/초기 상태/회사명은 공통으로 적용.
   * ================================================================== */
  let claudeGroupRowSeq = 0;

  function claudeGroupRowMarkup(rowKey) {
    return `
      <div class="claude-group-row" data-row-key="${rowKey}">
        <input type="text" placeholder="이름 *" data-field="name">
        <input type="tel" placeholder="연락처 *" data-field="phone">
        <input type="email" placeholder="이메일" data-field="email">
        <input type="text" placeholder="주민등록번호 * (000000-0000000)" data-field="rrn">
        <button type="button" class="claude-group-row-remove" title="이 행 삭제">×</button>
      </div>
    `;
  }

  function buildGroupAddDrawer() {
    return `
      <aside class="claude-drawer" id="claudeGroupAddDrawer">
        <div class="claude-drawer-head">
          <h3>+ 단체 등록 (여러 명 한 번에)</h3>
          <button type="button" class="claude-drawer-close" aria-label="닫기">×</button>
        </div>
        <div class="claude-drawer-body">
          <p class="claude-hint">회사명·신청 과정·초기 상태는 아래 목록 전체에 공통으로 적용됩니다. 각 사람마다 이름/연락처/주민등록번호는 필수입니다.</p>
          <div class="claude-group-shared">
            <div><label>회사명</label><input type="text" id="claudeGroupCompany" placeholder="예: ○○산업"></div>
            <div><label>신청 과정 *</label><select id="claudeGroupCourse"></select></div>
            <div><label>초기 상태 *</label><select id="claudeGroupStatus"></select></div>
          </div>
          <div class="claude-group-rows" id="claudeGroupRows"></div>
          <div class="claude-group-actions">
            <button type="button" class="claude-add-row-btn" id="claudeGroupAddRowBtn">+ 행 추가</button>
            <button type="button" id="claudeGroupSubmitBtn" class="submit" style="width:auto;padding:10px 22px;">전체 등록</button>
          </div>
          <div id="claudeGroupMsg" class="claude-msg"></div>
        </div>
      </aside>
    `;
  }

  function claudeAddGroupRow() {
    const rows = document.getElementById('claudeGroupRows');
    if (!rows) return;
    claudeGroupRowSeq += 1;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = claudeGroupRowMarkup(claudeGroupRowSeq);
    rows.appendChild(wrapper.firstElementChild);
  }

  function populateGroupSelects() {
    const courseSel = document.getElementById('claudeGroupCourse');
    if (courseSel) {
      const courses = (typeof allCourses !== 'undefined' && Array.isArray(allCourses)) ? allCourses : [];
      courseSel.innerHTML = '<option value="">과정 선택</option>' + courses.map(c =>
        `<option value="${escapeHtml(c.id)}">${escapeHtml((c.course_types?.name || '') + ' ' + c.name)}${c.start_date ? ' (' + escapeHtml(c.start_date) + ')' : ''}</option>`
      ).join('');
    }
    const statusSel = document.getElementById('claudeGroupStatus');
    if (statusSel) {
      const statuses = (typeof APPLICATION_STATUSES !== 'undefined') ? APPLICATION_STATUSES : ['대기', '승인', '중복신청', '신청확정', '수료', '거절', '취소'];
      statusSel.innerHTML = statuses.map(s => `<option value="${s}" ${s === '대기' ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('');
    }
  }

  async function submitGroupApplications() {
    const msgEl = document.getElementById('claudeGroupMsg');
    const company = document.getElementById('claudeGroupCompany').value.trim();
    const courseId = document.getElementById('claudeGroupCourse').value;
    const status = document.getElementById('claudeGroupStatus').value;
    msgEl.textContent = '';
    msgEl.className = 'claude-msg';

    if (!courseId) {
      msgEl.textContent = '신청 과정을 선택해주세요.';
      msgEl.classList.add('error');
      return;
    }

    const rowEls = [...document.querySelectorAll('#claudeGroupRows .claude-group-row')];
    const rowsToSubmit = [];
    let hasBlockingError = false;

    rowEls.forEach(rowEl => {
      rowEl.querySelectorAll('.claude-group-row-status').forEach(n => n.remove());
      rowEl.querySelectorAll('input').forEach(inp => inp.classList.remove('claude-row-err'));

      const name = rowEl.querySelector('[data-field="name"]').value.trim();
      const phone = rowEl.querySelector('[data-field="phone"]').value.trim();
      const email = rowEl.querySelector('[data-field="email"]').value.trim();
      const rrn = rowEl.querySelector('[data-field="rrn"]').value.trim();

      if (!name && !phone && !rrn && !email) return; // 완전히 빈 행은 건너뜀

      const missing = [];
      if (!name) missing.push('name');
      if (!phone) missing.push('phone');
      if (!rrn) missing.push('rrn');
      if (missing.length) {
        missing.forEach(f => rowEl.querySelector(`[data-field="${f}"]`)?.classList.add('claude-row-err'));
        hasBlockingError = true;
        return;
      }
      rowsToSubmit.push({ rowEl, name, phone, email, rrn });
    });

    if (hasBlockingError) {
      msgEl.textContent = '빨간 테두리로 표시된 필수 항목(이름/연락처/주민등록번호)을 채워주세요.';
      msgEl.classList.add('error');
      return;
    }
    if (!rowsToSubmit.length) {
      msgEl.textContent = '등록할 사람을 1명 이상 입력해주세요.';
      msgEl.classList.add('error');
      return;
    }

    const submitBtn = document.getElementById('claudeGroupSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = `등록 중... (0/${rowsToSubmit.length})`;

    let okCount = 0;
    let failCount = 0;

    for (let i = 0; i < rowsToSubmit.length; i++) {
      const row = rowsToSubmit[i];
      const { error } = await sb.rpc('claude_admin_add_application', {
        p_name: row.name,
        p_phone: row.phone,
        p_email: row.email || null,
        p_company: company || null,
        p_resident_number: row.rrn,
        p_course_id: courseId,
        p_status: status,
        p_employment_category: null,
        p_note: '단체 등록',
      });
      submitBtn.textContent = `등록 중... (${i + 1}/${rowsToSubmit.length})`;

      const statusNote = document.createElement('div');
      statusNote.className = 'claude-group-row-status';
      if (error) {
        failCount += 1;
        statusNote.classList.add('err');
        statusNote.textContent = `실패: ${error.message}`;
        row.rowEl.appendChild(statusNote);
      } else {
        okCount += 1;
        row.rowEl.remove(); // 성공한 행은 목록에서 제거
      }
    }

    submitBtn.disabled = false;
    submitBtn.textContent = '전체 등록';

    msgEl.textContent = `완료: 성공 ${okCount}건, 실패 ${failCount}건${failCount ? ' (실패한 행은 아래 남아있습니다. 수정 후 다시 등록해주세요.)' : ''}`;
    msgEl.classList.add(failCount ? 'error' : 'success');

    if (!document.querySelectorAll('#claudeGroupRows .claude-group-row').length) {
      claudeAddGroupRow();
      claudeAddGroupRow();
      claudeAddGroupRow();
    }

    if (okCount && typeof loadApplications === 'function') {
      loadApplications();
    }
  }

  /* ==================================================================
   * [Claude 추가] "신청자 수동 등록"/"단체 등록"을 신청 현황 화면 안에 끼워넣는
   * 대신, 오른쪽 아래 플로팅(+) 버튼 → 메뉴 → 노션처럼 오른쪽에서 슬라이드로
   * 열리는 사이드 패널(드로어)로 바꿈. 폼 자체(아이디/제출 로직)는 그대로 재사용.
   * ================================================================== */
  function claudeBuildFabMarkup() {
    return `
      <div class="claude-drawer-backdrop" id="claudeDrawerBackdrop"></div>
      <div class="claude-fab-wrap claude-fab-hidden" id="claudeFabWrap">
        <div class="claude-fab-menu" id="claudeFabMenu">
          <button type="button" class="claude-fab-menu-item" data-open-drawer="claudeAddDrawer">📋 신청자 수동 등록</button>
          <button type="button" class="claude-fab-menu-item" data-open-drawer="claudeGroupAddDrawer">👥 단체 등록</button>
        </div>
        <button type="button" class="claude-fab-btn" id="claudeFabBtn" aria-label="신청자 등록 메뉴 열기">+</button>
      </div>
    `;
  }

  function claudeOpenDrawer(id) {
    const el = document.getElementById(id);
    if (!el) return;
    document.querySelectorAll('.claude-drawer.open').forEach(d => { if (d !== el) d.classList.remove('open'); });
    el.classList.add('open');
    document.getElementById('claudeDrawerBackdrop')?.classList.add('open');
    document.getElementById('claudeFabMenu')?.classList.remove('open');
    document.getElementById('claudeFabBtn')?.classList.remove('open');
  }

  function claudeCloseAllDrawers() {
    document.querySelectorAll('.claude-drawer.open').forEach(d => d.classList.remove('open'));
    document.getElementById('claudeDrawerBackdrop')?.classList.remove('open');
  }

  function claudeSyncFabVisibility() {
    const view = document.getElementById('view-applications');
    const wrap = document.getElementById('claudeFabWrap');
    if (!view || !wrap) return;
    const isActive = view.classList.contains('active');
    wrap.classList.toggle('claude-fab-hidden', !isActive);
    if (!isActive) claudeCloseAllDrawers();
  }

  function claudeWatchApplicationsViewForFab() {
    const view = document.getElementById('view-applications');
    if (!view) return;
    claudeSyncFabVisibility();
    const observer = new MutationObserver(() => claudeSyncFabVisibility());
    observer.observe(view, { attributes: true, attributeFilter: ['class'] });
  }

  function claudeInjectApplicantDrawers() {
    if (document.getElementById('claudeFabWrap')) return;
    const view = document.getElementById('view-applications');
    if (!view) return;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = claudeBuildFabMarkup() + buildApplicantAddDrawer() + buildGroupAddDrawer();
    Array.from(wrapper.children).forEach(node => document.body.appendChild(node));

    populateCourseSelect();
    populateStatusSelect();
    document.getElementById('claudeAddForm').addEventListener('submit', submitManualApplication);

    populateGroupSelects();
    claudeAddGroupRow();
    claudeAddGroupRow();
    claudeAddGroupRow();
    document.getElementById('claudeGroupAddRowBtn').addEventListener('click', claudeAddGroupRow);
    document.getElementById('claudeGroupSubmitBtn').addEventListener('click', submitGroupApplications);
    document.getElementById('claudeGroupRows').addEventListener('click', (e) => {
      const btn = e.target.closest('.claude-group-row-remove');
      if (!btn) return;
      btn.closest('.claude-group-row')?.remove();
    });

    const fabBtn = document.getElementById('claudeFabBtn');
    const fabMenu = document.getElementById('claudeFabMenu');
    if (fabBtn && fabMenu) {
      fabBtn.addEventListener('click', () => {
        const isOpen = fabMenu.classList.toggle('open');
        fabBtn.classList.toggle('open', isOpen);
      });
      fabMenu.querySelectorAll('.claude-fab-menu-item').forEach(btn => {
        btn.addEventListener('click', () => claudeOpenDrawer(btn.dataset.openDrawer));
      });
    }
    document.getElementById('claudeDrawerBackdrop')?.addEventListener('click', claudeCloseAllDrawers);
    document.querySelectorAll('.claude-drawer-close').forEach(btn => {
      btn.addEventListener('click', claudeCloseAllDrawers);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') claudeCloseAllDrawers(); });

    claudeWatchApplicationsViewForFab();

    /* 신청 현황 탭을 열 때마다 과정/상태 목록을 최신 상태로 갱신 */
    const appsNavBtn = document.querySelector('.nav-item[data-view="applications"]');
    if (appsNavBtn) {
      appsNavBtn.addEventListener('click', () => {
        populateCourseSelect();
        populateStatusSelect();
        populateGroupSelects();
      });
    }
  }

