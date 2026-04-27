import { useState, useEffect } from 'react';
import { useIncidents } from '../../hooks/useIncidents';
import { useResponders } from '../../hooks/useResponders';
import AdvancedMap from './AdvancedMap';
import { DEMO_VENUE_LAYOUT } from '../../data/venueLayout';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function LiveMap({
  incidents: propIncidents,
  responders: propResponders,
  selectedIncident,
  onSelectIncident,
  showResponderRoutes,
  showHazardLabels,
}) {
  const { incidents: hookIncidents } = useIncidents();
  const { responders: hookResponders } = useResponders();
  const [venueLayout, setVenueLayout] = useState(DEMO_VENUE_LAYOUT);

  const incidents = propIncidents ?? hookIncidents;
  const responders = propResponders ?? hookResponders;

  useEffect(() => {
    if (!API_BASE) return;
    fetch(`${API_BASE}/api/venue-layout`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.zones) setVenueLayout(d); })
      .catch(() => {/* use local fallback silently */});
  }, []);

  return (
    <AdvancedMap
      venueLayout={venueLayout}
      incidents={incidents}
      responders={responders}
      selectedIncident={selectedIncident}
      showHazards
      showResponders
      showRoutes={showResponderRoutes}
      showLabels={showHazardLabels}
      onZoneClick={onSelectIncident ? (zone, inc) => { if (inc) onSelectIncident(inc); } : null}
    />
  );
}
