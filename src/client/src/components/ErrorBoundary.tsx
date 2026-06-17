/**
 * ErrorBoundary — catches render-time crashes anywhere in the tree and shows a
 * glassmorphism fallback card with a Reload button instead of a blank screen.
 */
import React, { Component, ErrorInfo, ReactNode } from 'react';
import '../App.css';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('Uncaught render error:', error, errorInfo);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="app-root">
          <div className="error-screen">
            <div className="glass-panel error-card">
              <div className="error-mark">!</div>
              <h2 className="error-title">Something Went Wrong</h2>
              <p className="error-message">
                {this.state.error?.message ||
                  'An unexpected error occurred while rendering the app.'}
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={this.handleReload}
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
