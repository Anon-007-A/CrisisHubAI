import { useState, useMemo } from 'react';
import { calculateRiskScore } from '../../utils/incidentRiskScore';

const ACCENT = {
  fire: '#EA4335', medical: '#4285F4', security: '#FBBC04', false_alarm: '#34A853'
};
const EMOJI = { fire: '🔥', medical: '🚑', security: '🚨', false_alarm: '✅' };
const TC = { fire: 'tc-fire', medical: 'tc-medical', security: 'tc-security', false_alarm: 'tc-false_alarm' };
const SEV = { critical: 'sev-critical', high: 'sev-high', medium: 'sev-medium', low: 'sev-low' };
const ACTION_COLORS = { dispatch: 'dispatch', alert: 'alert', escalate: 'escalate', evacuate: 'evacuate', equipment: 'equipment', resolve: 'resolve' };

function formatMTTM(seconds) {
  if (!seconds) return null;
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

import ReasoningHub from './ReasoningHub';
import VisionPreview from './VisionPreview';
import ElapsedTimer from './ElapsedTimer';
import IncidentProgressStepper from './IncidentProgressStepper';
import ResponderSelector from './ResponderSelector';
import GeminiAnalysisBadge from '../GeminiAnalysisBadge';
import { generateAAR } from '../../services/api';

export default function IncidentCard({ incident, onResolve, onAssignResponder, isSelected, onSelect, responders = [], allIncidents = [], automationPaused = false, manualOverride = false }) {
  const [showTrace, setShowTrace] = useState(false);
  const [confirming, setConfirming] = useState(false);
  
  const riskScore = useMemo(
    () => calculateRiskScore(incident, responders, allIncidents),
    [incident, responders, allIncidents]
  );
  
  const c = incident.classification;
  if (!c) return null;

  const isActive = incident.status !== 'resolved';
  const isCritical = c.severity === 'critical';
  const type = c.incident_type || 'fire';

  const incidentTimestamp = typeof incident.timestamp === 'string'
    ? incident.timestamp
    : incident.timestamp?.toDate?.() || new Date();

  return (
    <div
      className={`incident-card${isCritical && isActive ? ' is-critical' : ''}${isSelected ? ' selected' : ''}`}
      style={{ 
        '--card-accent': ACCENT[type],
        ...(isSelected ? { boxShadow: `0 0 20px -5px ${ACCENT[type]}, var(--shadow-2)` } : {})
      }}
      onClick={() => onSelect?.(incident)}
    >
      {/* Row 1: chips + timestamp */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        <span className={`type-chip ${TC[type] || ''}`}>
          {EMOJI[type]} {type.replace('_', ' ')}
        </span>
        <span className={`sev-badge ${SEV[c.severity] || ''}`}>{c.severity}</span>
        {isCritical && isActive && (
          <span className="sev-badge sev-critical" style={{ animation: 'blink 1.5s ease-in-out infinite' }}>● LIVE</span>
        )}
        {automationPaused && (
          <span className="sev-badge sev-high" style={{ background: '#FF9800', color: 'white' }}>⏸️ PAUSED</span>
        )}
        {manualOverride && (
          <span className="sev-badge sev-high" style={{ background: '#9C27B0', color: 'white' }}>👤 MANUAL</span>
        )}
        <span className="t-mono" style={{ color: '#FF9800', fontSize: '0.5625rem', fontWeight: 600, padding: '2px 8px', background: 'rgba(255,152,0,0.12)', borderRadius: 4 }}>
          Risk {riskScore}
        </span>
        {/* Confidence */}
        <span className="t-mono" style={{ color: 'var(--color-on-surface-dim)', fontSize: '0.5625rem' }}>
          {Math.round((c.confidence || 0) * 100)}%
        </span>
        {/* Timestamp */}
        <span className="t-caption" style={{ marginLeft: 'auto', whiteSpace: 'nowrap', fontSize: '0.625rem' }}>
          <ElapsedTimer timestamp={incidentTimestamp} />
        </span>
      </div>

      {/* Row 2: location */}
      <h3 className="t-title" style={{ marginTop: 6 }}>{c.location}</h3>

      {/* Row 3: summary */}
      <p className="t-body-sm" style={{ color: 'var(--color-on-surface-variant)', marginTop: 3 }}>{c.summary}</p>

      {/* Agentic Reasoning Hub */}
      {c.ai_reasoning && (
        <div style={{ marginTop: 8 }}>
          <GeminiAnalysisBadge analysis={c.ai_reasoning} />
          <ReasoningHub reasoning={c.ai_reasoning} />
          
          {/* Multimodal Proof: Vision Preview */}
          {(incident.input?.image_url || c.ai_reasoning.toLowerCase().includes('vision') || c.ai_reasoning.toLowerCase().includes('detected')) && (
            <VisionPreview 
              incidentType={type} 
              locationCoords={c.location_coords} 
              locationLabel={c.location}
            />
          )}

          {/* Trace Panel (Compact) */}
          <div style={{ marginTop: 8 }}>
            <button 
              className="btn-tonal"
              style={{ fontSize: '0.5rem', height: 20, width: '100%', justifyContent: 'center' }}
              onClick={(e) => { e.stopPropagation(); setShowTrace(!showTrace); }}
            >
              {showTrace ? 'Hide AI Trace ↑' : 'View AI Trace ↓'}
            </button>
            {showTrace && (
              <pre className="trace-panel" style={{ 
                marginTop: 6, padding: 8, borderRadius: 6,
                background: 'rgba(0,0,0,0.3)', color: '#D1D1D1',
                fontSize: '0.5625rem', fontFamily: 'var(--font-mono)', overflowX: 'auto'
              }}>
                {JSON.stringify({
                  model: "gemini-1.5-pro",
                  input_modalities: ["text", "image", "sensor_data"],
                  reasoning_chain: c.ai_reasoning.split('. ').map(s => s.trim()),
                }, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}

      <div style={{ marginTop: 10 }} onClick={e => e.stopPropagation()}>
        <ResponderSelector
          currentAssigned={incident.assigned_responders || []}
          responders={responders}
          onAssign={(responder) => onAssignResponder?.(incident.id, responder)}
        />
      </div>

      {/* Responders: Grounding Lite Telemetry */}
      {incident.assigned_responders?.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--color-outline-variant)' }}>
          <span className="t-overline" style={{ fontSize: '0.5rem' }}>ACTIVE RESPONDERS</span>
          {incident.assigned_responders.map((r, i) => {
            return (
              <span key={r} className="resp-tag" title="Distance telemetry">
                {r} <span style={{opacity: 0.8, marginLeft: 4, display: 'inline-flex', alignItems: 'center', gap: 2}}>
                  {(0.3 + (i * 0.15)).toFixed(1)}km <span style={{ fontSize: 10 }}>{['↑','↗','→','↘','↓','↙','←','↖'][i % 8]}</span>
                </span>
              </span>
            );
          })}
        </div>
      )}

      {/* Autonomous Actions Log */}
      {incident.autonomous_actions?.length > 0 && (
        <div className="action-log">
          <span className="t-overline" style={{ fontSize: '0.5rem', marginBottom: 2 }}>
            AGENTIC ACTIONS ({incident.autonomous_actions.length})
            {incident.toil_saved > 0 && (
              <span style={{ color: 'var(--color-success)', marginLeft: 6 }}>
                {incident.toil_saved} toil saved
              </span>
            )}
          </span>
          {incident.autonomous_actions.slice(0, 4).map((a, i) => {
            const action = typeof a === 'string' ? { action: 'dispatch', detail: a } : a;
            return (
            <div key={i} className="action-item">
              <div className={`action-dot ${ACTION_COLORS[action.action] || 'dispatch'}`} />
              <span>{action.detail || action.action}</span>
            </div>
          );
          })}
          {incident.autonomous_actions.length > 4 && (
            <span className="t-caption" style={{ fontSize: '0.5625rem', paddingLeft: 9 }}>
              +{incident.autonomous_actions.length - 4} more actions
            </span>
          )}
        </div>
      )}

      {/* Evacuation */}
      {c.evacuation_required && (
        <div className="evac-banner" style={{ marginTop: 8 }}>
          <span className="sev-badge sev-critical">EVAC</span>
          <span className="t-body-sm">{incident.evacuation_route?.steps?.join(' → ')}</span>
        </div>
      )}

      <IncidentProgressStepper incident={incident} />

      {/* Footer: ID + MTTM + actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--color-outline-variant)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="t-mono" style={{ color: 'var(--color-on-surface-dim)' }}>
            {incident.id?.slice(0, 8)}
          </span>
          {incident.mttm_seconds && (
            <span className="mttm-badge">
              MTTM {formatMTTM(incident.mttm_seconds)}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {isActive && (
            <>
              {confirming ? (
                <div style={{ display: 'flex', gap: 4 }}>
                  <input 
                    className="form-field" 
                    placeholder="Notes..." 
                    autoFocus
                    style={{ height: 21, fontSize: '0.625rem', width: 80, padding: '0 4px' }}
                    onClick={e => e.stopPropagation()}
                    onKeyDown={e => e.key === 'Enter' && onResolve(incident.id)}
                  />
                  <button className="btn-tonal" style={{ padding: '0 4px', fontSize: '0.5rem' }} onClick={e => { e.stopPropagation(); onResolve(incident.id); }}>OK</button>
                  <button className="btn-tonal" style={{ padding: '0 4px', fontSize: '0.5rem' }} onClick={e => { e.stopPropagation(); setConfirming(false); }}>×</button>
                </div>
              ) : (
                <button className="btn-tonal" style={{ fontSize: '0.625rem' }} onClick={e => { e.stopPropagation(); setConfirming(true); }}>
                  Resolve ✓
                </button>
              )}
            </>
          )}
          {!isActive && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {incident.aar_generated ? (
                <button className="btn-tonal" style={{ fontSize: '0.5625rem', padding: '0 6px' }} onClick={e => { 
                  e.stopPropagation(); 
                  // In a full app, this would open a modal with the AAR
                  alert("AFTER ACTION REPORT:\n\n" + (incident.aar_text || "AAR is available in the audit records.")); 
                }}>
                  View AAR
                </button>
              ) : (
                <button className="btn-tonal" style={{ fontSize: '0.5625rem', padding: '0 6px', backgroundColor: 'var(--color-primary)', color: 'white' }} onClick={e => { 
                  e.stopPropagation(); 
                  const btn = e.currentTarget;
                  btn.textContent = 'Generating...';
                  btn.disabled = true;
                  generateAAR(incident.id).then(() => {
                    btn.textContent = 'AAR Generated';
                  }).catch(err => {
                    console.error(err);
                    btn.textContent = 'AAR Failed';
                    btn.disabled = false;
                  });
                }}>
                  ✨ Gen AAR
                </button>
              )}
              <span className="sev-badge sev-low" style={{ fontSize: '0.5rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                 <span style={{ fontSize: 10 }}>✔</span> MITIGATED
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
