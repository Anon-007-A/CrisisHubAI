import React, { useState } from 'react';
import { X } from 'lucide-react';

const nodes = [
  { id: 'guest', x: 60, y: 70, w: 210, h: 72, title: 'Guest Portal', tech: 'React + Firebase submit', tone: 'guest' },
  { id: 'iot', x: 60, y: 190, w: 210, h: 72, title: 'IoT Sensors / Camera Feed', tech: 'Vision inputs + sensor stream', tone: 'guest' },
  { id: 'db', x: 360, y: 150, w: 230, h: 82, title: 'Firebase Firestore', tech: 'Live data sync', tone: 'backend' },
  { id: 'gemini', x: 690, y: 150, w: 250, h: 82, title: 'Gemini AI Engine', tech: 'Multimodal classification', tone: 'ai' },
  { id: 'ops', x: 1030, y: 150, w: 230, h: 82, title: 'Operations Dashboard', tech: 'React command center', tone: 'ops' },
  { id: 'agent', x: 360, y: 350, w: 250, h: 118, title: 'Agentic Action Layer', tech: 'Auto-dispatch, routing, alerts', tone: 'backend' },
  { id: 'team', x: 690, y: 350, w: 250, h: 118, title: 'Team / Responders', tech: 'Live status, position tracking', tone: 'ops' },
  { id: 'audit', x: 525, y: 565, w: 270, h: 82, title: 'Audit Trail / Compliance Log', tech: 'Immutable response history', tone: 'audit' },
];

function ArchNode({ node }) {
  return (
    <g>
      <rect x={node.x} y={node.y} width={node.w} height={node.h} rx="16" className={`arch-node ${node.tone}`} />
      <text x={node.x + node.w / 2} y={node.y + 30} textAnchor="middle" className="arch-title">
        {node.title}
      </text>
      <foreignObject x={node.x + 16} y={node.y + 42} width={node.w - 32} height={node.h - 46}>
        <div className="arch-tech">{node.tech}</div>
      </foreignObject>
    </g>
  );
}

function FlowCard({ icon, title, text, tone }) {
  return (
    <article className={`arch-flow-card ${tone}`}>
      <div className="arch-flow-icon">{icon}</div>
      <strong>{title}</strong>
      <p>{text}</p>
    </article>
  );
}

export default function ArchitectureModal({ onClose }) {
  const [activeTab, setActiveTab] = useState('diagram');

  return (
    <div className="modal-overlay arch-overlay" onClick={onClose} style={{ zIndex: 12000 }}>
      <div className="modal-content arch-modal-shell" onClick={(e) => e.stopPropagation()}>
        <div className="arch-modal-header">
          <div className="arch-heading">
            <p className="page-kicker" style={{ margin: 0 }}>Architecture</p>
            <h2 className="t-title-lg" style={{ margin: '4px 0 0' }}>CrisisHub AI System Design</h2>
            <p className="page-subtitle" style={{ margin: '8px 0 0' }}>
              End-to-end crisis flow from reporting to reasoning, approval, dispatch, and audit.
            </p>
          </div>
          <button onClick={onClose} className="arch-close" aria-label="Close architecture modal">
            <X size={20} />
          </button>
        </div>

        <div className="arch-tabs" role="tablist" aria-label="Architecture views">
          <button onClick={() => setActiveTab('diagram')} className={activeTab === 'diagram' ? 'arch-tab active' : 'arch-tab'} type="button">
            System Diagram
          </button>
          <button onClick={() => setActiveTab('flow')} className={activeTab === 'flow' ? 'arch-tab active' : 'arch-tab'} type="button">
            Incident Flow
          </button>
          <button onClick={() => setActiveTab('approval')} className={activeTab === 'approval' ? 'arch-tab active' : 'arch-tab'} type="button">
            Approval Gates
          </button>
          <button onClick={() => setActiveTab('audit')} className={activeTab === 'audit' ? 'arch-tab active' : 'arch-tab'} type="button">
            Audit Pipeline
          </button>
        </div>

        {activeTab === 'diagram' && (
          <div className="arch-panel">
            <div className="arch-panel-copy">
              <span className="arch-panel-kicker">System path</span>
              <p className="t-body-sm" style={{ margin: 0, color: 'var(--color-on-surface-variant)' }}>
                The architecture keeps the operational handoff visible from guest report to AI reasoning to human approval.
              </p>
            </div>

            <div className="arch-canvas-card">
              <svg viewBox="0 0 1320 720" className="arch-svg" role="img" aria-label="CrisisHub AI system architecture diagram">
                <defs>
                  <marker id="arch-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
                    <path d="M0,0 L8,3 L0,6 Z" fill="#4285F4" />
                  </marker>
                  <style>{`
                    .arch-node { fill: #ffffff; stroke: #4285F4; stroke-width: 2.5; filter: drop-shadow(0 8px 16px rgba(60,64,67,0.12)); }
                    .arch-node.guest { fill: #E8F0FE; }
                    .arch-node.backend { fill: #F8F9FA; }
                    .arch-node.ai { fill: #FFF7E0; }
                    .arch-node.ops { fill: #E6F4EA; }
                    .arch-node.audit { fill: #F3E8FF; }
                    .arch-title { fill: #202124; font-size: 16px; font-weight: 800; }
                    .arch-tech { color: #5F6368; font: 600 12px 'Roboto', system-ui, sans-serif; text-align: center; line-height: 1.3; }
                    .arch-line { stroke: #4285F4; stroke-width: 3; fill: none; marker-end: url(#arch-arrow); }
                    .arch-biline { stroke: #34A853; stroke-width: 3; fill: none; marker-start: url(#arch-arrow); marker-end: url(#arch-arrow); }
                  `}</style>
                </defs>

                {nodes.map((node) => <ArchNode key={node.id} node={node} />)}

                <path className="arch-line" d="M270 106 H310 V174 H360" />
                <path className="arch-line" d="M270 226 H310 V190 H360" />
                <path className="arch-biline" d="M590 191 H690" />
                <path className="arch-biline" d="M940 191 H1030" />
                <path className="arch-line" d="M475 232 V350" />
                <path className="arch-line" d="M815 232 V350" />
                <path className="arch-line" d="M485 468 V520 H660 V565" />
                <path className="arch-line" d="M815 468 V520 H660" />

                <text x="535" y="285" textAnchor="middle" className="arch-tech" style={{ fontSize: '12px' }}>
                  Firebase + AI Classification
                </text>
                <text x="815" y="285" textAnchor="middle" className="arch-tech" style={{ fontSize: '12px' }}>
                  Autonomous Agents
                </text>
              </svg>
            </div>

            <div className="arch-legend">
              <span><i className="legend-dot guest" />Reporting inputs</span>
              <span><i className="legend-dot backend" />Data sync and orchestration</span>
              <span><i className="legend-dot ai" />AI reasoning loop</span>
              <span><i className="legend-dot ops" />Human approval and audit</span>
            </div>
          </div>
        )}

        {activeTab === 'flow' && (
          <div className="arch-panel">
            <div className="arch-flow-grid">
              <FlowCard
                icon="👁️"
                title="Observe"
                text="Guests and staff submit the incident with text, image, and location hints."
                tone="guest"
              />
              <div className="arch-flow-arrow">→</div>
              <FlowCard
                icon="🧠"
                title="Reason"
                text="Gemini classifies type, severity, confidence, and the explainable reasoning chain."
                tone="ai"
              />
              <div className="arch-flow-arrow">→</div>
              <FlowCard
                icon="⚡"
                title="Act"
                text="Dispatch, routing, and alerting execute only after the human approval gate."
                tone="ops"
              />
            </div>

            <div className="arch-card-grid">
              {[
                { name: 'Classifier Agent', desc: 'Multimodal classification with confidence scoring' },
                { name: 'Dispatcher Agent', desc: 'Selects responders by role, availability, and SLA' },
                { name: 'Router Agent', desc: 'A* pathfinding that avoids hazards and optimizes escape time' },
                { name: 'Alerter Agent', desc: 'Multi-channel notifications across push, SMS, Slack, and email' },
              ].map((agent) => (
                <article key={agent.name} className="arch-info-card">
                  <strong>{agent.name}</strong>
                  <p>{agent.desc}</p>
                </article>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'approval' && (
          <div className="arch-panel">
            <div className="arch-card-grid">
              {[
                { title: 'Incident verification', desc: 'When AI confidence is below 80%, the operator must review before dispatch.', tone: 'warning' },
                { title: 'External escalation', desc: 'Fire, police, and EMS calls require explicit approval and are fully logged.', tone: 'warning' },
                { title: 'Evacuation override', desc: 'Venue-wide evacuation suggestions require a lead operator decision.', tone: 'warning' },
                { title: 'Core principle', desc: 'AI can recommend, but it never completes a critical action on its own.', tone: 'info' },
              ].map((item) => (
                <article key={item.title} className={`arch-check-card ${item.tone}`}>
                  <strong>{item.title}</strong>
                  <p>{item.desc}</p>
                </article>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="arch-panel">
            <div className="arch-audit-grid">
              {[
                { step: '1', title: 'Event generation', desc: 'Every operational change emits a traceable event.' },
                { step: '2', title: 'Context enrichment', desc: 'Sensor data, rationale, and responder context are attached.' },
                { step: '3', title: 'Approval recording', desc: 'Actor, decision, and timestamp are captured explicitly.' },
                { step: '4', title: 'Persistence', desc: 'The record is written to Firestore for later review.' },
                { step: '5', title: 'Display', desc: 'The UI separates AI recommendations from human actions.' },
              ].map((stage) => (
                <div key={stage.step} className="arch-audit-step">
                  <span>{stage.step}</span>
                  <strong>{stage.title}</strong>
                  <p>{stage.desc}</p>
                </div>
              ))}
            </div>

            <div className="arch-fields-card">
              <h4>Audit event fields</h4>
              <ul>
                <li>timestamp: precise ISO8601 when the event occurred</li>
                <li>actor: human name or system component</li>
                <li>actor_type: human or ai for separation</li>
                <li>action: dispatch, escalate, approve, or similar</li>
                <li>reason: sensor thresholds, confidence, and context</li>
                <li>approval_status: approved, pending, rejected, or auto</li>
                <li>confidence: AI confidence score when applicable</li>
                <li>linked_entities: responders, zones, and incidents involved</li>
              </ul>
            </div>
          </div>
        )}

        <div className="modal-footer arch-footer">
          <button className="btn-filled btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
