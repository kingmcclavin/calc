import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Last-resort guard so a rendering bug never leaves a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode; inline?: boolean }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Lumen crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page" role="alert">
        <div className="card card-body stack">
          <h2 style={{ margin: 0 }}>Something went wrong</h2>
          <p className="muted" style={{ margin: 0 }}>
            This part of the calculator hit an unexpected error: <code>{this.state.error.message}</code>
          </p>
          <div className="row wrap">
            <button className="btn primary" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
            {!this.props.inline && (
              <button
                className="btn danger"
                onClick={() => {
                  if (confirm('Reset all calculator data (history, graphs, lists, settings)?')) {
                    try {
                      localStorage.removeItem('lumen84-state');
                    } catch {
                      /* ignore */
                    }
                    location.reload();
                  }
                }}
              >
                Reset saved data
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}
