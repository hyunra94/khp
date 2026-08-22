/* ==================================================================
 * [Claude 추가] 알림 관리 화면 + 신청자 수동 등록
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

    msgEl.textContent = '등록되었습니다. 신청 현황에서 확인할 수 있습니다.';
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
        <p>문자/메일 알림 발송 이력을 확인하고, 상황별 발송 여부를 켜고 끌 수 있습니다. 신청자를 1명씩 수동으로 등록할 수도 있습니다.</p>
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
        <h3>신청자 수동 등록 (1명씩)</h3>
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
    `;
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

    navBtn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
      document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
      navBtn.classList.add('active');
      section.classList.add('active');
      onShowNotifyPanel();
    });

    document.getElementById('claudeAddForm').addEventListener('submit', submitManualApplication);
  }

  function onShowNotifyPanel() {
    populateCourseSelect();
    populateStatusSelect();
    loadNotificationSettings();
    loadNotificationLog();
    notifyLoaded = true;
  }

  function init() {
    injectStyle();
    buildNavAndSection();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
