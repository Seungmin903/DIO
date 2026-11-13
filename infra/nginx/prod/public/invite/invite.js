// 브라우저로 열린 초대 링크(/invite/{id}.{서명})의 안내 페이지.
// 앱이 링크를 받지 못했을 때(앱 미설치 · 앱 링크 확인 실패 · 메신저 내장 브라우저)만 보인다.
// 토큰은 주소에만 있고 어디에도 보내지 않는다(외부 스크립트 · 분석 도구 없음).
(function () {
  var HOST = 'k15f106.p.ssafy.io';
  var PACKAGE = 'com.f106.DIO';
  // 앱 src/sharing/memberInviteLink.js 의 sharedInviteUrl 과 같은 형식
  var match = /^\/invite\/([1-9][0-9]{0,18})\.[A-Za-z0-9_-]{43}$/.exec(location.pathname);
  var title = document.getElementById('title');
  if (!match) {
    title.textContent = '사용할 수 없는 초대 링크예요.';
    return;
  }
  var path = match[0];
  var link = 'https://' + HOST + path;
  document.getElementById('actions').hidden = false;
  document.getElementById('hint').hidden = false;

  // 안드로이드: 앱 링크 확인이 끝나지 않았어도 intent 로 앱을 연다(설치 안 됐으면 Play 스토어로 간다)
  if (/Android/i.test(navigator.userAgent)) {
    var open = document.getElementById('open-app');
    open.href = 'intent://' + HOST + path + '#Intent;scheme=https;package=' + PACKAGE + ';end';
    open.hidden = false;
  }

  var toast = document.getElementById('toast');
  var timer = null;
  function show(message) {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(function () { toast.hidden = true; }, 2000);
  }
  function fallbackCopy() {
    var field = document.createElement('textarea');
    field.value = link;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    var copied = false;
    try { copied = document.execCommand('copy'); } catch (error) { copied = false; }
    document.body.removeChild(field);
    return copied;
  }
  document.getElementById('copy-link').addEventListener('click', function () {
    var done = function () { show('초대 링크를 복사했어요.'); };
    var failed = function () { show(fallbackCopy() ? '초대 링크를 복사했어요.' : '초대 링크를 복사하지 못했어요.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, failed);
    else failed();
  });
})();
