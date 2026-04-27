import { useState, useMemo, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useCCTV } from '../hooks/useCCTV';
import { useVideoEvents } from '../hooks/useVideoEvents';
import { verifyVideoEvent } from '../services/api';

export default function CCTVPage() {
  const { isDark } = useTheme();
  const { feeds, loading: feedsLoading } = useCCTV();
  const { events, loading: eventsLoading } = useVideoEvents();
  
  const [selectedFeed, setSelectedFeed] = useState(null);
  const [verifyingEventId, setVerifyingEventId] = useState(null);
  const [eventOverrides, setEventOverrides] = useState({});

  const displayedEvents = useMemo(() => {
    return events.map((evt) => {
      const override = eventOverrides[evt.id];
      return override ? { ...evt, ...override } : evt;
    });
  }, [events, eventOverrides]);

  const activeEvents = useMemo(() => {
    return displayedEvents.filter(e => e.verification_status === 'pending' || e.verification_status === 'verified');
  }, [displayedEvents]);

  const handleVerifyEvent = async (evt) => {
    setVerifyingEventId(evt.id);
    setEventOverrides((current) => ({
      ...current,
      [evt.id]: {
        verification_status: 'verified'
      }
    }));

    try {
      await verifyVideoEvent(evt.id);
    } catch (err) {
      console.error('Verify failed', err);
      setEventOverrides((current) => {
        const next = { ...current };
        delete next[evt.id];
        return next;
      });
    } finally {
      setVerifyingEventId((current) => (current === evt.id ? null : current));
    }
  };

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (feedsLoading) {
    return (
      <main className="page-container" style={{ padding: '24px' }}>
        <h1 className="t-headline-lg">Initializing security feeds...</h1>
      </main>
    );
  }

  return (
    <main className="page-container" style={{ padding: '24px', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header className="page-header" style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="t-headline-lg" style={{ margin: '0 0 8px', fontWeight: 600 }}>CCTV Intelligence</h1>
          <p className="t-body-md" style={{ margin: 0, color: 'var(--color-on-surface-variant)' }}>
            Real-time video analysis and autonomous threat detection. {feeds.length} active feeds.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div className="card" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12, backgroundColor: 'var(--color-surface-variant)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--color-success)', boxShadow: '0 0 8px var(--color-success)' }} />
            <span style={{ fontWeight: 600 }}>SYSTEM ONLINE</span>
          </div>
          <div className="card" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12, backgroundColor: activeEvents.length > 0 ? 'var(--color-error)' : 'var(--color-surface-variant)', color: activeEvents.length > 0 ? '#fff' : 'inherit' }}>
             <span style={{ fontWeight: 600 }}>{activeEvents.length} active alerts</span>
          </div>
        </div>
      </header>

      <div style={{ display: 'flex', gap: 24, flex: 1, minHeight: 0 }}>
        
        {/* Main Feeds Grid */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', paddingRight: 8 }}>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', 
            gap: '16px' 
          }}>
            {feeds.map((feed) => {
              const hasAlert = activeEvents.some(e => e.cctv_feed_id === feed.id);
              return (
                <div 
                  key={feed.id} 
                  className={`card ${selectedFeed?.id === feed.id ? 'selected' : ''}`}
                  onClick={() => setSelectedFeed(feed)}
                  style={{ 
                    overflow: 'hidden', 
                    padding: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    cursor: 'pointer',
                    border: hasAlert ? '2px solid var(--color-error)' : selectedFeed?.id === feed.id ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                    boxShadow: hasAlert ? '0 0 15px rgba(220, 53, 69, 0.4)' : 'none',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ 
                    position: 'relative', 
                    aspectRatio: '16/9', 
                    backgroundColor: feed.status === 'online' ? (isDark ? '#1a1a1a' : '#e0e0e0') : '#000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderBottom: '1px solid var(--color-border)',
                    backgroundImage: feed.status === 'online' ? 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.05) 10px, rgba(0,0,0,0.05) 20px)' : 'none'
                  }}>
                    {feed.status === 'offline' ? (
                      <span style={{ fontFamily: 'monospace', color: 'var(--color-error)' }}>SIGNAL LOST</span>
                    ) : feed.image_url ? (
                      <img 
                        src={feed.image_url} 
                        alt={feed.label}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <span style={{ fontFamily: 'monospace', color: 'var(--color-on-surface-variant)', opacity: 0.5 }}>
                        LIVE FEED
                      </span>
                    )}
                    <div style={{ 
                      position: 'absolute', 
                      top: 8, 
                      left: 8, 
                      backgroundColor: 'rgba(0,0,0,0.6)', 
                      color: 'white',
                      padding: '4px 8px',
                      borderRadius: 4,
                      fontFamily: 'monospace',
                      fontSize: 12,
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center'
                    }}>
                      <div style={{ 
                        width: 8, height: 8, borderRadius: '50%', 
                        backgroundColor: feed.status === 'online' ? 'var(--color-success)' : 'var(--color-error)',
                        boxShadow: feed.status === 'online' ? '0 0 8px var(--color-success)' : '0 0 8px var(--color-error)'
                      }} />
                      {feed.camera_code}
                    </div>
                    {feed.status === 'online' && (
                      <div className="cctv-scanline" />
                    )}
                    <div className="cctv-glitch-overlay" />
                    <div style={{ 
                      position: 'absolute', 
                      bottom: 8, 
                      right: 8, 
                      backgroundColor: 'rgba(0,0,0,0.6)', 
                      color: '#00ff00',
                      padding: '2px 6px',
                      borderRadius: 2,
                      fontFamily: 'monospace',
                      fontSize: 10,
                      letterSpacing: 1,
                      pointerEvents: 'none',
                      textShadow: '0 0 2px #00ff00'
                    }}>
                      {currentTime.toLocaleDateString()} {currentTime.toLocaleTimeString()}
                    </div>
                    {hasAlert && (
                      <div style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        backgroundColor: 'var(--color-error)',
                        color: 'white',
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 'bold',
                        animation: 'pulse 2s infinite',
                        zIndex: 2
                      }}>
                        AI ALERT
                      </div>
                    )}
                  </div>
                  <div style={{ padding: '12px' }}>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{feed.label}</div>
                    <div style={{ fontSize: 13, color: 'var(--color-on-surface-variant)', marginTop: 4 }}>Zone: {feed.zone_id.replace('_', ' ').toUpperCase()}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* AI Intelligence Sidebar */}
        <div style={{ width: 400, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <h2 className="t-title-md" style={{ margin: '0 0 16px', display: 'flex', justifyContent: 'space-between' }}>
            <span>Intelligence stream</span>
              <span className="sev-badge sev-high" style={{ fontSize: 12 }}>{activeEvents.length} Active</span>
            </h2>
            
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 4 }}>
              {eventsLoading ? (
                <div style={{ color: 'var(--color-on-surface-variant)', textAlign: 'center', padding: 20 }}>Syncing...</div>
              ) : displayedEvents.length === 0 ? (
                <div style={{ color: 'var(--color-on-surface-variant)', textAlign: 'center', padding: 20 }}>No events detected.</div>
              ) : (
                displayedEvents.map(evt => {
                  const feed = feeds.find(f => f.id === evt.cctv_feed_id);
                  const isVerified = evt.verification_status === 'verified';
                  const isVerifying = verifyingEventId === evt.id;
                  return (
                    <div key={evt.id} style={{ 
                      padding: 16, 
                      borderRadius: 8, 
                      backgroundColor: 'var(--color-surface-variant)',
                      borderLeft: `4px solid ${isVerified ? 'var(--color-warning)' : 'var(--color-error)'}`
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-error)', textTransform: 'uppercase', letterSpacing: 1 }}>
                          {evt.event_type.replace('_', ' ')}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--color-on-surface-variant)', fontFamily: 'monospace' }}>
                          {new Date(evt.detected_at).toLocaleTimeString()}
                        </span>
                      </div>
                      <div style={{ fontSize: 14, marginBottom: 8, lineHeight: 1.5 }}>
                        {evt.ai_summary}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
                        <span style={{ fontSize: 12, color: 'var(--color-on-surface-variant)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>videocam</span>
                          {feed?.camera_code || evt.cctv_feed_id}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 600 }}>Confidence: {(evt.confidence * 100).toFixed(0)}%</span>
                          {isVerified ? (
                            <span className="sev-badge" style={{ backgroundColor: 'var(--color-success)', color: 'white', fontSize: 10 }}>VERIFIED</span>
                          ) : (
                            <button 
                              className="btn-filled btn-sm" 
                              style={{ backgroundColor: 'var(--color-error)', opacity: isVerifying ? 0.75 : 1 }}
                              disabled={isVerifying}
                              onClick={() => handleVerifyEvent(evt)}
                            >
                              {isVerifying ? 'Verifying...' : 'Verify event'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(220, 53, 69, 0.7); }
          70% { box-shadow: 0 0 0 10px rgba(220, 53, 69, 0); }
          100% { box-shadow: 0 0 0 0 rgba(220, 53, 69, 0); }
        }
        .cctv-scanline {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.1) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.03), rgba(0, 255, 0, 0.01), rgba(0, 0, 255, 0.03));
          background-size: 100% 3px, 3px 100%;
          pointer-events: none;
          z-index: 1;
          opacity: 0.4;
        }
        .cctv-glitch-overlay {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 255, 0, 0.02);
          pointer-events: none;
          z-index: 1;
          mix-blend-mode: color-dodge;
        }
      `}} />
    </main>
  );
}
