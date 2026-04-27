import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdvancedMap from '../components/map/AdvancedMap';
import { DEMO_VENUE_LAYOUT } from '../data/venueLayout';
import { createBroadcast, fetchActiveBroadcast, fetchBroadcasts, getApiErrorMessage, simulateCrisisTwin } from '../services/api';
import { useIncidents } from '../hooks/useIncidents';
import { useResponders } from '../hooks/useResponders';

const INCIDENT_TYPES = [
  { id: 'fire', label: 'Fire' },
  { id: 'medical', label: 'Medical' },
  { id: 'security', label: 'Security' },
];

const HORIZON_OPTIONS = [5, 10, 15];

function formatPercent(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function MetricCard({ label, value, delta = null, tone = 'default', subtext = '' }) {
  return (
    <div className={`twin-metric-card tone-${tone}`}>
      <span className="twin-metric-label">{label}</span>
      <strong className="twin-metric-value">{value}</strong>
      {delta !== null && <span className={`twin-metric-delta ${delta >= 0 ? 'up' : 'down'}`}>{delta >= 0 ? '+' : ''}{delta}</span>}
      {subtext && <span className="twin-metric-subtext">{subtext}</span>}
    </div>
  );
}

function ToggleChip({ active, children, onClick, tone = 'neutral' }) {
  return (
    <button type="button" className={`twin-chip tone-${tone} ${active ? 'active' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}

export default function CrisisTwinPage() {
  const navigate = useNavigate();
  const { incidents } = useIncidents();
  const { responders } = useResponders();
  const activeIncidents = useMemo(() => incidents.filter((incident) => incident.status !== 'resolved'), [incidents]);
  const [selectedIncidentId, setSelectedIncidentId] = useState('');
  const [incidentType, setIncidentType] = useState('fire');
  const [blockedExits, setBlockedExits] = useState(['exit_east']);
  const [responderDelayMinutes, setResponderDelayMinutes] = useState(0);
  const [occupancyPercent, setOccupancyPercent] = useState(62);
  const [evacuationTrigger, setEvacuationTrigger] = useState(true);
  const [safeZoneId, setSafeZoneId] = useState('assembly_point_a');
  const [horizon, setHorizon] = useState(15);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeBroadcast, setActiveBroadcast] = useState(null);
  const [broadcastFeed, setBroadcastFeed] = useState([]);
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastDraft, setBroadcastDraft] = useState('');
  const [broadcastScope, setBroadcastScope] = useState('venue');
  const [broadcastPublishing, setBroadcastPublishing] = useState(false);
  const [broadcastNotice, setBroadcastNotice] = useState('');

  useEffect(() => {
    if (selectedIncidentId) return;
    if (activeIncidents[0]?.id) {
      setSelectedIncidentId(activeIncidents[0].id);
      setIncidentType(activeIncidents[0]?.classification?.incident_type || 'fire');
    }
  }, [activeIncidents, selectedIncidentId]);

  useEffect(() => {
    const selectedIncident = activeIncidents.find((incident) => incident.id === selectedIncidentId);
    if (selectedIncident) {
      setIncidentType(selectedIncident.classification?.incident_type || 'fire');
    }
  }, [activeIncidents, selectedIncidentId]);

  const selectedIncident = activeIncidents.find((incident) => incident.id === selectedIncidentId) || activeIncidents[0] || null;
  const safeZoneOptions = useMemo(
    () => DEMO_VENUE_LAYOUT.zones.filter((zone) => zone.zone_type === 'assembly_point'),
    [],
  );
  const exitOptions = useMemo(
    () => DEMO_VENUE_LAYOUT.zones.filter((zone) => zone.zone_type === 'exit'),
    [],
  );

  const maxHorizon = useMemo(() => Math.max(...HORIZON_OPTIONS), []);
  const activeHorizon = useMemo(() => HORIZON_OPTIONS.includes(horizon) ? horizon : maxHorizon, [horizon, maxHorizon]);
  const pressureMap = snapshot?.scenario?.pressure_map || {};
  const scenario = snapshot?.scenario || null;
  const baseline = snapshot?.baseline || null;
  const briefing = snapshot?.briefing || null;
  const activeHazardIds = useMemo(() => {
    const hazards = scenario?.hazards?.[String(activeHorizon)] || [];
    return hazards.map((zone) => zone.zone_id);
  }, [activeHorizon, scenario]);

  useEffect(() => {
    if (!briefing || broadcastDraft.trim()) return;
    setBroadcastTitle(briefing.title || 'Guest safety notice');
    setBroadcastDraft(briefing.guest_announcement || briefing.summary || '');
    setBroadcastScope(scenario?.safe_zone ? 'floor' : 'venue');
  }, [briefing, broadcastDraft, scenario?.safe_zone]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        setError('');
        const response = await simulateCrisisTwin({
          incident_id: selectedIncident?.id || null,
          incident_type: incidentType,
          location: selectedIncident?.classification?.location || null,
          severity: selectedIncident?.classification?.severity || 'high',
          blocked_exits: blockedExits,
          responder_delay_minutes: responderDelayMinutes,
          occupancy_percent: occupancyPercent,
          safe_zone_id: safeZoneId,
          evacuation_trigger: evacuationTrigger,
          horizons: HORIZON_OPTIONS,
        });
        if (!cancelled) {
          setSnapshot(response);
        }
      } catch (err) {
        if (!cancelled) {
          setError(getApiErrorMessage(err, 'Twin simulation unavailable'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    blockedExits,
    incidentType,
    occupancyPercent,
    responderDelayMinutes,
    safeZoneId,
    selectedIncident?.id,
    selectedIncident?.classification?.location,
    selectedIncident?.classification?.severity,
    evacuationTrigger,
  ]);

  useEffect(() => {
    let mounted = true;
    const loadBroadcastLoop = async () => {
      try {
        const [active, feed] = await Promise.all([
          fetchActiveBroadcast(),
          fetchBroadcasts({ limit: 4 }),
        ]);
        if (!mounted) return;
        setActiveBroadcast(active || null);
        setBroadcastFeed(feed || []);
      } catch (err) {
        if (mounted) {
          console.warn('Broadcast replay unavailable:', err);
        }
      }
    };

    loadBroadcastLoop();
    const interval = setInterval(loadBroadcastLoop, 12000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const toggleExit = useCallback((exitId) => {
    setBlockedExits((current) => (
      current.includes(exitId)
        ? current.filter((id) => id !== exitId)
        : [...current, exitId]
    ));
  }, []);

  const copySnapshot = useCallback(async () => {
    if (!snapshot) return;
    const text = JSON.stringify({
      snapshot_id: snapshot.snapshot_id,
      briefing: snapshot.briefing,
      scenario: snapshot.scenario,
      deltas: snapshot.deltas,
    }, null, 2);
    await navigator.clipboard.writeText(text);
  }, [snapshot]);

  const publishBroadcast = useCallback(async () => {
    if (!snapshot || !broadcastDraft.trim()) return;
    setBroadcastPublishing(true);
    try {
      const response = await createBroadcast({
        incident_id: selectedIncident?.id || snapshot.incident_id || null,
        scope: broadcastScope,
        floor: scenario?.safe_zone?.floor || null,
        zone_id: scenario?.safe_zone?.zone_id || null,
        title: broadcastTitle || snapshot.briefing?.title || 'Guest safety notice',
        message: broadcastDraft,
        operator_name: 'Operator',
        incident_type: incidentType,
        location: selectedIncident?.classification?.location || null,
        recommended_action: briefing?.recommended_action || null,
        guest_announcement: briefing?.guest_announcement || broadcastDraft,
        rationale: briefing?.rationale || null,
        snapshot,
      });
      setActiveBroadcast(response.broadcast);
      setBroadcastFeed((current) => [response.broadcast, ...current.filter((item) => item.id !== response.broadcast.id)].slice(0, 4));
      setBroadcastNotice('Broadcast sent to the guest portal.');
    } catch (err) {
      setBroadcastNotice(getApiErrorMessage(err, 'Unable to publish broadcast'));
    } finally {
      setBroadcastPublishing(false);
    }
  }, [broadcastDraft, broadcastScope, broadcastTitle, briefing, incidentType, scenario?.safe_zone, selectedIncident?.classification?.location, selectedIncident?.id, snapshot]);

  const currentRisk = scenario?.risk_score ?? 0;
  const baselineRisk = baseline?.risk_score ?? 0;
  const maxResponderEta = Math.max(0, ...(scenario?.projected_responders || []).map((responder) => responder.eta_minutes || 0));
  const blockedCount = scenario?.blocked_exits?.length || 0;
  const selectedSafeZone = safeZoneOptions.find((zone) => zone.id === safeZoneId) || safeZoneOptions[0] || null;
  const isFallbackSimulation = snapshot?.metadata?.mode === 'fallback';
  const twinStatusLabel = error ? 'BACKEND ISSUE' : isFallbackSimulation ? 'DEMO FALLBACK' : 'SIMULATION LIVE';
  const twinStatusCopy = error
    ? error
    : snapshot
      ? (isFallbackSimulation
        ? `Local fallback simulation active. ${snapshot.share_text}`
        : snapshot.share_text)
      : 'Run a what-if scenario to generate a live crisis brief.';

  const deltaHighlights = useMemo(() => {
    if (!snapshot || !scenario) return [];
    const riskDelta = Math.abs((snapshot?.deltas?.risk_score ?? currentRisk - baselineRisk));
    const routeLength = scenario?.route?.path?.length || 0;
    const riskDirection = currentRisk >= baselineRisk ? 'up' : 'down';

    return [
      `Risk is ${riskDirection} ${riskDelta} points from baseline.`,
      `Route uses ${routeLength} waypoint${routeLength === 1 ? '' : 's'} toward ${scenario?.safe_zone?.name || 'the safe zone'}.`,
      `Responder timing changes by ${snapshot?.deltas?.eta_shift_minutes ?? 0} minute(s).`,
    ];
  }, [baselineRisk, currentRisk, scenario, snapshot]);

  return (
    <div className="page-shell twin-shell">
      <div className="page-hero twin-hero">
        <div>
          <p className="page-kicker">Crisis Twin</p>
          <h1 className="page-title">Simulate before you act</h1>
          <p className="page-subtitle">
            Use the venue layout to compare risk, route changes, crowd pressure, and responder timing before the operator commits.
          </p>
        </div>
        <div className="top-actions">
          <button className="btn-tonal btn-sm" onClick={() => navigate('/map')}>Open map</button>
          <button className="btn-filled btn-sm" onClick={() => navigate('/')}>Back to dashboard</button>
        </div>
      </div>

      <div className="twin-status-row">
        <span className={`status-pill ${loading || error || isFallbackSimulation ? '' : 'success'}`}>{loading ? 'SIMULATING' : twinStatusLabel}</span>
        <span className="twin-status-copy">
          {twinStatusCopy}
        </span>
        {isFallbackSimulation && <span className="status-pill">Judge-safe fallback</span>}
      </div>

      <div className="twin-metrics-grid">
        <MetricCard label="Risk score" value={`${currentRisk}/100`} delta={snapshot?.deltas?.risk_score ?? null} tone={currentRisk >= 70 ? 'critical' : 'calm'} subtext={`Baseline ${baselineRisk}/100`} />
        <MetricCard label="Blocked exits" value={blockedCount} delta={snapshot?.deltas?.blocked_exits ?? null} tone="warning" subtext="Scenario exits marked unavailable" />
        <MetricCard label="Responder ETA" value={`${maxResponderEta || 0} min`} delta={snapshot?.deltas?.eta_shift_minutes ?? null} tone="info" subtext="Slowest projected responder" />
        <MetricCard label="Safe zone pressure" value={scenario?.safe_zone ? formatPercent(scenario.safe_zone.pressure) : 'N/A'} delta={snapshot?.deltas?.safe_zone_pressure ?? null} tone="neutral" subtext={selectedSafeZone ? selectedSafeZone.name : 'Assembly point selection'} />
      </div>

      <div className="twin-layout">
        <aside className="twin-sidebar">
          <div className="panel-card twin-panel">
            <h3 className="t-label">Scenario setup</h3>
            <p className="t-caption">Tune the what-if inputs and watch the simulation update immediately.</p>

            <div className="stack-block">
              <span className="t-caption">Incident source</span>
              <div className="chip-row">
                {INCIDENT_TYPES.map((type) => (
                  <ToggleChip key={type.id} active={incidentType === type.id} onClick={() => setIncidentType(type.id)} tone={type.id}>
                    {type.label}
                  </ToggleChip>
                ))}
              </div>
            </div>

            <div className="stack-block">
              <span className="t-caption">Active incident</span>
              <div className="scenario-list">
                {activeIncidents.length === 0 ? (
                  <div className="empty-card">No active incidents. The twin is running against a simulated fire scenario.</div>
                ) : activeIncidents.map((incident) => (
                  <button
                    key={incident.id}
                    type="button"
                    className={`scenario-item ${selectedIncidentId === incident.id ? 'active' : ''}`}
                    onClick={() => setSelectedIncidentId(incident.id)}
                  >
                    <strong>{incident.classification?.location || 'Unknown location'}</strong>
                    <span>{incident.classification?.incident_type} · {incident.classification?.severity}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="stack-block">
              <span className="t-caption">Blocked exits</span>
              <div className="chip-row">
                {exitOptions.map((exit) => (
                  <ToggleChip
                    key={exit.id}
                    active={blockedExits.includes(exit.id)}
                    onClick={() => toggleExit(exit.id)}
                    tone={blockedExits.includes(exit.id) ? 'critical' : 'neutral'}
                  >
                    {exit.name}
                  </ToggleChip>
                ))}
              </div>
            </div>

            <div className="stack-block">
              <div className="field-row">
                <label className="field-label" htmlFor="twin-delay">Responder delay</label>
                <strong>{responderDelayMinutes} min</strong>
              </div>
              <input
                id="twin-delay"
                type="range"
                min="0"
                max="10"
                step="1"
                value={responderDelayMinutes}
                onChange={(event) => setResponderDelayMinutes(Number(event.target.value))}
              />
            </div>

            <div className="stack-block">
              <div className="field-row">
                <label className="field-label" htmlFor="twin-occupancy">Occupancy</label>
                <strong>{occupancyPercent}%</strong>
              </div>
              <input
                id="twin-occupancy"
                type="range"
                min="20"
                max="100"
                step="1"
                value={occupancyPercent}
                onChange={(event) => setOccupancyPercent(Number(event.target.value))}
              />
            </div>

            <div className="stack-block">
              <span className="t-caption">Safe zone</span>
              <div className="chip-row">
                {safeZoneOptions.map((zone) => (
                  <ToggleChip
                    key={zone.id}
                    active={safeZoneId === zone.id}
                    onClick={() => setSafeZoneId(zone.id)}
                    tone="neutral"
                  >
                    {zone.name}
                  </ToggleChip>
                ))}
              </div>
            </div>

            <div className="stack-block">
              <span className="t-caption">Evacuation posture</span>
              <ToggleChip active={evacuationTrigger} onClick={() => setEvacuationTrigger((value) => !value)} tone="critical">
                {evacuationTrigger ? 'Evacuation triggered' : 'Hold evacuation'}
              </ToggleChip>
            </div>
          </div>

          <div className="panel-card twin-panel">
            <h3 className="t-label">What-if controls</h3>
            <p className="t-caption">Make a decision and compare the outcome against the baseline state.</p>
            <div className="scenario-tags">
              {HORIZON_OPTIONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`scenario-tag ${activeHorizon === value ? 'active' : ''}`}
                  onClick={() => setHorizon(value)}
                >
                  {value} min
                </button>
              ))}
            </div>
            <button className="btn-tonal" style={{ width: '100%', marginTop: 14 }} onClick={copySnapshot} disabled={!snapshot}>
              Copy incident snapshot
            </button>
          </div>
        </aside>

        <main className="twin-main">
          <div className="panel-card twin-map-panel">
            <div className="panel-card-header">
              <div>
                <h3 className="t-label">Live digital twin</h3>
                <p className="t-caption">Hazard spread, pressure, blocked exits, and projected evacuation route.</p>
              </div>
              <span className={`status-pill ${error ? '' : 'success'}`}>{error ? 'BACKEND ISSUE' : 'SIMULATION LIVE'}</span>
            </div>

            {error ? (
              <div className="empty-card error-card">{error}</div>
            ) : (
              <AdvancedMap
                venueLayout={DEMO_VENUE_LAYOUT}
                incidents={selectedIncident ? [selectedIncident] : []}
                responders={responders}
                selectedIncident={selectedIncident}
                showHazards
                showResponders
                showRoutes
                showHeatmap={false}
                showDensity={false}
                showPressure
                showLabels
                blockedZoneIds={blockedExits}
                pressureMap={pressureMap}
                projectedRoute={scenario?.route?.path || []}
                highlightZoneIds={activeHazardIds}
              />
            )}
          </div>

          <div className="twin-comparison-grid">
            <div className="panel-card twin-panel">
              <h3 className="t-label">Before / after</h3>
              <div className="comparison-cards">
                <div className="comparison-card">
                  <span className="t-caption">Baseline</span>
                  <strong>{baseline ? `${baseline.risk_score}/100` : '—'}</strong>
                  <p>{baseline ? `${baseline.blocked_exits.length} exits blocked, ${formatPercent(baseline.safe_zone?.pressure)} safe-zone pressure.` : 'No baseline yet.'}</p>
                </div>
                <div className="comparison-card accent">
                  <span className="t-caption">Scenario</span>
                  <strong>{scenario ? `${scenario.risk_score}/100` : '—'}</strong>
                  <p>{scenario ? `${scenario.blocked_exits.length} exits blocked, ${formatPercent(scenario.safe_zone?.pressure)} safe-zone pressure.` : 'Waiting for simulation.'}</p>
                </div>
              </div>
            </div>

            <div className="panel-card twin-panel">
              <h3 className="t-label">Decision brief</h3>
              {briefing ? (
                <div className="brief-stack">
                  <div className="brief-title">{briefing.title}</div>
                  <p className="brief-summary">{briefing.summary}</p>
                  <div className="brief-block">
                    <span className="t-caption">What changed</span>
                    <ul style={{ margin: '8px 0 0', paddingLeft: 18, display: 'grid', gap: 6, color: 'var(--color-on-surface-variant)' }}>
                      {deltaHighlights.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="brief-block">
                    <span className="t-caption">Recommended action</span>
                    <p>{briefing.recommended_action}</p>
                  </div>
                  <div className="brief-block">
                    <span className="t-caption">Guest announcement</span>
                    <p>{briefing.guest_announcement}</p>
                  </div>
                  <div className="brief-block">
                    <span className="t-caption">Why</span>
                    <p>{briefing.rationale}</p>
                  </div>
                </div>
              ) : (
                <div className="empty-card">Run the twin to generate a live operational brief.</div>
              )}
            </div>
          </div>

          <div className="panel-card twin-panel">
            <div className="panel-card-header">
              <div>
                <h3 className="t-label">Broadcast composer</h3>
                <p className="t-caption">Turn the twin brief into a guest-facing safety notice before publishing.</p>
              </div>
              <button className="btn-tonal btn-sm" onClick={() => setBroadcastDraft(briefing?.guest_announcement || briefing?.summary || '')} disabled={!briefing}>
                Refresh draft
              </button>
            </div>
            <div className="broadcast-scope-row" style={{ marginBottom: 12 }}>
              {['venue', 'floor', 'zone'].map((scope) => (
                <button
                  key={scope}
                  type="button"
                  className={`scenario-tag ${broadcastScope === scope ? 'active' : ''}`}
                  onClick={() => setBroadcastScope(scope)}
                >
                  {scope === 'venue' ? 'Venue-wide' : scope === 'floor' ? 'Floor notice' : 'Zone notice'}
                </button>
              ))}
            </div>
            <label className="broadcast-field">
              <span>Headline</span>
              <input value={broadcastTitle} onChange={(event) => setBroadcastTitle(event.target.value)} placeholder="Guest safety notice" />
            </label>
            <label className="broadcast-field" style={{ marginTop: 12 }}>
              <span>Guest message</span>
              <textarea rows={4} value={broadcastDraft} onChange={(event) => setBroadcastDraft(event.target.value)} placeholder="Use the twin output to draft the guest notice" />
            </label>
            <div className="broadcast-actions" style={{ marginTop: 12 }}>
              <button className="btn-tonal btn-sm" onClick={publishBroadcast} disabled={broadcastPublishing || !broadcastDraft.trim()}>
                Publish broadcast
              </button>
              <button className="btn-ghost btn-sm" onClick={copySnapshot} disabled={!snapshot}>
                Copy snapshot JSON
              </button>
            </div>
            {broadcastNotice && <div className="broadcast-note" style={{ marginTop: 12 }}>{broadcastNotice}</div>}
          </div>

          <div className="panel-card twin-panel">
            <div className="panel-card-header">
              <div>
                <h3 className="t-label">Broadcast replay</h3>
                <p className="t-caption">See what the command center sent and how the guest loop responded.</p>
              </div>
              <span className="status-pill">{broadcastFeed.length} recent</span>
            </div>
            <div className="broadcast-replay-strip">
              {activeBroadcast ? (
                <div className="broadcast-replay-card">
                  <div className="broadcast-replay-top">
                    <strong>{activeBroadcast.title || 'Guest safety notice'}</strong>
                    <span className="sev-badge sev-low">{activeBroadcast.scope || 'venue'}</span>
                  </div>
                  <p>{activeBroadcast.message}</p>
                  <div className="broadcast-replay-stats">
                    <span>Safe {activeBroadcast.ack_counts?.safe || 0}</span>
                    <span>Help {activeBroadcast.ack_counts?.need_help || 0}</span>
                    <span>Trapped {activeBroadcast.ack_counts?.trapped || 0}</span>
                  </div>
                  {activeBroadcast.latest_ack && <div className="broadcast-replay-latest">Latest response: {activeBroadcast.latest_ack.message || activeBroadcast.latest_ack.response_type}</div>}
                </div>
              ) : (
                <div className="empty-card">Publish a broadcast from the ops dashboard to show the live response loop here.</div>
              )}
            </div>
          </div>
        </main>
      </div>

      <div className="panel-card twin-footer-card">
        <div>
          <h3 className="t-label">Shareable demo snapshot</h3>
          <p className="t-caption">Use this during the hackathon pitch to show a clear current state, forecast, and recommendation.</p>
        </div>
        <button className="btn-filled" onClick={copySnapshot} disabled={!snapshot}>Copy snapshot JSON</button>
      </div>
    </div>
  );
}
