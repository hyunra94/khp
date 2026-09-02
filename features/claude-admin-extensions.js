/* ==================================================================
 * [Claude 추가] claude-admin-extensions.js — 위 6개 claude-0N-*.js 파일이 정의해둔
 * 함수들을 실제로 호출해서 초기화하는 마지막 부트스트랩 파일. admin.html의
 * <script> 태그 중 반드시 가장 마지막에 로드되어야 함(다른 claude-*.js들이 먼저
 * 로드돼서 여기서 부르는 함수들이 전부 정의돼 있어야 하기 때문).
 * ================================================================== */

  function init() {
    claudeInitKeepLogin();
    injectStyle();
    claudeInjectReadableFont();
    buildCertNavAndSection();
    buildNavAndSection();
    buildSatisfactionNavAndSection();
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
    claudeWatchCourseLookup();
    claudeBindMemoClickEdit();
    claudeLoadAllCourseSessions().then(() => {
      claudeRefreshCourseCalendar();
      claudeRefreshAllSessionToggleLabels();
    });
    /* [Claude 추가] 훈련생×과정종류별 메모(trainee_type_memos) 로드 후,
       이미 그려져 있던 "신청 현황"/"과정 조회" 메모 칸을 최신값으로 다시 그림. */
    claudeLoadTypeMemos().then(() => {
      if (typeof renderApps === 'function') renderApps();
      if (typeof claudeAugmentCourseLookupEdit === 'function') claudeAugmentCourseLookupEdit();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
