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
      /* ===== [Claude 추가] 가독성 개선용 글씨체 교체.
         기존 'Noto Sans KR' 대신, 한글 UI 가독성이 좋다고 널리 쓰이는
         Pretendard로 바꿈(CDN, claudeInjectReadableFont()에서 <link> 추가).
         admin.html의 body{font-family:'Noto Sans KR', sans-serif;}는 그대로 두고,
         이 스타일이 나중에(head에 더 늦게) 추가되므로 같은 우선순위에서 이 규칙이 이김. ===== */
      body{font-family:'Pretendard','Noto Sans KR',-apple-system,'Malgun Gothic',sans-serif;line-height:1.55;}

      /* ==================================================================================
       * [Claude 추가] 관리자 화면 디자인 시스템 전면 리뉴얼.
       * "고급스러운 공공기관 업무 시스템 + Modern SaaS Dashboard" 컨셉.
       * admin.html 자체(HTML 구조/JS 로직)는 건드리지 않고, CSS 디자인 토큰과
       * 컴포넌트 스타일만 이 파일에서 재정의함. admin.html이 이미 CSS 변수
       * (--bg/--accent/--radius 등)로 대부분의 색/여백을 관리하고 있어서,
       * 변수 재정의만으로 로그인 카드/패널/메트릭카드/버튼/인풋 상당수가 자동 반영되고,
       * 변수를 안 쓰고 하드코딩된 값(옛 청록색, 좁은 폰트크기 등)은 아래에서 개별 selector로
       * 다시 덮어씀. 상태 배지(대기/승인/거절 등) "색상 자체"는 의미 구분용이라 유지하되
       * 모양(패딩/크기)만 배지 규격에 맞춤.
       *
       * 참고: admin.html은 --radius 변수 하나를 카드/버튼/인풋에 전부 같이 씀. 이 디자인
       * 시스템은 "카드 12px / 버튼·인풋 8px / 배지만 pill"로 구분하므로, --radius는
       * 12px(카드용)로 두고 버튼·인풋 계열 selector들만 아래에서 8px로 다시 지정함.
       * ================================================================================== */

      /* ==================================================================================
       * v2 — 사용자 피드백("색만 바뀐 수준, 정보 위계·레이아웃까지 적극 재설계 필요")을 반영해
       * 위 v1 규칙을 폐기하고 다시 씀. 이번엔 폰트 크기/여백/버튼-인풋-배지 크기를 실무용
       * 데스크톱(1920px+) 기준으로 훨씬 크게 잡고, "등록된 회차" 행은 CSS만으로는 한계가 있어
       * JS로 실제 DOM을 재구성(claudeRestructureCourseRow, 아래쪽 별도 함수)해서 제목/배지/
       * 부가정보/액션이 물리적으로 다른 줄에 놓이도록 만듦(admin.html의 courseRowHtml()이 만든
       * 엘리먼트를 "새로 그리지 않고 그대로 옮기기"만 해서 기존 이벤트 바인딩은 유지됨).
       * ================================================================================== */

      /* ---------- 1. Design Tokens ---------- */
      :root{
        --bg:#F6F7F9;
        --surface:#FFFFFF;
        --surface-soft:#F1F3F5;
        --line:#E3E7EB;
        --line-strong:#C7CED6;
        --ink:#18212B;
        --ink-soft:#66727D;
        --muted:#929CA5;
        --accent:#183B56;        /* Primary */
        --accent-dark:#102F47;   /* Primary Hover */
        --accent-soft:#EAF0F5;   /* Primary의 아주 연한 배경(활성 메뉴/포커스 배지 등) */
        --gold:#B88746;          /* Accent — 화면 전체에 반복하지 않고 포인트로만 사용 */
        --shadow:0 20px 44px rgba(24,33,43,0.10);
        --shadow-soft:0 6px 16px rgba(24,33,43,0.06);
        --radius:12px;           /* 카드 기준. 버튼/인풋은 아래에서 8px로 별도 지정 */
      }
      body{background:var(--bg);color:var(--ink);}
      #dashboard{background:var(--bg);}

      /* ---------- 2. Typography ----------
         페이지 제목 24 / 섹션 제목 17~18 / 항목명 15~16 / 본문·데이터 14 / 캡션 최소 12.
         단순 일괄 확대가 아니라 역할별로 다시 잡음. */
      .topbar h1,.view-header h2{font-size:24px;font-weight:700;letter-spacing:-0.2px;}
      .hero-card h2{font-size:22px;font-weight:700;}
      .panel h2,.panel-head h2,.section-title h2,.claude-section h3{font-size:17.5px;font-weight:700;color:var(--ink);}
      .ops-panel h3,.claude-drawer-head h3{font-size:15.5px;font-weight:600;}
      .course-row-title{font-size:16px;font-weight:700;color:var(--ink);}
      body,table,select,input,button,textarea{font-size:14px;}
      table,.compact-info,.check-list,.claude-course-meta-line{font-size:14px;line-height:1.6;}
      .view-header p,.panel-head p,.hero-card p{font-size:14px;color:var(--ink-soft);line-height:1.6;}
      th{font-size:12.5px;letter-spacing:0.2px;font-weight:700;}
      .course-row-meta,.metric-label,.memo-status,.rrn-value,.claude-hint,.status-badge,
      .status-select,select.status-select,.claude-cal-pill{font-size:12.5px;}
      .metric-value{font-size:30px;font-weight:700;}
      td{font-size:14px;}

      /* ---------- 3. Sidebar / Navigation ----------
         폭/높이/폰트를 키우고 활성 메뉴 표시는 유지. ---------- */
      .sidebar{width:272px;flex:0 0 272px;background:var(--surface);border-right:1px solid var(--line);box-shadow:none;}
      .sidebar-brand{padding:28px 22px;border-bottom:1px solid var(--line);}
      .sidebar-brand h1{color:var(--ink);font-size:19px;}
      .sidebar-brand .hero-kicker{color:var(--muted);}
      .nav{background:transparent;gap:6px;padding:16px 12px;}
      .nav-item{color:var(--ink-soft);border-radius:8px;font-weight:600;font-size:14.5px;padding:13px 14px;transition:background .12s,color .12s;}
      .nav-item span{color:var(--muted);font-size:11.5px;}
      .nav-item:hover{background:var(--surface-soft);color:var(--ink);}
      .nav-item.active{background:var(--accent-soft);color:var(--accent);box-shadow:none;}
      .nav-item.active span{color:var(--accent);}
      .sidebar-footer{border-top:1px solid var(--line);padding:18px 16px;}
      .sidebar-footer .who{color:var(--ink-soft);font-size:12.5px;}
      .sidebar-footer .logout-btn{border-color:var(--line);color:var(--ink-soft);box-shadow:none;}
      .sidebar-footer .logout-btn:hover{background:var(--surface-soft);color:var(--ink);}
      @media (max-width:980px){
        .nav{background:var(--surface);}
        .nav-item{border-color:var(--line);background:var(--surface);}
        .nav-item.active{background:var(--accent-soft);border-color:var(--accent-soft);color:var(--accent);}
        .sidebar-footer{border-top-color:var(--line);}
      }

      /* ---------- 4. Cards / Panels — 여백을 실무 SaaS 수준으로 확보 ---------- */
      .hero-card,.panel,.view .panel{
        border:1px solid var(--line);border-radius:var(--radius);background:var(--surface);
        box-shadow:var(--shadow-soft);padding:28px 30px;
      }
      .panel-head{margin-bottom:22px;}
      .metric-card,.console-metrics .metric-card{
        border:1px solid var(--line);border-radius:10px;background:var(--surface-soft);
        box-shadow:none;border-top:3px solid var(--accent);padding:18px;min-height:96px;
      }
      .console-metrics .metric-card:nth-child(3){border-top-color:var(--gold);}
      .console-metrics .metric-card:nth-child(4){border-top-color:var(--green,#1F7A55);}
      .view-header{border-bottom-color:var(--line);padding-bottom:20px;margin-bottom:26px;}
      .ops-panel{border:1px solid var(--line);border-radius:10px;background:var(--surface-soft);box-shadow:none;padding:20px;}
      .mini-form{border:1px solid var(--line);border-radius:10px;background:var(--surface-soft);box-shadow:none;padding:18px;}
      .management-list{gap:14px;}
      .course-panels,.ops-grid{gap:24px;}
      /* 카드 안에 카드(패널 중첩)로 보이는 경우 안쪽은 배경만 살리고 테두리/그림자는 뺌 */
      .panel .ops-panel,.panel .mini-form{box-shadow:none;}

      /* ---------- 5. Buttons: Primary / Secondary / Ghost ----------
         Primary = 진한 배경 + 흰 글자, Secondary = 흰 배경 + 테두리, Ghost = 배경 없음.
         Badge류(.status-badge, pill 뱃지)만 예외적으로 완전한 pill 유지, 나머지 버튼은 8px, 높이 40px+. */
      .login-card button,.add-course-form button,.primary-action,.submit{
        border:none;border-radius:8px;background:var(--accent);color:#fff;
        font-family:inherit;font-weight:700;cursor:pointer;min-height:42px;padding:0 20px;font-size:14px;
        box-shadow:none;transition:background .12s,transform .08s;
      }
      .login-card button:hover,.add-course-form button:hover,.primary-action:hover,.submit:hover{background:var(--accent-dark);}
      .login-card button:active,.submit:active{transform:translateY(1px);}
      .login-card button{width:100%;margin-top:22px;}

      .logout-btn,.mini-form button,.inline-btn,.filter-menu summary,
      .claude-add-row-btn,.claude-session-add-btn{
        border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);
        font-family:inherit;font-weight:600;cursor:pointer;min-height:40px;font-size:13.5px;box-shadow:none;
        transition:background .12s,border-color .12s;
      }
      .logout-btn:hover,.mini-form button:hover,.inline-btn:hover,
      .claude-add-row-btn:hover,.claude-session-add-btn:hover{
        border-color:var(--accent);background:var(--accent-soft);color:var(--accent);
      }
      .menu-btn{min-height:36px;width:36px;border-radius:8px;}
      .menu-btn:hover{border-color:var(--accent);background:var(--accent-soft);color:var(--accent);}
      .inline-btn.secondary{background:var(--ink);color:#fff;border-color:var(--ink);}
      .inline-btn.light{background:#fff;color:var(--accent);border:1px solid var(--line);}
      .claude-session-add-btn{background:var(--accent);color:#fff;border-color:var(--accent);}
      .claude-session-add-btn:hover{background:var(--accent-dark);border-color:var(--accent-dark);color:#fff;}

      /* Ghost: 드롭다운 메뉴 항목처럼 배경 없이 쓰는 버튼 */
      .menu-pop button{border-radius:6px;font-weight:600;font-size:13.5px;padding:9px 10px;}
      .menu-pop button:hover{background:var(--surface-soft);color:var(--accent);}

      /* ===== [Claude 추가] 로그인 화면 "로그인 상태 유지" 체크박스 ===== */
      .claude-keep-login-row{
        display:flex;align-items:center;gap:8px;margin:14px 0 4px;cursor:pointer;
        font-size:13px;color:var(--ink-soft);font-weight:600;user-select:none;
      }
      .claude-keep-login-row input{width:16px;height:16px;min-height:auto;accent-color:var(--accent);cursor:pointer;}

      /* ---------- 6. Inputs / Selects ----------
         버튼과 명확히 구분: 흰 배경, 얇은 테두리, radius 8px, 높이 42px, 포커스 시 Primary 링. */
      .login-card input,.mini-form input,.mini-form textarea,.mini-form select,
      .add-course-form input,.add-course-form select,.new-type-row input,
      .row-input,.trainee-input,textarea.memo-input,select.status-select,
      .claude-form-grid input,.claude-form-grid select,.claude-form-grid textarea,
      .claude-group-shared input,.claude-group-shared select,.claude-group-row input,
      .claude-sessions-add input{
        border-radius:8px;border:1px solid var(--line);background:var(--surface);
        color:var(--ink);font-family:inherit;font-size:14px;min-height:42px;
        outline:none;transition:border-color .12s,box-shadow .12s;
      }
      .mini-form textarea,textarea.memo-input,.claude-form-grid textarea{min-height:72px;}
      .login-card input:focus,.mini-form input:focus,.mini-form select:focus,
      .add-course-form input:focus,.add-course-form select:focus,.new-type-row input:focus,
      .row-input:focus,.trainee-input:focus,textarea.memo-input:focus,
      .claude-form-grid input:focus,.claude-form-grid select:focus,
      .claude-group-shared input:focus,.claude-group-shared select:focus,
      .claude-sessions-add input:focus{
        border-color:var(--accent);background:#fff;box-shadow:0 0 0 3px var(--accent-soft);
      }
      .filter-menu[open] summary{border-color:var(--accent);background:var(--accent-soft);color:var(--accent);}
      /* 회차 목록의 시작일/종료일 인풋은 "일반 정보처럼 보이다가 조작 시에만 인풋으로 드러남" */
      .course-date-quick input{
        border:1px solid transparent;background:transparent;border-radius:6px;color:var(--ink-soft);
        min-height:auto;padding:4px 6px;font-size:13.5px;
        transition:background .12s,border-color .12s;
      }
      .course-date-quick input:hover{background:var(--surface-soft);}
      .course-date-quick input:focus{
        border-color:var(--accent);background:#fff;box-shadow:0 0 0 3px var(--accent-soft);color:var(--ink);
      }

      /* ---------- 7. Badges / Status Chips (pill 형태 유지, 대비만 정리) ---------- */
      .status-badge{padding:5px 12px;border-radius:999px;font-weight:700;}
      .pill{border-radius:999px;background:var(--surface-soft);border-color:var(--line);color:var(--ink-soft);font-weight:600;}
      .course-open-toggle{
        border:none;border-radius:999px;padding:5px 12px;font-weight:700;
        background:var(--surface-soft);color:var(--muted);box-shadow:none;
      }
      .course-open-toggle.open{background:#E4F1EA;color:var(--green,#1F7A55);}

      /* 옛 하드코딩 청록색(#176B87/#0F465A/#E7F4F7/#BFDDE4) 잔재를 새 Primary 톤으로 교체 */
      .course-resizer:hover::before,.course-resizer.dragging::before{background:var(--accent);}
      .status-신청확정{background:var(--accent-soft);color:var(--accent);}
      .status-select.status-신청확정{border-color:var(--accent-soft);background:var(--accent-soft);color:var(--accent);}
      .course-tag:hover,.course-tag.active{border-color:var(--accent);background:var(--accent-soft);color:var(--accent);}
      .column-order-item input{accent-color:var(--accent);}
      .column-order-item.drag-over{background:var(--accent-soft);box-shadow:inset 0 0 0 1px var(--accent);}
      .trainee-save-btn:hover{background:var(--accent);border-color:var(--accent);color:#fff;}
      .copy-icon-btn{color:var(--accent);}
      .copy-icon-btn:hover{border-color:var(--accent);background:var(--accent-soft);}
      .lookup-interest-title{color:var(--accent);}

      /* ---------- 8. 회차 목록(과정 관리) — 정보 위계 재구성 ----------
         "드론 교육 3회차" 처럼 회차명은 크게 한 줄, 그 아래 "공개  기간  정원  개별일정"을
         한 줄의 부가정보로. 실제 조작 요소(⋯메뉴)만 우측에 버튼으로 남김.
         DOM 재배치는 claudeRestructureCourseRow() 함수(아래)에서 처리 —
         이 CSS는 그 결과물(.claude-course-meta-line 등)에 대한 스타일만 담당. */
      .course-row{
        display:grid;grid-template-columns:1fr auto;grid-template-rows:auto auto;
        column-gap:20px;row-gap:8px;align-items:start;
        padding:20px 22px;border-radius:10px;
      }
      .course-row > div:first-child{grid-column:1;grid-row:1;}
      .course-row .course-row-actions{grid-column:2;grid-row:1 / span 2;align-self:center;}
      .course-row-title{color:var(--ink);}
      .course-row-meta{color:var(--ink-soft);margin-top:3px;font-size:12.5px;}
      .claude-course-meta-line{
        grid-column:1;grid-row:2;display:flex;align-items:center;flex-wrap:wrap;gap:10px;
        color:var(--ink-soft);font-size:13.5px;
      }
      .claude-course-meta-line .claude-meta-dot{color:var(--line-strong);}
      .claude-course-meta-line .claude-meta-item{display:inline-flex;align-items:center;gap:5px;}
      .claude-course-meta-line .claude-meta-label{color:var(--muted);font-weight:600;font-size:12px;}
      .claude-course-meta-line .course-date-quick{width:auto;flex:0 0 auto;}
      .claude-course-meta-line .pill{
        background:transparent;border:none;padding:0;min-height:auto;border-radius:0;
        color:var(--ink-soft);font-weight:600;display:inline;
      }
      .claude-course-meta-line .claude-sessions-toggle-btn{
        border:none;background:transparent;padding:0;min-height:auto;color:var(--ink-soft);font-weight:600;
      }
      .claude-course-meta-line .claude-sessions-toggle-btn:hover{
        color:var(--accent);background:transparent;text-decoration:underline;
      }
      .course-edit-row{padding:20px 22px;border-radius:10px;row-gap:12px;}
      @media (max-width:980px){
        .course-row{grid-template-columns:1fr;grid-template-rows:auto auto auto;}
        .course-row .course-row-actions{grid-column:1;grid-row:3;justify-content:flex-start;align-self:auto;}
      }

      /* ---------- 9. 캘린더(제가 만든 회차 캘린더) — 시각 위계 강화 ---------- */
      .claude-cal-panel{padding:24px 26px;}
      .claude-cal-grid{gap:2px;}
      .claude-cal-cell{min-height:84px;padding:8px;}
      .claude-cal-dow{font-size:12.5px;font-weight:700;color:var(--ink-soft);padding:8px 0;}
      .claude-cal-daynum{color:var(--ink);font-weight:600;font-size:14px;}
      .claude-cal-outside .claude-cal-daynum{color:var(--muted);font-weight:400;}
      .claude-cal-today{background:var(--accent-soft);border-radius:8px;}
      .claude-cal-today .claude-cal-daynum{
        color:#fff;background:var(--accent);font-weight:800;border-radius:50%;
        display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;
      }
      .claude-cal-pill{
        background:var(--accent-soft);color:var(--accent);border:none;font-weight:600;
        padding:3px 8px;border-radius:6px;display:block;margin-top:3px;
      }
      .claude-cal-pill.claude-cal-closed{background:var(--surface-soft);color:var(--muted);}

      /* ---------- 10. 제가 만든 사이드 드로어/플로팅 버튼도 새 톤에 맞춤 ---------- */
      .claude-fab-btn{background:var(--accent);box-shadow:0 10px 22px rgba(24,33,43,0.22);}
      .claude-fab-btn:hover{background:var(--accent-dark);}
      .claude-fab-menu-item{border-radius:999px;font-weight:600;font-size:13.5px;padding:12px 20px;}
      .claude-drawer{border-radius:0;box-shadow:-14px 0 34px rgba(24,33,43,0.14);width:min(460px,100vw);}
      .claude-drawer-head h3{font-size:16px;}

      /* ---------- 11. 레이아웃 폭 / 밀도 — 넓은 데스크톱(1280~1920px+)에서
         콘텐츠가 왼쪽에 쏠리지 않도록 폭 상한을 크게 풀고, 핵심 리스트 영역에
         더 많은 비율을 줌 ---------- */
      .admin-main{max-width:none;padding:36px 40px 96px;}
      .overview-grid{grid-template-columns:minmax(0,1.3fr) minmax(360px,0.9fr);}
      .ops-grid{grid-template-columns:minmax(360px,0.85fr) minmax(0,1.5fr);}
      @media (min-width:1600px){
        .metric-grid,.console-metrics{grid-template-columns:repeat(6,minmax(150px,1fr));}
        .admin-main{padding:40px 56px 96px;}
      }

      .claude-section{margin-bottom:28px;}
      .claude-section h3{font-size:14px;font-weight:900;margin:0 0 10px;color:var(--ink);}
      .claude-section p.claude-hint{font-size:12px;color:var(--ink-soft);margin:-4px 0 12px;}

      /* 알림 관리 하위 탭 */
      .claude-subtabs{display:flex;gap:6px;margin:4px 0 18px;border-bottom:1px solid var(--line);flex-wrap:wrap;}
      .claude-subtab-btn{
        border:none;background:transparent;padding:10px 14px;font-family:inherit;font-size:13px;font-weight:800;
        color:var(--ink-soft);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;transition:color .12s, border-color .12s;
      }
      .claude-subtab-btn:hover{color:var(--ink);}
      .claude-subtab-btn.active{color:var(--accent-dark,#0F465A);border-bottom-color:var(--accent-dark,#0F465A);}
      .claude-tab-panel{display:none;}
      .claude-tab-panel.active{display:block;}
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

      /* ===== [Claude 추가] 신청자 수동 등록/단체 등록 — 오른쪽 아래 플로팅(+) 버튼
         + 노션 스타일 사이드 드로어(오른쪽에서 슬라이드로 열리는 패널) ===== */
      .claude-fab-wrap{
        position:fixed;right:26px;bottom:26px;z-index:210;display:flex;flex-direction:column;
        align-items:flex-end;gap:10px;transition:opacity .15s;
      }
      .claude-fab-wrap.claude-fab-hidden{display:none;}
      .claude-fab-btn{
        width:56px;height:56px;border-radius:50%;border:none;background:var(--accent-dark,#0F465A);
        color:#fff;font-size:28px;font-weight:400;line-height:1;cursor:pointer;
        box-shadow:0 10px 24px rgba(15,70,90,0.35);transition:transform .15s;
      }
      .claude-fab-btn:hover{transform:scale(1.06);}
      .claude-fab-btn.open{transform:rotate(45deg);}
      .claude-fab-menu{display:none;flex-direction:column;align-items:flex-end;gap:8px;}
      .claude-fab-menu.open{display:flex;}
      .claude-fab-menu-item{
        background:#fff;border:1px solid var(--line);border-radius:999px;padding:11px 18px;
        font-family:inherit;font-size:12.5px;font-weight:800;color:var(--ink);
        box-shadow:0 8px 20px rgba(15,23,32,0.14);cursor:pointer;white-space:nowrap;
      }
      .claude-fab-menu-item:hover{border-color:var(--accent,#176B87);color:var(--accent-dark,#0F465A);}

      .claude-drawer-backdrop{
        position:fixed;inset:0;background:rgba(15,23,32,0.32);z-index:190;opacity:0;pointer-events:none;
        transition:opacity .18s;
      }
      .claude-drawer-backdrop.open{opacity:1;pointer-events:auto;}
      .claude-drawer{
        position:fixed;top:0;right:0;height:100vh;width:min(440px,100vw);background:#fff;z-index:200;
        box-shadow:-14px 0 34px rgba(15,23,32,0.18);transform:translateX(100%);transition:transform .22s ease;
        display:flex;flex-direction:column;
      }
      .claude-drawer.open{transform:translateX(0);}
      .claude-drawer-head{
        display:flex;align-items:center;justify-content:space-between;padding:18px 20px;
        border-bottom:1px solid var(--line);flex:0 0 auto;
      }
      .claude-drawer-head h3{margin:0;font-size:15px;font-weight:900;color:var(--ink);}
      .claude-drawer-close{
        width:30px;height:30px;border:none;background:transparent;font-size:20px;color:var(--ink-soft);
        cursor:pointer;border-radius:50%;line-height:1;
      }
      .claude-drawer-close:hover{background:var(--surface-soft);}
      .claude-drawer-body{padding:18px 20px 28px;overflow-y:auto;flex:1 1 auto;}
      /* 사이드 패널은 폭이 좁으니 원래 2~3열이던 폼은 1열로 쌓음 */
      .claude-drawer .claude-form-grid{grid-template-columns:1fr;}
      .claude-drawer .claude-group-shared{grid-template-columns:1fr;}
      .claude-drawer .claude-group-row{grid-template-columns:1fr;gap:6px;}
      .claude-drawer .claude-group-row-remove{justify-self:end;}
      @media (max-width:600px){ .claude-drawer{width:100vw;} }

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

      /* [Claude 추가] 신청현황 행 왼쪽 선택 체크박스 (호버 시 노출) + 일괄 삭제 바 */
      .application-table th.claude-row-select-th, .application-table td.claude-row-select-cell{
        width:32px;min-width:32px;max-width:32px;text-align:center;padding:0 !important;overflow:visible !important;
      }
      .claude-row-select{
        opacity:0;width:16px;height:16px;cursor:pointer;accent-color:var(--accent-dark,#0F465A);
        transition:opacity .12s;vertical-align:middle;
      }
      #appRows tr:hover .claude-row-select, .claude-row-select:checked{opacity:1;}
      .claude-bulk-bar{
        display:none;align-items:center;gap:12px;margin:0 0 10px;padding:9px 14px;
        background:#FFF7E8;border:1px solid #E4B75E;border-radius:8px;font-size:12.5px;font-weight:800;color:#7A5C1E;
      }
      .claude-bulk-delete-btn{
        background:var(--danger,#A33C3C);color:#fff;border:none;border-radius:6px;padding:6px 14px;
        font-family:inherit;font-size:12px;font-weight:800;cursor:pointer;
      }
      .claude-bulk-delete-btn:disabled{opacity:.6;cursor:default;}
      .claude-bulk-clear-btn{
        background:transparent;border:1px solid #E4B75E;border-radius:6px;padding:6px 14px;
        font-family:inherit;font-size:12px;font-weight:800;cursor:pointer;color:#7A5C1E;
      }

      /* ===== [Claude 추가] 단체 등록 (여러 명 한 번에) ===== */
      .claude-group-shared{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px 16px;margin-bottom:14px;}
      .claude-group-shared label{display:block;font-size:12px;font-weight:800;color:var(--ink);margin-bottom:6px;}
      .claude-group-shared input, .claude-group-shared select{
        width:100%;padding:9px 11px;border:1.5px solid var(--line);border-radius:6px;font-family:inherit;font-size:13px;box-sizing:border-box;
      }
      .claude-group-rows{display:grid;gap:8px;margin-bottom:10px;}
      .claude-group-row{
        display:grid;grid-template-columns:1fr 1fr 1fr 1.2fr auto;gap:8px;align-items:center;
        padding:8px;border:1px solid var(--line);border-radius:7px;background:var(--surface-soft,#F7F9FB);
      }
      .claude-group-row input{
        padding:8px 9px;border:1px solid var(--line);border-radius:6px;font-family:inherit;font-size:12.5px;box-sizing:border-box;background:#fff;
      }
      .claude-group-row input.claude-row-err{border-color:var(--danger,#C43D3D);}
      .claude-group-row-remove{
        border:none;background:transparent;color:var(--danger,#A33C3C);font-size:16px;font-weight:900;cursor:pointer;padding:4px 6px;line-height:1;
      }
      .claude-group-row-status{grid-column:1/-1;font-size:11px;font-weight:800;margin-top:-2px;}
      .claude-group-row-status.ok{color:var(--green,#1F7A55);}
      .claude-group-row-status.err{color:var(--danger,#C43D3D);}
      .claude-group-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
      .claude-add-row-btn{
        border:1px dashed var(--line);background:#fff;border-radius:6px;padding:9px 14px;font-family:inherit;font-size:12.5px;font-weight:800;
        color:var(--accent-dark,#0F465A);cursor:pointer;
      }
      .claude-add-row-btn:hover{border-color:var(--accent,#176B87);background:var(--accent-soft,#E7F4F7);}
      .claude-group-summary{font-size:12px;font-weight:700;color:var(--ink-soft);margin-top:8px;}

      /* ===== [Claude 추가] 컬럼 설정 - 커스텀 속성 추가/삭제 ===== */
      .column-order-item .claude-custom-del{
        border:none;background:transparent;color:var(--danger,#A33C3C);font-size:13px;font-weight:900;cursor:pointer;padding:0 2px;margin-left:auto;
      }
      .claude-addfield-box{border-top:1px dashed var(--line);margin-top:10px;padding-top:10px;}
      .claude-addfield-toggle{
        display:block;width:100%;padding:7px 8px;border:1px solid var(--line);border-radius:6px;background:#fff;
        color:var(--accent-dark,#0F465A);font-family:inherit;font-size:11.5px;font-weight:800;cursor:pointer;text-align:center;
      }
      .claude-addfield-form{display:none;gap:8px;margin-top:8px;}
      .claude-addfield-form.open{display:grid;}
      .claude-addfield-form input, .claude-addfield-form select, .claude-addfield-form textarea{
        width:100%;padding:7px 8px;border:1px solid var(--line);border-radius:6px;font-family:inherit;font-size:12px;box-sizing:border-box;
      }
      .claude-addfield-form button{
        padding:7px 8px;border:1px solid var(--accent-dark,#0F465A);border-radius:6px;background:var(--accent-dark,#0F465A);
        color:#fff;font-family:inherit;font-size:11.5px;font-weight:800;cursor:pointer;
      }

      /* ===== [Claude 추가] 신청현황 인라인 편집 가능한 커스텀 셀 ===== */
      .claude-inline-cell{
        min-height:18px;padding:2px 3px;border-radius:4px;cursor:text;font-size:12.5px;color:var(--ink);
      }
      .claude-inline-cell:hover{background:var(--accent-soft,#E7F4F7);outline:1px dashed #BFDDE4;}
      .claude-inline-cell.empty{color:var(--ink-soft,#8A94A0);}
      .claude-inline-cell input{
        width:100%;padding:4px 6px;border:1.5px solid var(--accent,#176B87);border-radius:4px;font-family:inherit;font-size:12.5px;box-sizing:border-box;
      }
      .claude-custom-cb{width:15px;height:15px;cursor:pointer;accent-color:var(--accent-dark,#0F465A);}

      /* ===== [Claude 추가] 과정 관리 - 상단 일정 캘린더 ===== */
      .claude-cal-panel{margin-bottom:18px;}
      .claude-cal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}
      .claude-cal-head h3{font-size:14px;font-weight:900;margin:0;color:var(--ink);}
      .claude-cal-nav{display:flex;align-items:center;gap:10px;}
      .claude-cal-nav button{
        border:1px solid var(--line);background:#fff;border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:13px;font-weight:900;color:var(--ink);
      }
      .claude-cal-nav button:hover{border-color:var(--accent,#176B87);color:var(--accent-dark,#0F465A);}
      .claude-cal-nav span{font-size:13px;font-weight:800;color:var(--ink);min-width:88px;text-align:center;}
      .claude-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:1px;background:var(--line,#E0E6EE);border:1px solid var(--line,#E0E6EE);border-radius:8px;overflow:hidden;}
      .claude-cal-dow{background:#F8FAFC;padding:6px 4px;text-align:center;font-size:10.5px;font-weight:900;color:var(--ink-soft);}
      .claude-cal-cell{background:#fff;min-height:64px;padding:4px;cursor:pointer;transition:background .1s;}
      .claude-cal-cell:hover{background:var(--accent-soft,#E7F4F7);}
      .claude-cal-cell.claude-cal-outside{background:#FAFBFC;color:#C7CED6;}
      .claude-cal-cell.claude-cal-today .claude-cal-daynum{background:var(--accent-dark,#0F465A);color:#fff;border-radius:50%;}
      .claude-cal-daynum{font-size:11px;font-weight:800;color:var(--ink-soft);display:inline-block;width:18px;height:18px;line-height:18px;text-align:center;}
      .claude-cal-pill{
        display:block;margin-top:3px;padding:2px 5px;border-radius:4px;background:var(--accent-soft,#E7F4F7);color:var(--accent-dark,#0F465A);
        font-size:10px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
      }
      .claude-cal-pill.claude-cal-closed{background:#EDEDED;color:#888;}

      /* ===== [Claude 추가] 수료 관리 탭 ===== */
      .claude-cert-stats{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;}
      .claude-cert-stat{
        flex:1;min-width:120px;border:1px solid var(--line);border-radius:8px;padding:12px 14px;background:#fff;
      }
      .claude-cert-stat b{display:block;font-size:20px;font-weight:900;color:var(--ink);}
      .claude-cert-stat span{font-size:11.5px;font-weight:700;color:var(--ink-soft);}
      .claude-cert-num-input{
        padding:6px 8px;border:1px solid var(--line);border-radius:6px;font-family:inherit;font-size:12px;width:130px;box-sizing:border-box;
      }

      /* ===== [Claude 추가] 설정 메뉴 (활동 로그 등 자주 안 쓰는 항목을 여기로) ===== */
      .nav-item[data-view="log"]{display:none;}
      .claude-settings-menu{display:grid;gap:10px;max-width:420px;}
      .claude-settings-item{
        display:flex;align-items:center;justify-content:space-between;gap:12px;
        border:1px solid var(--line);border-radius:8px;padding:14px 16px;background:#fff;cursor:pointer;transition:border-color .12s,background .12s;
      }
      .claude-settings-item:hover{border-color:var(--accent,#176B87);background:var(--accent-soft,#E7F4F7);}
      .claude-settings-item .label{font-size:13.5px;font-weight:900;color:var(--ink);}
      .claude-settings-item .sub{font-size:11.5px;color:var(--ink-soft);margin-top:2px;}
      .claude-settings-item .arrow{font-size:16px;color:var(--ink-soft);}

      /* ===== [Claude 추가] 신청현황 "신청과정"/"상태" 칸의 콜아웃(박스)이
         컬럼 너비에 맞춰 줄바꿈 대신 말줄임(...)으로 보이게 함.
         CSS grid 자식은 기본적으로 내용 크기 밑으로 줄어들지 않아서(min-width:auto)
         그동안 컬럼을 좁혀도 텍스트가 넘쳐 보였음 — min-width:0으로 풀어주고,
         실제 텍스트를 담은 요소에 overflow:hidden + text-overflow:ellipsis 적용.
         td[data-col="course"] 자체의 overflow:visible(호버 상세 팝업용)은 그대로 둠. ===== */
      .application-table .application-course-item{min-width:0;max-width:100%;}
      .application-table .application-course-item b{
        display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;
      }
      .application-table .application-course-meta{
        overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;
      }
      .application-table .application-status-item{min-width:0;max-width:100%;}
      .application-table .application-status-list select.status-select{
        overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
      }

      /* ===== [Claude 추가] 회차별 "개별 교육일"(띄엄띄엄 진행되는 일정) 관리 ===== */
      .claude-sessions-toggle-btn{
        min-height:32px;border-radius:var(--radius);border:1px solid var(--line);background:#fff;
        color:var(--ink-soft);font-family:inherit;font-size:11.5px;font-weight:800;padding:0 10px;cursor:pointer;
      }
      .claude-sessions-toggle-btn:hover{border-color:var(--accent,#176B87);color:var(--accent-dark,#0F465A);}
      .claude-sessions-panel{
        grid-column:1 / -1;margin-top:8px;padding-top:10px;border-top:1px dashed var(--line);
      }
      .claude-sessions-panel .claude-sessions-hint{font-size:11px;color:var(--ink-soft);margin-bottom:8px;line-height:1.5;}
      .claude-sessions-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;}
      .claude-session-chip{
        display:inline-flex;align-items:center;gap:6px;padding:4px 4px 4px 10px;border-radius:999px;
        background:var(--accent-soft,#E7F4F7);color:var(--accent-dark,#0F465A);font-size:12px;font-weight:800;
      }
      .claude-session-del{
        width:18px;height:18px;border:none;border-radius:50%;background:rgba(15,70,90,0.12);color:inherit;
        font-size:12px;line-height:1;cursor:pointer;
      }
      .claude-session-del:hover{background:rgba(15,70,90,0.24);}
      .claude-sessions-empty{font-size:12px;color:#C7CED6;}
      .claude-sessions-add{display:flex;gap:6px;align-items:center;}
      .claude-sessions-add input{
        border:1px solid #D7E0EA;border-radius:7px;background:#fff;padding:7px 8px;
        font-family:inherit;font-size:12px;color:#1D2530;outline:none;
      }
      .claude-sessions-add button{
        min-height:32px;border-radius:var(--radius);border:1px solid var(--accent,#176B87);
        background:var(--accent,#176B87);color:#fff;font-family:inherit;font-size:11.5px;font-weight:800;
        padding:0 10px;cursor:pointer;
      }
    `;
    document.head.appendChild(style);
  }

  /* ===== [Claude 추가] 발송 설정도 실패 시 화면에 사유 표시 (위 발송 문구와 동일한 이유) ===== */
  async function loadNotificationSettings() {
    const el = document.getElementById('claudeSettingsGrid');
    try {
      const { data, error } = await sb.from('notification_settings').select('*');
      if (error) {
        console.warn('[Claude] 알림 설정 로드 실패:', error);
        if (el) el.innerHTML = `<p class="claude-hint" style="color:var(--danger, #A33C3C);">설정을 불러오지 못했습니다: ${escapeHtml(error.message || String(error))}</p>`;
        return;
      }
      settingsCache = data || [];
      renderSettings();
    } catch (e) {
      console.warn('[Claude] 알림 설정 로드 중 예외:', e);
      if (el) el.innerHTML = `<p class="claude-hint" style="color:var(--danger, #A33C3C);">설정을 불러오지 못했습니다: ${escapeHtml(String(e && e.message ? e.message : e))}</p>`;
    }
  }
  /* ===== [Claude 추가] 끝 ===== */

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

  /* ===== [Claude 추가] 발송 문구가 "불러오는 중..."에서 멈춰 안 보이던 문제 대응 시작
     기존엔 조회 실패 시 콘솔에만 경고를 남기고 화면은 그대로 방치되어, 사용자 입장에선
     원인을 알 수 없이 계속 로딩 중인 것처럼 보였음. 이제 실패 사유를 화면에 직접 표시함. */
  async function loadTemplates() {
    const el = document.getElementById('claudeTemplateEditor');
    try {
      const { data, error } = await sb.from('notification_templates').select('*');
      if (error) {
        console.warn('[Claude] 알림 문구 로드 실패:', error);
        if (el) el.innerHTML = `<p class="claude-hint" style="color:var(--danger, #A33C3C);">문구를 불러오지 못했습니다: ${escapeHtml(error.message || String(error))}</p>`;
        return;
      }
      templatesCache = data || [];
      renderTemplateEditor();
      renderManualQuickfillButtons();
    } catch (e) {
      console.warn('[Claude] 알림 문구 로드 중 예외:', e);
      if (el) el.innerHTML = `<p class="claude-hint" style="color:var(--danger, #A33C3C);">문구를 불러오지 못했습니다: ${escapeHtml(String(e && e.message ? e.message : e))}</p>`;
    }
  }
  /* ===== [Claude 추가] 끝 ===== */

  /* ===== [Claude 추가] 자유롭게 이름 붙여서 추가하는 "나만의 문구 템플릿" 시작
     기존 문구(신청접수/상태변경/일정임박)는 정해진 상황에서만 쓰이는데,
     "문구를 자유롭게 추가하고 싶다"는 요청에 따라 이름만 붙이면 몇 개든 추가할 수
     있는 템플릿을 별도로 지원함. notification_templates 테이블을 그대로 쓰되
     event_type='custom', detail=템플릿 이름으로 저장 — 새 테이블 없이 재사용.
     "개별 발송" 탭의 빠른 채우기에도 자동으로 나타남. */
  function customTemplateRowMarkup(tpl) {
    const isEmail = tpl.channel === 'email';
    return `
      <div class="claude-tpl-row" data-row-id="custom__${escapeHtml(tpl.channel)}__${escapeHtml(tpl.detail)}">
        <span class="ch ${isEmail ? '' : 'sms'}">${escapeHtml(tpl.detail)} · ${CHANNEL_LABELS[tpl.channel]}</span>
        ${isEmail ? `<label>제목</label><input type="text" class="claude-tpl-subject" value="${escapeHtml(tpl.subject || '')}">` : ''}
        <label>${isEmail ? '본문' : '내용'}</label>
        <textarea class="claude-tpl-body" rows="${isEmail ? 4 : 2}">${escapeHtml(tpl.body || '')}</textarea>
        <div class="claude-tpl-row-foot">
          <span class="claude-hint" style="margin:0;">사용 가능: <span class="var">{{name}}</span></span>
          <button type="button" class="claude-tpl-save-btn" data-event="custom" data-channel="${escapeHtml(tpl.channel)}" data-detail="${escapeHtml(tpl.detail)}">저장</button>
          <button type="button" class="claude-tpl-delete-btn" data-channel="${escapeHtml(tpl.channel)}" data-detail="${escapeHtml(tpl.detail)}">삭제</button>
          <span class="claude-tpl-msg"></span>
        </div>
      </div>
    `;
  }

  function renderCustomTemplateSection() {
    const listEl = document.getElementById('claudeCustomTplList');
    if (!listEl) return;
    const customTpls = templatesCache.filter(t => t.event_type === 'custom');
    listEl.innerHTML = customTpls.length
      ? customTpls.map(customTemplateRowMarkup).join('')
      : `<p class="claude-hint" style="margin:0 0 10px;">아직 추가한 템플릿이 없습니다. 아래에서 새로 만들어보세요.</p>`;

    listEl.querySelectorAll('.claude-tpl-save-btn').forEach(btn => {
      btn.addEventListener('click', () => claudeSaveTemplateRow(btn));
    });
    listEl.querySelectorAll('.claude-tpl-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(`"${btn.dataset.detail}" 템플릿을 삭제할까요?`)) return;
        btn.disabled = true;
        const { error } = await sb.from('notification_templates').delete()
          .eq('event_type', 'custom').eq('channel', btn.dataset.channel).eq('detail', btn.dataset.detail);
        if (error) { alert(`삭제 실패: ${error.message}`); btn.disabled = false; return; }
        templatesCache = templatesCache.filter(t => !(t.event_type === 'custom' && t.channel === btn.dataset.channel && t.detail === btn.dataset.detail));
        renderCustomTemplateSection();
        renderManualQuickfillButtons();
      });
    });
  }

  function bindCustomTemplateAddForm() {
    const btn = document.getElementById('claudeCustomTplAddBtn');
    if (!btn || btn.dataset.claudeBound) return;
    btn.dataset.claudeBound = 'true';
    const channelSelect = document.getElementById('claudeCustomTplChannel');
    const subjectWrap = document.getElementById('claudeCustomTplSubjectWrap');
    const toggleSubjectWrap = () => { if (subjectWrap) subjectWrap.style.display = channelSelect.value === 'email' ? '' : 'none'; };
    if (channelSelect) { channelSelect.addEventListener('change', toggleSubjectWrap); toggleSubjectWrap(); }

    btn.addEventListener('click', async () => {
      const nameEl = document.getElementById('claudeCustomTplName');
      const bodyEl = document.getElementById('claudeCustomTplBody');
      const subjectEl = document.getElementById('claudeCustomTplSubject');
      const msgEl = document.getElementById('claudeCustomTplMsg');
      const name = (nameEl.value || '').trim();
      const channel = channelSelect.value;
      const body = (bodyEl.value || '').trim();
      msgEl.className = 'claude-tpl-msg';
      if (!name) { msgEl.textContent = '템플릿 이름을 입력해주세요.'; msgEl.classList.add('error'); return; }
      if (!body) { msgEl.textContent = '내용을 입력해주세요.'; msgEl.classList.add('error'); return; }
      if (templatesCache.some(t => t.event_type === 'custom' && t.channel === channel && t.detail === name)) {
        msgEl.textContent = '같은 이름의 템플릿이 이미 있습니다.'; msgEl.classList.add('error'); return;
      }
      btn.disabled = true;
      msgEl.textContent = '추가 중...';
      const { data, error } = await sb.from('notification_templates').insert({
        event_type: 'custom', channel, detail: name,
        subject: channel === 'email' ? (subjectEl.value || null) : null,
        body,
      }).select().maybeSingle();
      btn.disabled = false;
      if (error) { msgEl.textContent = `추가 실패: ${error.message}`; msgEl.classList.add('error'); return; }
      if (data) templatesCache.push(data);
      nameEl.value = ''; subjectEl.value = ''; bodyEl.value = '';
      msgEl.textContent = '추가됨';
      msgEl.classList.add('success');
      setTimeout(() => { msgEl.textContent = ''; msgEl.className = 'claude-tpl-msg'; }, 1800);
      renderCustomTemplateSection();
      renderManualQuickfillButtons();
    });
  }
  /* ===== [Claude 추가] 끝 ===== */

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
      <details class="claude-preview-group" open>
        <summary>④ 나만의 문구 템플릿 (자유 추가)</summary>
        <div class="claude-preview-body">
          <p class="claude-hint">이름만 붙이면 몇 개든 자유롭게 추가할 수 있습니다. "개별 발송" 탭의 빠른 채우기에도 자동으로 나타납니다.</p>
          <div id="claudeCustomTplList"></div>
          <div class="claude-custom-tpl-add">
            <div class="claude-form-grid" style="grid-template-columns:1fr 130px;">
              <div><label>템플릿 이름</label><input type="text" id="claudeCustomTplName" placeholder="예: 수료증 발급 안내"></div>
              <div><label>채널</label>
                <select id="claudeCustomTplChannel">
                  <option value="email">이메일</option>
                  <option value="sms">문자</option>
                </select>
              </div>
            </div>
            <div style="margin-top:10px;" id="claudeCustomTplSubjectWrap"><label>제목</label><input type="text" id="claudeCustomTplSubject"></div>
            <div style="margin-top:10px;"><label>내용</label><textarea id="claudeCustomTplBody" rows="3" placeholder="{{name}}님, ... 처럼 이름을 자동으로 넣을 수 있습니다."></textarea></div>
            <div style="margin-top:10px;">
              <button type="button" id="claudeCustomTplAddBtn" class="claude-tpl-save-btn">+ 새 템플릿 추가</button>
              <span class="claude-tpl-msg" id="claudeCustomTplMsg"></span>
            </div>
          </div>
        </div>
      </details>
    `;

    el.querySelectorAll('.claude-tpl-save-btn').forEach(btn => {
      if (btn.id === 'claudeCustomTplAddBtn') return;
      btn.addEventListener('click', () => claudeSaveTemplateRow(btn));
    });
    renderCustomTemplateSection();
    bindCustomTemplateAddForm();
  }

  /* ===== [Claude 추가] 기존 저장 로직을 공용 함수로 분리 (나만의 문구 템플릿에서도 재사용) ===== */
  async function claudeSaveTemplateRow(btn) {
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
    /* ===== [Claude 추가] 협약서 PDF 첨부 체크박스 (이메일에만 적용됨) ===== */
    const attachAgreement = document.getElementById('claudeManualAttachAgreement')?.checked || false;

    if (recipients.length === 0) { msgEl.textContent = '수신자를 먼저 선택해주세요.'; msgEl.classList.add('error'); return; }
    if (channels.length === 0) { msgEl.textContent = '발송 채널(이메일/문자)을 선택해주세요.'; msgEl.classList.add('error'); return; }
    if (!body.trim()) { msgEl.textContent = '내용을 입력해주세요.'; msgEl.classList.add('error'); return; }

    const sendBtn = document.getElementById('claudeManualSendBtn');
    sendBtn.disabled = true;
    sendBtn.textContent = `발송 중... (0/${recipients.length})`;

    /* ===== [Claude 추가] 실제 발송 성공/실패 판정 버그 수정 시작 =====
       기존엔 sb.functions.invoke()가 HTTP 레벨에서 에러 없이 응답만 오면(200 OK) 무조건
       "성공"으로 카운트했음. 그런데 notify-manual 함수는 실제 이메일/문자 발송이 실패해도
       (Resend/Aligo 쪽 오류) HTTP 자체는 200으로 응답하고 결과를 body.results 안에 담아서
       돌려주기 때문에, 실제로는 다 실패했는데도 "발송 성공"으로 잘못 표시되는 문제가 있었음.
       이제 응답의 results.email / results.sms 안의 실제 ok 값을 보고 판정함. */
    let successCount = 0;
    let failCount = 0;
    const firstErrors = [];
    for (let i = 0; i < recipients.length; i++) {
      const t = recipients[i];
      try {
        const { data, error } = await sb.functions.invoke('notify-manual', {
          body: { traineeId: t.id, channels, subject, body, attachAgreement },
        });
        if (error) {
          failCount += channels.length;
          firstErrors.push(`${t.name}: ${error.message || '요청 실패'}`);
        } else {
          channels.forEach(ch => {
            const r = data?.results?.[ch];
            if (r && r.ok) {
              successCount++;
            } else {
              failCount++;
              if (r?.error) firstErrors.push(`${t.name}(${CHANNEL_LABELS[ch]}): ${r.error}`);
            }
          });
        }
      } catch (e) {
        failCount += channels.length;
        firstErrors.push(`${t.name}: ${String(e)}`);
      }
      sendBtn.textContent = `발송 중... (${i + 1}/${recipients.length})`;
    }
    sendBtn.disabled = false;
    sendBtn.textContent = '발송하기';

    let summary = `발송 완료: 성공 ${successCount}건, 실패 ${failCount}건.`;
    if (failCount > 0 && firstErrors.length) {
      summary += ` 첫 실패 사유: ${firstErrors[0]}`;
    }
    msgEl.textContent = summary;
    msgEl.classList.add(failCount ? 'error' : 'success');
    /* ===== [Claude 추가] 끝 ===== */
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
    renderManualQuickfillButtons();
  }

  /* ===== [Claude 추가] "나만의 문구 템플릿"을 개별 발송의 빠른 채우기 목록에 반영 ===== */
  function renderManualQuickfillButtons() {
    const el = document.getElementById('claudeCustomQuickfillList');
    if (!el) return;
    const customTpls = templatesCache.filter(t => t.event_type === 'custom');
    el.innerHTML = customTpls.map(t => `
      <button type="button" class="claude-resend-btn claude-manual-quickfill" data-event="custom" data-channel="${escapeHtml(t.channel)}" data-detail="${escapeHtml(t.detail)}">${escapeHtml(t.detail)}</button>
    `).join('');
    el.querySelectorAll('.claude-manual-quickfill').forEach(btn => {
      btn.addEventListener('click', () => claudeFillManualTemplate(btn.dataset.event, btn.dataset.channel, btn.dataset.detail || ''));
    });
  }

  /* ==================================================================
   * [Claude 추가] 신청현황 각 행의 ⋯ 메뉴에 있는 "문자/메일 보내기" 버튼 →
   * 알림 관리 탭 · 개별 발송 서브탭으로 바로 이동하면서 그 신청자를 수신자로
   * 미리 넣어줌 (요청: "클릭하면 알림관리에 수신자 입력된 상태로 간다거나").
   * 이벤트 위임으로 한 번만 바인딩 — renderApps()가 다시 그려져도 계속 동작함.
   * ================================================================== */
  function claudeQuickSendToTrainee(trainee) {
    const navBtn = document.querySelector('.nav-item[data-view="claude-notify"]');
    if (navBtn) navBtn.click();
    const manualTabBtn = document.querySelector('#claudeSubtabs .claude-subtab-btn[data-tab="manual"]');
    if (manualTabBtn) manualTabBtn.click();
    if (trainee.id) {
      claudeManualSelected.set(trainee.id, trainee);
      renderManualRecipientChips();
    }
    setTimeout(() => {
      document.getElementById('claudeManualBody')?.focus();
      document.getElementById('view-claude-notify')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  function bindQuickNotifyDelegate() {
    if (document.body.dataset.claudeQuickNotifyBound) return;
    document.body.dataset.claudeQuickNotifyBound = 'true';
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.claude-quick-notify-btn');
      if (!btn) return;
      e.preventDefault();
      const traineeId = btn.dataset.traineeId;
      if (!traineeId) {
        alert('이 신청자의 정보를 찾을 수 없습니다.');
        return;
      }
      claudeQuickSendToTrainee({
        id: traineeId,
        name: btn.dataset.name || '',
        phone: btn.dataset.phone || '',
        email: btn.dataset.email || '',
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

    msgEl.textContent = '등록되었습니다. 아래 목록에서 바로 확인할 수 있습니다.';
    msgEl.classList.add('success');
    document.getElementById('claudeAddForm').reset();
    populateStatusSelect();

    if (typeof loadApplications === 'function') {
      loadApplications();
    }
  }

  /* ==================================================================
   * [Claude 추가] 알림 관리 탭 UI 개선 — 내용이 많아 한 화면에 다 몰려있던 걸
   * 하위 탭(문구 편집 / 개별 발송 / 발송 이력 / on-off 설정)으로 나눔.
   * 기존 DOM id(claudeTemplateEditor, claudeManual*, claudeSettingsGrid,
   * claudeLogRows 등)는 전부 그대로 유지 — 로딩/바인딩 로직 변경 없음.
   * ================================================================== */
  function buildSectionMarkup() {
    return `
      <div class="view-header">
        <h2>알림 관리</h2>
        <p>문자/메일 알림 발송 이력을 확인하고, 상황별 발송 여부를 켜고 끌 수 있습니다.</p>
      </div>

      <div class="claude-subtabs" id="claudeSubtabs">
        <button type="button" class="claude-subtab-btn active" data-tab="templates">발송 문구</button>
        <button type="button" class="claude-subtab-btn" data-tab="manual">개별 발송</button>
        <button type="button" class="claude-subtab-btn" data-tab="log">발송 이력</button>
        <button type="button" class="claude-subtab-btn" data-tab="settings">발송 설정</button>
      </div>

      <div class="claude-tab-panel active" data-tab-panel="templates">
        <div class="claude-section">
          <p class="claude-hint">실제로 발송되는 이메일/문자 내용입니다. 아래에서 직접 수정 후 "저장"을 누르면 다음 발송부터 바로 반영됩니다. <span class="var">{{name}}</span>(이름), <span class="var">{{course}}</span>(과정명), <span class="var">{{start_date}}</span>(교육 시작일)은 신청자별로 자동 대체됩니다.</p>
          <div id="claudeTemplateEditor">불러오는 중...</div>
        </div>
      </div>

      <div class="claude-tab-panel" data-tab-panel="manual">
        <div class="claude-section">
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
            <!-- ===== [Claude 추가] 협약서 PDF 첨부 시작 ===== -->
            <div class="claude-checks" style="margin-top:6px;">
              <label><input type="checkbox" id="claudeManualAttachAgreement"> 협약서 양식 첨부 (이메일에만 첨부됩니다)</label>
            </div>
            <!-- ===== [Claude 추가] 끝 ===== -->

            <div style="margin-top:6px;">
              <span class="claude-hint" style="margin:0 0 6px;display:block;">빠른 채우기:</span>
              <button type="button" class="claude-resend-btn claude-manual-quickfill" data-event="application_received" data-channel="email">신청접수 문구</button>
              <button type="button" class="claude-resend-btn claude-manual-quickfill" data-event="status_change" data-channel="email" data-detail="승인">승인 문구</button>
              <button type="button" class="claude-resend-btn claude-manual-quickfill" data-event="course_reminder" data-channel="email">일정임박 문구</button>
              <!-- ===== [Claude 추가] 나만의 문구 템플릿도 빠른 채우기에 자동으로 추가됨 ===== -->
              <span id="claudeCustomQuickfillList"></span>
              <!-- ===== [Claude 추가] 끝 ===== -->
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
          <p class="claude-hint">신청자를 1명씩 직접 등록하는 기능은 <strong>신청 현황</strong> 화면으로 이동했습니다. 신청 현황 상단의 "+ 신청자 수동 등록"을 열어주세요.</p>
        </div>
      </div>

      <div class="claude-tab-panel" data-tab-panel="log">
        <div class="claude-section">
          <div class="table-shell simple-table">
            <table>
              <thead><tr><th>시간</th><th>상황</th><th>채널</th><th>수신자</th><th>상태</th><th>재발송</th></tr></thead>
              <tbody id="claudeLogRows"><tr><td colspan="6" class="empty-row">불러오는 중...</td></tr></tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="claude-tab-panel" data-tab-panel="settings">
        <div class="claude-section">
          <p class="claude-hint">상황별로 자동 발송을 켜고 끌 수 있습니다. 꺼두면 발송 이력에 "꺼짐"으로만 기록되고 실제 발송은 되지 않습니다.</p>
          <div class="claude-toggle-grid" id="claudeSettingsGrid">불러오는 중...</div>
        </div>
      </div>
    `;
  }

  function bindNotifySubTabs() {
    const bar = document.getElementById('claudeSubtabs');
    if (!bar || bar.dataset.claudeBound) return;
    bar.dataset.claudeBound = 'true';
    bar.querySelectorAll('.claude-subtab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        bar.querySelectorAll('.claude-subtab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('#view-claude-notify .claude-tab-panel').forEach(panel => {
          panel.classList.toggle('active', panel.dataset.tabPanel === btn.dataset.tab);
        });
      });
    });
  }

  /* ==================================================================
   * [Claude 추가] 신청자 수동 등록 폼. 예전엔 "신청 현황" 화면 안에 접이식(<details>)
   * 패널로 박혀 있었는데, 오른쪽 아래 플로팅(+) 버튼을 누르면 노션처럼
   * 오른쪽에서 슬라이드로 열리는 사이드 패널(드로어)로 바뀜.
   * (드로어/플로팅 버튼 마크업과 여닫는 로직은 claudeInjectApplicantDrawers() 참고)
   * ================================================================== */
  function buildApplicantAddDrawer() {
    return `
      <aside class="claude-drawer" id="claudeAddDrawer">
        <div class="claude-drawer-head">
          <h3>+ 신청자 수동 등록 (1명씩)</h3>
          <button type="button" class="claude-drawer-close" aria-label="닫기">×</button>
        </div>
        <div class="claude-drawer-body">
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
      </aside>
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
    navBtn.innerHTML = '<span>05</span>알림 관리'; /* [Claude 추가] 활동 로그(구 05)가 설정으로 옮겨가면서 한 칸씩 당김 */
    nav.appendChild(navBtn);

    const section = document.createElement('section');
    section.className = 'view';
    section.id = 'view-claude-notify';
    section.innerHTML = buildSectionMarkup();
    main.appendChild(section);
    bindManualSendUI();
    bindNotifySubTabs();

    navBtn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
      document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
      navBtn.classList.add('active');
      section.classList.add('active');
      onShowNotifyPanel();
    });

    claudeInjectApplicantDrawers();
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
    claudeInjectRowSelectColumn();
    claudeBindCustomFieldCells();
    claudeAugmentColumnOrderPanel();
    claudeRenderUpcomingPanel();
  }

  /* ==================================================================
   * [Claude 추가] 신청현황 테이블 각 행 맨 왼쪽에 체크박스를 추가함.
   * 평소엔 숨겨져 있다가 그 행에 마우스를 올리면 나타나고, 체크된 행이 있으면
   * 계속 보임. 여러 명을 선택해서 한 번에 삭제할 수 있음 (요청: "왼쪽에 가져다
   * 대면 체크박스 나타나서 체크하면 일괄 삭제 가능하게").
   * 한 행 = 한 신청자(trainee)이므로, 삭제 시 그 신청자의 신청 건 전체를
   * 지움(신청 건이 여러 개로 묶인 신청자도 전부 삭제됨 — 개별 건만 남기고
   * 싶으면 기존의 "이 건 삭제"를 사용해주세요).
   * ================================================================== */
  const claudeSelectedTraineeIds = new Set();

  function claudeUpdateBulkBar() {
    const bar = document.getElementById('claudeBulkBar');
    if (!bar) return;
    const count = claudeSelectedTraineeIds.size;
    bar.style.display = count > 0 ? 'flex' : 'none';
    const countEl = bar.querySelector('.claude-bulk-count');
    if (countEl) countEl.textContent = `${count}명 선택됨`;
  }

  async function claudeBulkDeleteSelected() {
    const ids = [...claudeSelectedTraineeIds];
    if (ids.length === 0) return;
    if (!confirm(`선택한 ${ids.length}명의 신청 내역을 전부 삭제할까요?\n(같은 신청자의 신청 건이 여러 개면 전부 함께 삭제됩니다)`)) return;
    const btn = document.getElementById('claudeBulkDeleteBtn');
    if (btn) { btn.disabled = true; btn.textContent = '삭제 중...'; }
    const results = await Promise.all(ids.map(traineeId => sb.from('applications').delete().eq('trainee_id', traineeId)));
    const failed = results.filter(r => r && r.error);
    claudeSelectedTraineeIds.clear();
    if (btn) { btn.disabled = false; btn.textContent = '선택 삭제'; }
    claudeUpdateBulkBar();
    if (failed.length) {
      alert(`${failed.length}건 삭제 중 실패했습니다: ${failed[0].error.message}`);
    }
    if (typeof loadApplications === 'function') {
      await loadApplications();
    } else if (typeof renderApps === 'function') {
      renderApps();
    }
    if (typeof renderMetrics === 'function') renderMetrics();
    if (typeof loadRecentActivity === 'function') loadRecentActivity();
  }

  function claudeInjectBulkBar() {
    const view = document.getElementById('view-applications');
    if (!view || document.getElementById('claudeBulkBar')) return;
    const anchor = view.querySelector('.table-shell.application-table');
    const bar = document.createElement('div');
    bar.id = 'claudeBulkBar';
    bar.className = 'claude-bulk-bar';
    bar.style.display = 'none';
    bar.innerHTML = `
      <span class="claude-bulk-count">0명 선택됨</span>
      <button type="button" id="claudeBulkDeleteBtn" class="claude-bulk-delete-btn">선택 삭제</button>
      <button type="button" id="claudeBulkClearBtn" class="claude-bulk-clear-btn">선택 해제</button>
    `;
    if (anchor) view.insertBefore(bar, anchor);
    else view.appendChild(bar);
    bar.querySelector('#claudeBulkDeleteBtn').addEventListener('click', claudeBulkDeleteSelected);
    bar.querySelector('#claudeBulkClearBtn').addEventListener('click', () => {
      claudeSelectedTraineeIds.clear();
      document.querySelectorAll('.claude-row-select:checked').forEach(cb => { cb.checked = false; });
      claudeUpdateBulkBar();
    });
  }

  function claudeInjectRowSelectColumn() {
    const headRow = document.querySelector('#appHead tr');
    if (headRow && !headRow.querySelector('.claude-row-select-th')) {
      const th = document.createElement('th');
      th.className = 'claude-row-select-th';
      th.setAttribute('aria-label', '선택');
      headRow.insertBefore(th, headRow.firstChild);
    }
    document.querySelectorAll('#appRows tr[data-trainee-id]').forEach(tr => {
      if (tr.querySelector('.claude-row-select-cell')) return;
      const traineeId = tr.dataset.traineeId;
      if (!traineeId) return;
      const td = document.createElement('td');
      td.className = 'claude-row-select-cell';
      td.innerHTML = `<input type="checkbox" class="claude-row-select" aria-label="이 신청자 선택">`;
      tr.insertBefore(td, tr.firstChild);
      const cb = td.querySelector('.claude-row-select');
      cb.dataset.traineeId = traineeId;
      if (claudeSelectedTraineeIds.has(traineeId)) cb.checked = true;
      cb.addEventListener('click', (e) => e.stopPropagation());
      cb.addEventListener('change', () => {
        if (cb.checked) claudeSelectedTraineeIds.add(traineeId);
        else claudeSelectedTraineeIds.delete(traineeId);
        claudeUpdateBulkBar();
      });
    });
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
    claudeInjectBulkBar();
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

  /* ==================================================================
   * [Claude 추가] 단체 등록 — 회사 하나에 대해 여러 명을 한 번에 등록.
   * 기존 "+ 신청자 수동 등록(1명씩)" 패널의 RPC(claude_admin_add_application)를
   * 행마다 재사용함. 신청 과정/초기 상태/회사명은 공통으로 적용.
   * ================================================================== */
  let claudeGroupRowSeq = 0;

  function claudeGroupRowMarkup(rowKey) {
    return `
      <div class="claude-group-row" data-row-key="${rowKey}">
        <input type="text" placeholder="이름 *" data-field="name">
        <input type="tel" placeholder="연락처 *" data-field="phone">
        <input type="email" placeholder="이메일" data-field="email">
        <input type="text" placeholder="주민등록번호 * (000000-0000000)" data-field="rrn">
        <button type="button" class="claude-group-row-remove" title="이 행 삭제">×</button>
      </div>
    `;
  }

  function buildGroupAddDrawer() {
    return `
      <aside class="claude-drawer" id="claudeGroupAddDrawer">
        <div class="claude-drawer-head">
          <h3>+ 단체 등록 (여러 명 한 번에)</h3>
          <button type="button" class="claude-drawer-close" aria-label="닫기">×</button>
        </div>
        <div class="claude-drawer-body">
          <p class="claude-hint">회사명·신청 과정·초기 상태는 아래 목록 전체에 공통으로 적용됩니다. 각 사람마다 이름/연락처/주민등록번호는 필수입니다.</p>
          <div class="claude-group-shared">
            <div><label>회사명</label><input type="text" id="claudeGroupCompany" placeholder="예: ○○산업"></div>
            <div><label>신청 과정 *</label><select id="claudeGroupCourse"></select></div>
            <div><label>초기 상태 *</label><select id="claudeGroupStatus"></select></div>
          </div>
          <div class="claude-group-rows" id="claudeGroupRows"></div>
          <div class="claude-group-actions">
            <button type="button" class="claude-add-row-btn" id="claudeGroupAddRowBtn">+ 행 추가</button>
            <button type="button" id="claudeGroupSubmitBtn" class="submit" style="width:auto;padding:10px 22px;">전체 등록</button>
          </div>
          <div id="claudeGroupMsg" class="claude-msg"></div>
        </div>
      </aside>
    `;
  }

  function claudeAddGroupRow() {
    const rows = document.getElementById('claudeGroupRows');
    if (!rows) return;
    claudeGroupRowSeq += 1;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = claudeGroupRowMarkup(claudeGroupRowSeq);
    rows.appendChild(wrapper.firstElementChild);
  }

  function populateGroupSelects() {
    const courseSel = document.getElementById('claudeGroupCourse');
    if (courseSel) {
      const courses = (typeof allCourses !== 'undefined' && Array.isArray(allCourses)) ? allCourses : [];
      courseSel.innerHTML = '<option value="">과정 선택</option>' + courses.map(c =>
        `<option value="${escapeHtml(c.id)}">${escapeHtml((c.course_types?.name || '') + ' ' + c.name)}${c.start_date ? ' (' + escapeHtml(c.start_date) + ')' : ''}</option>`
      ).join('');
    }
    const statusSel = document.getElementById('claudeGroupStatus');
    if (statusSel) {
      const statuses = (typeof APPLICATION_STATUSES !== 'undefined') ? APPLICATION_STATUSES : ['대기', '승인', '중복신청', '신청확정', '수료', '거절', '취소'];
      statusSel.innerHTML = statuses.map(s => `<option value="${s}" ${s === '대기' ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('');
    }
  }

  async function submitGroupApplications() {
    const msgEl = document.getElementById('claudeGroupMsg');
    const company = document.getElementById('claudeGroupCompany').value.trim();
    const courseId = document.getElementById('claudeGroupCourse').value;
    const status = document.getElementById('claudeGroupStatus').value;
    msgEl.textContent = '';
    msgEl.className = 'claude-msg';

    if (!courseId) {
      msgEl.textContent = '신청 과정을 선택해주세요.';
      msgEl.classList.add('error');
      return;
    }

    const rowEls = [...document.querySelectorAll('#claudeGroupRows .claude-group-row')];
    const rowsToSubmit = [];
    let hasBlockingError = false;

    rowEls.forEach(rowEl => {
      rowEl.querySelectorAll('.claude-group-row-status').forEach(n => n.remove());
      rowEl.querySelectorAll('input').forEach(inp => inp.classList.remove('claude-row-err'));

      const name = rowEl.querySelector('[data-field="name"]').value.trim();
      const phone = rowEl.querySelector('[data-field="phone"]').value.trim();
      const email = rowEl.querySelector('[data-field="email"]').value.trim();
      const rrn = rowEl.querySelector('[data-field="rrn"]').value.trim();

      if (!name && !phone && !rrn && !email) return; // 완전히 빈 행은 건너뜀

      const missing = [];
      if (!name) missing.push('name');
      if (!phone) missing.push('phone');
      if (!rrn) missing.push('rrn');
      if (missing.length) {
        missing.forEach(f => rowEl.querySelector(`[data-field="${f}"]`)?.classList.add('claude-row-err'));
        hasBlockingError = true;
        return;
      }
      rowsToSubmit.push({ rowEl, name, phone, email, rrn });
    });

    if (hasBlockingError) {
      msgEl.textContent = '빨간 테두리로 표시된 필수 항목(이름/연락처/주민등록번호)을 채워주세요.';
      msgEl.classList.add('error');
      return;
    }
    if (!rowsToSubmit.length) {
      msgEl.textContent = '등록할 사람을 1명 이상 입력해주세요.';
      msgEl.classList.add('error');
      return;
    }

    const submitBtn = document.getElementById('claudeGroupSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = `등록 중... (0/${rowsToSubmit.length})`;

    let okCount = 0;
    let failCount = 0;

    for (let i = 0; i < rowsToSubmit.length; i++) {
      const row = rowsToSubmit[i];
      const { error } = await sb.rpc('claude_admin_add_application', {
        p_name: row.name,
        p_phone: row.phone,
        p_email: row.email || null,
        p_company: company || null,
        p_resident_number: row.rrn,
        p_course_id: courseId,
        p_status: status,
        p_employment_category: null,
        p_note: '단체 등록',
      });
      submitBtn.textContent = `등록 중... (${i + 1}/${rowsToSubmit.length})`;

      const statusNote = document.createElement('div');
      statusNote.className = 'claude-group-row-status';
      if (error) {
        failCount += 1;
        statusNote.classList.add('err');
        statusNote.textContent = `실패: ${error.message}`;
        row.rowEl.appendChild(statusNote);
      } else {
        okCount += 1;
        row.rowEl.remove(); // 성공한 행은 목록에서 제거
      }
    }

    submitBtn.disabled = false;
    submitBtn.textContent = '전체 등록';

    msgEl.textContent = `완료: 성공 ${okCount}건, 실패 ${failCount}건${failCount ? ' (실패한 행은 아래 남아있습니다. 수정 후 다시 등록해주세요.)' : ''}`;
    msgEl.classList.add(failCount ? 'error' : 'success');

    if (!document.querySelectorAll('#claudeGroupRows .claude-group-row').length) {
      claudeAddGroupRow();
      claudeAddGroupRow();
      claudeAddGroupRow();
    }

    if (okCount && typeof loadApplications === 'function') {
      loadApplications();
    }
  }

  /* ==================================================================
   * [Claude 추가] "신청자 수동 등록"/"단체 등록"을 신청 현황 화면 안에 끼워넣는
   * 대신, 오른쪽 아래 플로팅(+) 버튼 → 메뉴 → 노션처럼 오른쪽에서 슬라이드로
   * 열리는 사이드 패널(드로어)로 바꿈. 폼 자체(아이디/제출 로직)는 그대로 재사용.
   * ================================================================== */
  function claudeBuildFabMarkup() {
    return `
      <div class="claude-drawer-backdrop" id="claudeDrawerBackdrop"></div>
      <div class="claude-fab-wrap claude-fab-hidden" id="claudeFabWrap">
        <div class="claude-fab-menu" id="claudeFabMenu">
          <button type="button" class="claude-fab-menu-item" data-open-drawer="claudeAddDrawer">📋 신청자 수동 등록</button>
          <button type="button" class="claude-fab-menu-item" data-open-drawer="claudeGroupAddDrawer">👥 단체 등록</button>
        </div>
        <button type="button" class="claude-fab-btn" id="claudeFabBtn" aria-label="신청자 등록 메뉴 열기">+</button>
      </div>
    `;
  }

  function claudeOpenDrawer(id) {
    const el = document.getElementById(id);
    if (!el) return;
    document.querySelectorAll('.claude-drawer.open').forEach(d => { if (d !== el) d.classList.remove('open'); });
    el.classList.add('open');
    document.getElementById('claudeDrawerBackdrop')?.classList.add('open');
    document.getElementById('claudeFabMenu')?.classList.remove('open');
    document.getElementById('claudeFabBtn')?.classList.remove('open');
  }

  function claudeCloseAllDrawers() {
    document.querySelectorAll('.claude-drawer.open').forEach(d => d.classList.remove('open'));
    document.getElementById('claudeDrawerBackdrop')?.classList.remove('open');
  }

  function claudeSyncFabVisibility() {
    const view = document.getElementById('view-applications');
    const wrap = document.getElementById('claudeFabWrap');
    if (!view || !wrap) return;
    const isActive = view.classList.contains('active');
    wrap.classList.toggle('claude-fab-hidden', !isActive);
    if (!isActive) claudeCloseAllDrawers();
  }

  function claudeWatchApplicationsViewForFab() {
    const view = document.getElementById('view-applications');
    if (!view) return;
    claudeSyncFabVisibility();
    const observer = new MutationObserver(() => claudeSyncFabVisibility());
    observer.observe(view, { attributes: true, attributeFilter: ['class'] });
  }

  function claudeInjectApplicantDrawers() {
    if (document.getElementById('claudeFabWrap')) return;
    const view = document.getElementById('view-applications');
    if (!view) return;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = claudeBuildFabMarkup() + buildApplicantAddDrawer() + buildGroupAddDrawer();
    Array.from(wrapper.children).forEach(node => document.body.appendChild(node));

    populateCourseSelect();
    populateStatusSelect();
    document.getElementById('claudeAddForm').addEventListener('submit', submitManualApplication);

    populateGroupSelects();
    claudeAddGroupRow();
    claudeAddGroupRow();
    claudeAddGroupRow();
    document.getElementById('claudeGroupAddRowBtn').addEventListener('click', claudeAddGroupRow);
    document.getElementById('claudeGroupSubmitBtn').addEventListener('click', submitGroupApplications);
    document.getElementById('claudeGroupRows').addEventListener('click', (e) => {
      const btn = e.target.closest('.claude-group-row-remove');
      if (!btn) return;
      btn.closest('.claude-group-row')?.remove();
    });

    const fabBtn = document.getElementById('claudeFabBtn');
    const fabMenu = document.getElementById('claudeFabMenu');
    if (fabBtn && fabMenu) {
      fabBtn.addEventListener('click', () => {
        const isOpen = fabMenu.classList.toggle('open');
        fabBtn.classList.toggle('open', isOpen);
      });
      fabMenu.querySelectorAll('.claude-fab-menu-item').forEach(btn => {
        btn.addEventListener('click', () => claudeOpenDrawer(btn.dataset.openDrawer));
      });
    }
    document.getElementById('claudeDrawerBackdrop')?.addEventListener('click', claudeCloseAllDrawers);
    document.querySelectorAll('.claude-drawer-close').forEach(btn => {
      btn.addEventListener('click', claudeCloseAllDrawers);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') claudeCloseAllDrawers(); });

    claudeWatchApplicationsViewForFab();

    /* 신청 현황 탭을 열 때마다 과정/상태 목록을 최신 상태로 갱신 */
    const appsNavBtn = document.querySelector('.nav-item[data-view="applications"]');
    if (appsNavBtn) {
      appsNavBtn.addEventListener('click', () => {
        populateCourseSelect();
        populateStatusSelect();
        populateGroupSelects();
      });
    }
  }

  /* ==================================================================
   * [Claude 추가] 신청현황 "나만의 속성(컬럼)" — 노션의 커스텀 프로퍼티처럼
   * 관리자가 자유롭게 새 컬럼을 추가/삭제하고, 셀을 클릭해 바로 값을 수정.
   * 값은 trainees.custom_fields (jsonb, key=필드 id)에 저장됨.
   * admin.html의 appColumnOrder/appColumnVisibility/appColumns(전역, let/const)를
   * 그대로 확장해서 사용 — renderApps() 등 기존 렌더 함수는 수정하지 않음.
   * ================================================================== */
  let claudeCustomFieldDefs = [];

  function claudeCustomColId(defId) {
    return `custom_${defId}`;
  }

  async function claudeLoadCustomFieldDefs() {
    const { data, error } = await sb.from('trainee_custom_fields').select('*').order('sort_order', { ascending: true });
    if (error) {
      console.warn('[Claude] 커스텀 속성 로드 실패:', error);
      return;
    }
    claudeCustomFieldDefs = data || [];
    claudeApplyCustomColumnsToAppColumns();
    if (typeof renderApps === 'function' && document.getElementById('appHead')) {
      renderApps();
    }
  }

  function claudeApplyCustomColumnsToAppColumns() {
    if (typeof appColumnOrder === 'undefined' || typeof appColumns === 'undefined' || typeof appColumnVisibility === 'undefined') return;

    // 삭제된 커스텀 속성은 컬럼 목록에서도 제거
    const validIds = new Set(claudeCustomFieldDefs.map(d => claudeCustomColId(d.id)));
    for (let i = appColumnOrder.length - 1; i >= 0; i--) {
      const id = appColumnOrder[i];
      if (id.startsWith('custom_') && !validIds.has(id)) {
        appColumnOrder.splice(i, 1);
        delete appColumns[id];
        delete appColumnVisibility[id];
      }
    }

    claudeCustomFieldDefs.forEach(def => {
      const colId = claudeCustomColId(def.id);
      appColumns[colId] = {
        label: def.label,
        render: row => claudeRenderCustomCell(row, def),
      };
      if (!appColumnOrder.includes(colId)) {
        const actionsIdx = appColumnOrder.indexOf('actions');
        if (actionsIdx >= 0) appColumnOrder.splice(actionsIdx, 0, colId);
        else appColumnOrder.push(colId);
      }
      if (appColumnVisibility[colId] === undefined) appColumnVisibility[colId] = true;
    });
  }

  function claudeRenderCustomCell(row, def) {
    const traineeId = escapeHtml(row.trainee_id || '');
    const value = row.trainees?.custom_fields ? row.trainees.custom_fields[def.id] : undefined;
    if (def.field_type === 'checkbox') {
      return `<input type="checkbox" class="claude-custom-cb" data-trainee-id="${traineeId}" data-field-id="${escapeHtml(def.id)}" ${value ? 'checked' : ''}>`;
    }
    if (def.field_type === 'select') {
      const options = Array.isArray(def.options) ? def.options : [];
      return `
        <select class="claude-custom-select" data-trainee-id="${traineeId}" data-field-id="${escapeHtml(def.id)}">
          <option value="">선택 안 함</option>
          ${options.map(opt => `<option value="${escapeHtml(opt)}" ${opt === value ? 'selected' : ''}>${escapeHtml(opt)}</option>`).join('')}
        </select>
      `;
    }
    const display = value === undefined || value === null || value === '' ? '' : escapeHtml(String(value));
    return `<div class="claude-inline-cell${display ? '' : ' empty'}" tabindex="0" data-trainee-id="${traineeId}" data-field-id="${escapeHtml(def.id)}" data-type="${escapeHtml(def.field_type)}">${display || '입력...'}</div>`;
  }

  async function claudeSaveCustomFieldValue(traineeId, fieldId, value) {
    // 로컬 캐시(allApps)에서 현재 custom_fields를 찾아 병합 후 저장
    let current = {};
    if (typeof allApps !== 'undefined' && Array.isArray(allApps)) {
      const found = allApps.find(a => a.trainee_id === traineeId);
      if (found?.trainees?.custom_fields) current = { ...found.trainees.custom_fields };
    }
    current[fieldId] = value;
    const { error } = await sb.from('trainees').update({ custom_fields: current }).eq('id', traineeId);
    if (error) {
      alert(`저장 실패: ${error.message}`);
      return false;
    }
    if (typeof allApps !== 'undefined' && Array.isArray(allApps)) {
      allApps.forEach(a => {
        if (a.trainee_id === traineeId && a.trainees) a.trainees.custom_fields = { ...current };
      });
    }
    return true;
  }

  function claudeBindCustomFieldCells() {
    const tbody = document.getElementById('appRows');
    if (!tbody || tbody.dataset.claudeCustomBound) return;
    tbody.dataset.claudeCustomBound = 'true';

    tbody.addEventListener('click', (e) => {
      const cell = e.target.closest('.claude-inline-cell');
      if (!cell || cell.querySelector('input')) return;
      const currentText = cell.classList.contains('empty') ? '' : cell.textContent.trim();
      const input = document.createElement('input');
      input.type = cell.dataset.type === 'number' ? 'number' : 'text';
      input.value = currentText;
      cell.textContent = '';
      cell.appendChild(input);
      input.focus();
      input.select();

      const finish = async (save) => {
        const newValue = input.value.trim();
        if (save && newValue !== currentText) {
          const ok = await claudeSaveCustomFieldValue(cell.dataset.traineeId, cell.dataset.fieldId, newValue);
          if (!ok) { cell.textContent = currentText || '입력...'; cell.classList.toggle('empty', !currentText); return; }
        }
        const finalText = save ? newValue : currentText;
        cell.textContent = finalText || '입력...';
        cell.classList.toggle('empty', !finalText);
      };

      input.addEventListener('blur', () => finish(true));
      input.addEventListener('keydown', (ke) => {
        if (ke.key === 'Enter') { ke.preventDefault(); input.blur(); }
        if (ke.key === 'Escape') { ke.preventDefault(); finish(false); }
      });
    });

    tbody.addEventListener('change', async (e) => {
      const cb = e.target.closest('.claude-custom-cb');
      if (cb) {
        cb.disabled = true;
        await claudeSaveCustomFieldValue(cb.dataset.traineeId, cb.dataset.fieldId, cb.checked);
        cb.disabled = false;
        return;
      }
      const sel = e.target.closest('.claude-custom-select');
      if (sel) {
        sel.disabled = true;
        await claudeSaveCustomFieldValue(sel.dataset.traineeId, sel.dataset.fieldId, sel.value || null);
        sel.disabled = false;
      }
    });
  }

  /* 컬럼 설정 패널에 커스텀 속성 삭제 버튼 + "+ 새 속성 추가" 폼을 덧붙임 */
  function claudeAugmentColumnOrderPanel() {
    const panel = document.getElementById('columnOrderPanel');
    if (!panel) return;

    panel.querySelectorAll('.column-order-item').forEach(item => {
      const id = item.dataset.id;
      if (!id || !id.startsWith('custom_') || item.querySelector('.claude-custom-del')) return;
      const def = claudeCustomFieldDefs.find(d => claudeCustomColId(d.id) === id);
      if (!def) return;
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'claude-custom-del';
      delBtn.title = '이 속성 삭제';
      delBtn.textContent = '×';
      delBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm(`"${def.label}" 속성을 삭제할까요? 저장된 값도 더 이상 표시되지 않습니다.`)) return;
        const { error } = await sb.from('trainee_custom_fields').delete().eq('id', def.id);
        if (error) { alert(`삭제 실패: ${error.message}`); return; }
        await claudeLoadCustomFieldDefs();
      });
      item.appendChild(delBtn);
    });

    if (!document.getElementById('claudeAddFieldBox')) {
      const box = document.createElement('div');
      box.className = 'claude-addfield-box';
      box.id = 'claudeAddFieldBox';
      box.innerHTML = `
        <button type="button" class="claude-addfield-toggle" id="claudeAddFieldToggle">+ 새 속성 추가</button>
        <div class="claude-addfield-form" id="claudeAddFieldForm">
          <input type="text" id="claudeAddFieldLabel" placeholder="속성 이름 (예: 참석확인)">
          <select id="claudeAddFieldType">
            <option value="text">텍스트</option>
            <option value="number">숫자</option>
            <option value="checkbox">체크박스</option>
            <option value="select">선택 목록</option>
          </select>
          <textarea id="claudeAddFieldOptions" placeholder="선택 목록일 때만: 옵션을 쉼표로 구분 (예: 미확인,확인,보류)" rows="2" style="display:none;"></textarea>
          <button type="button" id="claudeAddFieldSubmit">추가</button>
          <div id="claudeAddFieldMsg" class="claude-msg"></div>
        </div>
      `;
      panel.parentElement?.appendChild(box);

      document.getElementById('claudeAddFieldToggle').addEventListener('click', () => {
        document.getElementById('claudeAddFieldForm').classList.toggle('open');
      });
      document.getElementById('claudeAddFieldType').addEventListener('change', (e) => {
        document.getElementById('claudeAddFieldOptions').style.display = e.target.value === 'select' ? 'block' : 'none';
      });
      document.getElementById('claudeAddFieldSubmit').addEventListener('click', async () => {
        const label = document.getElementById('claudeAddFieldLabel').value.trim();
        const fieldType = document.getElementById('claudeAddFieldType').value;
        const msgEl = document.getElementById('claudeAddFieldMsg');
        msgEl.textContent = '';
        msgEl.className = 'claude-msg';
        if (!label) {
          msgEl.textContent = '속성 이름을 입력해주세요.';
          msgEl.classList.add('error');
          return;
        }
        let options = null;
        if (fieldType === 'select') {
          options = document.getElementById('claudeAddFieldOptions').value.split(',').map(s => s.trim()).filter(Boolean);
          if (!options.length) {
            msgEl.textContent = '선택 목록 옵션을 최소 1개 이상 입력해주세요.';
            msgEl.classList.add('error');
            return;
          }
        }
        const sortOrder = claudeCustomFieldDefs.length ? Math.max(...claudeCustomFieldDefs.map(d => d.sort_order || 0)) + 1 : 0;
        const { error } = await sb.from('trainee_custom_fields').insert({ label, field_type: fieldType, options, sort_order: sortOrder });
        if (error) {
          msgEl.textContent = `추가 실패: ${error.message}`;
          msgEl.classList.add('error');
          return;
        }
        document.getElementById('claudeAddFieldLabel').value = '';
        document.getElementById('claudeAddFieldOptions').value = '';
        document.getElementById('claudeAddFieldForm').classList.remove('open');
        await claudeLoadCustomFieldDefs();
      });
    }
  }

  /* ==================================================================
   * [Claude 추가] 과정 관리 화면 상단 — 회차 일정을 달력으로 보기.
   * allCourses(전역, admin.html)의 start_date 기준으로 월별 그리드에 표시.
   * 빈 날짜를 클릭하면 회차 추가 폼(#newCourseDate)에 그 날짜를 채워줌.
   * ================================================================== */
  let claudeCalMonth = null; // Date (해당 월의 1일)

  /* ==================================================================
   * [Claude 추가] 띄엄띄엄 진행되는(비연속) 교육 일정 지원.
   * course_sessions 테이블(course_id, session_date)에 개별 교육일을 등록해두면
   * 캘린더는 그 날짜들에만 표시됨. 한 건도 등록 안 된 회차는 기존처럼
   * start_date~end_date 범위 전체(연속 교육 가정)로 표시(하위호환).
   * ================================================================== */
  let claudeAllCourseSessions = {}; // course_id -> [dateStr, ...]

  async function claudeLoadAllCourseSessions() {
    if (typeof sb === 'undefined' || !sb) return;
    const { data, error } = await sb.from('course_sessions').select('course_id, session_date');
    if (error) { console.error('[claude] course_sessions 로드 실패', error); return; }
    const map = {};
    (data || []).forEach(row => {
      (map[row.course_id] = map[row.course_id] || []).push(row.session_date);
    });
    Object.keys(map).forEach(id => map[id].sort());
    claudeAllCourseSessions = map;
  }

  function claudeDateRangeKeys(startStr, endStr) {
    const keys = [];
    if (!startStr) return keys;
    const start = new Date(startStr + 'T00:00:00');
    const end = new Date((endStr || startStr) + 'T00:00:00');
    if (isNaN(start.getTime())) return keys;
    const last = isNaN(end.getTime()) || end < start ? start : end;
    const cur = new Date(start.getTime());
    let guard = 0;
    while (cur <= last && guard < 366) {
      keys.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`);
      cur.setDate(cur.getDate() + 1);
      guard++;
    }
    return keys;
  }

  function claudeTodayDateKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function claudeBuildCourseCalendar() {
    if (!claudeCalMonth) {
      const now = new Date();
      claudeCalMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    const year = claudeCalMonth.getFullYear();
    const month = claudeCalMonth.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const todayKey = claudeTodayDateKey();

    const courses = (typeof allCourses !== 'undefined' && Array.isArray(allCourses)) ? allCourses : [];
    const byDate = {};
    courses.forEach(c => {
      const sessions = claudeAllCourseSessions[c.id];
      const keys = (sessions && sessions.length) ? sessions : claudeDateRangeKeys(c.start_date, c.end_date);
      keys.forEach(key => { (byDate[key] = byDate[key] || []).push(c); });
    });

    const cells = [];
    for (let i = firstDow - 1; i >= 0; i--) {
      cells.push({ day: daysInPrevMonth - i, outside: true, key: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, outside: false, key });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ day: cells.length - (firstDow + daysInMonth) + 1, outside: true, key: null });
    }

    const dowLabels = ['일', '월', '화', '수', '목', '금', '토'];
    return `
      <section class="panel claude-cal-panel">
        <div class="claude-cal-head">
          <h3>회차 일정 캘린더</h3>
          <div class="claude-cal-nav">
            <button type="button" id="claudeCalPrev">‹</button>
            <span>${year}년 ${month + 1}월</span>
            <button type="button" id="claudeCalNext">›</button>
          </div>
        </div>
        <div class="claude-cal-grid">
          ${dowLabels.map(l => `<div class="claude-cal-dow">${l}</div>`).join('')}
          ${cells.map(cell => `
            <div class="claude-cal-cell ${cell.outside ? 'claude-cal-outside' : ''} ${cell.key === todayKey ? 'claude-cal-today' : ''}" ${cell.key ? `data-date="${cell.key}"` : ''}>
              <span class="claude-cal-daynum">${cell.day}</span>
              ${cell.key && byDate[cell.key] ? byDate[cell.key].map(c => `
                <span class="claude-cal-pill ${c.is_open === false ? 'claude-cal-closed' : ''}" title="${escapeHtml((c.course_types?.name || '') + ' ' + (c.name || ''))}">${escapeHtml(c.course_types?.name || c.name || '회차')}${c.round ? ' ' + escapeHtml(c.round) + '회' : ''}</span>
              `).join('') : ''}
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  function claudeRefreshCourseCalendar() {
    const existing = document.getElementById('claudeCourseCalendar');
    if (!existing) return;
    existing.outerHTML = `<div id="claudeCourseCalendar">${claudeBuildCourseCalendar()}</div>`;
    claudeBindCourseCalendar();
  }

  function claudeBindCourseCalendar() {
    const wrap = document.getElementById('claudeCourseCalendar');
    if (!wrap) return;
    const prevBtn = document.getElementById('claudeCalPrev');
    const nextBtn = document.getElementById('claudeCalNext');
    if (prevBtn) prevBtn.addEventListener('click', () => {
      claudeCalMonth = new Date(claudeCalMonth.getFullYear(), claudeCalMonth.getMonth() - 1, 1);
      claudeRefreshCourseCalendar();
    });
    if (nextBtn) nextBtn.addEventListener('click', () => {
      claudeCalMonth = new Date(claudeCalMonth.getFullYear(), claudeCalMonth.getMonth() + 1, 1);
      claudeRefreshCourseCalendar();
    });
    wrap.querySelectorAll('.claude-cal-cell[data-date]').forEach(cell => {
      cell.addEventListener('click', (e) => {
        if (e.target.closest('.claude-cal-pill')) return;
        const dateInput = document.getElementById('newCourseDate');
        if (dateInput) {
          dateInput.value = cell.dataset.date;
          dateInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          dateInput.focus();
          claudeAutoFillEndDate(dateInput, document.getElementById('newCourseEndDate'));
        }
      });
    });
  }

  /* ==================================================================
   * [Claude 추가] 회차 시작일/종료일 입력 보완.
   * 1) 종료일을 안 채우고 등록하면 비어버리던 걸, 시작일 입력 시 종료일이
   *    비어있으면 자동으로 시작일과 같은 날짜(=1일짜리 교육)로 채워줌.
   *    (물론 채워진 뒤에 직접 다른 날짜로 바꿀 수 있음)
   * 2) 날짜 입력칸에 타이핑할 때 연도가 4자리를 넘게 입력되는 브라우저
   *    기본 동작(<input type="date"> 자체의 특성)을 완전히 막을 수는 없지만,
   *    min/max로 허용 연도 범위를 좁혀서 터무니없는 값이 저장되는 건 막음.
   * ================================================================== */
  const CLAUDE_DATE_MIN = '2015-01-01';
  const CLAUDE_DATE_MAX = '2099-12-31';

  function claudeAutoFillEndDate(startInput, endInput) {
    if (!startInput || !endInput) return;
    if (startInput.value && !endInput.value) {
      endInput.value = startInput.value;
    }
  }

  function claudeConstrainDateInput(input) {
    if (!input || input.dataset.claudeDateBound) return;
    input.dataset.claudeDateBound = 'true';
    if (!input.min) input.min = CLAUDE_DATE_MIN;
    if (!input.max) input.max = CLAUDE_DATE_MAX;
  }

  function claudeBindCourseDateHelpers() {
    // 회차 추가 폼
    const newStart = document.getElementById('newCourseDate');
    const newEnd = document.getElementById('newCourseEndDate');
    if (newStart && !newStart.dataset.claudeDateBound) {
      claudeConstrainDateInput(newStart);
      claudeConstrainDateInput(newEnd);
      newStart.addEventListener('change', () => claudeAutoFillEndDate(newStart, newEnd));
    }

    // 등록된 회차 목록의 빠른 수정(course-quick-start/end)과 편집 행(course-start/end-input) —
    // 매번 새로 그려지므로 이벤트 위임으로 한 번만 바인딩
    const list = document.getElementById('courseRows');
    if (list && !list.dataset.claudeDateHelperBound) {
      list.dataset.claudeDateHelperBound = 'true';
      list.addEventListener('focusin', (e) => {
        if (e.target.matches('input[type="date"]')) claudeConstrainDateInput(e.target);
      });
      list.addEventListener('change', (e) => {
        const target = e.target;
        if (target.classList.contains('course-quick-start')) {
          const row = target.closest('[data-course-id]');
          claudeAutoFillEndDate(target, row?.querySelector('.course-quick-end'));
        } else if (target.classList.contains('course-start-input')) {
          const row = target.closest('[data-course-id]');
          claudeAutoFillEndDate(target, row?.querySelector('.course-end-input'));
        }
      });
    }
  }

  function claudeInjectCourseCalendar() {
    const view = document.getElementById('view-courses');
    if (!view || document.getElementById('claudeCourseCalendar')) return;
    const anchor = document.getElementById('coursePanelLayout');
    const wrap = document.createElement('div');
    wrap.id = 'claudeCourseCalendar';
    wrap.innerHTML = claudeBuildCourseCalendar();
    if (anchor) view.insertBefore(wrap, anchor);
    else view.appendChild(wrap);
    claudeBindCourseCalendar();

    const coursesNavBtn = document.querySelector('.nav-item[data-view="courses"]');
    if (coursesNavBtn) coursesNavBtn.addEventListener('click', () => claudeRefreshCourseCalendar());

    const rowsEl = document.getElementById('courseRows');
    if (rowsEl) {
      /* claudeGroupCourseRowsByType()가 courseRows 안의 DOM을 직접 옮기기 때문에,
         그 작업 도중엔 observer를 잠깐 끊어서 자기 자신을 다시 트리거하는
         무한 루프를 막음. */
      const observer = new MutationObserver(() => {
        requestAnimationFrame(() => {
          observer.disconnect();
          claudeRefreshCourseCalendar();
          claudeRenderUpcomingPanel();
          claudeAugmentCourseRowsWithSessions();
          claudeRestructureAllCourseRows();
          claudeGroupCourseRowsByType();
          observer.observe(rowsEl, { childList: true, subtree: true });
        });
      });
      observer.observe(rowsEl, { childList: true, subtree: true });
    }

    const typeFilterSel = document.getElementById('courseTypeTabs');
    if (typeFilterSel) typeFilterSel.addEventListener('change', () => requestAnimationFrame(claudeGroupCourseRowsByType));
  }

  /* ==================================================================
   * [Claude 추가] "등록된 회차"가 "전체 회차 보기"일 때는 과정별로 그룹 헤더를
   * 붙여서 묶어 보여줌. 특정 과정만 보고 있을 때는(필터가 걸려있을 때) 원래
   * 순서 그대로 두고 그룹핑하지 않음. renderCourses()가 그리는 실제 행(.course-row/
   * .course-edit-row) DOM 노드는 그대로 옮기기만 해서 바인딩된 이벤트가 유지됨.
   * ================================================================== */
  function claudeGroupCourseRowsByType() {
    const list = document.getElementById('courseRows');
    const filterSel = document.getElementById('courseTypeTabs');
    if (!list || !filterSel) return;

    list.querySelectorAll('.claude-course-group-header').forEach(h => h.remove());
    if (filterSel.value) return; // 특정 과정만 볼 때는 원래 순서 그대로

    const rows = [...list.querySelectorAll(':scope > [data-course-id]')];
    if (rows.length < 2) return;

    const courses = (typeof allCourses !== 'undefined' && Array.isArray(allCourses)) ? allCourses : [];
    const types = (typeof allCourseTypes !== 'undefined' && Array.isArray(allCourseTypes)) ? allCourseTypes : [];

    const groups = new Map();
    const groupOrder = [];
    rows.forEach(row => {
      const course = courses.find(c => c.id === row.dataset.courseId);
      const typeId = course?.course_type_id || '__unknown__';
      if (!groups.has(typeId)) { groups.set(typeId, []); groupOrder.push(typeId); }
      groups.get(typeId).push(row);
    });
    if (groupOrder.length < 2) return; // 과정이 하나뿐이면 그룹핑 의미 없음

    const typeIdOrder = types.map(t => t.id);
    groupOrder.sort((a, b) => {
      const ai = typeIdOrder.indexOf(a);
      const bi = typeIdOrder.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    groupOrder.forEach((typeId, idx) => {
      const typeName = types.find(t => t.id === typeId)?.name || '과정 미지정';
      const groupRows = groups.get(typeId);
      const header = document.createElement('div');
      header.className = 'claude-course-group-header';
      header.textContent = `${typeName} · ${groupRows.length}개`;
      header.style.cssText = `font-size:12px;font-weight:900;color:var(--accent-dark,#0F465A);padding:10px 2px 6px;${idx > 0 ? 'border-top:1px solid var(--line);margin-top:8px;' : ''}`;
      list.appendChild(header);
      groupRows.forEach(row => {
        list.appendChild(row);
        /* 그룹 헤더에 이미 과정명이 나와 있으므로, 행 안의 메타 텍스트에서
           과정명은 빼고 회차 번호만 남김("드론 교육 · 3회차" → "3회차"). */
        const meta = row.querySelector('.course-row-meta');
        if (meta) {
          const course = courses.find(c => c.id === row.dataset.courseId);
          meta.textContent = course && course.round ? `${course.round}회차` : '';
        }
      });
    });
  }

  /* ==================================================================
   * [Claude 추가] "등록된 회차" 각 행에 "개별일정" 버튼을 붙여서, 클릭하면
   * 그 회차의 개별 교육일(course_sessions)을 추가/삭제할 수 있는 패널을
   * 행 안에(그리드 전체 너비로) 펼침. 편집 모드(.course-edit-row)에는 붙이지 않음.
   * ================================================================== */
  function claudeSuggestNextSessionDate(courseId, dates) {
    /* [Claude 추가] "날짜 추가" 입력칸을 열 때 매번 오늘 날짜부터 달력을 뒤지지 않도록,
       이미 등록된 날짜가 있으면 그 마지막 날짜 다음날을, 하나도 없으면 회차의
       시작일을 기본값으로 제안함(=시작일 기준 근처에서 바로 고를 수 있게). */
    if (dates.length) {
      const last = new Date(dates[dates.length - 1] + 'T00:00:00');
      if (!isNaN(last.getTime())) {
        last.setDate(last.getDate() + 1);
        return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
      }
    }
    const courses = (typeof allCourses !== 'undefined' && Array.isArray(allCourses)) ? allCourses : [];
    const course = courses.find(c => c.id === courseId);
    return course?.start_date || '';
  }

  function claudeSessionsPanelMarkup(courseId) {
    const dates = (claudeAllCourseSessions[courseId] || []).slice().sort();
    const chips = dates.length
      ? dates.map(d => `<span class="claude-session-chip">${escapeHtml(d)}<button type="button" class="claude-session-del" data-date="${escapeHtml(d)}" aria-label="삭제">×</button></span>`).join('')
      : '<span class="claude-sessions-empty">등록된 개별 일자 없음 — 아래에서 날짜를 추가해주세요.</span>';
    const suggested = claudeSuggestNextSessionDate(courseId, dates);
    const courses = (typeof allCourses !== 'undefined' && Array.isArray(allCourses)) ? allCourses : [];
    const course = courses.find(c => c.id === courseId);
    return `
      <div class="claude-sessions-panel" data-course-id="${escapeHtml(courseId)}">
        <div class="claude-sessions-hint">개별 교육일(띄엄띄엄 진행되는 경우)을 등록해두면 캘린더에는 이 날짜들에만 표시됩니다. 하나도 등록 안 하면 지금처럼 시작일~종료일 범위로 표시돼요.</div>
        <div class="claude-sessions-chips">${chips}</div>
        <div class="claude-sessions-add">
          <input type="date" class="claude-session-add-input" min="${CLAUDE_DATE_MIN}" max="${CLAUDE_DATE_MAX}" value="${escapeHtml(suggested)}" aria-label="개별 교육일 추가">
          <button type="button" class="claude-session-add-btn">+ 날짜 추가</button>
        </div>
        ${course?.start_date ? `<div class="claude-sessions-hint" style="margin:6px 0 0;">시작일(${escapeHtml(course.start_date)}) 근처로 기본 제안돼요 — 원하는 날짜로 바꿔서 추가하면 됩니다.</div>` : ''}
      </div>
    `;
  }

  function claudeBindSessionsPanel(panel, courseId) {
    panel.querySelectorAll('.claude-session-del').forEach(btn => {
      btn.addEventListener('click', () => claudeDeleteCourseSession(courseId, btn.dataset.date));
    });
    const addBtn = panel.querySelector('.claude-session-add-btn');
    const addInput = panel.querySelector('.claude-session-add-input');
    if (addBtn && addInput) {
      addBtn.addEventListener('click', () => {
        if (!addInput.value) return;
        claudeAddCourseSession(courseId, addInput.value);
        addInput.value = '';
      });
    }
  }

  function claudeToggleSessionsPanel(courseId, row) {
    const existing = row.querySelector('.claude-sessions-panel');
    if (existing) { existing.remove(); return; }
    const list = document.getElementById('courseRows');
    if (list) list.querySelectorAll('.claude-sessions-panel').forEach(p => p.remove());
    const wrap = document.createElement('div');
    wrap.innerHTML = claudeSessionsPanelMarkup(courseId);
    const panel = wrap.firstElementChild;
    row.appendChild(panel);
    claudeBindSessionsPanel(panel, courseId);
  }

  function claudeAugmentCourseRowsWithSessions() {
    const list = document.getElementById('courseRows');
    if (!list) return;
    list.querySelectorAll(':scope > .course-row[data-course-id]').forEach(row => {
      if (row.querySelector('.claude-sessions-toggle-btn')) return;
      const actions = row.querySelector('.course-row-actions');
      if (!actions) return;
      const courseId = row.dataset.courseId;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'claude-sessions-toggle-btn';
      const n = (claudeAllCourseSessions[courseId] || []).length;
      btn.textContent = n ? `개별일정 ${n}` : '개별일정';
      btn.addEventListener('click', () => claudeToggleSessionsPanel(courseId, row));
      actions.insertBefore(btn, actions.firstChild);
    });
  }

  /* ==================================================================
   * [Claude 추가 v2] "등록된 회차" 행 정보 위계 재구성.
   * courseRowHtml()이 만든 실제 DOM(제목+메타 div, 공개/비공개 토글 버튼,
   * 시작~종료일 date input 2개, 정원 pill, 액션 영역)을 "새로 그리지 않고
   * 그대로 옮기기"만 해서 기존 이벤트 바인딩(클릭/change 등)을 그대로 유지한 채
   * 2번째 줄에 "공개 · 기간 · 정원 · 개별일정" meta-line을 만듦.
   * claudeAugmentCourseRowsWithSessions()가 붙인 "개별일정" 버튼도 같은 줄로 옮김.
   * 이미 재구성된 행(row.dataset.claudeRestructured)은 다시 처리하지 않음 —
   * admin.html이 데이터 변경 시 행을 통째로 새로 그리므로 매번 새 DOM에는
   * 이 플래그가 없어 자연히 다시 재구성됨.
   * ================================================================== */
  function claudeMetaDot() {
    const dot = document.createElement('span');
    dot.className = 'claude-meta-dot';
    dot.textContent = '·';
    dot.setAttribute('aria-hidden', 'true');
    return dot;
  }

  function claudeWrapMetaItem(label, el) {
    const wrap = document.createElement('span');
    wrap.className = 'claude-meta-item';
    if (label) {
      const labelSpan = document.createElement('span');
      labelSpan.className = 'claude-meta-label';
      labelSpan.textContent = label;
      wrap.appendChild(labelSpan);
    }
    wrap.appendChild(el);
    return wrap;
  }

  function claudeRestructureCourseRow(row) {
    if (!row || row.dataset.claudeRestructured === '1') return;
    if (row.querySelector(':scope > .claude-course-meta-line')) { row.dataset.claudeRestructured = '1'; return; }

    const titleWrap = row.querySelector(':scope > div:first-child');
    const toggle = row.querySelector(':scope > .course-open-toggle');
    const dateQuick = row.querySelector(':scope > .course-date-quick');
    const pill = row.querySelector(':scope > .pill');
    const actions = row.querySelector(':scope > .course-row-actions');
    if (!titleWrap || !toggle || !dateQuick || !pill || !actions) return; // admin.html 구조가 바뀌었으면 손대지 않고 넘어감

    const metaLine = document.createElement('div');
    metaLine.className = 'claude-course-meta-line';

    metaLine.appendChild(toggle);
    metaLine.appendChild(claudeMetaDot());
    metaLine.appendChild(claudeWrapMetaItem('기간', dateQuick));
    metaLine.appendChild(claudeMetaDot());
    metaLine.appendChild(claudeWrapMetaItem('정원', pill));

    const sessionsBtn = actions.querySelector('.claude-sessions-toggle-btn');
    if (sessionsBtn) {
      metaLine.appendChild(claudeMetaDot());
      metaLine.appendChild(sessionsBtn);
    }

    row.insertBefore(metaLine, titleWrap.nextSibling);
    row.dataset.claudeRestructured = '1';
  }

  function claudeRestructureAllCourseRows() {
    const list = document.getElementById('courseRows');
    if (!list) return;
    list.querySelectorAll(':scope > .course-row[data-course-id]').forEach(row => claudeRestructureCourseRow(row));
  }

  function claudeRefreshSessionsUI(courseId) {
    claudeRefreshCourseCalendar();
    const list = document.getElementById('courseRows');
    if (!list) return;
    const row = list.querySelector(`.course-row[data-course-id="${CSS.escape(courseId)}"]`);
    if (!row) return;
    const panel = row.querySelector('.claude-sessions-panel');
    if (panel) {
      const wrap = document.createElement('div');
      wrap.innerHTML = claudeSessionsPanelMarkup(courseId);
      const fresh = wrap.firstElementChild;
      panel.replaceWith(fresh);
      claudeBindSessionsPanel(fresh, courseId);
    }
    const toggleBtn = row.querySelector('.claude-sessions-toggle-btn');
    if (toggleBtn) {
      const n = (claudeAllCourseSessions[courseId] || []).length;
      toggleBtn.textContent = n ? `개별일정 ${n}` : '개별일정';
    }
  }

  async function claudeAddCourseSession(courseId, dateStr) {
    const { error } = await sb.from('course_sessions').insert({ course_id: courseId, session_date: dateStr });
    if (error) { alert('날짜 추가 실패: ' + error.message); return; }
    await claudeLoadAllCourseSessions();
    claudeRefreshSessionsUI(courseId);
  }

  async function claudeDeleteCourseSession(courseId, dateStr) {
    const { error } = await sb.from('course_sessions').delete().eq('course_id', courseId).eq('session_date', dateStr);
    if (error) { alert('날짜 삭제 실패: ' + error.message); return; }
    await claudeLoadAllCourseSessions();
    claudeRefreshSessionsUI(courseId);
  }

  /* ==================================================================
   * [Claude 추가] 수료 관리 탭 — 상태가 "수료"인 신청 건을 모아 수료증 발급을
   * 관리. certificate_issued/certificate_number/certificate_issued_at
   * (applications 테이블, 이번에 추가)을 사용.
   * ================================================================== */
  let claudeCompletions = [];

  async function claudeLoadCompletions() {
    const tbody = document.getElementById('claudeCertRows');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="empty-row">불러오는 중...</td></tr>';
    const { data, error } = await sb
      .from('applications')
      .select('id, status_updated_at, certificate_issued, certificate_number, certificate_issued_at, trainee_id, trainees(name, phone, company, email), courses(name, course_types(name))')
      .eq('status', '수료')
      .order('status_updated_at', { ascending: false });
    if (error) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="empty-row">불러오기 실패: ${escapeHtml(error.message)}</td></tr>`;
      return;
    }
    claudeCompletions = data || [];
    claudeRenderCompletions();
  }

  function claudeRenderCompletions() {
    const tbody = document.getElementById('claudeCertRows');
    const statsEl = document.getElementById('claudeCertStats');
    if (!tbody) return;

    const total = claudeCompletions.length;
    const issued = claudeCompletions.filter(c => c.certificate_issued).length;
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="claude-cert-stat"><b>${total.toLocaleString('ko-KR')}</b><span>전체 수료생</span></div>
        <div class="claude-cert-stat"><b>${issued.toLocaleString('ko-KR')}</b><span>수료증 발급 완료</span></div>
        <div class="claude-cert-stat"><b>${(total - issued).toLocaleString('ko-KR')}</b><span>미발급</span></div>
      `;
    }

    if (!total) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-row">수료 상태인 신청자가 없습니다</td></tr>';
      return;
    }

    tbody.innerHTML = claudeCompletions.map(c => `
      <tr data-id="${escapeHtml(c.id)}">
        <td>${escapeHtml(c.trainees?.name || '-')}</td>
        <td>${escapeHtml(c.trainees?.phone || '-')}</td>
        <td>${escapeHtml(c.trainees?.company || '-')}</td>
        <td>${escapeHtml((c.courses?.course_types?.name || '') + ' ' + (c.courses?.name || ''))}</td>
        <td>${escapeHtml(formatDateTime(c.status_updated_at))}</td>
        <td><input type="text" class="claude-cert-num-input" data-id="${escapeHtml(c.id)}" placeholder="수료증 번호" value="${escapeHtml(c.certificate_number || '')}"></td>
        <td style="text-align:center;"><input type="checkbox" class="claude-cert-issued-cb" data-id="${escapeHtml(c.id)}" ${c.certificate_issued ? 'checked' : ''}></td>
      </tr>
    `).join('');
  }

  function claudeBindCompletionsTable() {
    const tbody = document.getElementById('claudeCertRows');
    if (!tbody || tbody.dataset.claudeBound) return;
    tbody.dataset.claudeBound = 'true';

    tbody.addEventListener('change', async (e) => {
      const cb = e.target.closest('.claude-cert-issued-cb');
      if (cb) {
        cb.disabled = true;
        const issued = cb.checked;
        const { error } = await sb.from('applications').update({
          certificate_issued: issued,
          certificate_issued_at: issued ? new Date().toISOString() : null,
        }).eq('id', cb.dataset.id);
        cb.disabled = false;
        if (error) { alert(`저장 실패: ${error.message}`); cb.checked = !issued; return; }
        const item = claudeCompletions.find(c => c.id === cb.dataset.id);
        if (item) { item.certificate_issued = issued; item.certificate_issued_at = issued ? new Date().toISOString() : null; }
        claudeRenderCompletions();
      }
    });

    tbody.addEventListener('blur', async (e) => {
      const input = e.target.closest('.claude-cert-num-input');
      if (!input) return;
      const item = claudeCompletions.find(c => c.id === input.dataset.id);
      const newVal = input.value.trim() || null;
      if (item && item.certificate_number === newVal) return;
      const { error } = await sb.from('applications').update({ certificate_number: newVal }).eq('id', input.dataset.id);
      if (error) { alert(`저장 실패: ${error.message}`); return; }
      if (item) item.certificate_number = newVal;
    }, true);
  }

  function buildCertSectionMarkup() {
    return `
      <div class="view-header">
        <h2>수료 관리</h2>
        <p>상태가 "수료"로 변경된 신청자를 모아 수료증 발급 여부와 번호를 관리합니다.</p>
      </div>
      <div class="claude-cert-stats" id="claudeCertStats"></div>
      <div class="table-shell simple-table">
        <table>
          <thead><tr><th>이름</th><th>연락처</th><th>소속</th><th>과정</th><th>수료 확정일</th><th>수료증 번호</th><th>발급</th></tr></thead>
          <tbody id="claudeCertRows"><tr><td colspan="7" class="empty-row">불러오는 중...</td></tr></tbody>
        </table>
      </div>
    `;
  }

  function buildCertNavAndSection() {
    const nav = document.querySelector('.nav');
    const main = document.querySelector('.admin-main');
    if (!nav || !main || document.getElementById('view-claude-cert')) return;

    const navBtn = document.createElement('button');
    navBtn.className = 'nav-item';
    navBtn.type = 'button';
    navBtn.dataset.view = 'claude-cert';
    navBtn.innerHTML = '<span>06</span>수료 관리'; /* [Claude 추가] 활동 로그(구 05)가 설정으로 옮겨가면서 한 칸씩 당김 */
    nav.appendChild(navBtn);

    const section = document.createElement('section');
    section.className = 'view';
    section.id = 'view-claude-cert';
    section.innerHTML = buildCertSectionMarkup();
    main.appendChild(section);
    claudeBindCompletionsTable();

    navBtn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
      document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
      navBtn.classList.add('active');
      section.classList.add('active');
      claudeLoadCompletions();
    });
  }

  /* ==================================================================
   * [Claude 추가] 설정 메뉴 — "활동 로그"처럼 자주 안 쓰는 화면을 사이드바
   * 메인 목록에서 빼고 "설정" 안으로 넣음. 기존 활동 로그 nav-item은
   * (CSS로) 숨기기만 하고, 그 nav-item의 클릭 이벤트/#view-log/loadAuditLog()는
   * admin.html 코드 그대로 재사용 — 설정 메뉴에서는 그 버튼을 클릭한 것처럼
   * .click()만 대신 호출함.
   * ================================================================== */
  function buildSettingsSectionMarkup() {
    return `
      <div class="view-header">
        <h2>설정</h2>
        <p>자주 쓰지 않는 화면을 모아뒀습니다.</p>
      </div>
      <div class="claude-settings-menu">
        <div class="claude-settings-item" id="claudeSettingsAuditLogItem">
          <div>
            <div class="label">활동 로그</div>
            <div class="sub">관리자가 등록·수정·삭제한 이력을 확인합니다.</div>
          </div>
          <span class="arrow">›</span>
        </div>
      </div>
    `;
  }

  /* [Claude 추가] "설정"은 번호 매겨진 메인 메뉴 목록에 넣지 않고, 사이드바 하단
     이메일 옆에 작은 아이콘 버튼으로만 둠 (요청: "설정은 로그아웃 위쪽 이메일
     오른쪽에 작은 글씨로 아이콘만 올려놔줘"). */
  function buildSettingsSection() {
    const main = document.querySelector('.admin-main');
    if (!main || document.getElementById('view-claude-settings')) return;

    const section = document.createElement('section');
    section.className = 'view';
    section.id = 'view-claude-settings';
    section.innerHTML = buildSettingsSectionMarkup();
    main.appendChild(section);

    const auditItem = document.getElementById('claudeSettingsAuditLogItem');
    const logNavBtn = document.querySelector('.nav-item[data-view="log"]');
    if (auditItem && logNavBtn) {
      auditItem.addEventListener('click', () => logNavBtn.click());
    }
  }

  function claudeShowSettingsSection() {
    const section = document.getElementById('view-claude-settings');
    if (!section) return;
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
    section.classList.add('active');
  }

  function injectSettingsFooterButton() {
    const who = document.getElementById('whoAmI');
    if (!who || document.getElementById('claudeSettingsGearBtn')) return;
    const footer = who.parentElement;
    if (!footer) return;

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;';
    who.parentElement.insertBefore(row, who);
    row.appendChild(who);

    const gearBtn = document.createElement('button');
    gearBtn.id = 'claudeSettingsGearBtn';
    gearBtn.type = 'button';
    gearBtn.title = '설정';
    gearBtn.setAttribute('aria-label', '설정');
    gearBtn.textContent = '⚙';
    gearBtn.style.cssText = 'flex:0 0 auto;background:transparent;border:none;color:#A9B4C0;font-size:14px;cursor:pointer;padding:2px 4px;line-height:1;';
    gearBtn.addEventListener('mouseenter', () => { gearBtn.style.color = '#fff'; });
    gearBtn.addEventListener('mouseleave', () => { gearBtn.style.color = '#A9B4C0'; });
    gearBtn.addEventListener('click', claudeShowSettingsSection);
    row.appendChild(gearBtn);
  }

  /* ==================================================================
   * [Claude 추가] 새로고침(F5) 해도 보고 있던 탭이 유지되도록 함.
   * admin.html은 새로고침될 때마다 항상 "개요" 탭으로 초기화되는데,
   * 마지막으로 클릭한 탭(data-view)을 localStorage에 저장해뒀다가
   * 로그인 후 대시보드가 뜨는 시점에 그 탭을 대신 클릭해줌.
   * (nav-item 클릭 이벤트/뷰 전환 로직은 admin.html 것 그대로 재사용)
   * ================================================================== */
  const CLAUDE_ACTIVE_TAB_KEY = 'claudeActiveTab';

  function claudeBindTabPersistence() {
    const nav = document.querySelector('.nav');
    if (!nav || nav.dataset.claudeTabPersistBound) return;
    nav.dataset.claudeTabPersistBound = 'true';
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-item');
      if (!btn || !btn.dataset.view) return;
      try { localStorage.setItem(CLAUDE_ACTIVE_TAB_KEY, btn.dataset.view); } catch (e2) { /* localStorage 불가 시 조용히 무시 */ }
    });
  }

  function claudeRestoreActiveTab() {
    let saved = null;
    try { saved = localStorage.getItem(CLAUDE_ACTIVE_TAB_KEY); } catch (e) { saved = null; }
    if (!saved) return;
    const btn = [...document.querySelectorAll('.nav-item[data-view]')].find(el => el.dataset.view === saved);
    if (btn && !btn.classList.contains('active')) btn.click();
  }

  function claudeWatchDashboardShow() {
    const dash = document.getElementById('dashboard');
    if (!dash) return;
    if (dash.classList.contains('show')) {
      claudeRestoreActiveTab();
      return;
    }
    const observer = new MutationObserver(() => {
      if (dash.classList.contains('show')) {
        claudeRestoreActiveTab();
        observer.disconnect();
      }
    });
    observer.observe(dash, { attributes: true, attributeFilter: ['class'] });
  }

  /* ==================================================================
   * [Claude 추가] "과정명 목록" 패널 접어두기 + 과정명마다 연도 태그.
   * 자주 안 바뀌는 패널이라 기본은 접어두고, 연도(2024/2025/2026...)를
   * 붙여서 연도별로 운영 과정이 다른 걸 구분할 수 있게 함.
   * admin.html의 renderCourseTypes()는 건드리지 않고, #typeRows가
   * 다시 그려질 때마다(MutationObserver) 연도 칸만 덧붙임.
   * ================================================================== */
  const CLAUDE_TYPE_PANEL_OPEN_KEY = 'claudeTypePanelOpen';

  function claudeFindTypePanel() {
    return [...document.querySelectorAll('#view-courses > .panel')].find(p => p.querySelector('h2')?.textContent.trim() === '과정명 목록') || null;
  }

  function claudeInjectTypeCollapsible() {
    const panel = claudeFindTypePanel();
    if (!panel || panel.dataset.claudeCollapsible) return;
    panel.dataset.claudeCollapsible = 'true';

    const header = panel.querySelector('.section-title') || panel.querySelector('h2')?.parentElement;
    const restNodes = [...panel.children].filter(el => el !== header);
    if (!restNodes.length) return;

    let savedOpen = false;
    try { savedOpen = localStorage.getItem(CLAUDE_TYPE_PANEL_OPEN_KEY) === '1'; } catch (e) { /* 무시 */ }

    const details = document.createElement('details');
    details.id = 'claudeTypePanelDetails';
    if (savedOpen) details.open = true;
    const summary = document.createElement('summary');
    summary.className = 'claude-addfield-toggle';
    summary.style.cssText = 'margin:10px 0 14px;cursor:pointer;list-style:none;';
    summary.textContent = savedOpen ? '과정명 목록 접기' : '과정명 목록 펼치기';
    details.appendChild(summary);
    restNodes.forEach(node => details.appendChild(node));
    panel.appendChild(details);

    details.addEventListener('toggle', () => {
      summary.textContent = details.open ? '과정명 목록 접기' : '과정명 목록 펼치기 (평소엔 안 바꾸는 목록이라 접어뒀어요)';
      try { localStorage.setItem(CLAUDE_TYPE_PANEL_OPEN_KEY, details.open ? '1' : '0'); } catch (e) { /* 무시 */ }
    });
  }

  function claudeInjectTypeYearColumn() {
    const table = document.querySelector('#typeRows')?.closest('table');
    if (!table) return;
    const headRow = table.querySelector('thead tr');
    if (headRow && !headRow.querySelector('.claude-type-year-th')) {
      const th = document.createElement('th');
      th.className = 'claude-type-year-th';
      th.textContent = '연도';
      const lastTh = headRow.lastElementChild;
      if (lastTh) headRow.insertBefore(th, lastTh);
      else headRow.appendChild(th);
    }

    const currentYear = new Date().getFullYear();
    const yearOptions = ['', ...Array.from({ length: 6 }, (_, i) => String(currentYear + 1 - i))];

    document.querySelectorAll('#typeRows tr.type-row-table').forEach(tr => {
      if (tr.querySelector('.claude-type-year-select')) return;
      const typeId = tr.dataset.typeId;
      const type = (typeof allCourseTypes !== 'undefined' ? allCourseTypes : []).find(t => t.id === typeId);
      const td = document.createElement('td');
      td.innerHTML = `
        <select class="claude-type-year-select" data-id="${escapeHtml(typeId)}" style="padding:6px 7px;border:1px solid var(--line);border-radius:6px;font-family:inherit;font-size:12px;">
          ${yearOptions.map(y => `<option value="${y}" ${String(type?.year || '') === y ? 'selected' : ''}>${y ? y + '년' : '미지정'}</option>`).join('')}
        </select>
      `;
      const lastTd = tr.lastElementChild;
      if (lastTd) tr.insertBefore(td, lastTd);
      else tr.appendChild(td);
      tr.dataset.claudeYear = type?.year || '';
    });
  }

  function claudeBindTypeYearSelects() {
    const tbody = document.getElementById('typeRows');
    if (!tbody || tbody.dataset.claudeYearBound) return;
    tbody.dataset.claudeYearBound = 'true';
    tbody.addEventListener('change', async (e) => {
      const sel = e.target.closest('.claude-type-year-select');
      if (!sel) return;
      sel.disabled = true;
      const yearVal = sel.value ? Number(sel.value) : null;
      const { error } = await sb.from('course_types').update({ year: yearVal }).eq('id', sel.dataset.id);
      sel.disabled = false;
      if (error) { alert(`연도 저장 실패: ${error.message}`); return; }
      if (typeof allCourseTypes !== 'undefined') {
        const t = allCourseTypes.find(t => t.id === sel.dataset.id);
        if (t) t.year = yearVal;
      }
      sel.closest('tr').dataset.claudeYear = yearVal || '';
      claudeApplyTypeYearFilter();
    });
  }

  function claudeInjectTypeYearFilter() {
    const details = document.getElementById('claudeTypePanelDetails');
    if (!details || document.getElementById('claudeTypeYearFilter')) return;
    const table = document.querySelector('#typeRows')?.closest('.table-shell');
    if (!table) return;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-bottom:10px;display:flex;align-items:center;gap:8px;';
    wrap.innerHTML = `
      <label style="font-size:12px;font-weight:800;color:var(--ink);">연도로 보기</label>
      <select id="claudeTypeYearFilter" style="padding:6px 8px;border:1px solid var(--line);border-radius:6px;font-family:inherit;font-size:12px;">
        <option value="">전체</option>
      </select>
    `;
    table.parentElement.insertBefore(wrap, table);
    document.getElementById('claudeTypeYearFilter').addEventListener('change', claudeApplyTypeYearFilter);
  }

  function claudeApplyTypeYearFilter() {
    const filterSel = document.getElementById('claudeTypeYearFilter');
    if (!filterSel) return;

    // 옵션 목록을 실제 존재하는 연도들로 최신화
    const years = new Set();
    document.querySelectorAll('#typeRows tr.type-row-table').forEach(tr => {
      if (tr.dataset.claudeYear) years.add(tr.dataset.claudeYear);
    });
    const sortedYears = [...years].sort((a, b) => b - a);
    const prevValue = filterSel.value;
    filterSel.innerHTML = '<option value="">전체</option>' + sortedYears.map(y => `<option value="${y}">${y}년</option>`).join('');
    filterSel.value = sortedYears.includes(prevValue) ? prevValue : '';

    const active = filterSel.value;
    document.querySelectorAll('#typeRows tr.type-row-table').forEach(tr => {
      tr.style.display = (!active || tr.dataset.claudeYear === active) ? '' : 'none';
    });
  }

  function claudeRefreshTypeYearUI() {
    claudeInjectTypeCollapsible();
    claudeInjectTypeYearColumn();
    claudeBindTypeYearSelects();
    claudeInjectTypeYearFilter();
    claudeApplyTypeYearFilter();
  }

  function claudeInitTypeYearUI() {
    claudeRefreshTypeYearUI();
    const tbody = document.getElementById('typeRows');
    if (tbody) {
      const observer = new MutationObserver(() => requestAnimationFrame(claudeRefreshTypeYearUI));
      observer.observe(tbody, { childList: true, subtree: true });
    }
  }

  /* ==================================================================
   * [Claude 추가] 개요 화면 — "최근 활동" 대신 "가장 가까운 교육 · 참석자 명단"을
   * 보여줌. 오늘 이후로 가장 빨리 시작하는 회차를 찾아서, 그 회차에 신청한
   * 사람들(취소/거절 제외)을 이름/연락처/상태와 함께 보여줌.
   * admin.html의 loadRecentActivity()/#recentActivity는 그대로 두고
   * (다른 곳에서도 호출되므로 지우지 않음) 그 패널만 화면에서 숨김.
   * ================================================================== */
  function claudeHideRecentActivityPanel() {
    const panel = [...document.querySelectorAll('.overview-grid > .panel')].find(p => p.querySelector('h2')?.textContent.trim() === '최근 활동');
    if (panel) panel.style.display = 'none';
  }

  function claudeFindNearestUpcomingCourse() {
    const courses = (typeof allCourses !== 'undefined' && Array.isArray(allCourses)) ? allCourses : [];
    const todayKey = claudeTodayDateKey();
    const upcoming = courses
      .filter(c => c.start_date && c.start_date >= todayKey)
      .sort((a, b) => {
        if (a.start_date !== b.start_date) return a.start_date < b.start_date ? -1 : 1;
        return (a.is_open === false ? 1 : 0) - (b.is_open === false ? 1 : 0);
      });
    return upcoming[0] || null;
  }

  function claudeRenderUpcomingPanel() {
    const body = document.getElementById('claudeUpcomingBody');
    if (!body) return;
    const course = claudeFindNearestUpcomingCourse();
    if (!course) {
      body.innerHTML = '<div class="empty-row">예정된 회차가 없습니다</div>';
      return;
    }
    const apps = (typeof allApps !== 'undefined' && Array.isArray(allApps)) ? allApps : [];
    const attendees = apps.filter(a => a.courses?.id === course.id && a.status !== '취소' && a.status !== '거절');

    const header = `
      <div style="margin-bottom:10px;">
        <b style="font-size:14px;color:var(--ink);">${escapeHtml((course.course_types?.name || '') + ' ' + (course.name || ''))}${course.round ? ' · ' + escapeHtml(course.round) + '회차' : ''}</b>
        <div class="compact-info" style="margin-top:2px;">${escapeHtml(course.start_date || '')}${course.end_date && course.end_date !== course.start_date ? ' ~ ' + escapeHtml(course.end_date) : ''} · 신청 ${attendees.length.toLocaleString('ko-KR')}명${course.capacity ? ' / 정원 ' + escapeHtml(course.capacity) : ''}</div>
      </div>
    `;
    if (!attendees.length) {
      body.innerHTML = header + '<div class="empty-row">아직 신청자가 없습니다</div>';
      return;
    }
    const rows = attendees.map(a => `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 0;border-top:1px solid #F1F4F8;font-size:12.5px;">
        <span style="font-weight:800;color:var(--ink);">${escapeHtml(a.trainees?.name || '-')}</span>
        <span style="color:var(--ink-soft);">${escapeHtml(a.trainees?.phone || '-')}</span>
        <span class="status-${escapeHtml(a.status || '')}" style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:800;">${escapeHtml(a.status || '')}</span>
      </div>
    `).join('');
    body.innerHTML = header + rows;
  }

  function claudeInjectUpcomingPanel() {
    const grid = document.querySelector('.overview-grid');
    if (!grid || document.getElementById('claudeUpcomingPanel')) return;
    claudeHideRecentActivityPanel();
    const panel = document.createElement('section');
    panel.className = 'panel';
    panel.id = 'claudeUpcomingPanel';
    panel.innerHTML = `
      <h2>다가오는 교육 · 참석자 명단</h2>
      <div id="claudeUpcomingBody"><div class="empty-row">불러오는 중...</div></div>
    `;
    grid.appendChild(panel);
    claudeRenderUpcomingPanel();

    const overviewNavBtn = document.querySelector('.nav-item[data-view="overview"]');
    if (overviewNavBtn) overviewNavBtn.addEventListener('click', () => claudeRenderUpcomingPanel());
  }

  /* ==================================================================
   * [Claude 추가] "등록된 회차" 상단의 과정 필터 드롭박스 라벨 정리.
   * admin.html의 renderCourseTypeTabs()가 옵션을 "OO 회차만 보기"로 그리는데,
   * 과정별 그룹핑이 생긴 뒤로는 중복/장황해서 "OO"만 남기고 " 회차만 보기"는 뗌.
   * ("전체 회차 보기" 옵션은 값이 없어서(value="") 그대로 둠.)
   * ================================================================== */
  function claudeSimplifyCourseTypeTabs() {
    const tabs = document.getElementById('courseTypeTabs');
    if (!tabs) return;
    Array.from(tabs.options).forEach(opt => {
      if (opt.value && / 회차만 보기$/.test(opt.textContent)) {
        opt.textContent = opt.textContent.replace(/ 회차만 보기$/, '');
      }
    });
  }

  function claudeWatchCourseTypeTabs() {
    const tabs = document.getElementById('courseTypeTabs');
    if (!tabs) return;
    claudeSimplifyCourseTypeTabs();
    const observer = new MutationObserver(() => claudeSimplifyCourseTypeTabs());
    observer.observe(tabs, { childList: true });
  }

  /* ===== [Claude 추가] Pretendard 웹폰트 로드(CDN). body의 font-family는
     injectStyle()의 CSS에서 이미 'Pretendard'를 1순위로 지정해뒀으니, 여기서는
     그 폰트 파일 자체를 <link>로 불러오기만 함. ===== */
  function claudeInjectReadableFont() {
    if (document.getElementById('claudePretendardFont')) return;
    const link = document.createElement('link');
    link.id = 'claudePretendardFont';
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css';
    document.head.appendChild(link);
  }

  /* ==================================================================
   * [Claude 추가] "로그인 상태 유지" 체크박스 — 개인정보(신청자 이름/연락처/
   * 주민등록번호 등)를 다루는 관리자 화면이라, 요청에 따라 기본값을 "매번
   * 로그인 필요"로 바꾸고 체크박스를 켰을 때만 브라우저에 로그인이 남아있게 함.
   * admin.html의 로그인 로직(checkExistingSession/showDashboard/signInWithPassword)
   * 자체는 건드리지 않고, Supabase가 로그인 세션을 저장해두는 localStorage의
   * "sb-...-auth-token" 키를 이 스크립트에서 직접 관리하는 방식으로 구현함:
   *   - 체크박스를 켜고 로그인하면 지금처럼 브라우저를 껐다 켜도 로그인이 유지됨.
   *   - 체크박스를 끄고 로그인하면(기본값) 그 탭에 열려있는 동안은 정상적으로
   *     로그인 상태가 유지되지만, 탭을 닫거나 새로고침하는 순간 저장된 로그인
   *     토큰을 지워서 다음에 다시 열면 로그인 화면부터 시작하게 함.
   *   - 페이지가 열릴 때 "유지"를 선택한 적이 없는데도(=기본값) 예전에 저장된
   *     로그인이 남아있어서 자동으로 대시보드가 떠 있다면, 즉시 로그아웃 처리함.
   * ================================================================== */
  const CLAUDE_KEEP_LOGIN_KEY = 'khp_keep_login';

  function claudeIsKeepLoginOn() {
    return localStorage.getItem(CLAUDE_KEEP_LOGIN_KEY) === '1';
  }

  function claudeClearPersistedAuthToken() {
    Object.keys(localStorage).forEach(key => {
      if (/^sb-.*-auth-token$/.test(key)) localStorage.removeItem(key);
    });
  }

  function claudeInjectKeepLoginCheckbox() {
    if (document.getElementById('claudeKeepLoginRow')) return;
    const loginBtn = document.getElementById('loginBtn');
    if (!loginBtn || !loginBtn.parentNode) return;
    const row = document.createElement('label');
    row.id = 'claudeKeepLoginRow';
    row.className = 'claude-keep-login-row';
    row.innerHTML = '<input type="checkbox" id="claudeKeepLoginChk"><span>이 브라우저에 로그인 상태 유지</span>';
    loginBtn.parentNode.insertBefore(row, loginBtn);
  }

  function claudeBindKeepLoginControls() {
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    if (loginBtn) {
      loginBtn.addEventListener('click', () => {
        const chk = document.getElementById('claudeKeepLoginChk');
        localStorage.setItem(CLAUDE_KEEP_LOGIN_KEY, chk && chk.checked ? '1' : '0');
      });
    }
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        localStorage.removeItem(CLAUDE_KEEP_LOGIN_KEY);
      });
    }
  }

  function claudeEnforceKeepLoginOnLoad() {
    if (claudeIsKeepLoginOn()) return; // "유지"를 선택했으면 손대지 않음(기존 동작 그대로)
    const dashboard = document.getElementById('dashboard');
    const loginScreen = document.getElementById('loginScreen');
    if (dashboard && dashboard.classList.contains('show')) {
      // "유지"를 선택한 적 없는데 예전 로그인이 남아 자동으로 대시보드가 떠 있는 경우 — 즉시 되돌림
      dashboard.classList.remove('show');
      if (loginScreen) loginScreen.style.display = '';
    }
    claudeClearPersistedAuthToken();
    if (typeof sb !== 'undefined' && sb && sb.auth && sb.auth.signOut) {
      sb.auth.signOut().catch(() => {});
    }
  }

  function claudeWipeAuthTokenOnUnload() {
    if (claudeIsKeepLoginOn()) return;
    claudeClearPersistedAuthToken();
  }

  function claudeInitKeepLogin() {
    claudeEnforceKeepLoginOnLoad();
    claudeInjectKeepLoginCheckbox();
    claudeBindKeepLoginControls();
    window.addEventListener('pagehide', claudeWipeAuthTokenOnUnload);
    window.addEventListener('beforeunload', claudeWipeAuthTokenOnUnload);
  }

  function init() {
    claudeInitKeepLogin();
    injectStyle();
    claudeInjectReadableFont();
    buildNavAndSection();
    buildCertNavAndSection();
    buildSettingsSection();
    injectSettingsFooterButton();
    claudeInitColumnResize();
    bindQuickNotifyDelegate();
    claudeLoadCustomFieldDefs();
    claudeInjectCourseCalendar();
    claudeBindTabPersistence();
    claudeWatchDashboardShow();
    claudeInitTypeYearUI();
    claudeInjectUpcomingPanel();
    claudeBindCourseDateHelpers();
    claudeWatchCourseTypeTabs();
    claudeLoadAllCourseSessions().then(() => claudeRefreshCourseCalendar());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
