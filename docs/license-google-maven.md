# license-google-maven

관련 태스크: [S15P31F106-396](https://ssafy.atlassian.net/browse/S15P31F106-396) (손글씨 폰트 기능·Android 배포 지원)

AndroidX·Google Play Services·Firebase·Android Data Transport·Install Referrer의 POM/소스 수집은 공식 Google Maven2를 사용한다. Guava 등은 Maven Central을 유지한다. Play Services stats, Firebase iid-interop, measurement-connector의 SDK 조건 분류를 추가한다. SDK 조건과 번들 오픈소스 고지는 구분한다.

기존 최종 APK·웹·의존성 목록·생성 고지를 일괄 교체하지 않는다. 배포물 제작 시 기존 prepare/verify 절차로 해당 결과물에 맞춰 재생성한다. 이 수정은 수집 경로 보완이며 전체 배포 권리 검토 완료나 모델 가중치 권리 확인을 뜻하지 않는다.

검증: `python -B -m unittest discover -s tests -p test_release_licenses.py` 9개 통과. 기존 검증된 소스 아카이브 캐시 3개를 새 작업 폴더로 복사하여 사용했고 임시 디렉터리는 작업 폴더 안에 지정했다. 최종 APK/웹 고지 재생성은 하지 않았다.
