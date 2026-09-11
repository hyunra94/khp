(function () {
  'use strict';
  function decorate() {
    document.querySelectorAll('#appRows tr[data-trainee-id]').forEach(row=>{
      const menu=row.querySelector('.menu-pop');if(!menu||menu.querySelector('[data-codex-course-manage]'))return;
      const button=document.createElement('button');button.type='button';button.dataset.codexCourseManage='';button.textContent='신청 추가 / 변경';
      button.onclick=()=>manageCourses(row.dataset.traineeId);menu.append(button);
    });
    document.querySelectorAll('#appRows .save-applicant-btn').forEach(save => {
      const wrap = save.closest('.menu-wrap');
      if (!wrap || wrap.dataset.codexInlineSave) return;
      wrap.dataset.codexInlineSave = 'true';
      const cancel = wrap.querySelector('.cancel-edit-btn');
      for (const [button, icon, title] of [[save,'✓','신청자 정보 저장'],[cancel,'×','편집 취소']]) {
        if (!button) continue;
        button.textContent = icon; button.title = title; button.setAttribute('aria-label', title);
        wrap.before(button);
      }
      wrap.hidden = true;
      const row = save.closest('tr');
      const rrn = row.querySelector('.rrn-cell');
      if (rrn && !row.querySelector('[data-codex-correct-rrn]')) {
        const button=document.createElement('button');button.type='button';button.textContent='번호 수정';button.dataset.codexCorrectRrn='';
        button.onclick=()=>correctNumber(row.dataset.traineeId);rrn.after(button);
      }
    });
    document.querySelectorAll('#courseRows .course-edit-row').forEach(row => {
      if (row.dataset.codexForm) return;
      row.dataset.codexForm = 'true';
      row.querySelectorAll(':scope > input, :scope > select').forEach(input => {
        const label = document.createElement('label'); label.className = 'codex-course-field';
        const title = document.createElement('span'); title.textContent = input.getAttribute('aria-label');
        input.before(label); label.append(title,input);
      });
    });
    document.querySelectorAll('#courseLookupGroups .lookup-round tbody tr').forEach(row => {
      const select = row.querySelector('select.status-select:not(.employment-category-select)');
      const cell = row.querySelector('td[data-label="이름"]');
      if (!select || !cell || cell.querySelector('input,button')) return;
      const button = document.createElement('button'); button.type='button'; button.className='codex-row-link';
      button.textContent=cell.textContent;button.onclick=()=>jumpToApplicant(select.dataset.id);
      cell.replaceChildren(button);
    });
  }
  function highlight(row) {
    if (!row) return;
    row.scrollIntoView({behavior:'smooth',block:'center'});
    row.classList.add('codex-jump-highlight');
    setTimeout(()=>row.classList.remove('codex-jump-highlight'),2500);
  }
  function correctNumber(traineeId) {
    const dialog=document.createElement('dialog');
    dialog.style.cssText='width:360px;max-width:calc(100vw - 32px);border:1px solid #ccd4d9;border-radius:6px;padding:22px';
    dialog.innerHTML='<form><h3>주민등록번호 수정</h3><label>새 주민등록번호<input type="password" inputmode="numeric" autocomplete="off" maxlength="14" required style="width:100%;box-sizing:border-box;margin-top:8px"></label><p role="status"></p><div style="display:flex;gap:8px;justify-content:flex-end"><button type="button">취소</button><button type="submit">번호 저장</button></div></form>';
    document.body.append(dialog);dialog.showModal();let saving=false;
    dialog.querySelector('[type="button"]').onclick=()=>{if(!saving)dialog.close();};
    dialog.addEventListener('cancel',e=>{if(saving)e.preventDefault();});
    dialog.addEventListener('close',()=>{dialog.querySelector('input').value='';dialog.remove();});
    dialog.querySelector('form').onsubmit=async event=>{
      event.preventDefault();if(saving)return;
      const input=dialog.querySelector('input'),digits=input.value.replace(/\D/g,'');
      if(digits.length!==13){dialog.querySelector('p').textContent='13자리를 입력해주세요.';return;}
      saving=true;
      try{
        const {error}=await sb.rpc('admin_correct_resident_number',{p_trainee_id:traineeId,p_number:digits});
        if(error)throw error;
        input.value='';dialog.close();await loadApplications();
      }catch(error){dialog.querySelector('p').textContent=error.message;}
      finally{saving=false;}
    };
  }
  function manageCourses(traineeId) {
    closeMenus();
    const apps=allApps.filter(a=>a.trainee_id===traineeId);
    const dialog=document.createElement('dialog');
    dialog.style.cssText='width:440px;max-width:calc(100vw - 32px);border:1px solid #ccd4d9;border-radius:6px;padding:22px';
    dialog.innerHTML='<form><h3>신청 추가 / 변경</h3><label>처리<select name="mode"><option value="add">추가 신청</option><option value="change">기존 신청 변경</option></select></label><label data-existing hidden>변경할 신청<select name="application"></select></label><label>과정 · 회차<select name="course" required></select></label><p role="status"></p><footer><button type="button">취소</button><button type="submit">저장</button></footer></form>';
    const form=dialog.querySelector('form');
    apps.forEach(a=>form.elements.application.add(new Option(`${a.courses?.name || '과정'} · ${formatDateTime(a.applied_at)} · ${a.status}`,a.id)));
    form.elements.course.add(new Option('회차 선택',''));
    allCourses.forEach(c=>form.elements.course.add(new Option(`${c.name} · ${c.start_date || '일정 미정'}`,c.id)));
    form.elements.mode.onchange=()=>dialog.querySelector('[data-existing]').hidden=form.elements.mode.value!=='change';
    document.body.append(dialog);dialog.showModal();let saving=false;
    dialog.querySelector('[type="button"]').onclick=()=>{if(!saving)dialog.close();};
    dialog.addEventListener('cancel',e=>{if(saving)e.preventDefault();});
    dialog.addEventListener('close',()=>dialog.remove());
    form.onsubmit=async event=>{
      event.preventDefault();if(saving)return;saving=true;
      form.querySelector('[type="submit"]').disabled=true;
      try{
        const {error}=await sb.rpc('admin_save_application_course',{p_trainee_id:traineeId,p_course_id:form.elements.course.value,p_application_id:form.elements.mode.value==='change'?form.elements.application.value:null});
        if(error)throw error;
        dialog.close();await loadApplications();
      }catch(error){dialog.querySelector('p').textContent=error.message;}
      finally{saving=false;form.querySelector('[type="submit"]').disabled=false;}
    };
  }
  function jumpToApplicant(id) {
    const app=allApps.find(a=>a.id===id); if(!app)return;
    activeApplicationCourseTypeId='';
    document.getElementById('filterSearch').value='';document.getElementById('filterStatus').value='';
    document.querySelector('.nav-item[data-view="applications"]').click();
    renderApplicationCourseTags();renderApps();
    requestAnimationFrame(()=>highlight(document.querySelector(`#appRows tr[data-trainee-id="${CSS.escape(app.trainee_id)}"]`)));
  }
  document.addEventListener('click',event=>{
    const item=event.target.closest('[data-codex-lookup-app]'); if(!item)return;
    const app=allApps.find(a=>a.id===item.dataset.codexLookupApp); if(!app)return;
    if(!COURSE_LOOKUP_STATUSES.includes(app.status)){alert('대기·거절·취소 신청은 과정 조회 대상이 아닙니다.');return;}
    activeLookupCourseTypeId=app.courses?.course_type_id || '';
    document.querySelector('.nav-item[data-view="course-lookup"]').click();
    renderCourseLookupFilters();
    renderCourseLookup();
    requestAnimationFrame(()=>highlight(document.querySelector(`#courseLookupGroups select.status-select[data-id="${CSS.escape(app.id)}"]`)?.closest('tr')));
  });
  document.addEventListener('keydown',event=>{
    if(event.target.matches('[data-codex-lookup-app]')&&['Enter',' '].includes(event.key)){event.preventDefault();event.target.click();}
  });
  const style=document.createElement('style');
  style.textContent='#appRows .menu-wrap[hidden]{display:none}#appRows .save-applicant-btn,#appRows .cancel-edit-btn{width:36px;height:36px;padding:0;font-size:20px;flex:0 0 36px}.codex-row-link{border:0;background:none;padding:0;color:#245e56;font:inherit;font-weight:700;text-decoration:underline;cursor:pointer}.codex-jump-highlight{outline:2px solid #3b8173;outline-offset:-2px;background:#eaf6ef!important}#courseRows .course-edit-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:18px;border:1px solid #c5d1d8;border-radius:6px;background:#fff}#courseRows .codex-course-field{display:flex;flex-direction:column;gap:6px;min-width:0;font-size:12px;color:#53616a}#courseRows .codex-course-field input,#courseRows .codex-course-field select{width:100%;min-width:0;box-sizing:border-box}#courseRows .course-edit-row>.course-row-actions{grid-column:1/-1;border-top:1px solid #e0e5e8;padding-top:12px;justify-content:flex-end}@media(max-width:500px){#courseRows .course-edit-row{grid-template-columns:1fr}}';
  document.head.append(style);
  let queued=false;
  const observer=new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;decorate();});});
  for(const id of ['appRows','courseLookupGroups','courseRows']){const node=document.getElementById(id);if(node)observer.observe(node,{childList:true,subtree:true});}
  decorate();
})();
