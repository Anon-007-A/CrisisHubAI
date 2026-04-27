import { useEffect, useState, useRef } from 'react';

/**
 * Polls the backend /api/incidents endpoint every 3 seconds.
 * This is separate from useIncidents (which uses Firestore/demo data)
 * so that reports submitted via /api/report always appear here.
 */
export function useBackendIncidents(intervalMs = 3000) {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const timeoutRef = useRef(null);

  const fetchIncidents = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/incidents?limit=50');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setIncidents(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
    timeoutRef.current = setInterval(fetchIncidents, intervalMs);
    return () => clearInterval(timeoutRef.current);
  }, [intervalMs]);

  return { incidents, loading, error };
}
