export default function GeminiAnalysisBadge({ analysis }) {
  if (!analysis) return null;

  const reasoning = Array.isArray(analysis)
    ? analysis
    : analysis.agenticReasoningChain || analysis.reasoningChain || String(analysis).split('. ').filter(Boolean);

  return (
    <div className="info-callout" style={{ padding: '12px 14px', marginTop: 10 }}>
      <div style={{ display: 'grid', gap: 6 }}>
        <span className="t-overline" style={{ color: 'var(--color-primary)' }}>
          Gemini 2.0 Flash AI Analyzed
        </span>
        {reasoning.length > 0 && (
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            {reasoning.slice(0, 4).map((step, index) => (
              <li key={`${step}-${index}`} className="t-caption" style={{ marginBottom: 4 }}>
                {step}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
