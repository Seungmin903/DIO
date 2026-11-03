# 이메일 입력 검증 계약

가입·로그인·이메일 중복 확인·인증·비밀번호 재설정·공유 초대는 같은 검증 기준을 사용한다. 프론트는 src/shared/emailInput.js, 백엔드 요청 DTO는 user/support/UserInput.EMAIL_PATTERN과 normalizeEmail을 사용한다. API 경로·요청 필드·DB·기존 회원 데이터는 변경하지 않는다.

- 앞뒤 ECMAScript 공백 문자 제거 후 소문자 변환. 내부 공백·제어문자는 허용하지 않는다.
- 정규화 결과 최대 254 UTF-16 코드 단위, @ 앞 최대 64 Unicode 코드 포인트.
- 일반 dot-atom 주소를 받는다. 로컬 부분의 문자·숫자 및 !#$%&'*+/=?^_`{|}~-와 구분용 점을 허용하며, 시작·끝 점과 연속 점은 거절한다.
- 도메인은 문자·숫자·내부 하이픈으로 구성한 1~63자 레이블이며 점으로 구분한 레이블이 최소 두 개 필요하다. 한글 도메인과 punycode 표기를 허용한다. domain의 연속 점·밑줄·레이블 양끝 하이픈은 거절한다.
- plus addressing과 사용자 선택 메일 서비스는 제한하지 않는다. 소문자 변환은 기존 DIO 계정 정책을 유지하며 점 제거·+태그 제거·NFKC·punycode 변환은 하지 않는다.
- 이 입력 정책은 RFC의 모든 특수 주소를 지원한다는 뜻이 아니다. 따옴표 로컬 부분·주석·IP 도메인 리터럴은 지원하지 않는다. 기존 DB의 값을 일괄 정정하거나 삭제하지 않는다.
- 형식 통과는 메일함 존재·소유 확인이 아니다. 가입 이메일 인증과 초대 수신자 확인은 별도로 유지한다.

기존에는 프론트가 연속 점 등 일부 주소를 통과시켜도 서버 @Email에서 거절할 수 있었다. 이제 별도 @Email 구현에 따른 차이를 없애고 모든 요청에서 같은 패턴을 사용한다. 프론트 auth 어댑터도 부적합한 입력을 전송 전에 거절한다. 화면 디자인은 바꾸지 않는다.

공통 사례: contracts/email-input-cases.json. Node와 Java Bean Validation에서 같은 정상·비정상·길이 경계·Unicode 공백 사례를 실행한다. frontend의 pnpm test:auth 및 backend의 gradlew test --tests '*EmailInputContractTests'로 검증할 수 있다.
