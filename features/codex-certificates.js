(function (root) {
  'use strict';
  const selected = new Set();
  let groups = [], history = [], drafts = [], active = 0, busy = false;
  let assetsPromise, librariesPromise;
  let sessionVersion = 0;
  const checkSession = version => { if (version !== sessionVersion) throw new Error('로그인 상태가 변경되었습니다. 다시 로그인해주세요.'); };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const dateText = value => value ? value.split('-').join('. ') + '.' : '';
  const sourceKey = ids => [...new Set(ids)].sort().join(',');

  function groupCompletions(items) {
    const map = new Map();
    for (const item of items) {
      const course = item.courses || {}, type = course.course_types || {};
      const key = type.has_parts ? `${item.trainee_id}:${course.course_type_id}` : item.id;
      if (!map.has(key)) map.set(key, { key, items: [], name: item.trainees?.name || '', type });
      map.get(key).items.push(item);
    }
    return [...map.values()].map(group => {
      const completed = group.type.has_parts
        ? group.items.filter(item => item.part_a_completed || item.part_b_completed) : group.items;
      const ids = completed.map(item => item.id);
      const starts = completed.map(item => item.courses?.start_date).filter(Boolean).sort();
      const ends = completed.map(item => item.courses?.end_date || item.courses?.start_date).filter(Boolean).sort();
      const names = group.type.has_parts ? [
        ...(completed.some(item => item.part_a_completed) ? [group.type.certificate_part_a_name || ''] : []),
        ...(completed.some(item => item.part_b_completed) ? [group.type.certificate_part_b_name || ''] : [])
      ] : [group.type.certificate_course_name || ''];
      const parts = group.type.has_parts ? `${completed.some(item => item.part_a_completed) ? 'A' : ''}${completed.some(item => item.part_b_completed) ? 'B' : ''}` : 'single';
      return { ...group, ids, sourceKey: `${sourceKey(ids)}:${parts}`, snapshot: {
        parts,
        name: group.name, birthDate: '', courseNames: names,
        startDate: starts.length === completed.length ? starts[0] : '',
        endDate: ends.length === completed.length ? ends[ends.length - 1] : ''
      } };
    });
  }

  function validate(snapshot) {
    const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') &&
      !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    if (!snapshot.name.trim()) throw new Error('성명을 입력해주세요.');
    if (!validDate(snapshot.birthDate)) throw new Error('생년월일을 확인해주세요.');
    if (!validDate(snapshot.startDate) || !validDate(snapshot.endDate) || snapshot.startDate > snapshot.endDate) throw new Error('훈련기간을 확인해주세요.');
    if (snapshot.courseNames.length < 1 || snapshot.courseNames.length > 2 || snapshot.courseNames.some(name => !name.trim())) throw new Error('승인 과목명을 입력해주세요. 과정 관리에서 기본값을 저장할 수 있습니다.');
  }

  function period(snapshot) {
    return snapshot.startDate === snapshot.endDate ? dateText(snapshot.startDate)
      : `${dateText(snapshot.startDate)} ~ ${dateText(snapshot.endDate)}`;
  }

  async function buildPdf(documents, assets, lib, kit) {
    const pdf = await lib.PDFDocument.create();
    pdf.registerFontkit(kit);
    const font = await pdf.embedFont(assets.font);
    const logo = await pdf.embedPng(assets.logo), seal = await pdf.embedPng(assets.seal);
    const ink = lib.rgb(0, 0, 0);
    for (const document of documents) {
      const s = document.snapshot;
      validate(s);
      const page = pdf.addPage([595.28, 841.89]);
      function text(value, x, y, size = 14, width = 440, center = false) {
        let adjusted = size;
        while (font.widthOfTextAtSize(value, adjusted) > width && adjusted > 9) adjusted -= .25;
        if (font.widthOfTextAtSize(value, adjusted) > width) throw new Error('수료증에 들어갈 문구가 너무 깁니다. 과정명을 줄여주세요.');
        page.drawText(value, { x: center ? x - font.widthOfTextAtSize(value, adjusted) / 2 : x, y, size: adjusted, font, color: ink });
      }
      // Original form's stepped double border, in A4 points.
      const border = [[55,747],[67,747],[67,759],[87,759],[87,771],[519,771],[519,759],[539,759],[539,747],[551,747],[551,95],[539,95],[539,83],[519,83],[519,71],[87,71],[87,83],[67,83],[67,95],[55,95]];
      border.forEach(([x,y], i) => {
        const end = border[(i + 1) % border.length];
        page.drawLine({ start:{x,y}, end:{x:end[0],y:end[1]}, thickness:1.5, color:ink });
      });
      page.drawRectangle({ x:67, y:83, width:472, height:676, borderWidth:1.2, borderColor:ink });
      page.drawImage(logo, { x:410, y:682, width:120, height:22 });
      const number = document.certificate_number;
      const displayNumber = number ? (/^\d{4}-/.test(number) ? number.replace('-', ' - ') : `${s.endDate.slice(0,4)} - ${number}`) : '미리보기';
      text(`제 ${displayNumber} 호`, 82, 711, 13);
      text('수 료 증', 307, 603, 37, 350, true);
      const spaced = s.name.length <= 3 ? [...s.name].join('  ') : s.name;
      text('성       명  :', 92, 524, 14, 115); text(spaced, 219, 524, 16, 290);
      text('생 년 월 일  :', 92, 483, 14, 115); text(dateText(s.birthDate), 219, 483, 14, 300);
      text('훈련과정명  :', 92, 443, 14, 115);
      s.courseNames.forEach((name, index) => text(name, 219, 453 - index * 23, 14, 310));
      text('훈 련 기 간  :', 92, 394, 14, 115); text(period(s), 219, 394, 13, 310);
      text('위 사람은 사업주 직업능력개발훈련지원규정 제8조 규정에 의하여 위의', 307, 323, 14, 455, true);
      text('직업능력개발 훈련과정을 수료하였으므로 이 증서를 수여합니다.', 307, 299, 14, 455, true);
      const [year, month, day] = s.endDate.split('-').map(Number);
      text(`${year}년  ${month}월  ${day}일`, 307, 225, 16, 350, true);
      page.drawImage(seal, { x:411, y:119, width:81, height:81 });
      text('전주문화방송(주)', 303, 169, 22, 320, true);
      text('대표이사 정 희 찬', 307, 130, 22, 330, true);
      if (!document.certificate_number) text('미리보기 · 미발급', 307, 42, 11, 400, true);
    }
    pdf.setTitle('전주MBC 교육 수료증');
    return pdf.save();
  }

  function loadScript(src, ready) {
    if (ready()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = src;
      script.onload = resolve; script.onerror = () => { script.remove(); reject(new Error('PDF 도구를 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.')); };
      document.head.appendChild(script);
    });
  }

  async function assets() {
    if (!librariesPromise) librariesPromise = Promise.all([
      loadScript('vendor/pdf-lib-1.17.1.min.js', () => root.PDFLib),
      loadScript('vendor/fontkit-1.1.1.min.js', () => root.fontkit)
    ]).catch(error => { librariesPromise = null; throw error; });
    await librariesPromise;
    if (!assetsPromise) assetsPromise = (async () => {
      const response = await fetch('assets/fonts/NanumMyeongjo-Regular.ttf');
      if (!response.ok) throw new Error('수료증 글꼴을 불러오지 못했습니다.');
      const { data, error } = await sb.from('certificate_artwork').select('id,png_base64');
      if (error) throw error;
      const images = Object.fromEntries(data.map(item => [item.id, item.png_base64]));
      if (!images.logo || !images.seal) throw new Error('수료증 원본 이미지가 등록되지 않았습니다.');
      return { font: await response.arrayBuffer(), ...images };
    })().catch(error => { assetsPromise = null; throw error; });
    return assetsPromise;
  }

  function message(text, error = false) {
    const node = document.getElementById('codexCertMessage');
    if (node) { node.textContent = text; node.classList.toggle('error', error); }
  }

  async function loadHistory() {
    const version = sessionVersion;
    const result = await sb.from('certificate_documents').select('*').order('created_at', { ascending: false }).limit(1000);
    checkSession(version);
    if (result.error) throw result.error;
    history = result.data || [];
  }

  function render() {
    const panel = document.getElementById('codexCertificateWorkspace');
    if (!panel) return;
    groups = groupCompletions(claudeCompletions);
    const visibleIds = new Set(claudeFilteredCompletions().map(item => item.id));
    const visible = groups.filter(group => group.items.some(item => visibleIds.has(item.id)));
    const validKeys = new Set(visible.map(group => group.key));
    [...selected].forEach(key => { if (!validKeys.has(key)) selected.delete(key); });
    const body = document.getElementById('codexCertificateTargets');
    body.innerHTML = visible.map(group => `<tr>
      <td><input type="checkbox" data-cert-select="${escape(group.key)}" aria-label="${escape(group.name)} 선택" ${selected.has(group.key) ? 'checked' : ''} ${group.ids.length ? '' : 'disabled'}></td>
      <td>${escape(group.name)}</td><td>${escape(group.snapshot.courseNames.join(' / ') || group.type.name)}</td>
      <td>${escape(group.items.map(item => item.courses?.round ? `${item.courses.round}회차` : item.courses?.name).join(', '))}</td>
      <td>${group.snapshot.startDate && group.snapshot.endDate ? escape(period(group.snapshot)) : '기간 확인 필요'}</td>
      <td>${group.ids.length ? `${group.snapshot.courseNames.length}과정` : 'A/B 이수 확인 필요'}</td>
      <td><button type="button" data-cert-open="${escape(group.key)}" ${group.ids.length ? '' : 'disabled'}>미리보기</button></td>
    </tr>`).join('') || '<tr><td colspan="7" class="empty-row">발급 대상이 없습니다.</td></tr>';
    syncSelection();
    document.getElementById('codexCertificateHistory').innerHTML = history.map(record => `<tr>
      <td>${escape(record.certificate_number)}</td><td>${escape(record.snapshot.name)}</td>
      <td>${escape(record.snapshot.courseNames.join(' / '))}</td><td>${escape(dateText(record.snapshot.endDate))}</td>
      <td>${record.issued_at ? escape(formatDateTime(record.issued_at)) : '발급 준비'}</td>
      <td>${record.download_count}</td><td><button type="button" data-cert-history="${escape(record.id)}">${record.issued_at ? '재다운로드' : '발급 계속'}</button></td>
    </tr>`).join('') || '<tr><td colspan="7" class="empty-row">PDF 발급 이력이 없습니다.</td></tr>';
  }

  function syncSelection() {
    const boxes = [...document.querySelectorAll('#codexCertificateTargets input:not(:disabled)')];
    const count = boxes.filter(box => selected.has(box.dataset.certSelect)).length;
    const all = document.getElementById('codexCertificateSelectAll');
    all.checked = boxes.length > 0 && count === boxes.length;
    all.indeterminate = count > 0 && count < boxes.length;
    all.disabled = boxes.length === 0;
    document.getElementById('codexCertificateBatch').disabled = !count || busy;
    document.getElementById('codexCertificateCount').textContent = count ? `${count}명 선택` : '';
  }

  async function openGroups(keys) {
    if (busy) return;
    busy = true; syncSelection(); message('수료증 정보를 확인하고 있습니다.');
    const version = sessionVersion;
    try {
      await loadHistory();
      drafts = [];
      for (const group of groups.filter(item => keys.includes(item.key))) {
        const existing = history.find(item => item.source_key === group.sourceKey);
        if (existing) { drafts.push(existing); continue; }
        const { data, error } = await sb.rpc('certificate_birth_date', { p_trainee_id: group.items[0].trainee_id });
        checkSession(version);
        if (error) throw error;
        drafts.push({ application_ids: group.ids, snapshot: { ...group.snapshot, birthDate: data || '' } });
      }
      active = 0; showDialog(); message('');
    } catch (error) { message(error.message, true); }
    finally { busy = false; syncSelection(); }
  }

  function showDialog() {
    const dialog = document.getElementById('codexCertificateDialog');
    document.getElementById('codexCertificateDraft').innerHTML = drafts.map((draft, i) => `<option value="${i}">${escape(draft.snapshot.name)} (${i + 1}/${drafts.length})</option>`).join('');
    if (!dialog.open) { dialog.showModal(); document.body.classList.add('codex-cert-modal-open'); }
    fillForm();
  }

  function fillForm() {
    const draft = drafts[active], s = draft.snapshot;
    document.getElementById('codexCertificateDraft').value = String(active);
    for (const key of ['name', 'birthDate', 'startDate', 'endDate']) {
      const input = document.querySelector(`[data-cert-field="${key}"]`);
      input.value = s[key]; input.disabled = Boolean(draft.id);
    }
    document.getElementById('codexCertificateNames').innerHTML = s.courseNames.map((name, i) => `<label>승인 과목명 ${s.parts === 'AB' ? (i === 0 ? 'A' : 'B') : s.parts === 'single' ? '' : s.parts}<input data-cert-name="${i}" value="${escape(name)}" placeholder="승인받은 정식 과목명" ${draft.id ? 'disabled' : ''}></label>`).join('');
    clearPreview();
    document.getElementById('codexCertificateDialogMessage').textContent = draft.id ? `${draft.certificate_number} · 기존 발급 내용` : !s.birthDate ? '저장된 정보에서 유효한 생년월일을 확인하지 못했습니다. 실제 생년월일을 확인해 입력해주세요. 원본 주민등록번호는 변경되지 않습니다.' : '내용 확인 후 미리보기를 눌러주세요.';
  }

  function readForm() {
    if (drafts[active].id) return;
    const s = drafts[active].snapshot;
    document.querySelectorAll('[data-cert-field]').forEach(input => { s[input.dataset.certField] = input.value.trim(); });
    s.courseNames = [...document.querySelectorAll('[data-cert-name]')].map(input => input.value.trim());
  }

  function clearPreview() {
    const frame = document.getElementById('codexCertificatePreview');
    frame.hidden = true; frame.width = 0; frame.height = 0;
  }

  async function preview() {
    const version = sessionVersion;
    readForm();
    const bytes = await buildPdf([drafts[active]], await assets(), root.PDFLib, root.fontkit);
    checkSession(version);
    clearPreview();
    const renderer = await import(new URL('vendor/pdfjs/pdf.mjs', document.baseURI).href);
    renderer.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.mjs', document.baseURI).href;
    const task = renderer.getDocument({ data: bytes });
    try {
      const pdf = await task.promise, page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.getElementById('codexCertificatePreview');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      checkSession(version);
      canvas.hidden = false;
    } finally { await task.destroy(); }
  }

  async function download() {
    const version = sessionVersion;
    readForm(); drafts.forEach(draft => validate(draft.snapshot));
    const artwork = await assets();
    // Validate layout before reserving certificate numbers or recording an issuance.
    await buildPdf(drafts, artwork, root.PDFLib, root.fontkit);
    checkSession(version);
    for (let i = 0; i < drafts.length; i++) {
      if (drafts[i].id) continue;
      const result = await sb.rpc('prepare_certificate_document', { p_application_ids: drafts[i].application_ids, p_snapshot: drafts[i].snapshot });
      checkSession(version);
      if (result.error) throw result.error;
      drafts[i] = result.data;
    }
    const bytes = await buildPdf(drafts, artwork, root.PDFLib, root.fontkit);
    checkSession(version);
    for (const draft of drafts) {
      const result = await sb.rpc('complete_certificate_document', { p_document_id: draft.id });
      checkSession(version);
      if (result.error) throw new Error(`발급 기록 저장 실패: ${result.error.message}. 같은 수료증으로 다시 시도해주세요.`);
    }
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const link = document.createElement('a'); link.href = url;
    link.download = drafts.length === 1 ? `수료증_${drafts[0].snapshot.name}_${drafts[0].certificate_number}.pdf` : `수료증_${drafts.length}명.pdf`;
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    await loadHistory(); await claudeLoadCompletions(); render();
    document.getElementById('codexCertificateDialogMessage').textContent = 'PDF 생성 및 발급 기록 저장 완료';
  }

  async function dialogAction(action) {
    if (busy) return;
    busy = true;
    const dialog = document.getElementById('codexCertificateDialog');
    dialog.querySelectorAll('button,select').forEach(node => { node.disabled = true; });
    const msg = document.getElementById('codexCertificateDialogMessage'); msg.textContent = '처리 중...';
    try { await action(); if (action === preview) msg.textContent = '미리보기'; }
    catch (error) { msg.textContent = error.message; }
    finally { busy = false; dialog.querySelectorAll('button,select').forEach(node => { node.disabled = false; }); syncSelection(); }
  }

  function mount() {
    const host = document.getElementById('codexCertPanel');
    if (!host || document.getElementById('codexCertificateWorkspace')) return;
    const panel = document.createElement('section'); panel.id = 'codexCertificateWorkspace';
    panel.innerHTML = `<div class="codex-cert-actions"><button type="button" id="codexCertificateBatch" disabled>선택 수료증 미리보기</button><span id="codexCertificateCount"></span><button type="button" id="codexCertificateRefresh">새로고침</button></div>
      <p id="codexCertMessage" role="status"></p>
      <div class="codex-cert-scroll"><table><thead><tr><th><input type="checkbox" id="codexCertificateSelectAll" aria-label="발급 대상 전체 선택"></th><th>이름</th><th>수료 과정</th><th>참여 회차</th><th>훈련기간</th><th>서식</th><th>발급</th></tr></thead><tbody id="codexCertificateTargets"></tbody></table></div>
      <h3>PDF 발급 이력</h3><div class="codex-cert-scroll"><table><thead><tr><th>수료증 번호</th><th>이름</th><th>과정</th><th>수료증 날짜</th><th>실제 발급 시각</th><th>생성 횟수</th><th>파일</th></tr></thead><tbody id="codexCertificateHistory"></tbody></table></div>`;
    host.appendChild(panel);
    const dialog = document.createElement('dialog'); dialog.id = 'codexCertificateDialog';
    dialog.setAttribute('aria-labelledby', 'codexCertificateDialogTitle');
    dialog.innerHTML = `<div class="codex-cert-dialog-head"><h2 id="codexCertificateDialogTitle">수료증 발급</h2><button type="button" id="codexCertificateClose" aria-label="닫기">×</button></div>
      <select id="codexCertificateDraft" aria-label="미리보기 대상"></select>
      <div class="codex-cert-fields"><label>성명<input data-cert-field="name"></label><label>생년월일<input type="date" data-cert-field="birthDate"></label><label>훈련 시작일<input type="date" data-cert-field="startDate"></label><label>훈련 종료일 · 수료증 날짜<input type="date" data-cert-field="endDate"></label></div>
      <div id="codexCertificateNames" class="codex-cert-fields"></div>
      <div class="codex-cert-actions"><button type="button" id="codexCertificateShowPreview">미리보기</button><button type="button" id="codexCertificateDownload">PDF 다운로드 · 발급 기록</button></div>
      <p id="codexCertificateDialogMessage" role="status"></p><canvas id="codexCertificatePreview" aria-label="수료증 PDF 미리보기" hidden></canvas>`;
    document.body.appendChild(dialog);
    document.getElementById('codexCertificateClose').onclick = () => dialog.close();
    dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
    dialog.addEventListener('close', () => { clearPreview(); drafts = []; document.body.classList.remove('codex-cert-modal-open'); });
    document.getElementById('codexCertificateDraft').onchange = event => { readForm(); active = Number(event.target.value); fillForm(); };
    document.getElementById('codexCertificateShowPreview').onclick = () => dialogAction(preview);
    document.getElementById('codexCertificateDownload').onclick = () => dialogAction(download);
    document.getElementById('codexCertificateBatch').onclick = () => openGroups([...selected]);
    document.getElementById('codexCertificateSelectAll').onchange = event => {
      document.querySelectorAll('#codexCertificateTargets input:not(:disabled)').forEach(box => { box.checked = event.target.checked; if (box.checked) selected.add(box.dataset.certSelect); else selected.delete(box.dataset.certSelect); }); syncSelection();
    };
    panel.addEventListener('change', event => {
      const key = event.target.dataset.certSelect;
      if (key) { if (event.target.checked) selected.add(key); else selected.delete(key); syncSelection(); }
    });
    panel.addEventListener('click', event => {
      const open = event.target.closest('[data-cert-open]'), prior = event.target.closest('[data-cert-history]');
      if (open) openGroups([open.dataset.certOpen]);
      if (prior && !busy) { drafts = [history.find(item => item.id === prior.dataset.certHistory)]; active = 0; showDialog(); }
    });
    document.getElementById('codexCertificateRefresh').onclick = async () => {
      try { await loadHistory(); await claudeLoadCompletions(); render(); message(''); } catch (error) { message(error.message, true); }
    };
    sb.auth?.onAuthStateChange(event => {
      if (event !== 'SIGNED_OUT') return;
      sessionVersion++;
      dialog.close(); selected.clear(); history = []; groups = []; assetsPromise = null;
      document.getElementById('codexCertificateTargets').innerHTML = '';
      document.getElementById('codexCertificateHistory').innerHTML = '';
    });
  }

  async function refresh() {
    try { await loadHistory(); render(); message(''); }
    catch (error) { message(`발급 이력: ${error.message}`, true); }
  }
  root.CodexCertificates = { mount, render, refresh, groupCompletions, validate, period, buildPdf };
  if (typeof module !== 'undefined') module.exports = root.CodexCertificates;
})(typeof window === 'undefined' ? globalThis : window);
