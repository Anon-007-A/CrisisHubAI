import { useEffect, useState } from 'react';
import { DEMO_INCIDENTS } from '../lib/mockData';
import { db } from '../firebase';
import { collection, query, limit, onSnapshot, orderBy } from 'firebase/firestore';

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

export function useIncidents(limitCount = 20) {
  const [incidents, setIncidents] = useState(() => (DEMO_MODE ? DEMO_INCIDENTS : []));
  const [loading, setLoading] = useState(() => !DEMO_MODE && !!db);
  const [error, setError] = useState(() => (DEMO_MODE ? null : (!db ? 'Firestore not initialized' : null)));
  const [isDemo, setIsDemo] = useState(() => DEMO_MODE);

  useEffect(() => {
    if (DEMO_MODE) {
      console.info('[CrisisHub] Demo mode enabled - bypassing Firestore realtime sync');
      return undefined;
    }

    if (!db) {
      return;
    }

    const q = query(
      collection(db, 'incidents'),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setIncidents(docs);
      setError(null);
      setLoading(false);
      setIsDemo(false);
    }, (err) => {
      console.error('[CrisisHub] Firestore incidents listener failed:', err.message);
      setError('Realtime connection failed - Falling back to demo data');
      setIncidents(DEMO_INCIDENTS);
      setIsDemo(true);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [limitCount]);

  return { incidents, loading, error, isDemo, refresh: () => {} }; // refresh is a no-op in realtime
}
