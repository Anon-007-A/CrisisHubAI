import { useMemo } from 'react';

/**
 * VisionPreview Component
 * 
 * Simulates a CCTV feed with bounding box overlays for detected hazards.
 * Uses AREA_INDEX_LOC format for camera identifiers.
 */
export default function VisionPreview({ incidentType, locationCoords, locationLabel }) {
  // Parse bbox coordinates "x,y,w,h" (percentages)
  const [x, y, w, h] = useMemo(() => {
    if (locationCoords) return locationCoords.split(',').map(Number);
    // Default fallback bbox
    return [25, 30, 40, 45];
  }, [locationCoords]);

  const camId = useMemo(() => {
    const area = locationLabel?.split(' ')[0]?.toUpperCase() || 'INT';
    const loc = locationLabel?.split(' ').slice(1).join('_')?.toUpperCase() || 'ZONE';
    return `${area}_01_${loc}`;
  }, [locationLabel]);

  const timestamp = useMemo(() => new Date().toLocaleTimeString(), []);
  const confidence = useMemo(() => {
    const seed = `${incidentType || 'hazard'}:${locationLabel || ''}:${locationCoords || ''}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash * 31 + seed.charCodeAt(i)) % 1000;
    }
    return (0.94 + (hash % 5) / 1000).toFixed(2);
  }, [incidentType, locationCoords, locationLabel]);

  // Situational visuals mapping (using local user-provided assets for perfect context)
  const situationImage = useMemo(() => {
    const images = {
      fire: '/images/situation/fire.png',
      medical: '/images/situation/medical.png',
      security: '/images/situation/security.png',
      default: '/images/situation/fire.png' // Use fire as a high-impact default
    };
    return images[incidentType] || images.default;
  }, [incidentType]);

  return (
    <div className="vision-preview">
      <div className="vision-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="live-tag">● LIVE FEED</span>
          <span className="cam-id t-mono">{camId}</span>
        </div>
        <span className="timestamp t-mono">{timestamp}</span>
      </div>

      <div className="vision-viewport" style={{ 
        backgroundImage: `url(${situationImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        filter: 'contrast(1.1) brightness(0.9) saturate(0.8)'
      }}>
        {/* CCTV Overlay Effects */}
        <div className="vision-static" />
        <div className="vision-vignette" />
        
        {/* Pulsing Bounding Box */}
        <div 
          className="vision-bbox"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            width: `${w}%`,
            height: `${h}%`,
          }}
        >
          <div className="bbox-label">
            <span className="t-mono" style={{ marginRight: '8px' }}>{incidentType?.toUpperCase() || 'HAZARD'}</span>
            <span className="t-mono" style={{ opacity: 0.8, fontSize: '8px' }}>CONF: {confidence}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
