(function () {
  'use strict';
  const sidebar = document.querySelector('#dashboard > .sidebar');
  if (!sidebar) return;
  const bar = document.createElement('div');
  bar.className = 'codex-mobile-nav-bar';
  bar.innerHTML = '<span class="codex-mobile-nav-title"></span><button type="button" aria-label="메뉴 열기" aria-expanded="false" aria-controls="codexMobileNavigation"><span aria-hidden="true">☰</span></button>';
  sidebar.prepend(bar);
  const nav = sidebar.querySelector('.nav');
  const drawer = document.createElement('div');
  drawer.className = 'codex-mobile-nav-drawer';
  sidebar.append(drawer);
  drawer.append(nav, sidebar.querySelector('.sidebar-footer'));
  nav.id = 'codexMobileNavigation';
  const toggle = bar.querySelector('button');
  function setOpen(open) {
    sidebar.classList.toggle('codex-mobile-nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
    toggle.firstElementChild.textContent = open ? '×' : '☰';
  }
  function title() {
    const active = sidebar.querySelector('.nav-item.active');
    if (!active) return;
    const copy = active.cloneNode(true);
    copy.querySelectorAll('span').forEach(el => el.remove());
    bar.querySelector('.codex-mobile-nav-title').textContent = copy.textContent.trim();
  }
  toggle.onclick = () => setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  sidebar.addEventListener('click', event => {
    if (event.target.closest('.nav-item')) { setOpen(false); requestAnimationFrame(title); }
  });
  document.addEventListener('pointerdown', event => { if (!sidebar.contains(event.target)) setOpen(false); });
  sidebar.addEventListener('keydown', event => {
    if (event.key === 'Escape') { setOpen(false); toggle.focus(); }
  });
  new MutationObserver(title).observe(nav, {subtree:true, childList:true, attributes:true, attributeFilter:['class']});
  window.matchMedia('(max-width: 980px)').addEventListener('change', () => setOpen(false));
  title();
})();
