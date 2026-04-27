import { useState } from 'react';
import { analyzeIncident } from '../../lib/gemini';
import GeminiAnalysisBadge from '../GeminiAnalysisBadge';

export default function NewIncidentModal({ onClose, onSubmit }) {
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState('fire');
  const [loc, setLoc] = useState('');
  const [desc, setDesc] = useState('');
  const [analysis, setAnalysis] = useState(null);

  const handleSubmit = async () => {
    if (!desc || !loc) return;
    setLoading(true);
    try {
      const result = await analyzeIncident(desc, loc);
      setAnalysis(result);
      
      onSubmit({
        type: result.incidentType.toLowerCase(),
        location: result.affectedZone || loc,
        description: result.summary,
        severity: result.severity.toLowerCase(),
        evacuation_required: result.evacuationRequired,
        confidence: result.confidenceScore,
        ai_reasoning: result.agenticReasoningChain?.join('. '),
      });
      
      setLoading(false);
    } catch (e) {
      console.error(e);
      alert('Analysis failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 11000 }}>
      <div className="modal-content" style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ padding: 24 }}>
          <h2 className="t-title-lg">Initiate New Incident</h2>
          <p className="t-caption">AI-Agent will classify and orchestrate responders upon submission.</p>
          
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="t-overline" style={{ marginBottom: 4, display: 'block' }}>Primary Indicator</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {['fire', 'medical', 'security', 'other'].map(t => (
                  <button 
                    key={t}
                    onClick={() => setType(t)}
                    className={type === t ? 'btn-filled' : 'btn-tonal'}
                  >
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="t-overline" style={{ marginBottom: 4, display: 'block' }}>Reported Location</label>
              <input 
                className="form-field" 
                placeholder="e.g. Room 302, South Corridor..."
                value={loc}
                onChange={e => setLoc(e.target.value)}
              />
            </div>

            <div>
              <label className="t-overline" style={{ marginBottom: 4, display: 'block' }}>Description (Vision/Sensor Hint)</label>
              <textarea 
                className="form-field" 
                rows={3}
                placeholder="Describe current status..."
                value={desc}
                onChange={e => setDesc(e.target.value)}
              />
            </div>
            {loading && (
              <div className="info-callout" style={{ padding: '12px 14px' }}>
                <span className="spinner" />
                <span className="t-body-sm">Gemini is analyzing...</span>
              </div>
            )}
            {analysis && <GeminiAnalysisBadge analysis={analysis} />}
          </div>

          <div style={{ marginTop: 32, display: 'flex', gap: 12 }}>
            <button className="btn-tonal" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button 
              className="btn-filled" 
              style={{ flex: 2 }} 
              onClick={handleSubmit}
              disabled={loading || !loc}
            >
              {loading ? 'Gemini is analyzing...' : 'Analyze & Deploy AI'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
