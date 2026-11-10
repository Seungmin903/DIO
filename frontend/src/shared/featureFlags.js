// 아직 서버 · 저장에 연결되지 않은 기능의 입구 스위치. 개발 · 출시 모든 빌드에서 같은 값이다(환경변수로 나누지 않는다: 개발 빌드에서 켜 둔 채 출시되는 실수를 막는다).
// 연결되면 true 로 바꾸고, 켠 경로의 테스트(각 파일의 '켜면' 케이스)로 확인한다.
// 사진 속 대상 오리기(공방 · 편집기 스티커 보관함): Spring API로 저장하고 로컬 미디어 캐시에 등록한다.
export const CUTOUT_ENTRANCE = true;
// 설정 > 알림의 기기 알림 3줄(다이어리 초대 · 공유된 다이어리 소식 · 매일 기록 알림): 실제 발송에 연결되지 않음
export const DEVICE_TOGGLES_ENABLED = false;
// 알림 설정(회원)의 서비스 알림 구역: 서버 설정에 연결되지 않음
export const SERVICE_SECTION_ENABLED = false;
export const NOTIFICATION_SETTINGS_TITLE = SERVICE_SECTION_ENABLED ? '알림 설정' : '마케팅 수신 설정';
