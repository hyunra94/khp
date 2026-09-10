(function () {
  'use strict';
  let dialog, currentId, saving = false;
  const fields = ['certificate_course_name', 'certificate_part_a_name', 'certificate_part_b_name'];

  function mount() {
    if (dialog) return;
    const style = document.createElement('style');
    style.textContent = `#codexCourseNamesDialog{width:520px;max-width:calc(100vw - 32px);max-height:calc(100dvh - 32px);box-sizing:border-box;padding:24px;border:1px solid #cdd2d8;border-radius:8px;overflow:auto;overscroll-behavior:contain;color:#202429;background:#fff}#codexCourseNamesDialog::backdrop{background:#0006}#codexCourseNamesDialog h2{font-size:18px;margin:0 0 20px}#codexCourseNamesDialog label{display:block;margin:16px 0}#codexCourseNamesDialog label[hidden]{display:none}#codexCourseNamesDialog input{display:block;box-sizing:border-box;width:100%;margin-top:8px}#codexCourseNamesDialog footer{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}#codexCourseNamesMessage{color:#a32323;white-space:pre-wrap}body.codex-course-names-open{overflow:hidden}`;
    document.head.append(style);
    dialog = document.createElement('dialog');
    dialog.id = 'codexCourseNamesDialog';
    dialog.setAttribute('aria-labelledby', 'codexCourseNamesTitle');
    dialog.innerHTML = `<form><h2 id="codexCourseNamesTitle">수료증 승인 과목명</h2><p id="codexCourseNamesType"></p>${fields.map((field, i) => `<label>${['승인 과목명', 'A 과정 승인 과목명', 'B 과정 승인 과목명'][i]}<input name="${field}" maxlength="500" autocomplete="off"></label>`).join('')}<p id="codexCourseNamesMessage" role="status"></p><footer><button type="button" data-close>취소</button><button type="submit">저장</button></footer></form>`;
    document.body.append(dialog);
    const mode = document.createElement('label');
    mode.innerHTML = '과정 구성<select id="codexCourseMode"><option value="single">일반 과정</option><option value="parts">A/B 분할 과정</option></select>';
    document.getElementById('codexCourseNamesType').after(mode);
    mode.querySelector('select').addEventListener('change', updateFields);
    sb.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT' && dialog.open) dialog.close(); });
    dialog.querySelector('[data-close]').onclick = () => { if (!saving) dialog.close(); };
    dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
    dialog.addEventListener('close', () => {
      document.body.classList.remove('codex-course-names-open');
      dialog.querySelector('form').reset(); currentId = null;
    });
    dialog.querySelector('form').addEventListener('submit', save);
  }

  function open(id) {
    mount();
    const type = allCourseTypes.find(item => item.id === id);
    if (!type || saving) return;
    currentId = id;
    document.getElementById('codexCourseNamesType').textContent = type.name;
    document.getElementById('codexCourseNamesMessage').textContent = '';
    document.getElementById('codexCourseMode').value = type.has_parts ? 'parts' : 'single';
    fields.forEach((field, index) => {
      const input = dialog.querySelector(`[name="${field}"]`);
      input.value = type[field] || '';
      input.setCustomValidity('');
      const visible = index === 0 ? !type.has_parts : Boolean(type.has_parts);
      input.closest('label').hidden = !visible;
      input.disabled = !visible; input.required = visible;
    });
    dialog.showModal(); document.body.classList.add('codex-course-names-open');
  }

  function updateFields() {
    const parts = document.getElementById('codexCourseMode').value === 'parts';
    fields.forEach((field, index) => {
      const input = dialog.querySelector(`[name="${field}"]`);
      const visible = index === 0 ? !parts : parts;
      input.closest('label').hidden = !visible;
      input.disabled = !visible; input.required = visible;
      input.setCustomValidity('');
    });
  }

  async function save(event) {
    event.preventDefault();
    if (saving || !currentId) return;
    const payload = {has_parts: document.getElementById('codexCourseMode').value === 'parts'};
    for (const field of fields) {
      const input = dialog.querySelector(`[name="${field}"]`);
      if (input.disabled) continue;
      if (!input.value.trim()) { input.setCustomValidity('승인받은 과목명을 입력해주세요.'); input.reportValidity(); input.oninput = () => input.setCustomValidity(''); return; }
      payload[field] = input.value.trim();
    }
    saving = true;
    const button = dialog.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const { data, error } = await sb.from('course_types').update(payload).eq('id', currentId).select('id').single();
      if (error) throw error;
      if (!data) throw new Error('저장 권한을 확인해주세요.');
      Object.assign(allCourseTypes.find(item => item.id === currentId) || {}, payload);
      dialog.close();
      render();
      if (typeof claudeLoadCompletions === 'function') await claudeLoadCompletions();
    } catch (error) {
      if (dialog.open) document.getElementById('codexCourseNamesMessage').textContent = `저장 실패: ${error.message}`;
    } finally { saving = false; button.disabled = false; }
  }

  function render() {
    document.querySelectorAll('#typeRows [data-type-id]').forEach(row => {
      if (row.querySelector('[data-codex-course-name]')) return;
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'inline-btn light';
      button.dataset.codexCourseName = ''; button.textContent = '승인 과목명';
      button.onclick = () => open(row.dataset.typeId);
      row.querySelector('.course-row-actions')?.prepend(button);
    });
  }
  window.CodexCourseNames = { render };
  render();
})();
