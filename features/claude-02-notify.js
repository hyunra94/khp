/* ==================================================================
 * [Claude 추가] claude-02-notify.js — 알림 관리 화면 전체(발송 설정/로그/문자·이메일
 * 템플릿/나만의 문구 템플릿/개별 발송/신청자 수동 등록 폼/사이드바 알림관리 진입점).
 * claude-01-styles.js 로드 후에 이 파일이 로드되어야 함(escapeHtml 등 사용).
 * ================================================================== */

  /* ===== [Claude 추가] 발송 설정도 실패 시 화면에 사유 표시 (위 발송 문구와 동일한 이유) ===== */
  async function loadNotificationSettings() {
    const el = document.getElementById('claudeSettingsGrid');
    try {
      const { data, error } = await sb.from('notification_settings').select('*');
      if (error) {
        console.warn('[Claude] 알림 설정 로드 실패:', error);
        if (el) el.innerHTML = `<p class="claude-hint" style="color:var(--danger, #A33C3C);">설정을 불러오지 못했습니다: ${escapeHtml(error.message || String(error))}</p>`;
        return;
      }
      settingsCache = data || [];
      renderSettings();
    } catch (e) {
      console.warn('[Claude] 알림 설정 로드 중 예외:', e);
      if (el) el.innerHTML = `<p class="claude-hint" style="color:var(--danger, #A33C3C);">설정을 불러오지 못했습니다: ${escapeHtml(String(e && e.message ? e.message : e))}</p>`;
    }
  }
  /* ===== [Claude 추가] 끝 ===== */

  function renderSettings() {
    const el = document.getElementById('claudeSettingsGrid');
    if (!el) return;
    const order = [
      ['application_received', 'email'], ['application_received', 'sms'],
      ['status_change', 'email'], ['status_change', 'sms'],
      ['course_reminder', 'email'], ['course_reminder', 'sms'],
    ];
    el.innerHTML = order.map(([eventType, channel]) => {
      const row = settingsCache.find(s => s.event_type === eventType && s.channel === channel);
      const enabled = row ? row.enabled : true;
      return `
        <div class="claude-toggle-card">
          <div>
            <div class="label">${EVENT_LABELS[eventType]} · ${CHANNEL_LABELS[channel]}</div>
          </div>
          <label class="claude-switch">
            <input type="checkbox" data-event="${eventType}" data-channel="${channel}" ${enabled ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        </div>
      `;
    }).join('');

    el.querySelectorAll('input[type=checkbox]').forEach(input => {
      input.addEventListener('change', async () => {
        const eventType = input.dataset.event;
        const channel = input.dataset.channel;
        const enabled = input.checked;
        input.disabled = true;
        const { error } = await sb
          .from('notification_settings')
          .update({ enabled, updated_at: new Date().toISOString() })
          .eq('event_type', eventType)
          .eq('channel', channel);
        input.disabled = false;
        if (error) {
          alert(`설정 저장 실패: ${error.message}`);
          input.checked = !enabled;
          return;
        }
        const row = settingsCache.find(s => s.event_type === eventType && s.channel === channel);
        if (row) row.enabled = enabled;
      });
    });
  }

  async function loadNotificationLog() {
    const tbody = document.getElementById('claudeLogRows');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="empty-row">불러오는 중...</td></tr>';
    const { data, error } = await sb
      .from('notification_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-row">로드 실패: ${escapeHtml(error.message)}</td></tr>`;
      return;
    }
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-row">발송 이력이 없습니다</td></tr>';
      return;
    }
    tbody.innerHTML = data.map(row => `
      <tr>
        <td>${formatDateTime(row.created_at)}</td>
        <td>${escapeHtml(EVENT_LABELS[row.event_type] || row.event_type)}</td>
        <td>${escapeHtml(CHANNEL_LABELS[row.channel] || row.channel)}</td>
        <td>${escapeHtml(row.recipient || '-')}</td>
        <td><span class="claude-log-badge ${escapeHtml(row.status)}">${escapeHtml(STATUS_LABELS[row.status] || row.status)}</span></td>
        <td>${row.status === 'failed' && row.application_id && row.event_type !== 'course_reminder'
          ? `<button class="claude-resend-btn" data-id="${escapeHtml(row.application_id)}" data-event="${escapeHtml(row.event_type)}">재발송</button>`
          : '-'}</td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.claude-resend-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = '발송 중...';
        const fnName = btn.dataset.event === 'application_received' ? 'notify-application' : 'notify-status-change';
        try {
          await sb.functions.invoke(fnName, { body: { applicationId: btn.dataset.id } });
        } catch (err) {
          console.warn('[Claude] 재발송 실패:', err);
        }
        await loadNotificationLog();
      });
    });
  }

  /* ==================================================================
   * [Claude 추가] 발송 문구 "편집" (기존엔 읽기 전용 미리보기였으나,
   * "왜 문구를 못 고치냐"는 피드백에 따라 실제로 수정/저장 가능하게 변경.
   * DB 테이블 notification_templates에 저장된 값을 Edge Function이
   * 우선 사용하도록 이미 재배포해둠 (테이블에 값이 없으면 예전 하드코딩 문구로 폴백).
   * {{name}}(이름), {{course}}(과정명), {{start_date}}(교육 시작일) 플레이스홀더 사용 가능.
   * ================================================================== */
  const STATUS_LIST = ['승인', '신청확정', '수료', '거절', '취소', '중복신청'];
  let templatesCache = [];

  function findTemplate(eventType, channel, detail) {
    return templatesCache.find(t => t.event_type === eventType && t.channel === channel && (t.detail || '') === (detail || ''));
  }

  /* ===== [Claude 추가] 발송 문구가 "불러오는 중..."에서 멈춰 안 보이던 문제 대응 시작
     기존엔 조회 실패 시 콘솔에만 경고를 남기고 화면은 그대로 방치되어, 사용자 입장에선
     원인을 알 수 없이 계속 로딩 중인 것처럼 보였음. 이제 실패 사유를 화면에 직접 표시함. */
  async function loadTemplates() {
    const el = document.getElementById('claudeTemplateEditor');
    try {
      const { data, error } = await sb.from('notification_templates').select('*');
      if (error) {
        console.warn('[Claude] 알림 문구 로드 실패:', error);
        if (el) el.innerHTML = `<p class="claude-hint" style="color:var(--danger, #A33C3C);">문구를 불러오지 못했습니다: ${escapeHtml(error.message || String(error))}</p>`;
        return;
      }
      templatesCache = data || [];
      renderTemplateEditor();
      renderManualQuickfillButtons();
    } catch (e) {
      console.warn('[Claude] 알림 문구 로드 중 예외:', e);
      if (el) el.innerHTML = `<p class="claude-hint" style="color:var(--danger, #A33C3C);">문구를 불러오지 못했습니다: ${escapeHtml(String(e && e.message ? e.message : e))}</p>`;
    }
  }
  /* ===== [Claude 추가] 끝 ===== */

  /* ===== [Claude 추가] 자유롭게 이름 붙여서 추가하는 "나만의 문구 템플릿" 시작
     기존 문구(신청접수/상태변경/일정임박)는 정해진 상황에서만 쓰이는데,
     "문구를 자유롭게 추가하고 싶다"는 요청에 따라 이름만 붙이면 몇 개든 추가할 수
     있는 템플릿을 별도로 지원함. notification_templates 테이블을 그대로 쓰되
     event_type='custom', detail=템플릿 이름으로 저장 — 새 테이블 없이 재사용.
     "개별 발송" 탭의 빠른 채우기에도 자동으로 나타남. */
  function customTemplateRowMarkup(tpl) {
    const isEmail = tpl.channel === 'email';
    return `
      <div class="claude-tpl-row" data-row-id="custom__${escapeHtml(tpl.channel)}__${escapeHtml(tpl.detail)}">
        <span class="ch ${isEmail ? '' : 'sms'}">${escapeHtml(tpl.detail)} · ${CHANNEL_LABELS[tpl.channel]}</span>
        ${isEmail ? `<label>제목</label><input type="text" class="claude-tpl-subject" value="${escapeHtml(tpl.subject || '')}">` : ''}
        <label>${isEmail ? '본문' : '내용'}</label>
        <textarea class="claude-tpl-body" rows="${isEmail ? 4 : 2}">${escapeHtml(tpl.body || '')}</textarea>
        <div class="claude-tpl-row-foot">
          <span class="claude-hint" style="margin:0;">사용 가능: <span class="var">{{name}}</span></span>
          <button type="button" class="claude-tpl-save-btn" data-event="custom" data-channel="${escapeHtml(tpl.channel)}" data-detail="${escapeHtml(tpl.detail)}">저장</button>
          <button type="button" class="claude-tpl-delete-btn" data-channel="${escapeHtml(tpl.channel)}" data-detail="${escapeHtml(tpl.detail)}">삭제</button>
          <span class="claude-tpl-msg"></span>
        </div>
      </div>
    `;
  }

  function renderCustomTemplateSection() {
    const listEl = document.getElementById('claudeCustomTplList');
    if (!listEl) return;
    const customTpls = templatesCache.filter(t => t.event_type === 'custom');
    listEl.innerHTML = customTpls.length
      ? customTpls.map(customTemplateRowMarkup).join('')
      : `<p class="claude-hint" style="margin:0 0 10px;">아직 추가한 템플릿이 없습니다. 아래에서 새로 만들어보세요.</p>`;

    listEl.querySelectorAll('.claude-tpl-save-btn').forEach(btn => {
      btn.addEventListener('click', () => claudeSaveTemplateRow(btn));
    });
    listEl.querySelectorAll('.claude-tpl-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(`"${btn.dataset.detail}" 템플릿을 삭제할까요?`)) return;
        btn.disabled = true;
        const { error } = await sb.from('notification_templates').delete()
          .eq('event_type', 'custom').eq('channel', btn.dataset.channel).eq('detail', btn.dataset.detail);
        if (error) { alert(`삭제 실패: ${error.message}`); btn.disabled = false; return; }
        templatesCache = templatesCache.filter(t => !(t.event_type === 'custom' && t.channel === btn.dataset.channel && t.detail === btn.dataset.detail));
        renderCustomTemplateSection();
        renderManualQuickfillButtons();
      });
    });
  }

  function bindCustomTemplateAddForm() {
    const btn = document.getElementById('claudeCustomTplAddBtn');
    if (!btn || btn.dataset.claudeBound) return;
    btn.dataset.claudeBound = 'true';
    const channelSelect = document.getElementById('claudeCustomTplChannel');
    const subjectWrap = document.getElementById('claudeCustomTplSubjectWrap');
    const toggleSubjectWrap = () => { if (subjectWrap) subjectWrap.style.display = channelSelect.value === 'email' ? '' : 'none'; };
    if (channelSelect) { channelSelect.addEventListener('change', toggleSubjectWrap); toggleSubjectWrap(); }

    btn.addEventListener('click', async () => {
      const nameEl = document.getElementById('claudeCustomTplName');
      const bodyEl = document.getElementById('claudeCustomTplBody');
      const subjectEl = document.getElementById('claudeCustomTplSubject');
      const msgEl = document.getElementById('claudeCustomTplMsg');
      const name = (nameEl.value || '').trim();
      const channel = channelSelect.value;
      const body = (bodyEl.value || '').trim();
      msgEl.className = 'claude-tpl-msg';
      if (!name) { msgEl.textContent = '템플릿 이름을 입력해주세요.'; msgEl.classList.add('error'); return; }
      if (!body) { msgEl.textContent = '내용을 입력해주세요.'; msgEl.classList.add('error'); return; }
      if (templatesCache.some(t => t.event_type === 'custom' && t.channel === channel && t.detail === name)) {
        msgEl.textContent = '같은 이름의 템플릿이 이미 있습니다.'; msgEl.classList.add('error'); return;
      }
      btn.disabled = true;
      msgEl.textContent = '추가 중...';
      const { data, error } = await sb.from('notification_templates').insert({
        event_type: 'custom', channel, detail: name,
        subject: channel === 'email' ? (subjectEl.value || null) : null,
        body,
      }).select().maybeSingle();
      btn.disabled = false;
      if (error) { msgEl.textContent = `추가 실패: ${error.message}`; msgEl.classList.add('error'); return; }
      if (data) templatesCache.push(data);
      nameEl.value = ''; subjectEl.value = ''; bodyEl.value = '';
      msgEl.textContent = '추가됨';
      msgEl.classList.add('success');
      setTimeout(() => { msgEl.textContent = ''; msgEl.className = 'claude-tpl-msg'; }, 1800);
      renderCustomTemplateSection();
      renderManualQuickfillButtons();
    });
  }
  /* ===== [Claude 추가] 끝 ===== */

  function templateRowMarkup(eventType, channel, detail, groupKey) {
    const tpl = findTemplate(eventType, channel, detail) || { subject: '', body: '' };
    const rowId = `${eventType}__${channel}__${detail || 'none'}`;
    const isEmail = channel === 'email';
    return `
      <div class="claude-tpl-row" data-row-id="${escapeHtml(rowId)}">
        <span class="ch ${isEmail ? '' : 'sms'}">${CHANNEL_LABELS[channel]}</span>
        ${isEmail ? `<label>제목</label><input type="text" class="claude-tpl-subject" value="${escapeHtml(tpl.subject || '')}">` : ''}
        <label>${isEmail ? '본문' : '내용'}</label>
        <textarea class="claude-tpl-body" rows="${isEmail ? 4 : 2}">${escapeHtml(tpl.body || '')}</textarea>
        <div class="claude-tpl-row-foot">
          <span class="claude-hint" style="margin:0;">사용 가능: <span class="var">{{name}}</span> <span class="var">{{course}}</span>${eventType !== 'status_change' ? ' <span class="var">{{start_date}}</span>' : ''}</span>
          <button type="button" class="claude-tpl-save-btn" data-event="${escapeHtml(eventType)}" data-channel="${escapeHtml(channel)}" data-detail="${escapeHtml(detail || '')}">저장</button>
          <span class="claude-tpl-msg"></span>
        </div>
      </div>
    `;
  }

  function renderTemplateEditor() {
    const el = document.getElementById('claudeTemplateEditor');
    if (!el) return;

    const statusGroups = STATUS_LIST.map(status => `
      <div style="font-size:11px;color:var(--ink-soft);font-weight:800;margin:10px 0 4px;">▸ 상태가 "${escapeHtml(status)}"(으)로 바뀔 때</div>
      ${templateRowMarkup('status_change', 'email', status)}
      ${templateRowMarkup('status_change', 'sms', status)}
    `).join('');

    el.innerHTML = `
      <details class="claude-preview-group">
        <summary>① 신청 접수 시 발송되는 문구</summary>
        <div class="claude-preview-body">
          ${templateRowMarkup('application_received', 'email', '')}
          ${templateRowMarkup('application_received', 'sms', '')}
        </div>
      </details>
      <details class="claude-preview-group">
        <summary>② 상태 변경 시 발송되는 문구 (상태별 6종)</summary>
        <div class="claude-preview-body">
          ${statusGroups}
          <div style="font-size:11px;color:var(--ink-soft);margin-top:8px;">※ 위 6개 상태 외(예: "대기")로 바뀔 때는 알림이 발송되지 않습니다.</div>
        </div>
      </details>
      <details class="claude-preview-group">
        <summary>③ 교육 일정 임박(전날) 시 발송되는 문구</summary>
        <div class="claude-preview-body">
          ${templateRowMarkup('course_reminder', 'email', '')}
          ${templateRowMarkup('course_reminder', 'sms', '')}
          <div style="font-size:11px;color:var(--ink-soft);margin-top:8px;">※ 상태가 "신청확정"인 신청자에게만, 교육 시작일 하루 전 오전 9시(KST)에 자동 발송됩니다.</div>
        </div>
      </details>
      <details class="claude-preview-group" open>
        <summary>④ 나만의 문구 템플릿 (자유 추가)</summary>
        <div class="claude-preview-body">
          <p class="claude-hint">이름만 붙이면 몇 개든 자유롭게 추가할 수 있습니다. "개별 발송" 탭의 빠른 채우기에도 자동으로 나타납니다.</p>
          <div id="claudeCustomTplList"></div>
          <div class="claude-custom-tpl-add">
            <div class="claude-form-grid" style="grid-template-columns:1fr 130px;">
              <div><label>템플릿 이름</label><input type="text" id="claudeCustomTplName" placeholder="예: 수료증 발급 안내"></div>
              <div><label>채널</label>
                <select id="claudeCustomTplChannel">
                  <option value="email">이메일</option>
                  <option value="sms">문자</option>
                </select>
              </div>
            </div>
            <div style="margin-top:10px;" id="claudeCustomTplSubjectWrap"><label>제목</label><input type="text" id="claudeCustomTplSubject"></div>
            <div style="margin-top:10px;"><label>내용</label><textarea id="claudeCustomTplBody" rows="3" placeholder="{{name}}님, ... 처럼 이름을 자동으로 넣을 수 있습니다."></textarea></div>
            <div style="margin-top:10px;">
              <button type="button" id="claudeCustomTplAddBtn" class="claude-tpl-save-btn">+ 새 템플릿 추가</button>
              <span class="claude-tpl-msg" id="claudeCustomTplMsg"></span>
            </div>
          </div>
        </div>
      </details>
    `;

    el.querySelectorAll('.claude-tpl-save-btn').forEach(btn => {
      if (btn.id === 'claudeCustomTplAddBtn') return;
      btn.addEventListener('click', () => claudeSaveTemplateRow(btn));
    });
    renderCustomTemplateSection();
    bindCustomTemplateAddForm();
  }

  /* ===== [Claude 추가] 기존 저장 로직을 공용 함수로 분리 (나만의 문구 템플릿에서도 재사용) ===== */
  async function claudeSaveTemplateRow(btn) {
    const row = btn.closest('.claude-tpl-row');
    const eventType = btn.dataset.event;
    const channel = btn.dataset.channel;
    const detail = btn.dataset.detail;
    const subjectInput = row.querySelector('.claude-tpl-subject');
    const bodyInput = row.querySelector('.claude-tpl-body');
    const msgEl = row.querySelector('.claude-tpl-msg');
    btn.disabled = true;
    msgEl.textContent = '저장 중...';
    msgEl.className = 'claude-tpl-msg';
    const { error } = await sb
      .from('notification_templates')
      .update({
        subject: subjectInput ? subjectInput.value : null,
        body: bodyInput.value,
        updated_at: new Date().toISOString(),
      })
      .eq('event_type', eventType)
      .eq('channel', channel)
      .eq('detail', detail);
    btn.disabled = false;
    if (error) {
      msgEl.textContent = `저장 실패: ${error.message}`;
      msgEl.classList.add('error');
      return;
    }
    const cached = findTemplate(eventType, channel, detail);
    if (cached) {
      if (subjectInput) cached.subject = subjectInput.value;
      cached.body = bodyInput.value;
    }
    msgEl.textContent = '저장됨';
    msgEl.classList.add('success');
    setTimeout(() => { msgEl.textContent = ''; msgEl.className = 'claude-tpl-msg'; }, 1800);
  }

  /* ==================================================================
   * [Claude 추가] 특정 신청자에게 개별로 문자/이메일 발송
   * notify-manual Edge Function 호출 (관리자 로그인 세션으로 권한 확인).
   * ================================================================== */
  let claudeManualSelected = new Map(); // traineeId -> {id, name, phone, email}

  function claudeGetTraineeList() {
    const list = (typeof allApps !== 'undefined' && Array.isArray(allApps)) ? allApps : [];
    const seen = new Map();
    list.forEach(app => {
      const t = app.trainees;
      const id = app.trainee_id;
      if (!id || !t || seen.has(id)) return;
      seen.set(id, { id, name: t.name || '', phone: t.phone || '', email: t.email || '' });
    });
    return [...seen.values()];
  }

  function renderManualRecipientChips() {
    const el = document.getElementById('claudeManualChips');
    if (!el) return;
    const items = [...claudeManualSelected.values()];
    el.innerHTML = items.length
      ? items.map(t => `<span class="claude-chip">${escapeHtml(t.name)}<button type="button" data-id="${escapeHtml(t.id)}" aria-label="선택 해제">×</button></span>`).join('')
      : '<span style="font-size:12px;color:var(--ink-soft);">선택된 수신자 없음</span>';
    el.querySelectorAll('button[data-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        claudeManualSelected.delete(btn.dataset.id);
        renderManualRecipientChips();
      });
    });
  }

  function renderManualSearchResults(keyword) {
    const el = document.getElementById('claudeManualResults');
    if (!el) return;
    if (!keyword || keyword.trim().length < 1) {
      el.innerHTML = '';
      el.style.display = 'none';
      return;
    }
    const kw = keyword.trim().toLowerCase();
    const matches = claudeGetTraineeList()
      .filter(t => !claudeManualSelected.has(t.id))
      .filter(t => t.name.toLowerCase().includes(kw) || t.phone.includes(kw) || t.email.toLowerCase().includes(kw))
      .slice(0, 8);
    el.style.display = matches.length ? 'block' : 'none';
    el.innerHTML = matches.map(t => `
      <div class="claude-manual-result" data-id="${escapeHtml(t.id)}">
        <b>${escapeHtml(t.name)}</b>
        <span>${escapeHtml(t.phone || '연락처 없음')}${t.email ? ' · ' + escapeHtml(t.email) : ''}</span>
      </div>
    `).join('');
    el.querySelectorAll('.claude-manual-result').forEach(row => {
      row.addEventListener('click', () => {
        const t = claudeGetTraineeList().find(x => x.id === row.dataset.id);
        if (t) claudeManualSelected.set(t.id, t);
        renderManualRecipientChips();
        const input = document.getElementById('claudeManualSearch');
        if (input) input.value = '';
        el.innerHTML = '';
        el.style.display = 'none';
      });
    });
  }

  function claudeFillManualTemplate(eventType, channel, detail) {
    const tpl = findTemplate(eventType, channel, detail);
    if (!tpl) return;
    const subjectInput = document.getElementById('claudeManualSubject');
    const bodyInput = document.getElementById('claudeManualBody');
    if (subjectInput && tpl.subject) subjectInput.value = tpl.subject;
    if (bodyInput) bodyInput.value = tpl.body || '';
  }

  async function claudeSendManual() {
    const msgEl = document.getElementById('claudeManualMsg');
    msgEl.textContent = '';
    msgEl.className = 'claude-msg';
    const recipients = [...claudeManualSelected.values()];
    const emailChecked = document.getElementById('claudeManualChEmail')?.checked;
    const smsChecked = document.getElementById('claudeManualChSms')?.checked;
    const channels = [emailChecked && 'email', smsChecked && 'sms'].filter(Boolean);
    const subject = document.getElementById('claudeManualSubject')?.value || '';
    const body = document.getElementById('claudeManualBody')?.value || '';
    /* ===== [Claude 추가] 협약서 PDF 첨부 체크박스 (이메일에만 적용됨) ===== */
    const attachAgreement = document.getElementById('claudeManualAttachAgreement')?.checked || false;

    if (recipients.length === 0) { msgEl.textContent = '수신자를 먼저 선택해주세요.'; msgEl.classList.add('error'); return; }
    if (channels.length === 0) { msgEl.textContent = '발송 채널(이메일/문자)을 선택해주세요.'; msgEl.classList.add('error'); return; }
    if (!body.trim()) { msgEl.textContent = '내용을 입력해주세요.'; msgEl.classList.add('error'); return; }

    const sendBtn = document.getElementById('claudeManualSendBtn');
    sendBtn.disabled = true;
    sendBtn.textContent = `발송 중... (0/${recipients.length})`;

    /* ===== [Claude 추가] 실제 발송 성공/실패 판정 버그 수정 시작 =====
       기존엔 sb.functions.invoke()가 HTTP 레벨에서 에러 없이 응답만 오면(200 OK) 무조건
       "성공"으로 카운트했음. 그런데 notify-manual 함수는 실제 이메일/문자 발송이 실패해도
       (Resend/Aligo 쪽 오류) HTTP 자체는 200으로 응답하고 결과를 body.results 안에 담아서
       돌려주기 때문에, 실제로는 다 실패했는데도 "발송 성공"으로 잘못 표시되는 문제가 있었음.
       이제 응답의 results.email / results.sms 안의 실제 ok 값을 보고 판정함. */
    let successCount = 0;
    let failCount = 0;
    const firstErrors = [];
    for (let i = 0; i < recipients.length; i++) {
      const t = recipients[i];
      try {
        const { data, error } = await sb.functions.invoke('notify-manual', {
          body: { traineeId: t.id, channels, subject, body, attachAgreement },
        });
        if (error) {
          failCount += channels.length;
          firstErrors.push(`${t.name}: ${error.message || '요청 실패'}`);
        } else {
          channels.forEach(ch => {
            const r = data?.results?.[ch];
            if (r && r.ok) {
              successCount++;
            } else {
              failCount++;
              if (r?.error) firstErrors.push(`${t.name}(${CHANNEL_LABELS[ch]}): ${r.error}`);
            }
          });
        }
      } catch (e) {
        failCount += channels.length;
        firstErrors.push(`${t.name}: ${String(e)}`);
      }
      sendBtn.textContent = `발송 중... (${i + 1}/${recipients.length})`;
    }
    sendBtn.disabled = false;
    sendBtn.textContent = '발송하기';

    let summary = `발송 완료: 성공 ${successCount}건, 실패 ${failCount}건.`;
    if (failCount > 0 && firstErrors.length) {
      summary += ` 첫 실패 사유: ${firstErrors[0]}`;
    }
    msgEl.textContent = summary;
    msgEl.classList.add(failCount ? 'error' : 'success');
    /* ===== [Claude 추가] 끝 ===== */
    claudeManualSelected = new Map();
    renderManualRecipientChips();
    loadNotificationLog();
  }

  function bindManualSendUI() {
    const searchInput = document.getElementById('claudeManualSearch');
    if (searchInput) {
      searchInput.addEventListener('input', () => renderManualSearchResults(searchInput.value));
    }
    document.querySelectorAll('.claude-manual-quickfill').forEach(btn => {
      btn.addEventListener('click', () => claudeFillManualTemplate(btn.dataset.event, btn.dataset.channel, btn.dataset.detail || ''));
    });
    const sendBtn = document.getElementById('claudeManualSendBtn');
    if (sendBtn) sendBtn.addEventListener('click', claudeSendManual);
    renderManualRecipientChips();
    renderManualQuickfillButtons();
  }

  /* ===== [Claude 추가] "나만의 문구 템플릿"을 개별 발송의 빠른 채우기 목록에 반영 ===== */
  function renderManualQuickfillButtons() {
    const el = document.getElementById('claudeCustomQuickfillList');
    if (!el) return;
    const customTpls = templatesCache.filter(t => t.event_type === 'custom');
    el.innerHTML = customTpls.map(t => `
      <button type="button" class="claude-resend-btn claude-manual-quickfill" data-event="custom" data-channel="${escapeHtml(t.channel)}" data-detail="${escapeHtml(t.detail)}">${escapeHtml(t.detail)}</button>
    `).join('');
    el.querySelectorAll('.claude-manual-quickfill').forEach(btn => {
      btn.addEventListener('click', () => claudeFillManualTemplate(btn.dataset.event, btn.dataset.channel, btn.dataset.detail || ''));
    });
  }

  /* ==================================================================
   * [Claude 추가] 신청현황 각 행의 ⋯ 메뉴에 있는 "문자/메일 보내기" 버튼 →
   * 알림 관리 탭 · 개별 발송 서브탭으로 바로 이동하면서 그 신청자를 수신자로
   * 미리 넣어줌 (요청: "클릭하면 알림관리에 수신자 입력된 상태로 간다거나").
   * 이벤트 위임으로 한 번만 바인딩 — renderApps()가 다시 그려져도 계속 동작함.
   * ================================================================== */
  function claudeQuickSendToTrainee(trainee) {
    const navBtn = document.querySelector('.nav-item[data-view="claude-notify"]');
    if (navBtn) navBtn.click();
    const manualTabBtn = document.querySelector('#claudeSubtabs .claude-subtab-btn[data-tab="manual"]');
    if (manualTabBtn) manualTabBtn.click();
    if (trainee.id) {
      claudeManualSelected.set(trainee.id, trainee);
      renderManualRecipientChips();
    }
    setTimeout(() => {
      document.getElementById('claudeManualBody')?.focus();
      document.getElementById('view-claude-notify')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  function bindQuickNotifyDelegate() {
    if (document.body.dataset.claudeQuickNotifyBound) return;
    document.body.dataset.claudeQuickNotifyBound = 'true';
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.claude-quick-notify-btn');
      if (!btn) return;
      e.preventDefault();
      const traineeId = btn.dataset.traineeId;
      if (!traineeId) {
        alert('이 신청자의 정보를 찾을 수 없습니다.');
        return;
      }
      claudeQuickSendToTrainee({
        id: traineeId,
        name: btn.dataset.name || '',
        phone: btn.dataset.phone || '',
        email: btn.dataset.email || '',
      });
    });
  }

  function populateCourseSelect() {
    const select = document.getElementById('claudeAddCourse');
    if (!select) return;
    const courses = (typeof allCourses !== 'undefined' && Array.isArray(allCourses)) ? allCourses : [];
    select.innerHTML = '<option value="">과정 선택</option>' + courses.map(c =>
      `<option value="${escapeHtml(c.id)}">${escapeHtml((c.course_types?.name || '') + ' ' + c.name)}${c.start_date ? ' (' + escapeHtml(c.start_date) + ')' : ''}</option>`
    ).join('');
  }

  function populateStatusSelect() {
    const select = document.getElementById('claudeAddStatus');
    if (!select) return;
    const statuses = (typeof APPLICATION_STATUSES !== 'undefined') ? APPLICATION_STATUSES : ['대기', '승인', '중복신청', '신청확정', '수료', '거절', '취소'];
    select.innerHTML = statuses.map(s => `<option value="${s}" ${s === '대기' ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('');
  }

  async function submitManualApplication(e) {
    e.preventDefault();
    const msgEl = document.getElementById('claudeAddMsg');
    msgEl.textContent = '';
    msgEl.className = 'claude-msg';

    const name = document.getElementById('claudeAddName').value.trim();
    const phone = document.getElementById('claudeAddPhone').value.trim();
    const email = document.getElementById('claudeAddEmail').value.trim();
    const company = document.getElementById('claudeAddCompany').value.trim();
    const rrn = document.getElementById('claudeAddRrn').value.trim();
    const courseId = document.getElementById('claudeAddCourse').value;
    const status = document.getElementById('claudeAddStatus').value;
    const employmentCategory = document.getElementById('claudeAddEmploymentCategory').value || null;
    const note = document.getElementById('claudeAddNote').value.trim() || null;

    if (!name || !phone || !rrn || !courseId) {
      msgEl.textContent = '이름, 연락처, 주민등록번호, 과정은 필수입니다.';
      msgEl.classList.add('error');
      return;
    }

    const submitBtn = document.getElementById('claudeAddSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = '등록 중...';

    const { error } = await sb.rpc('claude_admin_add_application', {
      p_name: name,
      p_phone: phone,
      p_email: email || null,
      p_company: company || null,
      p_resident_number: rrn,
      p_course_id: courseId,
      p_status: status,
      p_employment_category: employmentCategory,
      p_note: note,
    });

    submitBtn.disabled = false;
    submitBtn.textContent = '신청자 등록';

    if (error) {
      msgEl.textContent = `등록 실패: ${error.message}`;
      msgEl.classList.add('error');
      return;
    }

    msgEl.textContent = '등록되었습니다. 아래 목록에서 바로 확인할 수 있습니다.';
    msgEl.classList.add('success');
    document.getElementById('claudeAddForm').reset();
    populateStatusSelect();

    if (typeof loadApplications === 'function') {
      loadApplications();
    }
  }

  /* ==================================================================
   * [Claude 추가] 알림 관리 탭 UI 개선 — 내용이 많아 한 화면에 다 몰려있던 걸
   * 하위 탭(문구 편집 / 개별 발송 / 발송 이력 / on-off 설정)으로 나눔.
   * 기존 DOM id(claudeTemplateEditor, claudeManual*, claudeSettingsGrid,
   * claudeLogRows 등)는 전부 그대로 유지 — 로딩/바인딩 로직 변경 없음.
   * ================================================================== */
  function buildSectionMarkup() {
    return `
      <div class="view-header">
        <h2>알림 관리</h2>
        <p>문자/메일 알림 발송 이력을 확인하고, 상황별 발송 여부를 켜고 끌 수 있습니다.</p>
      </div>

      <div class="claude-subtabs" id="claudeSubtabs">
        <button type="button" class="claude-subtab-btn active" data-tab="templates">발송 문구</button>
        <button type="button" class="claude-subtab-btn" data-tab="manual">개별 발송</button>
        <button type="button" class="claude-subtab-btn" data-tab="log">발송 이력</button>
        <button type="button" class="claude-subtab-btn" data-tab="settings">발송 설정</button>
      </div>

      <div class="claude-tab-panel active" data-tab-panel="templates">
        <div class="claude-section">
          <p class="claude-hint">실제로 발송되는 이메일/문자 내용입니다. 아래에서 직접 수정 후 "저장"을 누르면 다음 발송부터 바로 반영됩니다. <span class="var">{{name}}</span>(이름), <span class="var">{{course}}</span>(과정명), <span class="var">{{start_date}}</span>(교육 시작일)은 신청자별로 자동 대체됩니다.</p>
          <div id="claudeTemplateEditor">불러오는 중...</div>
        </div>
      </div>

      <div class="claude-tab-panel" data-tab-panel="manual">
        <div class="claude-section">
          <p class="claude-hint">특정 신청자를 골라 문자/이메일을 바로 보낼 수 있습니다. 자동 발송 on/off 설정과 무관하게 항상 발송됩니다.</p>
          <div class="claude-manual-box">
            <label>수신자 검색 (이름/연락처/이메일)</label>
            <div class="claude-manual-search-wrap">
              <input type="text" id="claudeManualSearch" placeholder="이름, 연락처 일부 입력">
              <div id="claudeManualResults" class="claude-manual-results" style="display:none;"></div>
            </div>
            <div id="claudeManualChips" class="claude-chip-list"></div>

            <div class="claude-checks" style="margin-top:14px;">
              <label><input type="checkbox" id="claudeManualChEmail" checked> 이메일</label>
              <label><input type="checkbox" id="claudeManualChSms" checked> 문자</label>
            </div>
            <!-- ===== [Claude 추가] 협약서 PDF 첨부 시작 ===== -->
            <div class="claude-checks" style="margin-top:6px;">
              <label><input type="checkbox" id="claudeManualAttachAgreement"> 협약서 양식 첨부 (이메일에만 첨부됩니다)</label>
            </div>
            <!-- ===== [Claude 추가] 끝 ===== -->

            <div style="margin-top:6px;">
              <span class="claude-hint" style="margin:0 0 6px;display:block;">빠른 채우기:</span>
              <button type="button" class="claude-resend-btn claude-manual-quickfill" data-event="application_received" data-channel="email">신청접수 문구</button>
              <button type="button" class="claude-resend-btn claude-manual-quickfill" data-event="status_change" data-channel="email" data-detail="승인">승인 문구</button>
              <button type="button" class="claude-resend-btn claude-manual-quickfill" data-event="course_reminder" data-channel="email">일정임박 문구</button>
              <!-- ===== [Claude 추가] 나만의 문구 템플릿도 빠른 채우기에 자동으로 추가됨 ===== -->
              <span id="claudeCustomQuickfillList"></span>
              <!-- ===== [Claude 추가] 끝 ===== -->
            </div>

            <div style="margin-top:12px;"><label>제목 (이메일에만 적용)</label><input type="text" id="claudeManualSubject" placeholder="예: [교육 안내] 참석 확인 요청"></div>
            <div style="margin-top:12px;"><label>내용</label><textarea id="claudeManualBody" rows="4" placeholder="{{name}}님, ... 처럼 이름을 자동으로 넣을 수 있습니다."></textarea></div>

            <div style="margin-top:14px;">
              <button type="button" id="claudeManualSendBtn" class="submit" style="width:auto;padding:10px 22px;">발송하기</button>
            </div>
            <div id="claudeManualMsg" class="claude-msg"></div>
          </div>
        </div>
        <div class="claude-section">
          <p class="claude-hint">신청자를 1명씩 직접 등록하는 기능은 <strong>신청 현황</strong> 화면으로 이동했습니다. 신청 현황 상단의 "+ 신청자 수동 등록"을 열어주세요.</p>
        </div>
      </div>

      <div class="claude-tab-panel" data-tab-panel="log">
        <div class="claude-section">
          <div class="table-shell simple-table">
            <table>
              <thead><tr><th>시간</th><th>상황</th><th>채널</th><th>수신자</th><th>상태</th><th>재발송</th></tr></thead>
              <tbody id="claudeLogRows"><tr><td colspan="6" class="empty-row">불러오는 중...</td></tr></tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="claude-tab-panel" data-tab-panel="settings">
        <div class="claude-section">
          <p class="claude-hint">상황별로 자동 발송을 켜고 끌 수 있습니다. 꺼두면 발송 이력에 "꺼짐"으로만 기록되고 실제 발송은 되지 않습니다.</p>
          <div class="claude-toggle-grid" id="claudeSettingsGrid">불러오는 중...</div>
        </div>
      </div>
    `;
  }

  function bindNotifySubTabs() {
    const bar = document.getElementById('claudeSubtabs');
    if (!bar || bar.dataset.claudeBound) return;
    bar.dataset.claudeBound = 'true';
    bar.querySelectorAll('.claude-subtab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        bar.querySelectorAll('.claude-subtab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('#view-claude-notify .claude-tab-panel').forEach(panel => {
          panel.classList.toggle('active', panel.dataset.tabPanel === btn.dataset.tab);
        });
      });
    });
  }

  /* ==================================================================
   * [Claude 추가] 신청자 수동 등록 폼. 예전엔 "신청 현황" 화면 안에 접이식(<details>)
   * 패널로 박혀 있었는데, 오른쪽 아래 플로팅(+) 버튼을 누르면 노션처럼
   * 오른쪽에서 슬라이드로 열리는 사이드 패널(드로어)로 바뀜.
   * (드로어/플로팅 버튼 마크업과 여닫는 로직은 claudeInjectApplicantDrawers() 참고)
   * ================================================================== */
  function buildApplicantAddDrawer() {
    return `
      <aside class="claude-drawer" id="claudeAddDrawer">
        <div class="claude-drawer-head">
          <h3>+ 신청자 수동 등록 (1명씩)</h3>
          <button type="button" class="claude-drawer-close" aria-label="닫기">×</button>
        </div>
        <div class="claude-drawer-body">
          <p class="claude-hint">일반 신청 페이지와 동일하게 주민등록번호 검증을 거쳐 등록됩니다. 초기 상태는 직접 선택할 수 있습니다. (엑셀/CSV 일괄 등록은 별도 논의 예정)</p>
          <form id="claudeAddForm">
            <div class="claude-form-grid">
              <div><label>이름 *</label><input type="text" id="claudeAddName" required></div>
              <div><label>연락처 *</label><input type="tel" id="claudeAddPhone" required></div>
              <div><label>이메일</label><input type="email" id="claudeAddEmail"></div>
              <div><label>회사명</label><input type="text" id="claudeAddCompany"></div>
              <div><label>주민등록번호 (13자리) *</label><input type="text" id="claudeAddRrn" placeholder="000000-0000000" required></div>
              <div><label>신청 과정 *</label><select id="claudeAddCourse" required></select></div>
              <div><label>초기 상태 *</label><select id="claudeAddStatus" required></select></div>
              <div><label>고용 구분</label>
                <select id="claudeAddEmploymentCategory">
                  <option value="">선택 안 함</option>
                  <option value="대규모">대규모</option>
                  <option value="우선지원기업">우선지원기업</option>
                  <option value="고용보험미가입">고용보험미가입</option>
                </select>
              </div>
            </div>
            <div style="margin-top:12px;"><label style="display:block;font-size:12px;font-weight:800;margin-bottom:6px;">메모</label><textarea id="claudeAddNote" rows="2" style="width:100%;padding:10px 12px;border:1.5px solid var(--line);border-radius:6px;font-family:inherit;font-size:13.5px;box-sizing:border-box;"></textarea></div>
            <div style="margin-top:14px;">
              <button type="submit" id="claudeAddSubmitBtn" class="submit" style="width:auto;padding:10px 22px;">신청자 등록</button>
            </div>
            <div id="claudeAddMsg" class="claude-msg"></div>
          </form>
        </div>
      </aside>
    `;
  }

  function buildNavAndSection() {
    const nav = document.querySelector('.nav');
    const main = document.querySelector('.admin-main');
    const footer = document.querySelector('.sidebar-footer');
    if (!nav || !main || document.getElementById('view-claude-notify')) return;

    /* [Claude 추가] 요청: "알림관리 번호 달지 말고 맨 밑으로 내려서 이메일 위에 바로
       붙어있게" — 번호 매기는 목록(.nav)에서 빼서 사이드바 하단(#whoAmI 이메일 표시
       바로 위)에 번호 없이 붙임. */
    const navBtn = document.createElement('button');
    navBtn.className = 'nav-item claude-footer-nav-item';
    navBtn.type = 'button';
    navBtn.dataset.view = 'claude-notify';
    navBtn.textContent = '알림 관리';
    if (footer) footer.insertBefore(navBtn, footer.firstChild);
    else nav.appendChild(navBtn); // 혹시 sidebar-footer가 없으면 예전처럼 nav에라도 붙임

    const section = document.createElement('section');
    section.className = 'view';
    section.id = 'view-claude-notify';
    section.innerHTML = buildSectionMarkup();
    main.appendChild(section);
    bindManualSendUI();
    bindNotifySubTabs();

    navBtn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
      document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
      navBtn.classList.add('active');
      section.classList.add('active');
      onShowNotifyPanel();
    });

    claudeInjectApplicantDrawers();
  }

  function onShowNotifyPanel() {
    loadNotificationSettings();
    loadNotificationLog();
    loadTemplates();
    notifyLoaded = true;
  }

