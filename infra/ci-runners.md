# CI 러너 분리

MR 파이프라인은 **MR 브랜치의 `.gitlab-ci.yml`과 스크립트**를 실행한다. 그래서 MR 잡이 배포 호스트에서 돌면, MR 작성자가 CI 파일이나 스크립트를 바꿔 그 호스트에서 무엇이든 실행할 수 있다. 배포 호스트에는 운영 비밀값(`/home/gitlab-runner/dio-env/*.env`)과 운영 컨테이너가 있다.

파일 권한만 나누는 방법으로는 막을 수 없다. 호스트 docker를 쓸 수 있는 잡은 `docker run -v /home:/h ...`로 어떤 파일이든 읽을 수 있기 때문이다. 그래서 러너 자체를 둘로 나눈다.

| 러너 태그 | 실행 방식 | 받는 파이프라인 | 맡는 잡 |
| --- | --- | --- | --- |
| `ec2-deploy` | shell, 호스트 docker 사용 | **보호 브랜치만**(Protected 러너) | `runner-check`, `deploy-*`, `publish-remote-assets-*`, `backend-postgres-push-test` |
| `mr-sandbox` | docker executor, 호스트 docker 소켓 없음 | MR·보호 브랜치 모두 | 나머지 검사 잡 전부(테스트·리뷰·비밀값 검사·에셋 형식 검사) |

`DeploymentAuthContractTests.mergeRequestJobsNeverRunOnTheDeploymentRunner`가 이 배치를 검사한다. MR에서 생길 수 있는 잡이 `ec2-deploy`를 쓰거나, `mr-sandbox` 잡이 `docker`·`/home/gitlab-runner`를 부르면 백엔드 테스트가 실패한다.

## 처음 적용하는 순서

순서를 지켜야 한다. `ec2-deploy`를 먼저 Protected로 바꾸면 이 변경을 담은 MR 자체가 돌 러너가 없다.

1. 서버에서 현재 상태를 확인한다.
   ```bash
   sudo grep -E 'name|executor|volumes|privileged' /etc/gitlab-runner/config.toml
   id gitlab-runner
   sudo ls -la /home/gitlab-runner/dio-env
   ```
2. `mr-sandbox` 러너를 등록한다(아래 절).
3. 이 변경을 담은 MR을 올리고 파이프라인이 `mr-sandbox`에서 통과하는지 확인한다.
4. MR이 병합되면 `ec2-deploy` 러너를 Protected로 바꾼다(아래 절).
5. CI 변수를 정리한다(아래 절).

## `mr-sandbox` 러너 등록

1. GitLab 프로젝트 → **Settings → CI/CD → Runners → New project runner**
   - Tags: `mr-sandbox`
   - Run untagged jobs: 끔
   - Protected: 끔(MR 파이프라인을 받아야 한다)
   - 만든 뒤 보이는 등록 토큰(`glrt-...`)을 복사한다. 토큰은 저장소·문서·채팅에 남기지 않는다.
2. 배포 서버(또는 별도 서버)에서 등록한다.
   ```bash
   sudo gitlab-runner register --non-interactive --url https://lab.ssafy.com --token <glrt-토큰> --executor docker --docker-image alpine:3.20 --docker-privileged=false --description dio-mr-sandbox
   ```
3. `/etc/gitlab-runner/config.toml`에서 새 러너 블록을 다음처럼 맞춘다.
   ```toml
   [[runners]]
     name = "dio-mr-sandbox"
     executor = "docker"
     limit = 2
     [runners.docker]
       image = "alpine:3.20"
       privileged = false
       # /var/run/docker.sock, /home/... 같은 호스트 경로는 절대 넣지 않는다.
       volumes = ["/cache"]
       # 잡 컨테이너 자원 상한. 백엔드 테스트가 -Xmx2g를 쓰므로 4g 이상으로 둔다. 운영 컨테이너 몫을 남긴다.
       memory = "4g"
       cpus = "2"
       # PostgreSQL 서비스 데이터는 메모리에 둔다(테스트 속도).
       [runners.docker.services_tmpfs]
         "/var/lib/postgresql/data" = "rw"
   ```
4. 재시작하고 연결을 확인한다.
   ```bash
   sudo gitlab-runner restart
   sudo gitlab-runner verify
   ```

같은 EC2에 두어도 잡 컨테이너 안에서는 호스트의 `dio-env`·운영 컨테이너가 보이지 않는다. 메모리가 부족하면 `limit`를 1로 낮추거나 별도 서버에 둔다.

## `ec2-deploy` 러너를 보호 브랜치 전용으로

1. **Settings → Repository → Protected branches**에 `master`, `develop`, `release/*`가 있는지 확인한다.
2. **Settings → CI/CD → Runners**에서 `ec2-deploy` 러너의 연필 아이콘 → **Protected** 체크 → 저장.

이후 이 러너는 보호 브랜치 파이프라인만 받는다. MR 파이프라인의 잡은 받지 않는다.

## CI 변수

MR 파이프라인에서 쓰는 변수는 Protected로 둘 수 없으므로, MR 작성자가 CI 파일을 고쳐 값을 출력할 수 있다고 가정하고 범위를 최소로 둔다.

- `GITLAB_REVIEW_TOKEN`: 이 프로젝트 전용 Project Access Token, Reporter 역할, `api` 범위만. 만료일을 둔다.
- `CLAUDE_CODE_OAUTH_TOKEN`: 리뷰 전용 계정의 토큰. 유출되면 즉시 재발급한다.
- 운영·배포 값은 CI 변수가 아니라 `ec2-deploy` 호스트의 `dio-env` 파일에 둔다. CI 변수에 둔다면 반드시 Protected로 지정한다.

## 잡별 이미지

| 잡 | 이미지 |
| --- | --- |
| `backend-test`, `backend-postgres-*-test`(auth·sharing·diary·lifecycle) | `eclipse-temurin:17-jdk` (+ 서비스 `postgres:17`) |
| `notification-contract-test`, `frontend-email-contract-test`, `remote-assets-check` | `node:24-alpine` |
| `legal-document-test` | `python:3.12-alpine` |
| `release-migration-guard-test` | `alpine:3.20` (+ `bash`, `git`) |
| `secret-scan` | `ghcr.io/gitleaks/gitleaks:v8.30.1` |
| `firebase-config-check` | 고정 digest의 `node` |
| `ai-code-review` | `node:22-bookworm` (+ `@anthropic-ai/claude-code`, 버전은 CI 변수 `CLAUDE_CODE_VERSION`) |

`backend-postgres-push-test`는 보호 브랜치 push에서만 돌고 호스트 docker로 DB를 띄우므로 `ec2-deploy`에 남는다.
