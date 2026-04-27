import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

const MOCK_CCTV_FEEDS = [
  { id: 'CAM-101', label: 'East Corridor 1F', zone_id: 'east_wing', status: 'online', camera_code: 'CAM-101', image_url: '/images/situation/fire.png' },
  { id: 'CAM-102', label: 'Main Lobby Desk', zone_id: 'lobby', status: 'online', camera_code: 'CAM-102', image_url: '/images/situation/medical.png' },
  { id: 'CAM-103', label: 'Pool Deck Area', zone_id: 'recreation', status: 'online', camera_code: 'CAM-103', image_url: '/images/situation/security.png' },
];

export function useCCTV() {
  const [feeds, setFeeds] = useState(() => (DEMO_MODE ? MOCK_CCTV_FEEDS : []));
  const [loading, setLoading] = useState(() => !DEMO_MODE && !!db);
  const [error, setError] = useState(() => (DEMO_MODE ? null : (!db ? 'Firestore not initialized' : null)));

  useEffect(() => {
    if (DEMO_MODE) {
      return undefined;
    }

    if (!db) {
      return;
    }

    const q = collection(db, 'cctv_feeds');

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFeeds(docs.length > 0 ? docs : MOCK_CCTV_FEEDS);
      setError(null);
      setLoading(false);
    }, (err) => {
      console.error('[CrisisHub] Firestore CCTV listener failed:', err.message);
      setError('Realtime connection failed - Falling back to demo data');
      setFeeds(MOCK_CCTV_FEEDS);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { feeds, loading, error };
}
