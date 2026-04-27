import React, { useState, useCallback, useEffect, useMemo } from 'react';
import './AdvancedMap.css';
import { findBestZoneMatch } from '../../utils/mapMatching';
import { DEMO_VENUE_LAYOUT } from '../../data/venueLayout';

const HAZARD_COLORS = { fire: '#FF4D4D', smoke: '#FFCC00', medical: '#00D4FF', security: '#FF9500', flood: '#00D4FF' };
const SEVERITY_COLORS = { low: '#FFCC00', medium: '#FF9500', high: '#FF4D4D', critical: '#FF0000' };
const ZONE_FILLS = {
  corridor: 'rgba(37, 99, 235, 0.06)',
  room: 'rgba(15, 23, 42, 0.05)',
  kitchen: 'rgba(249, 115, 22, 0.12)',
  stairwell: 'rgba(14, 165, 233, 0.12)',
  exit: 'rgba(34, 197, 94, 0.16)',
  assembly_point: 'rgba(34, 197, 94, 0.12)',
  medical: 'rgba(239, 68, 68, 0.1)',
  lobby: 'rgba(99, 102, 241, 0.08)',
  office: 'rgba(148, 163, 184, 0.08)',
  other: 'rgba(148, 163, 184, 0.05)',
};
const ROLE_COLORS = { fire_team: '#FF4D4D', medical: '#00D4FF', security: '#FFCC00', management: '#BD00FF', admin: '#9AA0A6' };

export default function AdvancedMap({
  venueLayout = DEMO_VENUE_LAYOUT,
  incidents = [],
  responders = [],
  selectedIncident = null,
  showHazards = true,
  showResponders = true,
  showRoutes = true,
  showHeatmap = false,
  showDensity = false,
  showPressure = false,
  showLabels = true,
  cctvFeeds = [],
  blockedZoneIds = [],
  pressureMap = {},
  projectedRoute = [],
  highlightZoneIds = [],
  selectedFloor = null,
  onFloorChange = null,
  onZoneClick = null,
}) {
  const [internalFloor, setInternalFloor] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hoveredZone, setHoveredZone] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const floor = selectedFloor ?? internalFloor;
  const zones = (venueLayout?.zones || []).filter((z) => z.floor === floor);
  const venue = venueLayout?.venue || { name: 'Venue', dimensions: { width: 1200, height: 800 } };
  const { width: vw, height: vh } = venue.dimensions;
  const floorsWithZones = useMemo(() => {
    const grouped = new Map();
    (venueLayout?.zones || []).forEach((zone) => {
      if (!zone?.floor) return;
      grouped.set(zone.floor, (grouped.get(zone.floor) || 0) + 1);
    });
    return Array.from(grouped.entries()).map(([value, count]) => ({ value, count })).sort((a, b) => a.value - b.value);
  }, [venueLayout]);
  const hasFloorData = zones.some((z) => z?.coordinates);
  const hasZones = zones.some((z) => z?.coordinates);

  useEffect(() => {
    if (!floorsWithZones.length) return;
    if (!floorsWithZones.some((item) => item.value === floor)) {
      (onFloorChange || setInternalFloor)(floorsWithZones[0].value);
      return;
    }
    if (!hasFloorData) {
      (onFloorChange || setInternalFloor)(floorsWithZones[0].value);
    }
  }, [floor, floorsWithZones, hasFloorData, onFloorChange]);

  const floorLabel = venueLayout?.venue?.name || 'Venue';
  const floorSummary = zones.length ? `${zones.length} zones` : 'No zones';

  // Pure SVG viewBox pan — no CSS transform conflict
  const viewBox = `${-pan.x / zoom} ${-pan.y / zoom} ${vw / zoom} ${vh / zoom}`;

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setPanStart({ ...pan });
  }, [pan]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    setPan({
      x: panStart.x + (e.clientX - dragStart.x),
      y: panStart.y + (e.clientY - dragStart.y),
    });
  }, [isDragging, dragStart, panStart]);

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    setZoom((z) => Math.max(0.4, Math.min(4, z * (e.deltaY > 0 ? 0.9 : 1.1))));
  }, []);

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // Map incidents → hazard zones
  const activeHazards = incidents
    .filter((i) => i.status !== 'resolved')
    .map((i) => {
      const zone = findBestZoneMatch(zones, i.classification?.location);
      return zone ? { incident: i, zone } : null;
    })
    .filter(Boolean);

  // Map responders → zones
  const floorResponders = responders
    .map((r) => {
      const zone = findBestZoneMatch(zones, r.zone_id || r.location);
      return zone ? { ...r, _zone: zone } : null;
    })
    .filter(Boolean);

  // Selected incident route
  const routePath = selectedIncident?.evacuation_route?.path || [];
  const blockedZoneSet = new Set(blockedZoneIds || []);
  const highlightedZoneSet = new Set(highlightZoneIds || []);

  // Distance helper for heatmap
  const getDist = (z1, z2) => {
    if (!z1?.coordinates || !z2?.coordinates) return 9999;
    const cx1 = z1.coordinates.x + z1.coordinates.width / 2;
    const cy1 = z1.coordinates.y + z1.coordinates.height / 2;
    const cx2 = z2.coordinates.x + z2.coordinates.width / 2;
    const cy2 = z2.coordinates.y + z2.coordinates.height / 2;
    return Math.sqrt(Math.pow(cx1 - cx2, 2) + Math.pow(cy1 - cy2, 2));
  };

  return (
    <div className="advanced-map-container">
      {/* Controls */}
      <div className="map-controls">
        <div className="map-zoom-group">
          <button className="btn-icon" onClick={() => setZoom((z) => Math.max(0.4, z - 0.25))} title="Zoom out">−</button>
          <span className="zoom-level">{Math.round(zoom * 100)}%</span>
          <button className="btn-icon" onClick={() => setZoom((z) => Math.min(4, z + 0.25))} title="Zoom in">+</button>
          <button className="btn-icon" onClick={resetView} title="Reset view">⟲</button>
        </div>

        {floorsWithZones.length > 1 && (
          <div className="map-floor-group">
            {floorsWithZones.map(({ value, count }) => (
              <button
                key={value}
                className={`floor-btn ${floor === value ? 'active' : ''}`}
                onClick={() => (onFloorChange || setInternalFloor)(value)}
                title={`${count} mapped zones`}
              >
                F{value}
                <span className="floor-btn-count">{count}</span>
              </button>
            ))}
          </div>
        )}
        <div className="map-floor-badge">
          <strong>{floorLabel}</strong>
          <span>F{floor} · {floorSummary}</span>
        </div>
      </div>

      {/* Floor plan SVG */}
      {hasZones ? (
        <svg
          className="floor-plan"
          viewBox={viewBox}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        >
          <defs>
            <filter id="hazard-glow">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <marker id="route-arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <path d="M 0 0 L 6 3 L 0 6 Z" fill="#34A853" />
            </marker>
          </defs>

          {/* Tactical Grid Background */}
          <g className="map-grid-overlay">
            {Array.from({ length: 40 }).map((_, i) => (
              <React.Fragment key={`grid-${i}`}>
                <line x1={i * 50} y1="0" x2={i * 50} y2={vh} stroke="rgba(66, 133, 244, 0.05)" strokeWidth="0.5" />
                <line x1="0" y1={i * 50} x2={vw} y2={i * 50} stroke="rgba(66, 133, 244, 0.05)" strokeWidth="0.5" />
              </React.Fragment>
            ))}
          </g>

          {/* Scanner Line Effect - Full Venue Sweep */}
          <line x1="0" y1="0" x2={vw} y2="0" className="map-scanner-line" style={{ stroke: 'rgba(37, 99, 235, 0.35)', strokeWidth: 3, filter: 'drop-shadow(0 0 8px rgba(37,99,235,0.45))' }} />

          {/* Map Boundary & Tech Markers */}
          <rect x="0" y="0" width={vw} height={vh} fill="rgba(248,250,252,0.94)" stroke="rgba(148,163,184,0.16)" strokeWidth="2" />
          <g className="tech-markers" opacity="0.4">
            <text x="10" y="20" fontSize="10" fill="#64748b" className="t-mono">LAT: 51.5074° N</text>
            <text x="10" y="35" fontSize="10" fill="#64748b" className="t-mono">LNG: 0.1278° W</text>
            <text x={vw - 10} y="20" textAnchor="end" fontSize="10" fill="#64748b" className="t-mono">SECURE_LINK_ACTIVE</text>
            <text x={vw - 10} y={vh - 10} textAnchor="end" fontSize="10" fill="#64748b" className="t-mono">AEGIS_OS_V2.0</text>
          </g>

          {/* Zones */}
          {zones.map((zone) => {
            const { x, y, width, height } = zone.coordinates;
            const cx = x + width / 2;
            const cy = y + height / 2;
            const hazard = activeHazards.find((h) => h.zone.id === zone.id);
            const isHazard = !!hazard;
            const isBlocked = zone.is_blocked || blockedZoneSet.has(zone.id);
            const isSelected = selectedIncident?.classification?.location?.toLowerCase().replace(/ /g, '_') === zone.id;
            const sevColor = isHazard ? SEVERITY_COLORS[hazard.incident?.classification?.severity || 'medium'] : null;
            const pressure = Number(pressureMap?.[zone.id] ?? 0);
            const pressureOpacity = Math.max(0, Math.min(0.62, pressure * 0.62));

            return (
              <g
                key={zone.id}
                className={`zone ${isBlocked ? 'blocked' : ''} ${isHazard ? 'hazard-zone' : ''}`}
                onClick={() => onZoneClick?.(zone, hazard?.incident)}
                onMouseEnter={() => setHoveredZone(zone)}
                onMouseLeave={() => setHoveredZone(null)}
                style={{ cursor: onZoneClick ? 'pointer' : 'default' }}
              >
                <rect
                  x={x} y={y} width={width} height={height} rx="3"
                  className="zone-rect"
                  fill={isSelected ? 'rgba(66,133,244,0.15)' : ZONE_FILLS[zone.zone_type] || ZONE_FILLS.other}
                  stroke={highlightedZoneSet.has(zone.id) ? '#0284c7' : isSelected ? '#2563eb' : isHazard ? sevColor : 'rgba(71,85,105,0.28)'}
                  strokeWidth={highlightedZoneSet.has(zone.id) ? 3 : isSelected ? 2.5 : isHazard ? 2.5 : 1.2}
                  style={{ transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}
                />
                {showPressure && pressure > 0 && (
                  <rect
                    x={x + 4} y={y + 4} width={Math.max(0, width - 8)} height={Math.max(0, height - 8)} rx="2"
                    fill="#8E24AA"
                    opacity={pressureOpacity}
                    pointerEvents="none"
                  />
                )}
                {isBlocked && (
                  <line x1={x} y1={y} x2={x + width} y2={y + height} stroke="#EA4335" strokeWidth="2" opacity="0.7" />
                )}
                {showLabels && (
                  <text x={cx} y={cy + 4} textAnchor="middle" fontSize="10" fontWeight="700" className="zone-label" style={{ fill: isSelected ? '#1d4ed8' : '#334155', textShadow: '0 1px 2px rgba(255,255,255,0.85)' }}>
                    {zone.name.toUpperCase()}
                  </text>
                )}
              </g>
            );
          })}

          {/* Hazard overlays (rect-based, not floating circles) */}
          {showHazards && activeHazards.map(({ incident, zone }, idx) => {
            const { x, y, width, height } = zone.coordinates;
            const sev = incident.classification?.severity || 'medium';
            const color = SEVERITY_COLORS[sev];
            const type = incident.classification?.incident_type || 'fire';
            return (
              <g key={`hz-${idx}`} className="hazard-overlay">
                <rect
                  x={x - 4} y={y - 4} width={width + 8} height={height + 8} rx="5"
                  fill={color} fillOpacity="0.2"
                  stroke={color} strokeWidth="2" strokeDasharray="6,4"
                  className={sev === 'critical' ? 'hazard-pulse-rect' : ''}
                />
                {showLabels && (
                  <text x={x + width / 2} y={y - 10} textAnchor="middle" fontSize="10" fontWeight="700" fill={color} style={{ textShadow: '0 1px 2px rgba(255,255,255,0.7)' }}>
                    {type.toUpperCase()} {sev === 'critical' ? '⚠' : ''}
                  </text>
                )}
              </g>
            );
          })}

          {/* Risk Heatmap Layer */}
          {showHeatmap && zones.map(zone => {
            let risk = 0;
            activeHazards.forEach(h => {
              const d = getDist(zone, h.zone);
              if (d < 400) risk += Math.max(0, 1 - d/400); // 400px radius fade
            });
            if (risk === 0) return null;
            return (
              <rect key={`hm-${zone.id}`}
                x={zone.coordinates.x} y={zone.coordinates.y}
                width={zone.coordinates.width} height={zone.coordinates.height}
                fill="#FF6D00" opacity={Math.min(0.5, risk * 0.4)}
                pointerEvents="none"
              />
            );
          })}

          {/* Guest Density Layer */}
          {showDensity && zones.map(zone => {
            // Visualize simulated density based on area/capacity
            if (zone.zone_type === 'corridor' || zone.zone_type === 'stairwell' || zone.is_blocked) return null;
            const area = zone.coordinates.width * zone.coordinates.height;
            const baseDensity = zone.capacity ? Math.min(1, zone.capacity / 150) : 0.2;
            return (
              <g key={`dn-${zone.id}`} pointerEvents="none">
                <rect 
                  x={zone.coordinates.x} y={zone.coordinates.y}
                  width={zone.coordinates.width} height={zone.coordinates.height}
                  fill="#7c3aed" opacity={baseDensity * 0.24}
                />
                {showLabels && area > 2000 && (
                  <text x={zone.coordinates.x + 5} y={zone.coordinates.y + 12} fontSize="8" fill="#6d28d9" fontWeight="700">
                    ~{Math.round(baseDensity * 100)} GUESTS
                  </text>
                )}
              </g>
            );
          })}

          {/* Evacuation route (animated) */}
          {showRoutes && routePath.length > 1 && (() => {
            const pts = routePath.map((nodeId) => findBestZoneMatch(zones, nodeId)).filter(Boolean);
            return pts.slice(0, -1).map((zone1, i) => {
              const zone2 = pts[i + 1];
              const x1 = zone1.coordinates.x + zone1.coordinates.width / 2;
              const y1 = zone1.coordinates.y + zone1.coordinates.height / 2;
              const x2 = zone2.coordinates.x + zone2.coordinates.width / 2;
              const y2 = zone2.coordinates.y + zone2.coordinates.height / 2;
              return (
                <g key={`rt-${i}`}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="#16a34a" strokeWidth="3" opacity="0.9"
                    strokeDasharray="10,6" className="evac-path"
                    markerEnd="url(#route-arrow)"
                  />
                </g>
              );
            });
          })()}

          {/* Projected route for what-if scenarios */}
          {showRoutes && projectedRoute?.length > 1 && (() => {
            const pts = projectedRoute.map((nodeId) => findBestZoneMatch(zones, nodeId)).filter(Boolean);
            return pts.slice(0, -1).map((zone1, i) => {
              const zone2 = pts[i + 1];
              const x1 = zone1.coordinates.x + zone1.coordinates.width / 2;
              const y1 = zone1.coordinates.y + zone1.coordinates.height / 2;
              const x2 = zone2.coordinates.x + zone2.coordinates.width / 2;
              const y2 = zone2.coordinates.y + zone2.coordinates.height / 2;
              return (
                <g key={`pr-${i}`}>
                  <line
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="#7C3AED" strokeWidth="4" opacity="0.9"
                    strokeDasharray="8,8"
                    markerEnd="url(#route-arrow)"
                  />
                </g>
              );
            });
          })()}

          {/* Responders */}
          {showResponders && floorResponders.map((r, i) => {
            const z = r._zone;
            const cx = z.coordinates.x + z.coordinates.width / 2 + (i % 3 - 1) * 14;
            const cy = z.coordinates.y + z.coordinates.height / 2 + Math.floor(i / 3) * 14;
            const color = ROLE_COLORS[r.role] || '#5F6368';
            return (
              <g key={`resp-${i}`} className="responder-marker">
                {r.status === 'responding' && (
                  <circle cx={cx} cy={cy} r="10" fill={color} opacity="0.2" className="responder-pulse-ring" />
                )}
                <circle cx={cx} cy={cy} r="6" fill={color} stroke="white" strokeWidth="2" />
                {showLabels && (
                  <text x={cx + 10} y={cy - 4} fontSize="9" fontWeight="700" fill={color} className="responder-name">
                    {r.name?.split(' ')[0]}
                  </text>
                )}
              </g>
            );
          })}

          {/* CCTV Cameras */}
          {cctvFeeds.map((feed, i) => {
            const z = findBestZoneMatch(zones, feed.zone_id);
            if (!z) return null;
            const cx = z.coordinates.x + 10 + (i * 2 % 10);
            const cy = z.coordinates.y + 10;
            return (
              <g key={`cam-${feed.id}`} className="cctv-marker">
                <rect x={cx - 6} y={cy - 4} width="12" height="8" fill={feed.status === 'online' ? '#1a73e8' : '#EA4335'} rx="2" />
                <circle cx={cx} cy={cy} r="2" fill="white" />
                {showLabels && (
                  <text x={cx} y={cy - 6} fontSize="8" fontWeight="700" fill={feed.status === 'online' ? '#1a73e8' : '#EA4335'} textAnchor="middle">
                    {feed.camera_code}
                  </text>
                )}
              </g>
            );
          })}

          {/* Assembly points */}
          {zones.filter((z) => z.zone_type === 'assembly_point').map((zone) => {
            const cx = zone.coordinates.x + zone.coordinates.width / 2;
            const cy = zone.coordinates.y + zone.coordinates.height / 2;
            return (
              <g key={`ap-${zone.id}`}>
                <rect x={zone.coordinates.x} y={zone.coordinates.y}
                  width={zone.coordinates.width} height={zone.coordinates.height}
                  rx="4" fill="#34A85322" stroke="#34A853" strokeWidth="2" strokeDasharray="5,3"
                />
                <text x={cx} y={cy + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill="#34A853">
                  ✚ Assembly
                </text>
              </g>
            );
          })}

          {/* Exits */}
          {zones.filter((z) => z.zone_type === 'exit').map((zone) => {
            const cx = zone.coordinates.x + zone.coordinates.width / 2;
            const cy = zone.coordinates.y + zone.coordinates.height / 2;
            return (
              <g key={`ex-${zone.id}`}>
                <rect x={zone.coordinates.x} y={zone.coordinates.y}
                  width={zone.coordinates.width} height={zone.coordinates.height}
                  rx="3" fill="#34A853" stroke="#1e8e3e" strokeWidth="1.5"
                />
                <text x={cx} y={cy + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill="white">
                  EXIT
                </text>
              </g>
            );
          })}
        </svg>
      ) : (
        <div className="map-empty-state">
          <strong>No mapped zones on this floor</strong>
          <span>Select a floor that has layout data to render overlays.</span>
        </div>
      )}

      {/* Legend */}
      <div className="map-legend">
        <div className="legend-title">Legend</div>
        <div className="legend-items">
          <div className="legend-item"><div className="legend-color" style={{ background: SEVERITY_COLORS.critical }} /><span>CRITICAL HAZARD</span></div>
          <div className="legend-item"><div className="legend-color" style={{ background: SEVERITY_COLORS.high }} /><span>HIGH SEVERITY</span></div>
          <div className="legend-item"><div className="legend-color" style={{ background: '#34A853' }} /><span>EVAC ROUTE / EXIT</span></div>
          <div className="legend-item"><div className="legend-color" style={{ background: '#FF6D00', opacity: 0.5 }} /><span>RISK HEATMAP</span></div>
          <div className="legend-item"><div className="legend-color" style={{ background: '#9C27B0', opacity: 0.3 }} /><span>GUEST DENSITY</span></div>
          <div className="legend-item"><div className="legend-color" style={{ background: '#8E24AA', opacity: 0.45 }} /><span>CROWD PRESSURE</span></div>
          <div className="legend-item"><div className="legend-color" style={{ background: ROLE_COLORS.fire_team, borderRadius: '50%' }} /><span>FIRE TEAM</span></div>
          <div className="legend-item"><div className="legend-color" style={{ background: ROLE_COLORS.medical, borderRadius: '50%' }} /><span>MEDICAL UNIT</span></div>
          <div className="legend-item"><div className="legend-color" style={{ background: ROLE_COLORS.security, borderRadius: '50%' }} /><span>SECURITY FORCE</span></div>
        </div>
      </div>

      {/* Hover tooltip */}
      {hoveredZone && (
        <div className="zone-info-popup">
          <div className="zone-info-header">{hoveredZone.name}</div>
          <div className="zone-info-body">
            <div>Type: {hoveredZone.zone_type}</div>
            {hoveredZone.capacity && <div>Capacity: {hoveredZone.capacity}</div>}
            {hoveredZone.is_blocked && <div style={{ color: '#EA4335' }}>⚠ BLOCKED</div>}
            {activeHazards.find((h) => h.zone.id === hoveredZone.id) && (
              <div style={{ color: '#EA4335' }}>🔥 Active hazard</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
