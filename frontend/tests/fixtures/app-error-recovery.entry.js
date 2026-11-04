import { useState } from 'react';
import { Text } from 'react-native';
import { registerRootComponent } from 'expo';
import AppErrorBoundary from '../../src/stability/AppErrorBoundary';
import { initializeErrorHandling, readAppErrorDiagnostics } from '../../src/stability/errorHandling';

initializeErrorHandling();
const qa = window.__stabilityQA = { broken: true, loadBroken: false, read: readAppErrorDiagnostics };
function Content() {
  if (qa.broken) throw new TypeError('QA-only private@example.com token=do-not-store');
  return <Text accessibilityRole="header">정상 화면으로 돌아왔어요</Text>;
}
function Loader() {
  if (qa.loadBroken) throw new Error('QA-only module evaluation failure');
  return <Content />;
}
function Fixture() {
  const [attempt, setAttempt] = useState(0);
  qa.failModule = () => { qa.loadBroken = true; setAttempt(value => value + 1); };
  return <AppErrorBoundary key={attempt}><Loader /></AppErrorBoundary>;
}
registerRootComponent(Fixture);
