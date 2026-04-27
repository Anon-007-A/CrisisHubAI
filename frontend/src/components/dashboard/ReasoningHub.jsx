/**
 * ReasoningHub Component
 * 
 * Visualizes the agentic reasoning steps from Gemini.
 */
export default function ReasoningHub({ reasoning }) {
  if (!reasoning) return null;

  const steps = reasoning
    .replace(/[→→•–>-]+/g, '.')
    .replace(/\s+/g, ' ')
    .split(/(?:\d+\.|\.)\s*/)
    .map(s => s.trim())
    .filter(Boolean);

  return (
    <div className="reasoning-hub">
      <div className="reasoning-header">
        <span className="ai-icon">✨</span>
        <span className="t-label">Agentic Reasoning Chain</span>
      </div>
      
      <div className="reasoning-steps">
        {steps.map((step, i) => (
          <div key={i} className="reasoning-step">
            <div className="step-number t-mono">{i + 1}</div>
            <div className="step-text t-body-sm">{step}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
