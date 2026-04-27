import { useState, useEffect } from 'react';

export default function ElapsedTimer({ timestamp }) {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    const updateElapsed = () => {
      if (!timestamp) {
        setElapsed('');
        return;
      }

      const now = new Date();
      const incidentTime = new Date(timestamp);
      const diff = now - incidentTime;

      const totalSeconds = Math.floor(diff / 1000);
      const seconds = totalSeconds % 60;
      const totalMinutes = Math.floor(totalSeconds / 60);
      const minutes = totalMinutes % 60;
      const hours = Math.floor(totalMinutes / 60);
      const days = Math.floor(hours / 24);

      if (days > 0) {
        setElapsed(`${days}d ${hours % 24}h ago`);
      } else if (hours > 0) {
        setElapsed(`${hours}h ${minutes}m ago`);
      } else if (minutes > 0) {
        setElapsed(`${minutes}m ${seconds}s ago`);
      } else {
        setElapsed(`${seconds}s ago`);
      }
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [timestamp]);

  return (
    <span className="t-mono" style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
      {elapsed || 'Just now'}
    </span>
  );
}
