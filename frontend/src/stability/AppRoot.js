import AppErrorBoundary from './AppErrorBoundary';

function Application() {
  // Evaluate App and its module imports inside the boundary, after global observation is installed.
  const App = require('../../App').default;
  return <App />;
}

export default function AppRoot() {
  return <AppErrorBoundary><Application /></AppErrorBoundary>;
}
