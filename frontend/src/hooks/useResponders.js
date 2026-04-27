import { useEffect, useState } from 'react';
import { MOCK_RESPONDERS } from '../lib/mockData';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

export function useResponders() {
  const [responders, setResponders] = useState(() => (DEMO_MODE ? MOCK_RESPONDERS : []));
  const [loading, setLoading] = useState(() => !DEMO_MODE && !!db);
  const [error, setError] = useState(() => (DEMO_MODE ? null : (!db ? 'Firestore not initialized' : null)));
  const [isDemo, setIsDemo] = useState(() => DEMO_MODE);

  useEffect(() => {
    if (DEMO_MODE) {
      console.info('[CrisisHub] Demo mode enabled - bypassing backend API');
      return undefined;
    }

    if (!db) {
      return;
    }

    const q = collection(db, 'responders');

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setResponders(docs.length > 0 ? docs : MOCK_RESPONDERS);
      setError(null);
      setLoading(false);
      setIsDemo(docs.length === 0);
    }, (err) => {
      console.error('[CrisisHub] Firestore responders listener failed:', err.message);
      setError('Realtime connection failed - Falling back to demo data');
      setResponders(MOCK_RESPONDERS);
      setIsDemo(true);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { responders, loading, error, isDemo, refresh: () => {} };
}
