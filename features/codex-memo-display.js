(function () {
  'use strict';
  let queued = false;
  function refresh() {
    document.querySelectorAll('#appRows .claude-memo-group, #courseLookupGroups .claude-memo-group').forEach(group => {
      const application = Boolean(group.closest('#appRows'));
      const expanded = group.dataset.codexMemoExpanded === 'true';
      group.querySelectorAll('.claude-memo-box').forEach(box => {
        const kind = box.dataset.kind;
        if (!['general','type'].includes(kind)) return;
        const text = box.querySelector('.claude-memo-readonly-text');
        const editing = box.dataset.claudeEditing === '1';
        const hasText = Boolean(text?.dataset.claudeRaw?.trim());
        const hide = !editing && (application ? kind === 'type' && !expanded && !hasText : kind === 'general' && !hasText);
        if (box.hidden !== hide) box.hidden = hide;
        const label = box.querySelector('.claude-memo-label');
        const hideLabel = application && kind === 'general' && !hasText && !editing;
        if (label && label.hidden !== hideLabel) label.hidden = hideLabel;
        if (application && kind === 'general' && text && !hasText && text.textContent !== '메모') text.textContent = '메모';
      });
    });
  }
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; refresh(); });
  }
  document.addEventListener('click', event => {
    const box = event.target.closest('#appRows .claude-memo-box[data-kind="general"]');
    const group = event.target.closest('#appRows .claude-memo-group');
    document.querySelectorAll('[data-codex-memo-expanded="true"]').forEach(item => {
      if (item !== group) delete item.dataset.codexMemoExpanded;
    });
    if (box && group) group.dataset.codexMemoExpanded = 'true';
    refresh();
  }, true);
  document.addEventListener('keydown', event => {
    if (!['Enter',' '].includes(event.key) || !event.target.matches('.claude-memo-readonly-text')) return;
    event.preventDefault(); event.target.click();
  });
  const style = document.createElement('style');
  style.textContent = '.claude-memo-box[hidden],.claude-memo-label[hidden]{display:none!important}';
  document.head.append(style);
  for (const id of ['appRows','courseLookupGroups']) {
    const target = document.getElementById(id);
    if (target) new MutationObserver(schedule).observe(target, {subtree:true,childList:true,attributes:true,attributeFilter:['data-claude-editing']});
  }
  refresh();
})();
