/* ==================================================================
 * [Claude 추가] claude-01-styles.js — 공용 유틸(escapeHtml, formatDateTime) +
 * 전체 디자인 시스템 CSS(injectStyle). admin.html의 <head> 뒤에 이 CSS가 붙어서
 * 기존 스타일을 덮어씀. 이 파일이 다른 모든 claude-*.js 파일보다 먼저 로드되어야
 * escapeHtml/formatDateTime을 다른 파일에서 바로 쓸 수 있음(전역 스코프 공유,
 * <script> 태그를 여러 개로 나눠도 admin.html의 sb/allCourses처럼 서로 접근 가능).
 * 원래 하나였던 claude-admin-extensions.js(4000줄 가까이 됨)를 정리 요청에 따라
 * 주제별로 나눈 파일 중 1번째. 실제 동작 변경은 없고 파일만 나뉨.
 * 로드 순서: 01-styles → 02-notify → 03-applications → 04-course → 05-cert →
 * 06-ui-settings → claude-admin-extensions.js(init 실행부, 반드시 마지막)
 * ================================================================== */

/* ==================================================================
 * [Claude 추가] 알림 관리 화면 + 신청자 수동 등록 + 신청현황 UX 보완
 * admin.html의 전역 변수(sb, allCourses, APPLICATION_STATUSES, loadApplications 등)를
 * 그대로 사용합니다. 이 파일은 admin.html의 기존 함수/로직을 수정하지 않습니다.
 * ================================================================== */
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

      /* ===== [Claude 추가] 로그인 화면 "로그인 상태 유지" 체크박스 =====
         admin.html의 ".login-card label{display:block}"와 ".login-card input{...}"이
         이미 label/input 태그 전체를 대상으로 스타일을 걸어둬서(specificity가 class 1개인
         .claude-keep-login-row보다 높음, class+태그 조합), 그냥 클래스만으로는 안 눌리고
         체크박스가 100% 너비 인풋처럼 커지면서 줄바꿈되는 문제가 있었음. id 선택자로
         specificity를 확실히 올려서 덮어씀. */
      #claudeKeepLoginRow{
        display:flex !important;align-items:center;gap:8px;margin:14px 0 4px;cursor:pointer;
        font-size:13px;color:var(--ink-soft);font-weight:600;user-select:none;
      }
      #claudeKeepLoginRow input{
        appearance:auto;-webkit-appearance:checkbox;
        width:16px;height:16px;min-height:auto;flex:0 0 auto;
        padding:0;border:none;border-radius:0;background:none;box-shadow:none;
        accent-color:var(--accent);cursor:pointer;
      }
      #claudeKeepLoginRow span{font-size:13px;color:var(--ink-soft);font-weight:600;}

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

      /* ===== [Claude 추가] "신청 현황" 상태 컬럼 — select가 컬럼 폭에 맞춰 반응형으로
         줄어들게 하고(글자가 짤려도 최소한 박스 밖으로 안 삐져나가게), 신청일시는
         claudeHideStatusDatesAsTooltip()에서 display:none 처리하고 title 툴팁으로 옮김 */
      .application-status-list,.application-status-item{width:100%;min-width:0;}

      /* ===== [Claude 추가] "신청 현황" 신청과정 컬럼도 상태 컬럼과 같은 방식으로 반응형 처리.
         원래 .application-course-list{min-width:230px}라 컬럼을 좁게 조절하면 밖으로
         삐져나가던 문제 — min-width를 없애고, 과정명/메타 텍스트는 한 줄로 줄이되 넘치면
         ...으로 잘리게 함. 원래부터 있던 hover 시 상세 팝업(.application-course-detail,
         과정명 전체+접수시간)은 그대로 남아있어서, 짧게 잘려도 마우스를 올리면 전체 내용을
         볼 수 있음(상태 컬럼의 "날짜는 호버로" 처리와 같은 패턴). */
      .application-course-list{min-width:0;max-width:100%;width:100%;}
      .application-course-item{min-width:0;max-width:100%;}
      .application-course-item b{
        display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;
      }
      .application-course-meta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;}

      /* [Claude 추가] "과정 조회" 인라인 편집 버튼 영역 + 메모 컬럼 */
      .lookup-table td[data-label="관리"]{display:flex;gap:6px;white-space:nowrap;}
      .claude-lookup-edit-btn,.claude-lookup-save-btn,.claude-lookup-cancel-btn{min-height:30px;padding:0 10px;font-size:12px;}
      .claude-lookup-memo-td{max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink-soft);font-size:12.5px;}
      .claude-lookup-memo-td textarea.row-memo{width:100%;min-width:120px;box-sizing:border-box;}

      /* [Claude 추가] 사이드바 하단(이메일 위)에 번호 없이 붙는 "알림 관리" */
      .claude-footer-nav-item{padding-bottom:12px;margin-bottom:2px;border-bottom:1px solid var(--line);}

      .application-status-list select.status-select{
        width:100%;max-width:100%;box-sizing:border-box;
        overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
      }
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
      /* [Claude 추가] 버그 수정: admin.html 원본 .course-edit-row는 80px/130px/130px/86px/72px처럼
         고정 픽셀 열이 8개나 이어져 있어서 최소 폭이 1000px+ 필요함 — 예전엔 "등록된 회차" 패널이
         충분히 넓어서 안 보이던 문제인데, v2에서 사이드바(240→272px)/카드 padding이 커지면서
         왼쪽 패널이 좁아진 화면(전체 폭이 넉넉하지 않은 경우)에서 이 편집 행이 오른쪽 "회차 추가"
         패널 위로 넘쳐 흘러(overflow) 겹쳐 보이는 문제가 있었음. 폭에 맞게 알아서 줄바꿈되도록
         고정 픽셀 열 대신 auto-fit 반응형 그리드로 바꾸고, 저장/취소 버튼은 항상 맨 아래 한 줄로 뺌. */
      .course-edit-row{
        padding:20px 22px;border-radius:10px;
        grid-template-columns:repeat(auto-fit,minmax(110px,1fr));
        row-gap:12px;
      }
      .course-edit-row>*{min-width:0;}
      .course-edit-row select,.course-edit-row input{width:100%;box-sizing:border-box;}
      .course-edit-row .course-row-actions{grid-column:1 / -1;justify-content:flex-end;display:flex;gap:8px;}
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
      /* [Claude 추가] 과정별·회차별 요약 + 필터 */
      .claude-cert-summary-panel,.claude-cert-list-panel{margin-bottom:16px;}
      .claude-cert-summary-table th:not(:first-child),.claude-cert-summary-table td:not(:first-child){text-align:right;}
      .claude-cert-summary-toggle{
        background:none;border:none;padding:0;margin:0;font:inherit;font-weight:700;color:var(--ink);cursor:pointer;text-align:left;
      }
      .claude-cert-summary-toggle:hover{color:var(--accent);}
      .claude-cert-summary-detail td{padding:0;background:var(--surface-soft);}
      .claude-cert-summary-subtable{width:100%;border-collapse:collapse;}
      .claude-cert-summary-subtable th,.claude-cert-summary-subtable td{padding:8px 16px;font-size:12.5px;}
      .claude-cert-summary-subtable th:not(:first-child),.claude-cert-summary-subtable td:not(:first-child){text-align:right;}
      .claude-cert-summary-round{color:var(--ink-soft);font-weight:600;}
      .claude-cert-filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;}
      .claude-cert-filters select,.claude-cert-filters input{
        min-height:38px;padding:0 10px;border-radius:8px;border:1px solid var(--line);background:#fff;
        font-family:inherit;font-size:13px;color:var(--ink);
      }
      .claude-cert-filters input{flex:1;min-width:180px;}
      .claude-cert-cat-badge{
        display:inline-block;padding:3px 9px;border-radius:999px;font-size:11.5px;font-weight:700;
        background:var(--surface-soft);color:var(--ink-soft);
      }
      .claude-cert-cat-badge.claude-cert-cat-대규모{background:var(--accent-soft);color:var(--accent);}
      .claude-cert-cat-badge.claude-cert-cat-자회사{background:#FBF0DE;color:var(--gold);}

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

