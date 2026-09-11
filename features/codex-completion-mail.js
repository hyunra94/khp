(function () {
  'use strict';
  window.CodexCompletionMail = {
    ask() {
      return new Promise(resolve => {
        const dialog = document.createElement('dialog');
        dialog.style.cssText = 'width:340px;max-width:calc(100vw - 32px);border:1px solid #ccd4d9;border-radius:6px;padding:22px';
        dialog.innerHTML = '<form method="dialog"><h3>수료 처리</h3><label style="display:flex;gap:8px;margin:20px 0"><input type="checkbox" name="send">수료 안내 메일 발송</label><div style="display:flex;justify-content:flex-end;gap:8px"><button value="cancel">취소</button><button value="save">저장</button></div></form>';
        document.body.append(dialog);
        dialog.addEventListener('close', () => {
          const result = dialog.returnValue === 'save' ? {send:dialog.querySelector('input').checked} : null;
          dialog.remove(); resolve(result);
        }, {once:true});
        dialog.showModal();
      });
    },
    async send(id) {
      const {data,error} = await sb.functions.invoke('notify-status-change',{body:{applicationId:id,notifyCompletion:true}});
      if (error || data?.error) alert('수료는 저장됐지만 메일 발송 요청에 실패했습니다. 알림 관리에서 발송 이력을 확인해주세요.');
    }
  };
})();
