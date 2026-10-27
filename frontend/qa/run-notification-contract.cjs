const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const frontend = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--backend-root')) throw new Error('Usage: node qa/run-notification-contract.cjs [--backend-root path]');
const backend = path.resolve(args[1] || path.join(frontend, '../backend'));
if (!fs.existsSync(path.join(backend, 'src/test/java/com/f106/DIO/notification/NotificationFrontendContractTests.java')))
  throw new Error('계약 생산자 테스트가 있는 backend를 --backend-root로 지정해 주세요.');
const outputRoot = path.join(frontend, '.expo/notification-contract');
fs.mkdirSync(outputRoot, { recursive: true });
const init = path.join(outputRoot, 'contract-init.gradle');
fs.writeFileSync(init, "allprojects { layout.buildDirectory.set(layout.projectDirectory.dir('.gradle/notification-frontend-contract-build')) }\n");
const output = path.join(outputRoot, randomUUID() + '.json');
const env = { ...process.env, DIO_NOTIFICATION_CONTRACT_OUTPUT: output };
function run(command, options, cwd) {
  const result = spawnSync(command, options, { cwd, env, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('알림 계약 검증 실패: ' + (result.signal || result.status));
}
const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java';
// Java wrapper를 직접 호출해 Windows batch/shell 인용과 플랫폼별 gradlew 차이를 피한다.
run(java, ['-Xmx64m', '-Xms64m', '-classpath', path.join(backend, 'gradle/wrapper/gradle-wrapper.jar'),
  'org.gradle.wrapper.GradleWrapperMain', 'test', '--tests', 'com.f106.DIO.notification.NotificationFrontendContractTests.exportsActualSpringResponsesForFrontend',
  '--offline', '--console=plain', '--rerun-tasks', '--init-script', init, '--project-cache-dir', '.gradle/notification-frontend-contract-cache'], backend);
if (!fs.existsSync(output)) throw new Error('현재 실행의 Spring 응답 파일이 생성되지 않았습니다.');
run(process.execPath, ['--test', 'tests/spring-notification-contract.test.js'], frontend);
