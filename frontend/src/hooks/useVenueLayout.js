import { useState, useEffect } from 'react';
import { apiClient } from '../services/api';
import { DEMO_VENUE_LAYOUT } from '../data/venueLayout';

export function useVenueLayout() {
  const [layout, setLayout] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const response = await apiClient.get('/api/venue-layout');
        const nextLayout = response?.data?.zones?.length ? response.data : DEMO_VENUE_LAYOUT;
        setLayout(nextLayout);
        setError(response?.data?.zones?.length ? null : 'Demo venue layout loaded');
      } catch (err) {
        console.error('Failed to load venue layout:', err);
        setLayout(DEMO_VENUE_LAYOUT);
        setError(`${err.message}. Showing demo venue layout.`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { layout, loading, error };
}
