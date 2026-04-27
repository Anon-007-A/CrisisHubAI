import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = Date.now();
    setToasts((current) => [...current, { id, message, type }]);

    if (duration > 0) {
      window.setTimeout(() => removeToast(id), duration);
    }

    return id;
  }, [removeToast]);

  const success = useCallback((message, duration = 3000) => addToast(message, 'success', duration), [addToast]);
  const error = useCallback((message, duration = 5000) => addToast(message, 'error', duration), [addToast]);
  const warning = useCallback((message, duration = 4000) => addToast(message, 'warning', duration), [addToast]);
  const info = useCallback((message, duration = 3000) => addToast(message, 'info', duration), [addToast]);

  return (
    <ToastContext.Provider value={{ addToast, removeToast, success, error, warning, info }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

function ToastContainer({ toasts, onRemove }) {
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'grid', gap: 12 }}>
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onRemove={() => onRemove(toast.id)} />
      ))}
    </div>
  );
}

function Toast({ toast, onRemove }) {
  const typeStyles = {
    success: {
      background: 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)',
      borderLeft: '4px solid #4CAF50',
    },
    error: {
      background: 'linear-gradient(135deg, #f44336 0%, #da190b 100%)',
      borderLeft: '4px solid #f44336',
    },
    warning: {
      background: 'linear-gradient(135deg, #ff9800 0%, #e68900 100%)',
      borderLeft: '4px solid #ff9800',
    },
    info: {
      background: 'linear-gradient(135deg, #2196F3 0%, #0b7dda 100%)',
      borderLeft: '4px solid #2196F3',
    },
  };

  const icons = {
    success: 'OK',
    error: 'X',
    warning: '!',
    info: 'i',
  };

  return (
    <div
      style={{
        ...typeStyles[toast.type],
        color: 'white',
        padding: '14px 20px',
        borderRadius: '12px',
        minWidth: '320px',
        maxWidth: '400px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
        animation: 'slideIn 0.3s ease-out',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        fontSize: '14px',
        fontWeight: '500',
      }}
    >
      <span style={{ fontSize: '0.85rem', fontWeight: 800, width: 20, textAlign: 'center' }}>{icons[toast.type]}</span>
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Dismiss toast"
        style={{
          background: 'rgba(255, 255, 255, 0.2)',
          border: 'none',
          color: 'white',
          cursor: 'pointer',
          padding: '4px 8px',
          borderRadius: '999px',
          fontSize: '12px',
          fontWeight: 'bold',
          transition: 'background 0.2s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'; }}
      >
        Close
      </button>
    </div>
  );
}

if (typeof document !== 'undefined' && document.head && !document.getElementById('toast-slide-style')) {
  const style = document.createElement('style');
  style.id = 'toast-slide-style';
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `;
  document.head.appendChild(style);
}
