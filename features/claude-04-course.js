/* ==================================================================
 * [Claude 추가] claude-04-course.js — 신청자 커스텀 필드(관리자가 자유롭게 추가하는
 * 속성) + "과정 관리" 화면(회차 캘린더, 개별 교육일(course_sessions), 회차 행
 * 재구성, 과정별 그룹핑, 과정 유형 탭 단순화).
 * ================================================================== */

  /* ==================================================================
   * [Claude 추가] 신청현황 "나만의 속성(컬럼)" — 노션의 커스텀 프로퍼티처럼
   * 관리자가 자유롭게 새 컬럼을 추가/삭제하고, 셀을 클릭해 바로 값을 수정.
   * 값은 trainees.custom_fields (jsonb, key=필드 id)에 저장됨.
   * admin.html의 appColumnOrder/appColumnVisibility/appColumns(전역, let/const)를
   * 그대로 확장해서 사용 — renderApps() 등 기존 렌더 함수는 수정하지 않음.
   * ================================================================== */
  let claudeCustomFieldDefs = [];

  function claudeCustomColId(defId) {
    return `custom_${defId}`;
  }

  async function claudeLoadCustomFieldDefs() {
    const { data, error } = await sb.from('trainee_custom_fields').select('*').order('sort_order', { ascending: true });
    if (error) {
      console.warn('[Claude] 커스텀 속성 로드 실패:', error);
      return;
    }
    claudeCustomFieldDefs = data || [];
    claudeApplyCustomColumnsToAppColumns();
    if (typeof renderApps === 'function' && document.getElementById('appHead')) {
      renderApps();
    }
  }

  function claudeApplyCustomColumnsToAppColumns() {
    if (typeof appColumnOrder === 'undefined' || typeof appColumns === 'undefined' || typeof appColumnVisibility === 'undefined') return;

    // 삭제된 커스텀 속성은 컬럼 목록에서도 제거
    const validIds = new Set(claudeCustomFieldDefs.map(d => claudeCustomColId(d.id)));
    for (let i = appColumnOrder.length - 1; i >= 0; i--) {
      const id = appColumnOrder[i];
      if (id.startsWith('custom_') && !validIds.has(id)) {
        appColumnOrder.splice(i, 1);
        delete appColumns[id];
        delete appColumnVisibility[id];
      }
    }

    claudeCustomFieldDefs.forEach(def => {
      const colId = claudeCustomColId(def.id);
      appColumns[colId] = {
        label: def.label,
        render: row => claudeRenderCustomCell(row, def),
      };
      if (!appColumnOrder.includes(colId)) {
        const actionsIdx = appColumnOrder.indexOf('actions');
        if (actionsIdx >= 0) appColumnOrder.splice(actionsIdx, 0, colId);
        else appColumnOrder.push(colId);
      }
      if (appColumnVisibility[colId] === undefined) appColumnVisibility[colId] = true;
    });
  }

  function claudeRenderCustomCell(row, def) {
    const traineeId = escapeHtml(row.trainee_id || '');
    const value = row.trainees?.custom_fields ? row.trainees.custom_fields[def.id] : undefined;
    if (def.field_type === 'checkbox') {
      return `<input type="checkbox" class="claude-custom-cb" data-trainee-id="${traineeId}" data-field-id="${escapeHtml(def.id)}" ${value ? 'checked' : ''}>`;
    }
    if (def.field_type === 'select') {
      const options = Array.isArray(def.options) ? def.options : [];
      return `
        <select class="claude-custom-select" data-trainee-id="${traineeId}" data-field-id="${escapeHtml(def.id)}">
          <option value="">선택 안 함</option>
          ${options.map(opt => `<option value="${escapeHtml(opt)}" ${opt === value ? 'selected' : ''}>${escapeHtml(opt)}</option>`).join('')}
        </select>
      `;
    }
    const display = value === undefined || value === null || value === '' ? '' : escapeHtml(String(value));
    return `<div class="claude-inline-cell${display ? '' : ' empty'}" tabindex="0" data-trainee-id="${traineeId}" data-field-id="${escapeHtml(def.id)}" data-type="${escapeHtml(def.field_type)}">${display || '입력...'}</div>`;
  }

  async function claudeSaveCustomFieldValue(traineeId, fieldId, value) {
    // 로컬 캐시(allApps)에서 현재 custom_fields를 찾아 병합 후 저장
    let current = {};
    if (typeof allApps !== 'undefined' && Array.isArray(allApps)) {
      const found = allApps.find(a => a.trainee_id === traineeId);
      if (found?.trainees?.custom_fields) current = { ...found.trainees.custom_fields };
    }
    current[fieldId] = value;
    const { error } = await sb.from('trainees').update({ custom_fields: current }).eq('id', traineeId);
    if (error) {
      alert(`저장 실패: ${error.message}`);
      return false;
    }
    if (typeof allApps !== 'undefined' && Array.isArray(allApps)) {
      allApps.forEach(a => {
        if (a.trainee_id === traineeId && a.trainees) a.trainees.custom_fields = { ...current };
      });
    }
    return true;
  }

  function claudeBindCustomFieldCells() {
    const tbody = document.getElementById('appRows');
    if (!tbody || tbody.dataset.claudeCustomBound) return;
    tbody.dataset.claudeCustomBound = 'true';

    tbody.addEventListener('click', (e) => {
      const cell = e.target.closest('.claude-inline-cell');
      if (!cell || cell.querySelector('input')) return;
      const currentText = cell.classList.contains('empty') ? '' : cell.textContent.trim();
      const input = document.createElement('input');
      input.type = cell.dataset.type === 'number' ? 'number' : 'text';
      input.value = currentText;
      cell.textContent = '';
      cell.appendChild(input);
      input.focus();
      input.select();

      const finish = async (save) => {
        const newValue = input.value.trim();
        if (save && newValue !== currentText) {
          const ok = await claudeSaveCustomFieldValue(cell.dataset.traineeId, cell.dataset.fieldId, newValue);
          if (!ok) { cell.textContent = currentText || '입력...'; cell.classList.toggle('empty', !currentText); return; }
        }
        const finalText = save ? newValue : currentText;
        cell.textContent = finalText || '입력...';
        cell.classList.toggle('empty', !finalText);
      };

      input.addEventListener('blur', () => finish(true));
      input.addEventListener('keydown', (ke) => {
        if (ke.key === 'Enter') { ke.preventDefault(); input.blur(); }
        if (ke.key === 'Escape') { ke.preventDefault(); finish(false); }
      });
    });

    tbody.addEventListener('change', async (e) => {
      const cb = e.target.closest('.claude-custom-cb');
      if (cb) {
        cb.disabled = true;
        await claudeSaveCustomFieldValue(cb.dataset.traineeId, cb.dataset.fieldId, cb.checked);
        cb.disabled = false;
        return;
      }
      const sel = e.target.closest('.claude-custom-select');
      if (sel) {
        sel.disabled = true;
        await claudeSaveCustomFieldValue(sel.dataset.traineeId, sel.dataset.fieldId, sel.value || null);
        sel.disabled = false;
      }
    });
  }

  /* 컬럼 설정 패널에 커스텀 속성 삭제 버튼 + "+ 새 속성 추가" 폼을 덧붙임 */
  function claudeAugmentColumnOrderPanel() {
    const panel = document.getElementById('columnOrderPanel');
    if (!panel) return;

    panel.querySelectorAll('.column-order-item').forEach(item => {
      const id = item.dataset.id;
      if (!id || !id.startsWith('custom_') || item.querySelector('.claude-custom-del')) return;
      const def = claudeCustomFieldDefs.find(d => claudeCustomColId(d.id) === id);
      if (!def) return;
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'claude-custom-del';
      delBtn.title = '이 속성 삭제';
      delBtn.textContent = '×';
      delBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm(`"${def.label}" 속성을 삭제할까요? 저장된 값도 더 이상 표시되지 않습니다.`)) return;
        const { error } = await sb.from('trainee_custom_fields').delete().eq('id', def.id);
        if (error) { alert(`삭제 실패: ${error.message}`); return; }
        await claudeLoadCustomFieldDefs();
      });
      item.appendChild(delBtn);
    });

    if (!document.getElementById('claudeAddFieldBox')) {
      const box = document.createElement('div');
      box.className = 'claude-addfield-box';
      box.id = 'claudeAddFieldBox';
      box.innerHTML = `
        <button type="button" class="claude-addfield-toggle" id="claudeAddFieldToggle">+ 새 속성 추가</button>
        <div class="claude-addfield-form" id="claudeAddFieldForm">
          <input type="text" id="claudeAddFieldLabel" placeholder="속성 이름 (예: 참석확인)">
          <select id="claudeAddFieldType">
            <option value="text">텍스트</option>
            <option value="number">숫자</option>
            <option value="checkbox">체크박스</option>
            <option value="select">선택 목록</option>
          </select>
          <textarea id="claudeAddFieldOptions" placeholder="선택 목록일 때만: 옵션을 쉼표로 구분 (예: 미확인,확인,보류)" rows="2" style="display:none;"></textarea>
          <button type="button" id="claudeAddFieldSubmit">추가</button>
          <div id="claudeAddFieldMsg" class="claude-msg"></div>
        </div>
      `;
      panel.parentElement?.appendChild(box);

      document.getElementById('claudeAddFieldToggle').addEventListener('click', () => {
        document.getElementById('claudeAddFieldForm').classList.toggle('open');
      });
      document.getElementById('claudeAddFieldType').addEventListener('change', (e) => {
        document.getElementById('claudeAddFieldOptions').style.display = e.target.value === 'select' ? 'block' : 'none';
      });
      document.getElementById('claudeAddFieldSubmit').addEventListener('click', async () => {
        const label = document.getElementById('claudeAddFieldLabel').value.trim();
        const fieldType = document.getElementById('claudeAddFieldType').value;
        const msgEl = document.getElementById('claudeAddFieldMsg');
        msgEl.textContent = '';
        msgEl.className = 'claude-msg';
        if (!label) {
          msgEl.textContent = '속성 이름을 입력해주세요.';
          msgEl.classList.add('error');
          return;
        }
        let options = null;
        if (fieldType === 'select') {
          options = document.getElementById('claudeAddFieldOptions').value.split(',').map(s => s.trim()).filter(Boolean);
          if (!options.length) {
            msgEl.textContent = '선택 목록 옵션을 최소 1개 이상 입력해주세요.';
            msgEl.classList.add('error');
            return;
          }
        }
        const sortOrder = claudeCustomFieldDefs.length ? Math.max(...claudeCustomFieldDefs.map(d => d.sort_order || 0)) + 1 : 0;
        const { error } = await sb.from('trainee_custom_fields').insert({ label, field_type: fieldType, options, sort_order: sortOrder });
        if (error) {
          msgEl.textContent = `추가 실패: ${error.message}`;
          msgEl.classList.add('error');
          return;
        }
        document.getElementById('claudeAddFieldLabel').value = '';
        document.getElementById('claudeAddFieldOptions').value = '';
        document.getElementById('claudeAddFieldForm').classList.remove('open');
        await claudeLoadCustomFieldDefs();
      });
    }
  }

  /* ==================================================================
   * [Claude 추가] 과정 관리 화면 상단 — 회차 일정을 달력으로 보기.
   * allCourses(전역, admin.html)의 start_date 기준으로 월별 그리드에 표시.
   * 빈 날짜를 클릭하면 회차 추가 폼(#newCourseDate)에 그 날짜를 채워줌.
   * ================================================================== */
  let claudeCalMonth = null; // Date (해당 월의 1일)

  /* ==================================================================
   * [Claude 추가] 띄엄띄엄 진행되는(비연속) 교육 일정 지원.
   * course_sessions 테이블(course_id, session_date)에 개별 교육일을 등록해두면
   * 캘린더는 그 날짜들에만 표시됨. 한 건도 등록 안 된 회차는 기존처럼
   * start_date~end_date 범위 전체(연속 교육 가정)로 표시(하위호환).
   * ================================================================== */
  let claudeAllCourseSessions = {}; // course_id -> [dateStr, ...]

  async function claudeLoadAllCourseSessions() {
    if (typeof sb === 'undefined' || !sb) return;
    const { data, error } = await sb.from('course_sessions').select('course_id, session_date');
    if (error) { console.error('[claude] course_sessions 로드 실패', error); return; }
    const map = {};
    (data || []).forEach(row => {
      (map[row.course_id] = map[row.course_id] || []).push(row.session_date);
    });
    Object.keys(map).forEach(id => map[id].sort());
    claudeAllCourseSessions = map;
  }

  function claudeDateRangeKeys(startStr, endStr) {
    const keys = [];
    if (!startStr) return keys;
    const start = new Date(startStr + 'T00:00:00');
    const end = new Date((endStr || startStr) + 'T00:00:00');
    if (isNaN(start.getTime())) return keys;
    const last = isNaN(end.getTime()) || end < start ? start : end;
    const cur = new Date(start.getTime());
    let guard = 0;
    while (cur <= last && guard < 366) {
      keys.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`);
      cur.setDate(cur.getDate() + 1);
      guard++;
    }
    return keys;
  }

  function claudeTodayDateKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function claudeBuildCourseCalendar() {
    if (!claudeCalMonth) {
      const now = new Date();
      claudeCalMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    const year = claudeCalMonth.getFullYear();
    const month = claudeCalMonth.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const todayKey = claudeTodayDateKey();

    const courses = (typeof allCourses !== 'undefined' && Array.isArray(allCourses)) ? allCourses : [];
    const byDate = {};
    courses.forEach(c => {
      const sessions = claudeAllCourseSessions[c.id];
      const keys = (sessions && sessions.length) ? sessions : claudeDateRangeKeys(c.start_date, c.end_date);
      keys.forEach(key => { (byDate[key] = byDate[key] || []).push(c); });
    });

    const cells = [];
    for (let i = firstDow - 1; i >= 0; i--) {
      cells.push({ day: daysInPrevMonth - i, outside: true, key: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, outside: false, key });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ day: cells.length - (firstDow + daysInMonth) + 1, outside: true, key: null });
    }

    const dowLabels = ['일', '월', '화', '수', '목', '금', '토'];
    return `
      <section class="panel claude-cal-panel">
        <div class="claude-cal-head">
          <h3>회차 일정 캘린더</h3>
          <div class="claude-cal-nav">
            <button type="button" id="claudeCalPrev">‹</button>
            <span>${year}년 ${month + 1}월</span>
            <button type="button" id="claudeCalNext">›</button>
          </div>
        </div>
        <div class="claude-cal-grid">
          ${dowLabels.map(l => `<div class="claude-cal-dow">${l}</div>`).join('')}
          ${cells.map(cell => `
            <div class="claude-cal-cell ${cell.outside ? 'claude-cal-outside' : ''} ${cell.key === todayKey ? 'claude-cal-today' : ''}" ${cell.key ? `data-date="${cell.key}"` : ''}>
              <span class="claude-cal-daynum">${cell.day}</span>
              ${cell.key && byDate[cell.key] ? byDate[cell.key].map(c => `
                <span class="claude-cal-pill ${c.is_open === false ? 'claude-cal-closed' : ''}" title="${escapeHtml((c.course_types?.name || '') + ' ' + (c.name || ''))}">${escapeHtml(c.course_types?.name || c.name || '회차')}${c.round ? ' ' + escapeHtml(c.round) + '회' : ''}</span>
              `).join('') : ''}
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  function claudeRefreshCourseCalendar() {
    const existing = document.getElementById('claudeCourseCalendar');
    if (!existing) return;
    existing.outerHTML = `<div id="claudeCourseCalendar">${claudeBuildCourseCalendar()}</div>`;
    claudeBindCourseCalendar();
  }

  function claudeBindCourseCalendar() {
    const wrap = document.getElementById('claudeCourseCalendar');
    if (!wrap) return;
    const prevBtn = document.getElementById('claudeCalPrev');
    const nextBtn = document.getElementById('claudeCalNext');
    if (prevBtn) prevBtn.addEventListener('click', () => {
      claudeCalMonth = new Date(claudeCalMonth.getFullYear(), claudeCalMonth.getMonth() - 1, 1);
      claudeRefreshCourseCalendar();
    });
    if (nextBtn) nextBtn.addEventListener('click', () => {
      claudeCalMonth = new Date(claudeCalMonth.getFullYear(), claudeCalMonth.getMonth() + 1, 1);
      claudeRefreshCourseCalendar();
    });
    wrap.querySelectorAll('.claude-cal-cell[data-date]').forEach(cell => {
      cell.addEventListener('click', (e) => {
        if (e.target.closest('.claude-cal-pill')) return;
        const dateInput = document.getElementById('newCourseDate');
        if (dateInput) {
          dateInput.value = cell.dataset.date;
          dateInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          dateInput.focus();
          claudeAutoFillEndDate(dateInput, document.getElementById('newCourseEndDate'));
        }
      });
    });
  }

  /* ==================================================================
   * [Claude 추가] 회차 시작일/종료일 입력 보완.
   * 1) 종료일을 안 채우고 등록하면 비어버리던 걸, 시작일 입력 시 종료일이
   *    비어있으면 자동으로 시작일과 같은 날짜(=1일짜리 교육)로 채워줌.
   *    (물론 채워진 뒤에 직접 다른 날짜로 바꿀 수 있음)
   * 2) 날짜 입력칸에 타이핑할 때 연도가 4자리를 넘게 입력되는 브라우저
   *    기본 동작(<input type="date"> 자체의 특성)을 완전히 막을 수는 없지만,
   *    min/max로 허용 연도 범위를 좁혀서 터무니없는 값이 저장되는 건 막음.
   * ================================================================== */
  const CLAUDE_DATE_MIN = '2015-01-01';
  const CLAUDE_DATE_MAX = '2099-12-31';

  function claudeAutoFillEndDate(startInput, endInput) {
    if (!startInput || !endInput) return;
    if (startInput.value && !endInput.value) {
      endInput.value = startInput.value;
    }
  }

  function claudeConstrainDateInput(input) {
    if (!input || input.dataset.claudeDateBound) return;
    input.dataset.claudeDateBound = 'true';
    if (!input.min) input.min = CLAUDE_DATE_MIN;
    if (!input.max) input.max = CLAUDE_DATE_MAX;
  }

  function claudeBindCourseDateHelpers() {
    // 회차 추가 폼
    const newStart = document.getElementById('newCourseDate');
    const newEnd = document.getElementById('newCourseEndDate');
    if (newStart && !newStart.dataset.claudeDateBound) {
      claudeConstrainDateInput(newStart);
      claudeConstrainDateInput(newEnd);
      newStart.addEventListener('change', () => claudeAutoFillEndDate(newStart, newEnd));
    }

    // 등록된 회차 목록의 빠른 수정(course-quick-start/end)과 편집 행(course-start/end-input) —
    // 매번 새로 그려지므로 이벤트 위임으로 한 번만 바인딩
    const list = document.getElementById('courseRows');
    if (list && !list.dataset.claudeDateHelperBound) {
      list.dataset.claudeDateHelperBound = 'true';
      list.addEventListener('focusin', (e) => {
        if (e.target.matches('input[type="date"]')) claudeConstrainDateInput(e.target);
      });
      list.addEventListener('change', (e) => {
        const target = e.target;
        if (target.classList.contains('course-quick-start')) {
          const row = target.closest('[data-course-id]');
          claudeAutoFillEndDate(target, row?.querySelector('.course-quick-end'));
        } else if (target.classList.contains('course-start-input')) {
          const row = target.closest('[data-course-id]');
          claudeAutoFillEndDate(target, row?.querySelector('.course-end-input'));
        }
      });
    }
  }

  function claudeInjectCourseCalendar() {
    const view = document.getElementById('view-courses');
    if (!view || document.getElementById('claudeCourseCalendar')) return;
    const anchor = document.getElementById('coursePanelLayout');
    const wrap = document.createElement('div');
    wrap.id = 'claudeCourseCalendar';
    wrap.innerHTML = claudeBuildCourseCalendar();
    if (anchor) view.insertBefore(wrap, anchor);
    else view.appendChild(wrap);
    claudeBindCourseCalendar();

    const coursesNavBtn = document.querySelector('.nav-item[data-view="courses"]');
    if (coursesNavBtn) coursesNavBtn.addEventListener('click', () => claudeRefreshCourseCalendar());

    const rowsEl = document.getElementById('courseRows');
    if (rowsEl) {
      /* claudeGroupCourseRowsByType()가 courseRows 안의 DOM을 직접 옮기기 때문에,
         그 작업 도중엔 observer를 잠깐 끊어서 자기 자신을 다시 트리거하는
         무한 루프를 막음. */
      const observer = new MutationObserver(() => {
        requestAnimationFrame(() => {
          observer.disconnect();
          claudeRefreshCourseCalendar();
          claudeRenderUpcomingPanel();
          claudeAugmentCourseRowsWithSessions();
          claudeRefreshAllSessionToggleLabels();
          claudeRestructureAllCourseRows();
          claudeGroupCourseRowsByType();
          observer.observe(rowsEl, { childList: true, subtree: true });
        });
      });
      observer.observe(rowsEl, { childList: true, subtree: true });
    }

    const typeFilterSel = document.getElementById('courseTypeTabs');
    if (typeFilterSel) typeFilterSel.addEventListener('change', () => requestAnimationFrame(claudeGroupCourseRowsByType));
  }

  /* ==================================================================
   * [Claude 추가] "등록된 회차"가 "전체 회차 보기"일 때는 과정별로 그룹 헤더를
   * 붙여서 묶어 보여줌. 특정 과정만 보고 있을 때는(필터가 걸려있을 때) 원래
   * 순서 그대로 두고 그룹핑하지 않음. renderCourses()가 그리는 실제 행(.course-row/
   * .course-edit-row) DOM 노드는 그대로 옮기기만 해서 바인딩된 이벤트가 유지됨.
   * ================================================================== */
  function claudeGroupCourseRowsByType() {
    const list = document.getElementById('courseRows');
    const filterSel = document.getElementById('courseTypeTabs');
    if (!list || !filterSel) return;

    list.querySelectorAll('.claude-course-group-header').forEach(h => h.remove());
    if (filterSel.value) return; // 특정 과정만 볼 때는 원래 순서 그대로

    const rows = [...list.querySelectorAll(':scope > [data-course-id]')];
    if (rows.length < 2) return;

    const courses = (typeof allCourses !== 'undefined' && Array.isArray(allCourses)) ? allCourses : [];
    const types = (typeof allCourseTypes !== 'undefined' && Array.isArray(allCourseTypes)) ? allCourseTypes : [];

    const groups = new Map();
    const groupOrder = [];
    rows.forEach(row => {
      const course = courses.find(c => c.id === row.dataset.courseId);
      const typeId = course?.course_type_id || '__unknown__';
      if (!groups.has(typeId)) { groups.set(typeId, []); groupOrder.push(typeId); }
      groups.get(typeId).push(row);
    });
    if (groupOrder.length < 2) return; // 과정이 하나뿐이면 그룹핑 의미 없음

    const typeIdOrder = types.map(t => t.id);
    groupOrder.sort((a, b) => {
      const ai = typeIdOrder.indexOf(a);
      const bi = typeIdOrder.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    groupOrder.forEach((typeId, idx) => {
      const typeName = types.find(t => t.id === typeId)?.name || '과정 미지정';
      const groupRows = groups.get(typeId);
      const header = document.createElement('div');
      header.className = 'claude-course-group-header';
      header.textContent = `${typeName} · ${groupRows.length}개`;
      header.style.cssText = `font-size:12px;font-weight:900;color:var(--accent-dark,#0F465A);padding:10px 2px 6px;${idx > 0 ? 'border-top:1px solid var(--line);margin-top:8px;' : ''}`;
      list.appendChild(header);
      groupRows.forEach(row => {
        list.appendChild(row);
        /* 그룹 헤더에 이미 과정명이 나와 있으므로, 행 안의 메타 텍스트에서
           과정명은 빼고 회차 번호만 남김("드론 교육 · 3회차" → "3회차"). */
        const meta = row.querySelector('.course-row-meta');
        if (meta) {
          const course = courses.find(c => c.id === row.dataset.courseId);
          meta.textContent = course && course.round ? `${course.round}회차` : '';
        }
      });
    });
  }

  /* ==================================================================
   * [Claude 추가] "등록된 회차" 각 행에 "개별일정" 버튼을 붙여서, 클릭하면
   * 그 회차의 개별 교육일(course_sessions)을 추가/삭제할 수 있는 패널을
   * 행 안에(그리드 전체 너비로) 펼침. 편집 모드(.course-edit-row)에는 붙이지 않음.
   * ================================================================== */
  function claudeSuggestNextSessionDate(courseId, dates) {
    /* [Claude 추가] "날짜 추가" 입력칸을 열 때 매번 오늘 날짜부터 달력을 뒤지지 않도록,
       이미 등록된 날짜가 있으면 그 마지막 날짜 다음날을, 하나도 없으면 회차의
       시작일을 기본값으로 제안함(=시작일 기준 근처에서 바로 고를 수 있게). */
    if (dates.length) {
      const last = new Date(dates[dates.length - 1] + 'T00:00:00');
      if (!isNaN(last.getTime())) {
        last.setDate(last.getDate() + 1);
        return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
      }
    }
    const courses = (typeof allCourses !== 'undefined' && Array.isArray(allCourses)) ? allCourses : [];
    const course = courses.find(c => c.id === courseId);
    return course?.start_date || '';
  }

  function claudeSessionsPanelMarkup(courseId) {
    const dates = (claudeAllCourseSessions[courseId] || []).slice().sort();
    const chips = dates.length
      ? dates.map(d => `<span class="claude-session-chip">${escapeHtml(d)}<button type="button" class="claude-session-del" data-date="${escapeHtml(d)}" aria-label="삭제">×</button></span>`).join('')
      : '<span class="claude-sessions-empty">등록된 개별 일자 없음 — 아래에서 날짜를 추가해주세요.</span>';
    const suggested = claudeSuggestNextSessionDate(courseId, dates);
    const courses = (typeof allCourses !== 'undefined' && Array.isArray(allCourses)) ? allCourses : [];
    const course = courses.find(c => c.id === courseId);
    return `
      <div class="claude-sessions-panel" data-course-id="${escapeHtml(courseId)}">
        <div class="claude-sessions-hint">개별 교육일(띄엄띄엄 진행되는 경우)을 등록해두면 캘린더에는 이 날짜들에만 표시됩니다. 하나도 등록 안 하면 지금처럼 시작일~종료일 범위로 표시돼요.</div>
        <div class="claude-sessions-chips">${chips}</div>
        <div class="claude-sessions-add">
          <input type="date" class="claude-session-add-input" min="${CLAUDE_DATE_MIN}" max="${CLAUDE_DATE_MAX}" value="${escapeHtml(suggested)}" aria-label="개별 교육일 추가">
          <button type="button" class="claude-session-add-btn">+ 날짜 추가</button>
        </div>
        ${course?.start_date ? `<div class="claude-sessions-hint" style="margin:6px 0 0;">시작일(${escapeHtml(course.start_date)}) 근처로 기본 제안돼요 — 원하는 날짜로 바꿔서 추가하면 됩니다.</div>` : ''}
      </div>
    `;
  }

  function claudeBindSessionsPanel(panel, courseId) {
    panel.querySelectorAll('.claude-session-del').forEach(btn => {
      btn.addEventListener('click', () => claudeDeleteCourseSession(courseId, btn.dataset.date));
    });
    const addBtn = panel.querySelector('.claude-session-add-btn');
    const addInput = panel.querySelector('.claude-session-add-input');
    if (addBtn && addInput) {
      addBtn.addEventListener('click', () => {
        if (!addInput.value) return;
        claudeAddCourseSession(courseId, addInput.value);
        addInput.value = '';
      });
    }
  }

  function claudeToggleSessionsPanel(courseId, row) {
    const existing = row.querySelector('.claude-sessions-panel');
    if (existing) { existing.remove(); return; }
    const list = document.getElementById('courseRows');
    if (list) list.querySelectorAll('.claude-sessions-panel').forEach(p => p.remove());
    const wrap = document.createElement('div');
    wrap.innerHTML = claudeSessionsPanelMarkup(courseId);
    const panel = wrap.firstElementChild;
    row.appendChild(panel);
    claudeBindSessionsPanel(panel, courseId);
  }

  function claudeAugmentCourseRowsWithSessions() {
    const list = document.getElementById('courseRows');
    if (!list) return;
    list.querySelectorAll(':scope > .course-row[data-course-id]').forEach(row => {
      if (row.querySelector('.claude-sessions-toggle-btn')) return;
      const actions = row.querySelector('.course-row-actions');
      if (!actions) return;
      const courseId = row.dataset.courseId;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'claude-sessions-toggle-btn';
      const n = (claudeAllCourseSessions[courseId] || []).length;
      btn.textContent = n ? `개별일정 ${n}` : '개별일정';
      btn.addEventListener('click', () => claudeToggleSessionsPanel(courseId, row));
      actions.insertBefore(btn, actions.firstChild);
    });
  }

  /* ===== [Claude 추가] 버그 수정: "개별일정" 버튼은 회차 행이 처음 그려질 때 딱 한 번
     claudeAugmentCourseRowsWithSessions()가 텍스트("개별일정 N")를 붙이는데, 그 시점에
     course_sessions 데이터(claudeAllCourseSessions)가 아직 서버에서 다 안 불러와진
     상태면 N이 0으로 계산돼서 숫자 없이 "개별일정"만 붙어버림 — 실제 등록된 날짜가
     지워진 게 아니라 화면에 숫자가 늦게 반영 안 된 것뿐임(DB 데이터는 그대로 있음).
     claudeLoadAllCourseSessions()가 끝난 뒤 이미 그려진 버튼들의 숫자를 다시 맞춰줌. ===== */
  function claudeRefreshAllSessionToggleLabels() {
    const list = document.getElementById('courseRows');
    if (!list) return;
    list.querySelectorAll(':scope > .course-row[data-course-id] .claude-sessions-toggle-btn').forEach(btn => {
      const row = btn.closest('.course-row[data-course-id]');
      if (!row) return;
      const n = (claudeAllCourseSessions[row.dataset.courseId] || []).length;
      btn.textContent = n ? `개별일정 ${n}` : '개별일정';
    });
  }

  /* ==================================================================
   * [Claude 추가 v2] "등록된 회차" 행 정보 위계 재구성.
   * courseRowHtml()이 만든 실제 DOM(제목+메타 div, 공개/비공개 토글 버튼,
   * 시작~종료일 date input 2개, 정원 pill, 액션 영역)을 "새로 그리지 않고
   * 그대로 옮기기"만 해서 기존 이벤트 바인딩(클릭/change 등)을 그대로 유지한 채
   * 2번째 줄에 "공개 · 기간 · 정원 · 개별일정" meta-line을 만듦.
   * claudeAugmentCourseRowsWithSessions()가 붙인 "개별일정" 버튼도 같은 줄로 옮김.
   * 이미 재구성된 행(row.dataset.claudeRestructured)은 다시 처리하지 않음 —
   * admin.html이 데이터 변경 시 행을 통째로 새로 그리므로 매번 새 DOM에는
   * 이 플래그가 없어 자연히 다시 재구성됨.
   * ================================================================== */
  function claudeMetaDot() {
    const dot = document.createElement('span');
    dot.className = 'claude-meta-dot';
    dot.textContent = '·';
    dot.setAttribute('aria-hidden', 'true');
    return dot;
  }

  function claudeWrapMetaItem(label, el) {
    const wrap = document.createElement('span');
    wrap.className = 'claude-meta-item';
    if (label) {
      const labelSpan = document.createElement('span');
      labelSpan.className = 'claude-meta-label';
      labelSpan.textContent = label;
      wrap.appendChild(labelSpan);
    }
    wrap.appendChild(el);
    return wrap;
  }

  function claudeRestructureCourseRow(row) {
    if (!row || row.dataset.claudeRestructured === '1') return;
    if (row.querySelector(':scope > .claude-course-meta-line')) { row.dataset.claudeRestructured = '1'; return; }

    const titleWrap = row.querySelector(':scope > div:first-child');
    const toggle = row.querySelector(':scope > .course-open-toggle');
    const dateQuick = row.querySelector(':scope > .course-date-quick');
    const pill = row.querySelector(':scope > .pill');
    const actions = row.querySelector(':scope > .course-row-actions');
    if (!titleWrap || !toggle || !dateQuick || !pill || !actions) return; // admin.html 구조가 바뀌었으면 손대지 않고 넘어감

    const metaLine = document.createElement('div');
    metaLine.className = 'claude-course-meta-line';

    metaLine.appendChild(toggle);
    metaLine.appendChild(claudeMetaDot());
    metaLine.appendChild(claudeWrapMetaItem('기간', dateQuick));
    metaLine.appendChild(claudeMetaDot());
    metaLine.appendChild(claudeWrapMetaItem('정원', pill));

    const sessionsBtn = actions.querySelector('.claude-sessions-toggle-btn');
    if (sessionsBtn) {
      metaLine.appendChild(claudeMetaDot());
      metaLine.appendChild(sessionsBtn);
    }

    row.insertBefore(metaLine, titleWrap.nextSibling);
    row.dataset.claudeRestructured = '1';
  }

  function claudeRestructureAllCourseRows() {
    const list = document.getElementById('courseRows');
    if (!list) return;
    list.querySelectorAll(':scope > .course-row[data-course-id]').forEach(row => claudeRestructureCourseRow(row));
  }

  function claudeRefreshSessionsUI(courseId) {
    claudeRefreshCourseCalendar();
    const list = document.getElementById('courseRows');
    if (!list) return;
    const row = list.querySelector(`.course-row[data-course-id="${CSS.escape(courseId)}"]`);
    if (!row) return;
    const panel = row.querySelector('.claude-sessions-panel');
    if (panel) {
      const wrap = document.createElement('div');
      wrap.innerHTML = claudeSessionsPanelMarkup(courseId);
      const fresh = wrap.firstElementChild;
      panel.replaceWith(fresh);
      claudeBindSessionsPanel(fresh, courseId);
    }
    const toggleBtn = row.querySelector('.claude-sessions-toggle-btn');
    if (toggleBtn) {
      const n = (claudeAllCourseSessions[courseId] || []).length;
      toggleBtn.textContent = n ? `개별일정 ${n}` : '개별일정';
    }
  }

  async function claudeAddCourseSession(courseId, dateStr) {
    const { error } = await sb.from('course_sessions').insert({ course_id: courseId, session_date: dateStr });
    if (error) { alert('날짜 추가 실패: ' + error.message); return; }
    await claudeLoadAllCourseSessions();
    claudeRefreshSessionsUI(courseId);
  }

  async function claudeDeleteCourseSession(courseId, dateStr) {
    const { error } = await sb.from('course_sessions').delete().eq('course_id', courseId).eq('session_date', dateStr);
    if (error) { alert('날짜 삭제 실패: ' + error.message); return; }
    await claudeLoadAllCourseSessions();
    claudeRefreshSessionsUI(courseId);
  }

