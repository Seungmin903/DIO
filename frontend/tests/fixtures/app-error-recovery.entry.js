import { Text } from 'react-native';
import { registerRootComponent } from 'expo';
import AppErrorBoundary from '../../src/stability/AppErrorBoundary';
import { initializeErrorHandling, readAppErrorDiagnostics } from '../../src/stability/errorHandling';

initializeErrorHandling();
const qa = window.__stabilityQA = { broken: true, read: readAppErrorDiagnostics };
function Content() {
  if (qa.broken) throw new TypeError('QA-only private@example.com token=do-not-store');
  return <Text accessibilityRole="header">정상 화면으로 돌아왔어요</Text>;
}
function Fixture() {
  return <AppErrorBoundary><Content /></AppErrorBoundary>;
}
registerRootComponent(Fixture);
