import { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIncidents } from '../hooks/useIncidents';
import { useResponders } from '../hooks/useResponders';
import { useCCTV } from '../hooks/useCCTV';
import { useVenueLayout } from '../hooks/useVenueLayout';
import AdvancedMap from '../components/map/AdvancedMap';
import { DEMO_VENUE_LAYOUT } from '../data/venueLayout';

const LAYER_OPTIONS = [
  { id: 'hazards', label: 'Hazards', color: '#EA4335' },
  { id: 'heatmap', label: 'Risk Heatmap', color: '#FF6D00' },
  { id: 'density', label: 'Guest Density', color: '#9C27B0' },
  { id: 'responders', label: 'Responders', color: '#4285F4' },
  { id: 'routes', label: 'Routes', color: '#34A853' },
  { id: 'cctv', label: 'CCTV Cameras', color: '#1a73e8' },
  { id: 'labels', label: 'Labels', color: '#9AA0A6' },
];

function IncidentBadge({ incident, isSelected, onClick, currentTime }) {
  const sev = incident.classification?.severity || 'medium';
  const mins = Math.max(0, Math.round((currentTime - new Date(incident.timestamp).getTime()) / 60000));
  return (
    <button className={`sidebar-incident-btn ${isSelected ? 'selected' : ''} sev-border-${sev}`} onClick={onClick}>
      <span className={`sev-dot sev-${sev}`} />
      <div>
        <strong className="t-label">{incident.classification?.location || 'Unknown zone'}</strong>
        <p className="t-caption">{incident.classification?.incident_type?.toUpperCase()} · {mins}m ago</p>
      </div>
      <span className={`sev-pill sev-${sev}`}>{sev}</span>
    </button>
  );
}

function SummaryCard({ label, value, detail, accent = false }) {
  return (
    <div className={`map-summary-card ${accent ? 'accent' : ''}`}>
      <span className="t-caption">{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}

export default function StrategicMapPage() {
  const navigate = useNavigate();
  const { incidents } = useIncidents();
  const { responders } = useResponders();
  const { feeds: cctvFeeds } = useCCTV();
  const { layout: venueLayout, loading: layoutLoading, error: layoutError } = useVenueLayout();
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFloor, setSelectedFloor] = useState(1);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [layers, setLayers] = useState({
    hazards: true,
    responders: true,
    routes: true,
    labels: true,
    cctv: true,
    heatmap: false,
    density: false,
  });
  const [zoneDetail, setZoneDetail] = useState(null);

  const toggleLayer = useCallback((layerId) => {
    setLayers((prev) => ({ ...prev, [layerId]: !prev[layerId] }));
  }, []);

  const activeIncidents = useMemo(() => incidents.filter((i) => i.status !== 'resolved'), [incidents]);
  const selected = selectedIncident || activeIncidents[0] || null;
  const activeCritical = activeIncidents.filter((incident) => incident.classification?.severity === 'critical').length;
  const venue = venueLayout || DEMO_VENUE_LAYOUT;
  const floorList = useMemo(() => {
    const floors = (venue?.zones || []).reduce((acc, zone) => {
      if (!zone?.floor) return acc;
      const current = acc.get(zone.floor) || { value: zone.floor, zones: 0, incidents: 0 };
      current.zones += 1;
      acc.set(zone.floor, current);
      return acc;
    }, new Map());
    activeIncidents.forEach((incident) => {
      const match = (venue?.zones || []).find((zone) => zone.name?.toLowerCase() === incident.classification?.location?.toLowerCase() || zone.id === incident.classification?.location?.toLowerCase().replace(/ /g, '_'));
      if (match) {
        const current = floors.get(match.floor) || { value: match.floor, zones: 0, incidents: 0 };
        current.incidents += 1;
        floors.set(match.floor, current);
      }
    });
    return Array.from(floors.values()).sort((a, b) => a.value - b.value);
  }, [venue, activeIncidents]);
  const mappedFloors = floorList.length;
  const filteredIncidents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeIncidents.filter((incident) => {
      if (!q) return true;
      const location = incident.classification?.location?.toLowerCase() || '';
      const type = incident.classification?.incident_type?.toLowerCase() || '';
      const severity = incident.classification?.severity?.toLowerCase() || '';
      return location.includes(q) || type.includes(q) || severity.includes(q);
    });
  }, [activeIncidents, searchQuery]);
  const currentFloor = floorList.some((floor) => floor.value === selectedFloor)
    ? selectedFloor
    : floorList[0]?.value || selectedFloor;
  const selectedFloorMeta = floorList.find((floor) => floor.value === currentFloor) || floorList[0] || null;

  useEffect(() => {
    const id = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const focusIncident = useCallback((incident) => {
    setSelectedIncident(incident);
    setZoneDetail(null);
    const normalizedLocation = incident?.classification?.location?.toLowerCase().replace(/ /g, '_');
    const matchedZone = venue?.zones?.find((zone) => (
      zone.id === normalizedLocation ||
      zone.name?.toLowerCase() === incident?.classification?.location?.toLowerCase()
    ));
    if (matchedZone) {
      setSelectedFloor(matchedZone.floor);
    }
  }, [venue]);

  const handleZoneClick = useCallback((zone, incident) => {
    setZoneDetail({ zone, incident });
    if (incident) setSelectedIncident(incident);
  }, []);

  return (
    <div className="page-shell map-shell">
      <div className="page-hero map-hero" style={{ paddingBottom: 12 }}>
        <div>
          <p className="page-kicker">Strategic map</p>
          <h1 className="page-title">Venue floor plan</h1>
          <p className="page-subtitle">
            A live tactical view with hazard overlays, routing, responder positions, and floor-aware controls.
          </p>
        </div>
        <div className="top-actions map-top-actions">
          <button className="btn-tonal btn-sm" onClick={() => navigate('/')}>Back to dashboard</button>
          <button className="btn-filled btn-sm" onClick={() => navigate('/twin')}>Open twin</button>
        </div>
      </div>

      <div className="map-summary-grid">
        <SummaryCard
          label="Active incidents"
          value={activeIncidents.length}
          detail={`${activeCritical} critical incident${activeCritical === 1 ? '' : 's'} need immediate attention.`}
        />
        <SummaryCard
          label="Mapped floors"
          value={mappedFloors}
          detail={layoutLoading ? 'Loading venue layout...' : layoutError || 'Demo layout available for active floors.'}
          accent
        />
        <SummaryCard
          label="Live responders"
          value={responders.length}
          detail="Tracked alongside incident routing and floor movement."
        />
        <SummaryCard
          label="Camera feeds"
          value={cctvFeeds.length}
          detail={layers.cctv ? 'Overlaid on the map canvas.' : 'Hidden from the canvas.'}
        />
      </div>

      <div className="map-toolbar panel-card">
        <div className="map-toolbar-search">
          <label className="map-search-box">
            <span>Search incident or zone</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Kitchen, medical, critical..."
            />
          </label>
        </div>
        <div className="map-floor-chips">
          {floorList.map((floor) => (
            <button
              key={floor.value}
              className={`floor-summary-chip ${currentFloor === floor.value ? 'active' : ''}`}
              onClick={() => setSelectedFloor(floor.value)}
            >
              <strong>F{floor.value}</strong>
              <span>{floor.zones} zones</span>
              <em>{floor.incidents} active</em>
            </button>
          ))}
        </div>
        <div className="map-floor-context">
          <span className="t-caption">Current floor</span>
          <strong>{selectedFloorMeta ? `F${selectedFloorMeta.value}` : 'F1'}</strong>
          <p>{selectedFloorMeta ? `${selectedFloorMeta.zones} mapped zones, ${selectedFloorMeta.incidents} active incidents.` : 'Waiting for layout data.'}</p>
        </div>
      </div>

      <div className="map-layout">
        <aside className="map-sidebar">
          <div className="panel-card map-control-card">
            <div className="section-header" style={{ marginBottom: 10 }}>
              <h3 className="t-label">Map controls</h3>
              <span className="status-pill success">LIVE</span>
            </div>
            <div className="layer-toggles">
              {LAYER_OPTIONS.map((layer) => (
                <label key={layer.id} className={`layer-toggle-row ${layers[layer.id] ? 'active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={layers[layer.id]}
                    onChange={() => toggleLayer(layer.id)}
                  />
                  <div className="layer-toggle-swatch" style={{ background: layer.color }} />
                  <span className="t-body-sm">{layer.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="panel-card map-control-card">
            <div className="section-header" style={{ marginBottom: 10 }}>
              <h3 className="t-label">Incidents in view</h3>
              <span className="t-caption">{activeIncidents.length} active</span>
            </div>
            {activeIncidents.length === 0 ? (
              <p className="t-caption" style={{ padding: '8px 0' }}>No active incidents</p>
            ) : filteredIncidents.length === 0 ? (
              <p className="t-caption" style={{ padding: '8px 0' }}>No incidents match this search</p>
            ) : (
              <div className="sidebar-incident-list">
                {filteredIncidents.map((inc) => (
                  <IncidentBadge
                    key={inc.id}
                    incident={inc}
                    isSelected={selected?.id === inc.id}
                    currentTime={currentTime}
                    onClick={() => focusIncident(inc)}
                  />
                ))}
              </div>
            )}
          </div>

          {selected && (
            <div className="panel-card map-control-card">
              <div className="section-header" style={{ marginBottom: 10 }}>
                <h3 className="t-label">Incident details</h3>
                <button className="btn-ghost btn-sm" onClick={() => navigate('/twin')}>Simulate</button>
              </div>
              <div className="map-incident-detail">
                <div className="detail-row">
                  <span className="t-caption">Location</span>
                  <span className="t-label">{selected.classification?.location}</span>
                </div>
                <div className="detail-row">
                  <span className="t-caption">Type</span>
                  <span className="t-label">{selected.classification?.incident_type}</span>
                </div>
                <div className="detail-row">
                  <span className="t-caption">Severity</span>
                  <span className={`sev-badge sev-${selected.classification?.severity}`}>{selected.classification?.severity}</span>
                </div>
                <div className="detail-row">
                  <span className="t-caption">Confidence</span>
                  <span className="t-label">{Math.round((selected.classification?.confidence || 0) * 100)}%</span>
                </div>
                {selected.evacuation_route && (
                  <div className="detail-row" style={{ flexDirection: 'column', gap: 4 }}>
                    <span className="t-caption">Safe route</span>
                    <span className="t-body-sm evac-route-text">
                      {selected.evacuation_route.steps?.join(' -> ') || selected.evacuation_route.path?.join(' -> ')}
                    </span>
                  </div>
                )}
                <div className="detail-row">
                  <span className="t-caption">Responders</span>
                  <span className="t-label">{(selected.assigned_responders || []).join(', ') || 'None assigned'}</span>
                </div>
                <button className="btn-tonal btn-sm" style={{ marginTop: 10, width: '100%' }} onClick={() => navigate('/')}>
                  Open incident
                </button>
              </div>
            </div>
          )}

          {zoneDetail && !zoneDetail.incident && (
            <div className="panel-card map-control-card">
              <h3 className="t-label" style={{ marginBottom: 10 }}>Zone details</h3>
              <div className="map-incident-detail">
                <div className="detail-row"><span className="t-caption">Zone</span><span className="t-label">{zoneDetail.zone.name}</span></div>
                <div className="detail-row"><span className="t-caption">Type</span><span className="t-label">{zoneDetail.zone.zone_type}</span></div>
                <div className="detail-row"><span className="t-caption">Floor</span><span className="t-label">F{zoneDetail.zone.floor}</span></div>
                {zoneDetail.zone.capacity && <div className="detail-row"><span className="t-caption">Capacity</span><span className="t-label">{zoneDetail.zone.capacity}</span></div>}
                <p className="t-caption" style={{ marginTop: 8, color: 'var(--color-success-dark)' }}>Zone is clear - no active hazards.</p>
              </div>
            </div>
          )}

          <div className="panel-card map-control-card">
            <div className="section-header" style={{ marginBottom: 10 }}>
              <h3 className="t-label">Incident timeline</h3>
              <span className="t-caption">{filteredIncidents.length} shown</span>
            </div>
            <div className="timeline-list">
              {filteredIncidents.slice(0, 5).map((incident) => (
                <button
                  key={incident.id}
                  className="timeline-item"
                  onClick={() => {
                    setSelectedIncident(incident);
                    setZoneDetail(null);
                  }}
                >
                  <div className="timeline-dot" />
                  <div className="timeline-copy">
                    <strong>{incident.classification?.location || 'Unknown zone'}</strong>
                    <span>
                      {incident.classification?.incident_type} · {incident.classification?.severity}
                    </span>
                  </div>
                  <time>{Math.max(0, Math.round((currentTime - new Date(incident.timestamp).getTime()) / 60000))}m</time>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div className="map-canvas">
          <AdvancedMap
            venueLayout={venue}
            incidents={incidents}
            responders={responders}
            selectedIncident={selected}
            showHazards={layers.hazards}
            showResponders={layers.responders}
            showRoutes={layers.routes}
            showHeatmap={layers.heatmap}
            showDensity={layers.density}
            showLabels={layers.labels}
            cctvFeeds={layers.cctv ? cctvFeeds : []}
            selectedFloor={currentFloor}
            onFloorChange={setSelectedFloor}
            onZoneClick={handleZoneClick}
          />
        </div>
      </div>
    </div>
  );
}
