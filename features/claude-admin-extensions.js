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
   * [Claude 추가] 발송 문구 미리보기
   * "알림관리에서 어떤 내용의 문자를 보내는지 직관적이지 않다"는 피드백에 따라,
   * 실제 Edge Function(notify-application/notify-status-change/notify-course-reminder)에
   * 적용된 문구를 그대로 화면에서 확인할 수 있도록 구성. 문구를 바꾸려면 Supabase의
   * 해당 Edge Function 코드를 수정해야 하며, 이 화면은 "현재 발송되는 내용"을 보여주는
   * 용도입니다.
   * ================================================================== */
  const STATUS_SMS_TEMPLATES = [
    { status: '승인', subject: '교육 신청이 승인되었습니다', body: '신청이 승인되었습니다. 추후 수강 확정 안내를 기다려주세요.' },
    { status: '신청확정', subject: '수강이 확정되었습니다', body: '수강이 확정되었습니다. 교육 일정에 맞춰 참석해주세요.' },
    { status: '수료', subject: '교육을 수료하셨습니다', body: '교육을 수료하셨습니다. 수고하셨습니다.' },
    { status: '거절', subject: '교육 신청 결과 안내', body: '안내드립니다. 이번 신청은 반영되지 못했습니다.' },
    { status: '취소', subject: '교육 신청이 취소되었습니다', body: '신청이 취소 처리되었습니다.' },
    { status: '중복신청', subject: '중복 신청 안내', body: '중복 신청으로 확인되어 처리되었습니다.' },
  ];

  function buildPreviewMarkup() {
    const applicationEmail = `
      <div class="claude-preview-row">
        <span class="ch">이메일</span>
        <div class="subject">[교육 신청 접수] <span class="var">과정명</span> 신청이 접수되었습니다</div>
        <div class="body"><span class="var">이름</span>님, 안녕하세요.
<span class="var">과정명</span> 과정 신청이 정상적으로 접수되었습니다.
교육 시작일: <span class="var">교육 시작일</span>
담당자 확인 후 신청 결과를 다시 안내드립니다.</div>
      </div>`;
    const applicationSms = `
      <div class="claude-preview-row">
        <span class="ch sms">문자</span>
        <div class="body">[교육신청접수] <span class="var">이름</span>님, <span class="var">과정명</span> 신청이 접수되었습니다. 결과는 별도 안내드립니다.</div>
      </div>`;

    const statusRows = STATUS_SMS_TEMPLATES.map(t => `
      <div class="claude-preview-row">
        <span class="ch">이메일</span>
        <div class="subject">[<span class="var">과정명</span>] ${escapeHtml(t.subject)}</div>
        <div class="body"><span class="var">이름</span>님, 안녕하세요.
<span class="var">과정명</span> 과정: ${escapeHtml(t.body)}</div>
      </div>
      <div class="claude-preview-row">
        <span class="ch sms">문자</span>
        <div class="body">[<span class="var">과정명</span>] <span class="var">이름</span>님, ${escapeHtml(t.body)}</div>
      </div>
      <div style="font-size:11px;color:var(--ink-soft);font-weight:800;margin:2px 0 6px;">▲ 상태가 "${escapeHtml(t.status)}"(으)로 바뀔 때</div>
    `).join('');

    const reminderEmail = `
      <div class="claude-preview-row">
        <span class="ch">이메일</span>
        <div class="subject">[교육 일정 안내] <span class="var">과정명</span> 시작이 임박했습니다</div>
        <div class="body"><span class="var">이름</span>님, 안녕하세요.
<span class="var">과정명</span> 과정이 <span class="var">시작일</span>에 시작됩니다. 참석 부탁드립니다.</div>
      </div>`;
    const reminderSms = `
      <div class="claude-preview-row">
        <span class="ch sms">문자</span>
        <div class="body">[교육일정안내] <span class="var">이름</span>님, <span class="var">과정명</span> 과정이 <span class="var">시작일</span>에 시작됩니다.</div>
      </div>`;

    return `
      <details class="claude-preview-group">
        <summary>① 신청 접수 시 발송되는 문구</summary>
        <div class="claude-preview-body">${applicationEmail}${applicationSms}</div>
      </details>
      <details class="claude-preview-group">
        <summary>② 상태 변경 시 발송되는 문구 (상태별 6종)</summary>
        <div class="claude-preview-body">${statusRows}
          <div style="font-size:11px;color:var(--ink-soft);">※ "대기" 상태로 되돌아가는 경우 등, 위 6개 상태에 해당하지 않으면 알림은 발송되지 않습니다.</div>
        </div>
      </details>
      <details class="claude-preview-group">
        <summary>③ 교육 일정 임박(전날) 시 발송되는 문구</summary>
        <div class="claude-preview-body">${reminderEmail}${reminderSms}
          <div style="font-size:11px;color:var(--ink-soft);">※ 상태가 "신청확정"인 신청자에게만, 교육 시작일 하루 전 오전 9시(KST)에 자동 발송됩니다.</div>
        </div>
      </details>
    `;
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
        <h3>발송 문구 미리보기</h3>
        <p class="claude-hint">실제로 발송되는 이메일/문자 내용입니다. <span class="var" style="background:#FFF3E8;color:#A35A18;border-radius:3px;padding:0 3px;">색이 있는 부분</span>은 신청자별로 자동으로 채워지는 값입니다.</p>
        ${buildPreviewMarkup()}
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

  function claudeInitColumnResize() {
    claudeLoadColumnWidths();
    const head = document.getElementById('appHead');
    const body = document.getElementById('appRows');
    if (!head) return;
    claudeRefreshColumnResize();
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
