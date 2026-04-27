import { useEffect, useState } from 'react';
import { MOCK_AUDIT_EVENTS } from '../lib/mockData';
import { db } from '../firebase';
import { collection, query, limit, onSnapshot, orderBy, where } from 'firebase/firestore';

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

function normalizeEntry(entry) {
  if (!entry) return null;
  const timestamp = entry.timestamp?.toDate ? entry.timestamp.toDate().toISOString() : entry.timestamp;
  return { ...entry, timestamp };
}

export function useAuditLogs(limitCount = 100, incidentId = null) {
  const [logs, setLogs] = useState(() => (DEMO_MODE ? MOCK_AUDIT_EVENTS.slice(0, limitCount) : []));
  const [loading, setLoading] = useState(() => !DEMO_MODE && !!db);
  const [error, setError] = useState(() => (DEMO_MODE ? null : (!db ? 'Firestore not initialized' : null)));

  useEffect(() => {
    if (DEMO_MODE) {
      console.info('[CrisisHub] Demo mode enabled - bypassing backend API');
      return undefined;
    }

    if (!db) {
      return;
    }

    let q = query(
      collection(db, 'audit_events'),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );

    if (incidentId) {
      q = query(
        collection(db, 'audit_events'),
        where('incident_id', '==', incidentId),
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => normalizeEntry({ id: doc.id, ...doc.data() }));
      setLogs(docs.length > 0 ? docs : MOCK_AUDIT_EVENTS.slice(0, limitCount));
      setError(null);
      setLoading(false);
    }, (err) => {
      console.error('[CrisisHub] Firestore audit listener failed:', err.message);
      setError('Realtime connection failed - Falling back to demo data');
      setLogs(MOCK_AUDIT_EVENTS.slice(0, limitCount));
      setLoading(false);
    });

    return () => unsubscribe();
  }, [incidentId, limitCount]);

  return { logs, loading, error, refresh: () => {} };
}
