import { Component, Fragment } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import AppErrorFallback from './AppErrorFallback';
import { reportAppError } from './errorHandling';

const quietly = callback => {
  try { Promise.resolve(callback()).catch(() => {}); } catch { /* Recovery must remain usable. */ }
};

export default class AppErrorBoundary extends Component {
  state = { failed: false, attempt: 0 };
  retrying = false;
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) {
    quietly(() => (this.props.report || reportAppError)(error, { source: 'render', fatal: false }));
    // App can fail before its normal startup effect hides the native splash.
    quietly(() => SplashScreen.hideAsync());
  }
  retry = () => {
    if (!this.state.failed || this.retrying) return;
    this.retrying = true;
    this.setState(state => ({ failed: false, attempt: state.attempt + 1 }), () => { this.retrying = false; });
  };
  render() {
    return this.state.failed ? <AppErrorFallback onRetry={this.retry} />
      : <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
  }
}
