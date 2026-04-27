import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  handleRefresh = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          background: 'linear-gradient(180deg, var(--color-surface-dim), var(--color-surface))',
          color: 'var(--color-on-surface)',
          padding: '24px',
          textAlign: 'center',
        }}>
          <div style={{
            maxWidth: 520,
            padding: '40px',
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-outline-variant)',
            borderRadius: '16px',
            backdropFilter: 'blur(8px)',
            boxShadow: 'var(--shadow-2)',
          }}>
            <h1 style={{ margin: '0 0 16px', fontSize: '28px' }}>
              Aegis CrisisHub System Error
            </h1>
            <p style={{ margin: '0 0 20px', fontSize: '14px', color: 'var(--color-on-surface-variant)', lineHeight: '1.6' }}>
              Demo mode active. An unexpected error has occurred. Please refresh the page to restart the application.
            </p>
            {this.state.error && import.meta.env.DEV && (
              <details style={{
                marginBottom: '24px',
                padding: '12px',
                backgroundColor: 'var(--color-danger-light)',
                borderRadius: '10px',
                border: '1px solid rgba(234,67,53,0.2)',
                textAlign: 'left',
              }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: '8px' }}>
                  Error Details (dev only)
                </summary>
                <pre style={{
                  margin: 0,
                  fontSize: '11px',
                  color: 'var(--color-on-surface)',
                  overflow: 'auto',
                  maxHeight: '200px',
                }}>
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
            <button
              onClick={this.handleRefresh}
              style={{
                width: '100%',
                padding: '12px 24px',
                backgroundColor: 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: '999px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background-color 0.2s',
              }}
              onMouseOver={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-primary-dark)'; }}
              onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-primary)'; }}
            >
              Refresh Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
