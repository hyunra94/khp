(function () {
  'use strict';
  let panel, active, busy = false;
  function find(select) {
    const app = allApps.find(item => item.id === select.dataset.id);
    const course = allCourses.find(item => item.id === app?.course_id) || app?.courses;
    const type = allCourseTypes.find(item => item.id === course?.course_type_id) || course?.course_types;
    return type?.has_parts ? {app, type, select} : null;
  }
  function close() {
    if (busy) return;
    panel?.remove(); panel = null; active = null;
  }
  function open(select) {
    const target = find(select);
    if (!target) return false;
    if (busy) return true;
    close(); active = target;
    select.value = target.app.status;
    panel = document.createElement('form');
    panel.className = 'codex-lookup-parts';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'A/B 수료 확인');
    panel.innerHTML = '<strong>A/B 수료 확인</strong><label><input type="checkbox" name="a"><span></span></label><label><input type="checkbox" name="b"><span></span></label><p role="status"></p><footer><button type="button">취소</button><button type="submit">저장</button></footer>';
    ['a','b'].forEach(part => {
      const input = panel.elements[part];
      input.checked = Boolean(target.app[`part_${part}_completed`]);
      input.nextElementSibling.textContent = `${part.toUpperCase()} · ${target.type[`certificate_part_${part}_name`] || target.type[`part_${part}_label`] || '수료'}`;
    });
    panel.querySelector('[type="button"]').onclick = () => { close(); select.focus(); };
    panel.addEventListener('submit', save);
    panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); close(); select.focus(); } });
    document.body.append(panel);
    const state = document.createElement('select');
    state.name = 'status'; state.setAttribute('aria-label','신청 상태');
    APPLICATION_STATUSES.forEach(value => state.add(new Option(value,value)));
    state.value = '수료'; panel.querySelector('strong').after(state);
    const rect = select.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - panel.offsetWidth - 8))}px`;
    panel.style.top = `${Math.max(8, Math.min(rect.bottom + 6, innerHeight - panel.offsetHeight - 8))}px`;
    panel.elements.a.focus();
    return true;
  }
  async function save(event) {
    event.preventDefault();
    if (busy || !active) return;
    const {app} = active, form = panel;
    const status = form.elements.status.value;
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
      if (changed) sb.functions.invoke('notify-status-change',{body:{applicationId:app.id}}).catch(()=>{});
      renderMetrics(); renderApps(); renderCourseLookup();
      if (typeof claudeLoadCompletions === 'function') await claudeLoadCompletions();
    } catch (error) {
      form.querySelector('p').textContent = `저장 실패: ${error.message}`;
    } finally {
      busy = false; form.querySelectorAll('button,input,select').forEach(el => el.disabled = false);
    }
  }
  function bind(select) {
    select.addEventListener('pointerdown', event => {
      if (select.value === '수료' && find(select)) { event.preventDefault(); open(select); }
    });
    select.addEventListener('keydown', event => {
      if (select.value === '수료' && ['Enter',' '].includes(event.key) && find(select)) { event.preventDefault(); open(select); }
    });
  }
  const style = document.createElement('style');
  style.textContent = '.codex-lookup-parts{position:fixed;z-index:1000;width:300px;max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);overflow:auto;overscroll-behavior:contain;box-sizing:border-box;padding:16px;background:#fff;border:1px solid #cdd4dc;border-radius:6px;box-shadow:0 8px 24px #0002}.codex-lookup-parts label{display:flex;gap:8px;align-items:start;margin:14px 0;overflow-wrap:anywhere}.codex-lookup-parts input{width:16px;height:16px;flex:0 0 16px;margin-top:3px}.codex-lookup-parts footer{display:flex;justify-content:flex-end;gap:8px}.codex-lookup-parts p{color:#a32323;font-size:12px}';
  document.head.append(style);
  document.addEventListener('pointerdown', event => { if (panel && !panel.contains(event.target) && event.target !== active?.select) close(); });
  window.addEventListener('resize', () => {
    if (!panel) return;
    panel.style.left = `${Math.max(8, Math.min(parseFloat(panel.style.left), innerWidth - panel.offsetWidth - 8))}px`;
    panel.style.top = `${Math.max(8, Math.min(parseFloat(panel.style.top), innerHeight - panel.offsetHeight - 8))}px`;
  });
  window.CodexLookupParts = {open,bind};
})();
