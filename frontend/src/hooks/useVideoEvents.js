import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, limit, onSnapshot, orderBy, where } from 'firebase/firestore';

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

const MOCK_VIDEO_EVENTS = [
  { 
    id: 've-001', 
    cctv_feed_id: 'cctv-003', 
    detected_at: new Date(Date.now() - 1000 * 60 * 2).toISOString(), 
    event_type: 'smoke_detected', 
    confidence: 0.94,
    ai_summary: 'Dense smoke accumulation detected near ventilation shaft.',
    verification_status: 'verified',
    incident_id: 'demo-fire-001'
  },
  { 
    id: 've-002', 
    cctv_feed_id: 'cctv-001', 
    detected_at: new Date(Date.now() - 1000 * 60 * 9).toISOString(), 
    event_type: 'collapse_detected', 
    confidence: 0.88,
    ai_summary: 'Individual collapsed near front desk. No movement detected for 30s.',
    verification_status: 'verified',
    incident_id: 'demo-med-002'
  },
  { 
    id: 've-003', 
    cctv_feed_id: 'cctv-005', 
    detected_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(), 
    event_type: 'suspicious_behavior', 
    confidence: 0.72,
    ai_summary: 'Person lingering near secure access door A3.',
    verification_status: 'pending',
    incident_id: null
  }
];

export function useVideoEvents(limitCount = 50, incidentId = null) {
  const initialEvents = DEMO_MODE
    ? (incidentId ? MOCK_VIDEO_EVENTS.filter((e) => e.incident_id === incidentId).slice(0, limitCount) : MOCK_VIDEO_EVENTS.slice(0, limitCount))
    : [];
  const [events, setEvents] = useState(() => initialEvents);
  const [loading, setLoading] = useState(() => !DEMO_MODE && !!db);
  const [error, setError] = useState(() => (DEMO_MODE ? null : (!db ? 'Firestore not initialized' : null)));

  useEffect(() => {
    if (DEMO_MODE) {
      return undefined;
    }

    if (!db) {
      return;
    }

    let q = query(
      collection(db, 'video_events'),
      orderBy('detected_at', 'desc'),
      limit(limitCount)
    );

    if (incidentId) {
      q = query(
        collection(db, 'video_events'),
        where('incident_id', '==', incidentId),
        orderBy('detected_at', 'desc'),
        limit(limitCount)
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEvents(docs.length > 0 ? docs : MOCK_VIDEO_EVENTS.slice(0, limitCount));
      setError(null);
      setLoading(false);
    }, (err) => {
      console.error('[CrisisHub] Firestore video events listener failed:', err.message);
      setError('Realtime connection failed - Falling back to demo data');
      setEvents(MOCK_VIDEO_EVENTS.slice(0, limitCount));
      setLoading(false);
    });

    return () => unsubscribe();
  }, [incidentId, limitCount]);

  return { events, loading, error };
}
