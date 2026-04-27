export default function ArchitectureModal({ onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()} tabIndex={-1}>
      <div className="modal-card arch-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="t-headline">System Architecture</h2>
            <p className="t-caption">Aegis CrisisHub v2.0 · Full-stack agentic orchestration</p>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="arch-body">
          {/* Pipeline diagram */}
          <div className="arch-pipeline">
            <div className="arch-node guest">
              <span className="arch-node-icon">👤</span>
              <strong>Guest Portal</strong>
              <span className="t-caption">React · multimodal report</span>
            </div>
            <div className="arch-arrow">→</div>
            <div className="arch-node backend">
              <span className="arch-node-icon">⚡</span>
              <strong>FastAPI Backend</strong>
              <span className="t-caption">Observe → Reason → Act</span>
            </div>
            <div className="arch-arrow">→</div>
            <div className="arch-node ai">
              <span className="arch-node-icon">◈</span>
              <strong>Gemini 2.0 Flash</strong>
              <span className="t-caption">Classification · routing</span>
            </div>
            <div className="arch-arrow">→</div>
            <div className="arch-node ops">
              <span className="arch-node-icon">🖥</span>
              <strong>Ops Dashboard</strong>
              <span className="t-caption">Human approval · audit</span>
            </div>
          </div>

          {/* Agents */}
          <div className="arch-section-title t-overline">Agentic pipeline (backend)</div>
          <div className="arch-agents-grid">
            {[
              { name: 'Classifier Agent', desc: 'Gemini multimodal classification → type, severity, location, confidence', icon: '🧠', badge: 'Gemini 2.0' },
              { name: 'Dispatch Agent',   desc: 'Nearest responder selection · autonomous action with human approval gate', icon: '📡', badge: 'Auto' },
              { name: 'Routing Agent',    desc: 'A* pathfinding with hazard cost function · dynamic rerouting', icon: '🗺',  badge: 'A*' },
              { name: 'Alert Agent',      desc: 'Google Chat webhook · email · SLA monitoring · external escalation', icon: '🔔', badge: 'Multi-channel' },
            ].map((agent) => (
              <div key={agent.name} className="arch-agent-card">
                <div className="arch-agent-header">
                  <span>{agent.icon}</span>
                  <strong>{agent.name}</strong>
                  <span className="status-pill">{agent.badge}</span>
                </div>
                <p className="t-caption">{agent.desc}</p>
              </div>
            ))}
          </div>

          {/* Human-in-the-loop */}
          <div className="arch-section-title t-overline">Human-in-the-loop governance</div>
          <div className="arch-hitl-grid">
            {[
              { step: '1', label: 'AI recommends', desc: 'Gemini generates action with confidence score. Never auto-executes without approval gate.' },
              { step: '2', label: 'Operator reviews', desc: 'Operator sees reasoning chain, confidence, and evidence. Approves, modifies, or rejects.' },
              { step: '3', label: 'Action executed', desc: 'Only operator-approved actions execute. Attribution and timestamp recorded.' },
              { step: '4', label: 'Audit logged', desc: 'Every action logged with actor, type, reason, confidence, and approval state. Immutable.' },
            ].map((item) => (
              <div key={item.step} className="arch-hitl-step">
                <span className="arch-hitl-num">{item.step}</span>
                <div>
                  <strong className="t-label">{item.label}</strong>
                  <p className="t-caption">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Data flow */}
          <div className="arch-section-title t-overline">Infrastructure</div>
          <div className="arch-infra-grid">
            {[
              { name: 'React 19 + Vite', icon: '⚛', desc: 'Frontend · SPA' },
              { name: 'FastAPI (Python)', icon: '🐍', desc: 'Backend · async API' },
              { name: 'Gemini 2.0 Flash', icon: '◈', desc: 'AI · multimodal' },
              { name: 'Firebase Auth',    icon: '🔐', desc: 'SSO · Google OAuth' },
              { name: 'Firestore',        icon: '🗄',  desc: 'Persistence · real-time' },
              { name: 'Venue Graph JSON', icon: '🗺',  desc: 'A* routing · topology' },
            ].map((item) => (
              <div key={item.name} className="arch-infra-item">
                <span className="arch-infra-icon">{item.icon}</span>
                <strong className="t-label">{item.name}</strong>
                <span className="t-caption">{item.desc}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-filled btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
