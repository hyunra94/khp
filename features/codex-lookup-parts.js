(function () {
  'use strict';
  let panel, active, busy = false, dialog;
  function find(select) {
    const app = allApps.find(item => item.id === select.dataset.id);
    const course = allCourses.find(item => item.id === (app?.course_id || app?.courses?.id)) || app?.courses;
    const type = allCourseTypes.find(item => item.id === course?.course_type_id) || course?.course_types;
    return type?.has_parts ? {app, type, select} : null;
  }
  function close() {
    if (busy) return;
    dialog?.close(); dialog?.remove(); dialog = null;
    document.body.classList.remove('codex-parts-modal-open');
    panel = null; active = null;
  }
  function open(select) {
    const target = find(select);
    if (!target) return false;
    if (busy) return true;
    close(); active = target;
    select.value = target.app.status;
    panel = document.createElement('form');
    panel.className = 'codex-lookup-parts';
    panel.innerHTML = '<strong>A/B 수료 확인</strong><label><input type="checkbox" name="a"><span></span></label><label><input type="checkbox" name="b"><span></span></label><p role="status"></p><footer><button type="button">취소</button><button type="submit">저장</button></footer>';
    ['a','b'].forEach(part => {
      const input = panel.elements[part];
      input.checked = Boolean(target.app[`part_${part}_completed`]);
      input.nextElementSibling.textContent = `${part.toUpperCase()} · ${target.type[`certificate_part_${part}_name`] || target.type[`part_${part}_label`] || '수료'}`;
    });
    const restoreFocus = () => (select.hidden ? select.nextElementSibling : select)?.focus();
    panel.querySelector('[type="button"]').onclick = () => { close(); restoreFocus(); };
    panel.addEventListener('submit', save);
    panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); close(); restoreFocus(); } });
    dialog = document.createElement('dialog');
    dialog.className = 'codex-parts-dialog';
    dialog.setAttribute('aria-label','수료 설정');
    dialog.append(panel); document.body.append(dialog);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    const mail = document.createElement('label');
    mail.innerHTML = '<input type="checkbox" name="sendMail">수료 안내 메일 발송';
    panel.querySelector('footer').before(mail);
    const state = document.createElement('select');
    state.name = 'status'; state.setAttribute('aria-label','신청 상태');
    APPLICATION_STATUSES.forEach(value => state.add(new Option(value,value)));
    state.value = '수료'; panel.querySelector('strong').after(state);
    mail.className = 'codex-parts-mail';
    const context = document.createElement('div');context.className='codex-parts-context';
    context.textContent = `${target.app.trainees?.name || ''} · ${target.type.name || ''}`;
    panel.querySelector('strong').after(context);
    state.className='status-select status-수료';
    dialog.showModal(); document.body.classList.add('codex-parts-modal-open');
    panel.elements.a.focus();
    return true;
  }
  async function save(event) {
    event.preventDefault();
    if (busy || !active) return;
    const {app} = active, form = panel;
    const status = form.elements.status.value;
    const sendMail = form.elements.sendMail.checked && status === '수료';
    const payload = {status, cancelled_at:status === '취소' ? new Date().toISOString() : null, part_a_completed:form.elements.a.checked, part_b_completed:form.elements.b.checked};
    if (status === '수료' && !payload.part_a_completed && !payload.part_b_completed) {
      form.querySelector('p').textContent = '수료한 과목을 하나 이상 선택해주세요.'; return;
    }
    busy = true;
    form.querySelectorAll('button,input,select').forEach(el => el.disabled = true);
    try {
      const {data,error} = await sb.from('applications').update(payload).eq('id',app.id).select('id').single();
      if (error) throw error;
      if (!data) throw new Error('저장 권한을 확인해주세요.');
      const changed = app.status !== status;
      Object.assign(app,payload);
      busy = false; close();
      if (sendMail) await window.CodexCompletionMail.send(app.id);
      else if (changed && status !== '수료') sb.functions.invoke('notify-status-change',{body:{applicationId:app.id}}).catch(()=>{});
      renderMetrics(); renderApps(); renderCourseLookup();
      if (typeof claudeLoadCompletions === 'function') await claudeLoadCompletions();
    } catch (error) {
      form.querySelector('p').textContent = `저장 실패: ${error.message}`;
    } finally {
      busy = false; form.querySelectorAll('button,input,select').forEach(el => el.disabled = false);
    }
  }
  function bind(select) {
    if (select.dataset.codexPartsBound) return;
    select.dataset.codexPartsBound = 'true';
    if (select.value === '수료' && find(select)) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'status-select status-수료';
      button.classList.add('codex-completion-status');
      button.textContent = '수료'; button.setAttribute('aria-label','수료: A/B 수료 수정');
      button.onclick = () => open(select);
      select.hidden = true; select.style.display = 'none'; select.after(button);
    }
    select.addEventListener('pointerdown', event => {
      if (select.value === '수료' && find(select)) { event.preventDefault(); open(select); }
    });
    select.addEventListener('keydown', event => {
      if (select.value === '수료' && ['Enter',' '].includes(event.key) && find(select)) { event.preventDefault(); open(select); }
    });
  }
  const style = document.createElement('style');
  style.textContent = '.codex-parts-dialog{width:420px;max-width:calc(100vw - 32px);max-height:calc(100dvh - 32px);box-sizing:border-box;padding:0;border:1px solid #d4dce0;border-radius:8px;box-shadow:0 20px 60px #0003;overflow:auto;overscroll-behavior:contain}.codex-parts-dialog::backdrop{background:#15252f66}.codex-lookup-parts{padding:24px;background:#fff;color:#24313a}.codex-lookup-parts>strong{font-size:20px;display:block}.codex-parts-context{color:#65727b;font-size:13px;margin:6px 0 18px}.codex-lookup-parts>select{width:100%;box-sizing:border-box;margin-bottom:8px}.codex-lookup-parts label{display:flex;gap:10px;align-items:start;padding:12px;margin:10px 0;border:1px solid #dce3e6;border-radius:5px;overflow-wrap:anywhere;font-size:14px}.codex-lookup-parts label:has(input:checked){border-color:#7ea99b;background:#eff7f3}.codex-lookup-parts input{width:17px;height:17px;flex:0 0 17px;margin:2px 0 0;accent-color:#286856}.codex-lookup-parts .codex-parts-mail{border:0;border-top:1px solid #e0e5e8;border-radius:0;padding:16px 0 4px;margin-top:20px;background:none}.codex-lookup-parts footer{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}.codex-lookup-parts footer button{min-height:40px;padding:8px 18px;border-radius:4px}.codex-lookup-parts footer button[type=submit]{background:#286856;color:#fff;border-color:#286856}.codex-lookup-parts p{color:#a32323;font-size:12px}.codex-lookup-parts p:empty{display:none}body.codex-parts-modal-open{overflow:hidden}button.codex-completion-status{font:inherit;font-size:12px;font-weight:700;border:1px solid #C9BDF0;border-radius:6px;padding:7px 8px;min-height:34px;box-sizing:border-box;box-shadow:none;width:100%;text-align:left;cursor:pointer}';
  document.head.append(style);
  document.addEventListener('pointerdown', event => { if (panel && !panel.contains(event.target) && event.target !== active?.select) close(); });
  window.CodexLookupParts = {open,bind};
})();
