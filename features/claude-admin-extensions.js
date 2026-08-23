/* ==================================================================
 * [Claude 추가] 알림 관리 화면 + 신청자 수동 등록 + 신청현황 UX 보완
 * admin.html의 전역 변수(sb, allCourses, APPLICATION_STATUSES, loadApplications 등)를
 * 그대로 사용합니다. 이 파일은 admin.html의 기존 함수/로직을 수정하지 않습니다.
 * ================================================================== */
(function () {
  const EVENT_LABELS = {
    application_received: '신청 접수',
    status_change: '상태 변경',
    course_reminder: '일정 임박',
  };
  const CHANNEL_LABELS = { email: '이메일', sms: '문자' };
  const STATUS_LABELS = { sent: '발송됨', failed: '실패', skipped: '꺼짐' };

  let notifyLoaded = false;
  let settingsCache = [];

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatDateTime(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function injectStyle() {
    if (document.getElementById('claudeExtStyle')) return;
    const style = document.createElement('style');
    style.id = 'claudeExtStyle';
    style.textContent = `
      .claude-section{margin-bottom:28px;}
      .claude-section h3{font-size:14px;font-weight:900;margin:0 0 10px;color:var(--ink);}
      .claude-section p.claude-hint{font-size:12px;color:var(--ink-soft);margin:-4px 0 12px;}
      .claude-toggle-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;}
      .claude-toggle-card{border:1px solid var(--line);border-radius:var(--radius,8px);padding:12px 14px;display:flex;align-items:center;justify-content:space-between;background:var(--surface,#fff);}
      .claude-toggle-card .label{font-size:13px;font-weight:800;color:var(--ink);}
      .claude-toggle-card .sub{font-size:11px;color:var(--ink-soft);margin-top:2px;}
      .claude-switch{position:relative;display:inline-block;width:38px;height:22px;flex:0 0 auto;}
      .claude-switch input{opacity:0;width:0;height:0;}
      .claude-switch .slider{position:absolute;inset:0;background:#CBD3DB;border-radius:22px;cursor:pointer;transition:.15s;}
      .claude-switch .slider:before{content:"";position:absolute;width:16px;height:16px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.15s;}
      .claude-switch input:checked + .slider{background:var(--accent,#176B87);}
      .claude-switch input:checked + .slider:before{transform:translateX(16px);}
      .claude-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 16px;}
      .claude-form-grid label{display:block;font-size:12px;font-weight:800;color:var(--ink);margin-bottom:6px;}
      .claude-form-grid input, .claude-form-grid select, .claude-form-grid textarea{
        width:100%;padding:10px 12px;border:1.5px solid var(--line);border-radius:6px;font-family:inherit;font-size:13.5px;box-sizing:border-box;
      }
      .claude-checks{display:flex;flex-wrap:wrap;gap:12px;margin:10px 0;}
      .claude-checks label{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;color:var(--ink-soft);}
      .claude-msg{font-size:12.5px;margin-top:10px;}
      .claude-msg.error{color:var(--danger,#C43D3D);}
      .claude-msg.success{color:var(--green,#1F7A55);}
      .claude-log-badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:800;}
      .claude-log-badge.sent{background:#DDEDEA;color:#14624B;}
      .claude-log-badge.failed{background:#F7DEDE;color:#A33C3C;}
      .claude-log-badge.skipped{background:#EDEDED;color:#888;}
      .claude-resend-btn{font-size:11px;padding:4px 8px;border:1px solid var(--line);border-radius:6px;background:#fff;cursor:pointer;}

      /* 발송 문구 편집 */
      .claude-tpl-row{border:1px solid #EDF1F5;border-radius:7px;padding:10px 12px;background:#FBFCFE;margin-bottom:8px;}
      .claude-tpl-row label{display:block;font-size:11px;font-weight:800;color:var(--ink-soft);margin:6px 0 4px;}
      .claude-tpl-row input, .claude-tpl-row textarea{
        width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:6px;font-family:inherit;font-size:12.5px;box-sizing:border-box;background:#fff;
      }
      .claude-tpl-row-foot{display:flex;align-items:center;gap:10px;margin-top:8px;flex-wrap:wrap;}
      .claude-tpl-save-btn{font-size:11px;padding:5px 12px;border:1px solid var(--accent-dark,#0F465A);border-radius:6px;background:var(--accent-dark,#0F465A);color:#fff;font-weight:800;cursor:pointer;}
      .claude-tpl-save-btn:disabled{opacity:.6;cursor:default;}
      .claude-tpl-msg{font-size:11.5px;font-weight:800;}
      .claude-tpl-msg.success{color:var(--green,#1F7A55);}
      .claude-tpl-msg.error{color:var(--danger,#C43D3D);}

      /* 개별(수동) 발송 */
      .claude-manual-box label{display:block;font-size:12px;font-weight:800;color:var(--ink);margin-bottom:6px;}
      .claude-manual-box input[type=text], .claude-manual-box textarea{
        width:100%;padding:10px 12px;border:1.5px solid var(--line);border-radius:6px;font-family:inherit;font-size:13.5px;box-sizing:border-box;
      }
      .claude-manual-search-wrap{position:relative;}
      .claude-manual-results{
        position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:20;background:#fff;border:1px solid var(--line);
        border-radius:8px;box-shadow:0 14px 34px rgba(21,35,52,0.16);max-height:220px;overflow-y:auto;
      }
      .claude-manual-result{padding:9px 12px;cursor:pointer;border-bottom:1px solid #F1F4F8;display:flex;flex-direction:column;gap:2px;}
      .claude-manual-result:last-child{border-bottom:none;}
      .claude-manual-result:hover{background:var(--accent-soft,#E7F4F7);}
      .claude-manual-result b{font-size:13px;color:var(--ink);}
      .claude-manual-result span{font-size:11.5px;color:var(--ink-soft);}
      .claude-chip-list{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;min-height:20px;}
      .claude-chip{
        display:inline-flex;align-items:center;gap:6px;padding:5px 6px 5px 10px;border-radius:20px;
        background:var(--accent-soft,#E7F4F7);color:var(--accent-dark,#0F465A);font-size:12px;font-weight:800;
      }
      .claude-chip button{border:none;background:transparent;color:inherit;cursor:pointer;font-size:14px;line-height:1;padding:2px;}

      /* 발송 문구 미리보기 */
      .claude-preview-group{border:1px solid var(--line);border-radius:8px;margin-bottom:12px;overflow:hidden;background:#fff;}
      .claude-preview-group summary{list-style:none;cursor:pointer;padding:12px 14px;font-size:13px;font-weight:800;color:var(--ink);background:#F8FAFC;display:flex;align-items:center;justify-content:space-between;}
      .claude-preview-group summary::-webkit-details-marker{display:none;}
      .claude-preview-group summary::after{content:"펼치기";font-size:11px;font-weight:700;color:var(--ink-soft);}
      .claude-preview-group[open] summary::after{content:"접기";}
      .claude-preview-body{padding:12px 14px;display:grid;gap:10px;}
      .claude-preview-row{border:1px solid #EDF1F5;border-radius:7px;padding:10px 12px;background:#FBFCFE;}
      .claude-preview-row .ch{display:inline-block;font-size:10.5px;font-weight:900;color:#fff;background:var(--accent-dark,#0F465A);border-radius:4px;padding:2px 7px;margin-bottom:6px;}
      .claude-preview-row .ch.sms{background:#4E3C8A;}
      .claude-preview-row .subject{font-size:12.5px;font-weight:800;color:var(--ink);margin-bottom:4px;}
      .claude-preview-row .body{font-size:12px;color:var(--ink-soft);line-height:1.6;white-space:pre-line;}
      .claude-preview-row .var{background:#FFF3E8;color:#A35A18;border-radius:3px;padding:0 3px;font-weight:800;}

      /* 신청자 수동 등록 (신청현황 화면에 삽입) */
      .claude-add-details{border:1px solid var(--line);border-radius:8px;background:#fff;margin-bottom:14px;}
      .claude-add-details summary{list-style:none;cursor:pointer;padding:12px 16px;font-size:13px;font-weight:900;color:var(--accent-dark,#0F465A);display:flex;align-items:center;gap:8px;}
      .claude-add-details summary::-webkit-details-marker{display:none;}
      .claude-add-details summary::before{content:"+";font-size:15px;font-weight:900;}
      .claude-add-details[open] summary::before{content:"−";}
      .claude-add-body{padding:4px 16px 18px;border-top:1px solid #EDF1F5;}

      .application-table table{table-layout:fixed;}
      .application-table th[data-col], .application-table td[data-col]{
        overflow:hidden;text-overflow:ellipsis;white-space:nowrap;position:relative;
      }
      /* [Claude 추가] 신청과정/관리 칸은 팝업(호버 상세, ⋯메뉴)이 밖으로 나와야 하므로 클리핑 제외 */
      .application-table th[data-col="course"], .application-table td[data-col="course"],
      .application-table th[data-col="actions"], .application-table td[data-col="actions"]{
        overflow:visible;white-space:normal;
      }
      .application-table th .claude-col-resizer{position:absolute;top:0;right:0;width:6px;height:100%;cursor:col-resize;user-select:none;z-index:5;}
      .application-table th .claude-col-resizer:hover, .application-table th .claude-col-resizer.dragging{background:rgba(23,107,135,0.35);}
    `;
    document.head.appendChild(style);
  }

  async function loadNotificationSettings() {
    const { data, error } = await sb.from('notification_settings').select('*');
    if (error) {
      console.warn('[Claude] 알림 설정 로드 실패:', error);
      return;
    }
    settingsCache = data || [];
    renderSettings();
  }

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

  async function loadTemplates() {
    const { data, error } = await sb.from('notification_templates').select('*');
    if (error) {
      console.warn('[Claude] 알림 문구 로드 실패:', error);
      return;
    }
    templatesCache = data || [];
    renderTemplateEditor();
  }

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
    `;

    el.querySelectorAll('.claude-tpl-save-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
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
      });
    });
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

    if (recipients.length === 0) { msgEl.textContent = '수신자를 먼저 선택해주세요.'; msgEl.classList.add('error'); return; }
    if (channels.length === 0) { msgEl.textContent = '발송 채널(이메일/문자)을 선택해주세요.'; msgEl.classList.add('error'); return; }
    if (!body.trim()) { msgEl.textContent = '내용을 입력해주세요.'; msgEl.classList.add('error'); return; }

    const sendBtn = document.getElementById('claudeManualSendBtn');
    sendBtn.disabled = true;
    sendBtn.textContent = `발송 중... (0/${recipients.length})`;

    let successCount = 0;
    let failCount = 0;
    for (let i = 0; i < recipients.length; i++) {
      const t = recipients[i];
      try {
        const { data, error } = await sb.functions.invoke('notify-manual', {
          body: { traineeId: t.id, channels, subject, body },
        });
        if (error) { failCount++; } else { successCount++; }
      } catch (e) {
        failCount++;
      }
      sendBtn.textContent = `발송 중... (${i + 1}/${recipients.length})`;
    }
    sendBtn.disabled = false;
    sendBtn.textContent = '발송하기';

    msgEl.textContent = `발송 완료: 성공 ${successCount}건, 실패 ${failCount}건. 아래 발송 이력에서 확인할 수 있습니다.`;
    msgEl.classList.add(failCount ? 'error' : 'success');
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

  function buildSectionMarkup() {
    return `
      <div class="view-header">
        <h2>알림 관리</h2>
        <p>문자/메일 알림 발송 이력을 확인하고, 상황별 발송 여부를 켜고 끌 수 있습니다.</p>
      </div>

      <div class="claude-section">
        <h3>발송 문구 편집</h3>
        <p class="claude-hint">실제로 발송되는 이메일/문자 내용입니다. 아래에서 직접 수정 후 "저장"을 누르면 다음 발송부터 바로 반영됩니다. <span class="var">{{name}}</span>(이름), <span class="var">{{course}}</span>(과정명), <span class="var">{{start_date}}</span>(교육 시작일)은 신청자별로 자동 대체됩니다.</p>
        <div id="claudeTemplateEditor">불러오는 중...</div>
      </div>

      <div class="claude-section">
        <h3>개별 발송</h3>
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

          <div style="margin-top:6px;">
            <span class="claude-hint" style="margin:0 0 6px;display:block;">빠른 채우기:</span>
            <button type="button" class="claude-resend-btn claude-manual-quickfill" data-event="application_received" data-channel="email">신청접수 문구</button>
            <button type="button" class="claude-resend-btn claude-manual-quickfill" data-event="status_change" data-channel="email" data-detail="승인">승인 문구</button>
            <button type="button" class="claude-resend-btn claude-manual-quickfill" data-event="course_reminder" data-channel="email">일정임박 문구</button>
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
        <h3>발송 on/off</h3>
        <div class="claude-toggle-grid" id="claudeSettingsGrid">불러오는 중...</div>
      </div>

      <div class="claude-section">
        <h3>발송 이력 (최근 100건)</h3>
        <div class="table-shell simple-table">
          <table>
            <thead><tr><th>시간</th><th>상황</th><th>채널</th><th>수신자</th><th>상태</th><th>재발송</th></tr></thead>
            <tbody id="claudeLogRows"><tr><td colspan="6" class="empty-row">불러오는 중...</td></tr></tbody>
          </table>
        </div>
      </div>

      <div class="claude-section">
        <h3>신청자 수동 등록</h3>
        <p class="claude-hint">신청자를 1명씩 직접 등록하는 기능은 <strong>신청 현황</strong> 화면으로 이동했습니다. 신청 현황 상단의 "+ 신청자 수동 등록"을 열어주세요.</p>
      </div>
    `;
  }

  /* ==================================================================
   * [Claude 추가] 신청자 수동 등록 패널을 "신청 현황" 화면으로 이동
   * (기존에는 "알림 관리" 탭에 있었으나, 신청 현황에서 바로 등록/확인하는 게
   * 더 자연스럽다는 피드백에 따라 이동함. admin.html의 #view-applications
   * 섹션 안, 필터 툴바 아래 / 테이블 위에 <details> 접이식 패널로 삽입.)
   * ================================================================== */
  function buildApplicantAddPanel() {
    return `
      <details class="claude-add-details" id="claudeAddDetails">
        <summary>+ 신청자 수동 등록 (1명씩)</summary>
        <div class="claude-add-body">
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
      </details>
    `;
  }

  function injectApplicantAddPanel() {
    const view = document.getElementById('view-applications');
    if (!view || document.getElementById('claudeAddDetails')) return;
    const anchor = view.querySelector('.table-shell.application-table') || view.querySelector('.table-shell');
    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildApplicantAddPanel();
    const details = wrapper.firstElementChild;
    if (anchor) {
      view.insertBefore(details, anchor);
    } else {
      view.appendChild(details);
    }
    populateCourseSelect();
    populateStatusSelect();
    document.getElementById('claudeAddForm').addEventListener('submit', submitManualApplication);
  }

  function buildNavAndSection() {
    const nav = document.querySelector('.nav');
    const main = document.querySelector('.admin-main');
    if (!nav || !main || document.getElementById('view-claude-notify')) return;

    const navBtn = document.createElement('button');
    navBtn.className = 'nav-item';
    navBtn.type = 'button';
    navBtn.dataset.view = 'claude-notify';
    navBtn.innerHTML = '<span>06</span>알림 관리';
    nav.appendChild(navBtn);

    const section = document.createElement('section');
    section.className = 'view';
    section.id = 'view-claude-notify';
    section.innerHTML = buildSectionMarkup();
    main.appendChild(section);
    bindManualSendUI();

    navBtn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
      document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
      navBtn.classList.add('active');
      section.classList.add('active');
      onShowNotifyPanel();
    });

    injectApplicantAddPanel();

    /* 신청 현황 탭을 열 때마다 과정/상태 목록을 최신 상태로 갱신 */
    const appsNavBtn = document.querySelector('.nav-item[data-view="applications"]');
    if (appsNavBtn) {
      appsNavBtn.addEventListener('click', () => {
        populateCourseSelect();
        populateStatusSelect();
      });
    }
  }

  function onShowNotifyPanel() {
    loadNotificationSettings();
    loadNotificationLog();
    loadTemplates();
    notifyLoaded = true;
  }

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

  function claudeInitColumnResize() {
    claudeLoadColumnWidths();
    const head = document.getElementById('appHead');
    const body = document.getElementById('appRows');
    if (!head) return;
    claudeRefreshColumnResize();
    claudeInjectColumnResetButton();
    if (!claudeResizeObserverBound) {
      const observer = new MutationObserver(() => {
        requestAnimationFrame(claudeRefreshColumnResize);
      });
      observer.observe(head, { childList: true, subtree: true });
      if (body) observer.observe(body, { childList: true, subtree: true });
      claudeResizeObserverBound = true;
    }
  }

  function init() {
    injectStyle();
    buildNavAndSection();
    claudeInitColumnResize();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
