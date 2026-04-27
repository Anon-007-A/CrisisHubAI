import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIncidents } from '../hooks/useIncidents';
import { acknowledgeBroadcast, createIncidentReport, fetchActiveBroadcast, getApiErrorMessage, sendGuestChatMessage } from '../services/api';

const REPORT_TYPES = [
  { id: 'fire', label: 'Fire / Smoke', icon: 'F', color: '#EA4335' },
  { id: 'medical', label: 'Medical Emergency', icon: 'M', color: '#4285F4' },
  { id: 'security', label: 'Security Threat', icon: 'S', color: '#FBBC04' },
  { id: 'help', label: 'I Need Help', icon: 'H', color: '#34A853' },
];

const SUB_OPTIONS = {
  fire: ['Small Fire', 'Heavy Smoke', 'Blocked Exit', 'Smell of Smoke'],
  medical: ['Not Breathing', 'Bleeding', 'Unconscious', 'Chest Pain'],
  security: ['Aggressive Person', 'Weapon Spotted', 'Trespassing', 'Suspicious Package'],
  help: ['Trapped in Room', 'Mobility Issue', 'Lost Child', 'Panic Attack'],
};

function triggerHaptic(type = 'heavy') {
  if (!navigator.vibrate) return;
  if (type === 'heavy') navigator.vibrate([180, 80, 180]);
  else navigator.vibrate(40);
}

function getLocalReply(text) {
  const value = String(text || '').toLowerCase();
  if (value.includes('fire') || value.includes('smoke')) {
    return 'AEGIS: FIRE PROTOCOL. Pull the alarm, stay low, and use the nearest stairwell.';
  }
  if (value.includes('medical') || value.includes('hurt') || value.includes('pain') || value.includes('breath')) {
    return 'AEGIS: MEDICAL PROTOCOL. Help is on the way. Keep the person still and stay calm.';
  }
  if (value.includes('security') || value.includes('threat') || value.includes('weapon') || value.includes('danger')) {
    return 'AEGIS: SECURITY PROTOCOL. Move away from the threat, lock the door, and wait for staff.';
  }
  if (value.includes('exit') || value.includes('leave') || value.includes('route')) {
    return 'AEGIS: EVACUATION. Follow green exit signs and move to the nearest assembly point.';
  }
  return 'AEGIS: I am monitoring your location. Stay calm and wait for instructions.';
}

function GuestSafeRoute({ hazards, userLocation }) {
  const zones = hazards.map((hazard) => hazard.node).filter(Boolean);
  const blocked = zones.includes('corridor_1f_b') || zones.includes('kitchen');
  const path = blocked
    ? '220,170 220,155 180,155 180,240 100,240 50,240 50,250 37,250'
    : '220,170 220,155 220,115 380,115 380,85 430,42';

  const routeBg = 'var(--color-surface)';
  const routePanel = 'var(--color-surface-container)';
  const routeBorder = 'var(--color-outline-variant)';
  const routeText = 'var(--color-on-surface-variant)';

  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', background: routeBg, border: `1px solid ${routeBorder}` }}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${routeBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 700, color: 'var(--color-on-surface)' }}>Live Safe Route</div>
          <div style={{ fontSize: 12, color: routeText }}>Updated from active hazard data</div>
        </div>
        <span className="sev-badge sev-low">ROUTE</span>
      </div>

      <svg viewBox="0 0 480 320" style={{ width: '100%', display: 'block', background: routePanel }} aria-label="Venue safe route map">
        <rect x="10" y="10" width="460" height="300" rx="6" fill={routeBg} stroke={routeBorder} strokeWidth="2" />
        <rect x="20" y="20" width="110" height="80" rx="4" fill={zones.includes('kitchen') ? '#ff444422' : 'var(--color-surface-dim)'} stroke={zones.includes('kitchen') ? '#ff4444' : routeBorder} strokeWidth="1.5" />
        <text x="75" y="62" textAnchor="middle" fill={routeText} fontSize="10" fontWeight="600">Kitchen</text>
        <rect x="145" y="20" width="140" height="80" rx="4" fill="var(--color-surface-dim)" stroke={routeBorder} strokeWidth="1.5" />
        <text x="215" y="62" textAnchor="middle" fill={routeText} fontSize="10" fontWeight="600">Restaurant</text>
        <rect x="300" y="20" width="160" height="80" rx="4" fill="var(--color-surface-dim)" stroke={routeBorder} strokeWidth="1.5" />
        <text x="380" y="62" textAnchor="middle" fill={routeText} fontSize="10" fontWeight="600">Main Lobby</text>
        <rect x="20" y="115" width="440" height="40" rx="2" fill={zones.includes('corridor_1f_b') ? '#ff444411' : 'var(--color-surface-dim)'} stroke={zones.includes('corridor_1f_b') ? '#ff444466' : routeBorder} strokeWidth="1" />
        <text x="240" y="139" textAnchor="middle" fill={routeText} fontSize="9">Corridor 1F</text>
        {zones.includes('corridor_1f_b') && <text x="320" y="139" fill="#ff4444" fontSize="9">BLOCKED</text>}
        <rect x="20" y="170" width="160" height="100" rx="4" fill="var(--color-surface-dim)" stroke={routeBorder} strokeWidth="1.5" />
        <text x="100" y="222" textAnchor="middle" fill={routeText} fontSize="10" fontWeight="600">Pool Deck</text>
        <rect x="195" y="170" width="50" height="100" rx="4" fill="#e8f0fe0a" stroke="#4285F488" strokeWidth="1.5" />
        <text x="220" y="220" textAnchor="middle" fill="#4285F4" fontSize="9" fontWeight="600">Stair B</text>
        <rect x="430" y="20" width="40" height="22" rx="3" fill="#34A853" />
        <text x="450" y="35" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="700">EXIT</text>
        <rect x="20" y="230" width="34" height="40" rx="3" fill="#34A853" />
        <text x="37" y="254" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="700">EXIT</text>
        {hazards.length > 0 && (
          <polyline points={path} fill="none" stroke="#34A853" strokeWidth="3" strokeDasharray="8,5" style={{ animation: 'dash 1s linear infinite' }} />
        )}
        {userLocation && (
          <g>
            <circle cx="220" cy="180" r="12" fill="#4285F4" opacity="0.25" />
            <circle cx="220" cy="180" r="5" fill="#4285F4" />
            <text x="220" y="200" textAnchor="middle" fill="#4285F4" fontSize="8">You</text>
          </g>
        )}
      </svg>
    </div>
  );
}

function formatBroadcastScope(broadcast) {
  if (!broadcast) return 'Venue-wide';
  if (broadcast.scope === 'floor') return `Floor ${broadcast.floor ?? ''}`.trim();
  if (broadcast.scope === 'zone') return broadcast.zone_id ? broadcast.zone_id.replace(/_/g, ' ') : 'Targeted zone';
  return 'Venue-wide';
}

function getBroadcastResponseMeta(responseType) {
  switch (responseType) {
    case 'safe':
      return { label: "I'm safe", description: 'Marks you safe and lowers follow-up priority.', status: 'resolved' };
    case 'need_help':
      return { label: 'Need help', description: 'Alerts the ops team that you still need assistance.', status: 'received' };
    case 'trapped':
      return { label: "I'm trapped", description: 'Escalates your request to critical.', status: 'escalated' };
    case 'cannot_evacuate':
      return { label: "Can't evacuate", description: 'Flags access or mobility support needs.', status: 'escalated' };
    default:
      return { label: 'Check in', description: 'Send a status update to the command center.', status: 'received' };
  }
}

function CrisisChatbot({ location, context, activeHazards }) {
  const chatRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [chatStatus, setChatStatus] = useState('connecting');
  const [chatStatusDetail, setChatStatusDetail] = useState('Connecting to live support');
  const initDone = useRef(false);

  const hazardContext = useMemo(() => ({
    location,
    reportType: context.reportType,
    hazards: activeHazards.map((hazard) => ({
      node: hazard.node,
      severity: hazard.severity,
    })),
  }), [activeHazards, context.reportType, location]);

  const askAssistant = useCallback(async (message, history = []) => {
    const payload = {
      message,
      location,
      context: {
        ...hazardContext,
        conversation: history.slice(-6).map((item) => ({ role: item.role, text: item.text })),
      },
    };

    try {
      const response = await sendGuestChatMessage(payload);
      const mode = response.mode || 'live';
      if (mode === 'live' && !response.warning) {
        setChatStatus('online');
        setChatStatusDetail('Connected to live support');
      } else {
        setChatStatus('degraded');
        setChatStatusDetail(response.warning || 'Using safe fallback guidance');
      }
      return {
        text: response.reply || response.message || getLocalReply(message),
        items: response.action_items || [],
        staff: response.assigned_staff || '',
        mode,
        warning: response.warning || '',
      };
    } catch (error) {
      console.warn('[GuestChat] Falling back to local response:', error);
      setChatStatus('offline');
      setChatStatusDetail(getApiErrorMessage(error, 'Backend unavailable or Gemini API not configured'));
      return {
        text: getLocalReply(message),
        items: ['Move to a safe area', 'Wait for staff guidance'],
        staff: 'Security Team',
        mode: 'offline',
      warning: getApiErrorMessage(error, 'Backend unavailable or Gemini API not configured'),
      };
    }
  }, [hazardContext, location]);

  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    (async () => {
      const hazardText = activeHazards.length
        ? `Hazards near you: ${activeHazards.map((hazard) => hazard.node?.replace(/_/g, ' ')).join(', ')}.`
        : 'No active hazards reported.';
      const initMessage = `SYSTEM_INIT | Location: ${location || 'unknown'} | ${hazardText}`;
      const reply = await askAssistant(initMessage, []);
      setMessages([{ role: 'assistant', text: reply.text, items: reply.items, staff: reply.staff }]);
      triggerHaptic('heavy');
      if (reply.mode === 'live' && !reply.warning) {
        setChatStatus('online');
        setChatStatusDetail('Connected to live support');
      }
      setLoading(false);
    })();
  }, [activeHazards, askAssistant, location]);

  useEffect(() => {
    if (!chatRef.current) return;
    const id = setTimeout(() => {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }, 80);
    return () => clearTimeout(id);
  }, [messages, loading]);

  const sendMessage = async (textOverride) => {
    const text = textOverride || input;
    if (!text.trim() || loading) return;

    const userMessage = { role: 'user', text };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);

    const reply = await askAssistant(text, nextMessages);
    setMessages((current) => [...current, { role: 'assistant', text: reply.text, items: reply.items, staff: reply.staff }]);
    if (reply.mode === 'live' && !reply.warning) {
      setChatStatus('online');
      setChatStatusDetail('Connected to live support');
    }
    setLoading(false);
    triggerHaptic('light');
  };

  const startVoice = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice input is not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event) => {
      if (event.results[0]) {
        setInput(event.results[0][0].transcript);
      }
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.start();
  };

  return (
    <section className="guest-chat-card" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-outline-variant)' }}>
      <div className="guest-chat-header">
        <div className="guest-chat-avatar">AI</div>
        <div>
          <div className="guest-chat-title">Aegis Assistant</div>
          <div className="guest-chat-status">
            <span
              className="status-dot-sm"
              style={{
                background: chatStatus === 'online'
                  ? 'var(--color-success)'
                  : chatStatus === 'degraded'
                    ? 'var(--color-warning)'
                    : 'var(--color-error)',
              }}
            />
            <span>{chatStatus === 'online' ? 'Live support' : chatStatus === 'degraded' ? 'Limited support' : 'Backend offline'}</span>
          </div>
          <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.25rem' }}>{chatStatusDetail}</div>
        </div>
      </div>

      <div ref={chatRef} className="guest-chat-messages">
        {messages.map((message, index) => (
          <div key={index} className={`guest-chat-row ${message.role === 'user' ? 'user' : 'assistant'}`}>
            <div className={`guest-chat-bubble ${message.role}`}>
              <div>{message.text}</div>
              {message.items?.length > 0 && (
                <ul className="guest-chat-items">
                  {message.items.map((item) => <li key={item}>{item}</li>)}
                </ul>
              )}
              {message.staff && <div className="guest-chat-staff">Assigned: {message.staff}</div>}
            </div>
          </div>
        ))}

        {loading && (
          <div className="guest-chat-row assistant">
            <div className="guest-chat-bubble assistant typing">Thinking</div>
          </div>
        )}
      </div>

      <div className="guest-chat-input">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && !event.shiftKey && sendMessage()}
          placeholder="Describe what you need"
          aria-label="Guest chat input"
        />
        <button type="button" className="btn-tonal" onClick={startVoice} title={isListening ? 'Listening' : 'Voice input'}>
          Mic
        </button>
        <button type="button" className="btn-filled" onClick={() => sendMessage()} disabled={loading || !input.trim()}>
          Send
        </button>
      </div>
    </section>
  );
}

export default function GuestPortal() {
  const { incidents } = useIncidents();
  const [reportType, setReportType] = useState('fire');
  const [location, setLocation] = useState('');
  const [details, setDetails] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [submittedReport, setSubmittedReport] = useState(null);
  const [locationShared, setLocationShared] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeBroadcast, setActiveBroadcast] = useState(null);
  const [broadcastStatus, setBroadcastStatus] = useState('loading');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastSubmitting, setBroadcastSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  const activeHazards = useMemo(() => incidents
    .filter((incident) => incident.status !== 'resolved' && incident.classification?.severity !== 'low')
    .map((incident) => ({
      node: incident.classification?.location?.toLowerCase().replace(/ /g, '_'),
      severity: incident.classification?.severity,
    })), [incidents]);

  const hasAlert = activeHazards.length > 0;

  useEffect(() => {
    let mounted = true;
    const loadBroadcast = async () => {
      try {
        const current = await fetchActiveBroadcast();
        if (!mounted) return;
        setActiveBroadcast(current || null);
        setBroadcastStatus(current ? (current.fallback ? 'cached' : 'live') : 'idle');
        setBroadcastMessage(current
          ? current.fallback
            ? 'Showing the latest cached broadcast until the live service reconnects.'
            : ''
          : 'No active guest broadcast right now.');
      } catch (error) {
        if (!mounted) return;
        setBroadcastStatus('offline');
        setBroadcastMessage(getApiErrorMessage(error, 'Unable to load live safety broadcast'));
      }
    };

    loadBroadcast();
    const interval = setInterval(loadBroadcast, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const sendBroadcastAck = async (responseType) => {
    if (!activeBroadcast) {
      alert('No active broadcast to acknowledge yet.');
      return;
    }
    setBroadcastSubmitting(true);
    try {
      const meta = getBroadcastResponseMeta(responseType);
      await acknowledgeBroadcast(activeBroadcast.id, {
        guest_name: 'Guest',
        guest_location: location || 'Unknown',
        guest_zone_id: null,
        response_type: responseType,
        message: meta.label,
        contact_method: 'app',
        language_preference: 'en',
      });
      setBroadcastMessage(`${meta.label} sent to operations.`);
      setActiveBroadcast((current) => (
        current ? {
          ...current,
          ack_counts: {
            ...(current.ack_counts || {}),
            [responseType]: (current.ack_counts?.[responseType] || 0) + 1,
          },
          latest_ack: {
            response_type: responseType,
            message: meta.label,
            timestamp: new Date().toISOString(),
          },
        } : current
      ));
      triggerHaptic('heavy');
    } catch (error) {
      alert(getApiErrorMessage(error));
    } finally {
      setBroadcastSubmitting(false);
    }
  };

  const shareLocation = () => {
    if (!navigator.geolocation) {
      setLocation('Unavailable');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocation(`${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`);
        setLocationShared(true);
        triggerHaptic('light');
      },
      () => setLocation('Manual entry needed'),
      { enableHighAccuracy: false, timeout: 4000 },
    );
  };

  const onImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (readerEvent) => setImagePreview(readerEvent.target.result);
    reader.readAsDataURL(file);
  };

  const submitReport = async () => {
    if (!details.trim()) return;
    setSubmitting(true);

    try {
      const created = await createIncidentReport({
        reportText: `Guest Report [${reportType.toUpperCase()}]: ${details}`,
        locationHint: location,
        reporterRole: 'guest',
        imageFile,
      });
      setSubmittedReport(created);
      triggerHaptic('heavy');
    } catch (error) {
      alert(getApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const markSafe = async () => {
    try {
      if (activeBroadcast) {
        await sendBroadcastAck('safe');
        alert('Safety confirmation sent.');
      } else {
        await createIncidentReport({
          reportText: 'I AM SAFE - Guest check-in',
          locationHint: location,
          reporterRole: 'guest',
        });
        triggerHaptic('heavy');
        alert('Safety confirmation sent.');
      }
    } catch (error) {
      alert(getApiErrorMessage(error));
    }
  };

  const styles = {
    shell: {
      minHeight: '100vh',
      background: 'linear-gradient(180deg, var(--color-surface-dim) 0%, var(--color-surface) 100%)',
      color: 'var(--color-on-surface)',
      fontFamily: "'Google Sans', 'Roboto', sans-serif",
    },
    navbar: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 16,
      padding: '14px 24px',
      background: 'var(--color-nav)',
      borderBottom: '1px solid var(--color-nav-border)',
      backdropFilter: 'blur(12px)',
      position: 'sticky',
      top: 0,
      zIndex: 5,
    },
    logo: {
      fontWeight: 800,
      fontSize: 18,
      letterSpacing: '-0.02em',
      color: 'var(--color-on-surface)',
    },
    alertBanner: {
      background: 'linear-gradient(90deg, rgba(234,67,53,0.18), rgba(251,188,4,0.10))',
      padding: '12px 24px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      fontSize: 14,
      fontWeight: 700,
      color: 'var(--color-on-surface)',
      borderBottom: '1px solid rgba(234,67,53,0.25)',
    },
    broadcastBanner: {
      margin: '18px 24px 0',
      maxWidth: 1400,
      marginInline: 'auto',
      background: 'linear-gradient(135deg, rgba(66,133,244,0.10), rgba(52,168,83,0.10))',
      border: '1px solid rgba(66,133,244,0.20)',
      borderRadius: 22,
      padding: '18px 20px',
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) auto auto',
      gap: 16,
      alignItems: 'center',
      boxShadow: 'var(--shadow-1)',
    },
    broadcastActions: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: 8,
      minWidth: 240,
    },
    broadcastChip: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 10px',
      borderRadius: 999,
      background: 'var(--color-surface)',
      border: '1px solid var(--color-outline-variant)',
      fontSize: 12,
      color: 'var(--color-on-surface-variant)',
      fontWeight: 600,
    },
    hero: {
      padding: '24px 24px 10px',
      maxWidth: 1400,
      margin: '0 auto',
      display: 'flex',
      justifyContent: 'space-between',
      gap: 16,
      alignItems: 'flex-end',
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) 420px',
      gap: 24,
      padding: '16px 24px 24px',
      maxWidth: 1400,
      margin: '0 auto',
      alignItems: 'start',
    },
    card: {
      background: 'var(--color-surface)',
      border: '1px solid var(--color-outline-variant)',
      borderRadius: 20,
      padding: 24,
      boxShadow: 'var(--shadow-1)',
    },
    label: {
      color: 'var(--color-on-surface-variant)',
      fontSize: 12,
      fontWeight: 700,
      marginBottom: 8,
      display: 'block',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
    },
    input: {
      width: '100%',
      boxSizing: 'border-box',
      background: 'var(--color-surface)',
      border: '1px solid var(--color-outline)',
      borderRadius: 12,
      padding: '12px 14px',
      color: 'var(--color-on-surface)',
      fontSize: 14,
      outline: 'none',
    },
  };

  return (
    <div style={styles.shell}>
      <header style={styles.navbar}>
        <div style={styles.logo}>Aegis CrisisHub</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {hasAlert && (
            <span style={{ background: 'rgba(234,67,53,0.14)', color: 'var(--color-danger-dark)', padding: '5px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
              {activeHazards.length} Active Hazard{activeHazards.length > 1 ? 's' : ''}
            </span>
          )}
          <span className="status-dot-sm" />
          <span style={{ fontSize: 12, color: 'var(--color-success-dark)', fontWeight: 700 }}>LIVE SUPPORT</span>
        </div>
      </header>

      {hasAlert && (
        <div style={styles.alertBanner}>
          <span style={{ fontSize: 18 }}>Alert</span>
          <span>Critical conditions detected. Follow staff instructions and move to the nearest safe exit.</span>
        </div>
      )}

      {activeBroadcast && (
        <section className="guest-broadcast-banner" style={styles.broadcastBanner}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span
                className="status-dot-sm"
                style={{
                  background: broadcastStatus === 'live'
                    ? 'var(--color-success)'
                    : broadcastStatus === 'cached'
                      ? 'var(--color-warning)'
                      : 'var(--color-error)',
                }}
              />
              <strong style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 12 }}>
                {broadcastStatus === 'cached' ? 'Cached safety broadcast' : 'Live safety broadcast'}
              </strong>
              <span style={{ fontSize: 12, color: 'var(--color-on-surface-variant)' }}>{formatBroadcastScope(activeBroadcast)}</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.35 }}>{activeBroadcast.title || 'Guest safety notice'}</div>
            <p style={{ margin: 0, color: 'var(--color-on-surface-variant)', lineHeight: 1.6 }}>{activeBroadcast.message}</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
              {(activeBroadcast.draft?.guest_actions || ['Stay calm', 'Follow staff directions']).slice(0, 3).map((action) => (
                <span key={action} style={styles.broadcastChip}>{action}</span>
              ))}
            </div>
          </div>

          <div className="guest-broadcast-actions" style={styles.broadcastActions}>
            <button className="btn-filled btn-sm" onClick={() => sendBroadcastAck('safe')} disabled={broadcastSubmitting}>I’m safe</button>
            <button className="btn-tonal btn-sm" onClick={() => sendBroadcastAck('need_help')} disabled={broadcastSubmitting}>Need help</button>
            <button className="btn-tonal btn-sm" onClick={() => sendBroadcastAck('trapped')} disabled={broadcastSubmitting}>I’m trapped</button>
            <button className="btn-tonal btn-sm" onClick={() => sendBroadcastAck('cannot_evacuate')} disabled={broadcastSubmitting}>Can’t evacuate</button>
          </div>

          <div style={{ minWidth: 180, textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: 'var(--color-on-surface-variant)', marginBottom: 6 }}>Ops response</div>
            <div style={{ fontWeight: 700, color: 'var(--color-on-surface)' }}>
              {broadcastStatus === 'live' ? 'Connected' : broadcastStatus === 'cached' ? 'Cached' : broadcastStatus === 'offline' ? 'Offline' : 'Loading'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-on-surface-variant)', marginTop: 4 }}>
              {broadcastMessage || `Safe: ${activeBroadcast.ack_counts?.safe || 0} · Help: ${activeBroadcast.ack_counts?.need_help || 0} · Trapped: ${activeBroadcast.ack_counts?.trapped || 0}`}
            </div>
          </div>
        </section>
      )}

      <section style={styles.hero}>
        <div>
          <div className="page-kicker">Guest assistance</div>
          <h1 className="page-title" style={{ marginTop: 4 }}>Emergency Assistance Portal</h1>
          <p className="page-subtitle" style={{ marginTop: 8, maxWidth: 760 }}>
            Report an incident, request help, or share your location. The assistant uses the active venue context to give immediate guidance.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn-tonal btn-sm" onClick={shareLocation}>Share my location</button>
          <button className="btn-filled btn-sm" onClick={markSafe}>I'm safe</button>
        </div>
      </section>

      <div style={styles.grid} className="guest-grid">
        <div style={{ minWidth: 0 }}>
          {submittedReport ? (
            <div style={{ ...styles.card, textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 40, fontWeight: 800, marginBottom: 12, color: 'var(--color-success-dark)' }}>Report submitted</div>
              <p style={{ color: 'var(--color-on-surface-variant)', margin: '0 0 18px' }}>
                Responders have been notified. Stay in a safe place and keep your phone nearby.
              </p>
              <div style={{ background: 'var(--color-surface-dim)', border: '1px solid var(--color-outline-variant)', borderRadius: 14, padding: 16, textAlign: 'left' }}>
                <div style={{ fontSize: 12, color: 'var(--color-on-surface-variant)', marginBottom: 6 }}>AI classification</div>
                <div style={{ fontWeight: 700, color: 'var(--color-on-surface)' }}>{submittedReport.classification?.summary || 'Processing'}</div>
                {submittedReport.classification?.ai_reasoning && (
                  <div style={{ marginTop: 8, color: 'var(--color-primary-dark)', fontSize: 13, lineHeight: 1.6 }}>
                    {submittedReport.classification.ai_reasoning}
                  </div>
                )}
              </div>
              <button className="btn-filled" style={{ marginTop: 20 }} onClick={() => { setSubmittedReport(null); setDetails(''); setImageFile(null); setImagePreview(null); }}>
                Submit another report
              </button>
            </div>
          ) : (
            <div style={styles.card}>
              <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>Report an incident</h2>

              <label style={styles.label}>Emergency type</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                {REPORT_TYPES.map((type) => {
                  const selected = reportType === type.id;
                  return (
                    <button
                      key={type.id}
                      onClick={() => { setReportType(type.id); triggerHaptic('light'); }}
                      style={{
                        padding: '14px 16px',
                        borderRadius: 14,
                        border: `1px solid ${selected ? type.color : 'var(--color-outline-variant)'}`,
                        background: selected ? `${type.color}18` : 'var(--color-surface-dim)',
                        color: 'var(--color-on-surface)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        fontWeight: 600,
                        fontSize: 14,
                        transition: 'transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease',
                        boxShadow: selected ? `0 8px 24px ${type.color}22` : 'none',
                        transform: selected ? 'translateY(-1px)' : 'translateY(0)',
                      }}
                    >
                      <span style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: selected ? type.color : 'var(--color-surface)',
                        color: selected ? '#fff' : type.color,
                        fontSize: 12,
                        fontWeight: 800,
                      }}>
                        {type.icon}
                      </span>
                      <span>{type.label}</span>
                    </button>
                  );
                })}
              </div>

              <label style={styles.label}>What happened</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
                {SUB_OPTIONS[reportType].map((option) => {
                  const selected = details === option;
                  return (
                    <button
                      key={option}
                      onClick={() => { setDetails(option); triggerHaptic('light'); }}
                      style={{
                        padding: '10px 12px',
                        background: selected ? 'var(--color-primary-light)' : 'var(--color-surface-dim)',
                        border: `1px solid ${selected ? 'var(--color-primary)' : 'var(--color-outline-variant)'}`,
                        borderRadius: 10,
                        color: selected ? 'var(--color-primary-dark)' : 'var(--color-on-surface-variant)',
                        cursor: 'pointer',
                        fontSize: 13,
                        textAlign: 'left',
                        transition: 'all 160ms ease',
                      }}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>

              <label style={styles.label}>Your location</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                <input
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="Lobby, Room 204, Pool Deck..."
                  style={styles.input}
                />
                <button
                  type="button"
                  onClick={shareLocation}
                  title="Share GPS location"
                  className={locationShared ? 'btn-filled' : 'btn-tonal'}
                  style={{ minWidth: 54, paddingInline: 0 }}
                >
                  Pin
                </button>
              </div>

              <label style={styles.label}>Attach photo evidence</label>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '1.5px dashed var(--color-outline)',
                  borderRadius: 16,
                  padding: 18,
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: 'var(--color-surface-dim)',
                  marginBottom: 20,
                  transition: 'border-color 160ms ease, background 160ms ease',
                }}
              >
                {imagePreview ? (
                  <div>
                    <img src={imagePreview} alt="Preview" style={{ maxHeight: 160, borderRadius: 12, objectFit: 'cover', maxWidth: '100%' }} />
                    <div style={{ color: 'var(--color-success-dark)', fontSize: 12, marginTop: 8 }}>Image attached</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>Photo</div>
                    <div style={{ color: 'var(--color-on-surface-variant)', fontSize: 13 }}>Tap to upload or take a photo</div>
                    <div style={{ color: 'var(--color-on-surface-variant)', fontSize: 11, marginTop: 4 }}>The assistant will include it in the report.</div>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={onImageChange} style={{ display: 'none' }} />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="btn-danger btn-large"
                  onClick={submitReport}
                  disabled={submitting || !details.trim()}
                  style={{ flex: 1 }}
                >
                  {submitting ? 'Sending...' : 'Send report'}
                </button>
                <button className="btn-filled btn-large" onClick={markSafe} style={{ flex: 1, background: 'var(--color-success)' }}>
                  I'm safe
                </button>
              </div>
            </div>
          )}
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          <CrisisChatbot location={location} context={{ reportType }} activeHazards={activeHazards} />

          <div style={styles.card}>
            <GuestSafeRoute hazards={activeHazards} userLocation={locationShared} />
            {!locationShared && (
              <button onClick={shareLocation} className="btn-tonal" style={{ width: '100%', marginTop: 12 }}>
                Share GPS for more precise routing
              </button>
            )}
          </div>
        </aside>
      </div>

      <style>{`
        .guest-grid { grid-template-columns: minmax(0, 1fr) 420px; }
        .guest-chat-card { display: flex; flex-direction: column; border-radius: 20px; overflow: hidden; min-height: 500px; box-shadow: var(--shadow-1); }
        .guest-chat-header { display: flex; align-items: center; gap: 12px; padding: 16px 18px; background: var(--color-surface-dim); border-bottom: 1px solid var(--color-outline-variant); }
        .guest-chat-avatar { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--color-primary-light); color: var(--color-primary-dark); font-weight: 800; }
        .guest-chat-title { font-weight: 700; color: var(--color-on-surface); }
        .guest-chat-status { display: flex; align-items: center; gap: 6px; margin-top: 2px; font-size: 11px; color: var(--color-on-surface-variant); }
        .guest-chat-messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; background: var(--color-surface); }
        .guest-chat-row { display: flex; }
        .guest-chat-row.user { justify-content: flex-end; }
        .guest-chat-row.assistant { justify-content: flex-start; }
        .guest-chat-bubble { max-width: 88%; padding: 12px 14px; border-radius: 16px; font-size: 13px; line-height: 1.55; word-break: break-word; }
        .guest-chat-bubble.user { background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark)); color: #fff; border-bottom-right-radius: 4px; }
        .guest-chat-bubble.assistant { background: var(--color-surface-dim); color: var(--color-on-surface); border: 1px solid var(--color-outline-variant); border-bottom-left-radius: 4px; }
        .guest-chat-items { margin: 8px 0 0 0; padding-left: 18px; color: var(--color-primary-dark); }
        .guest-chat-items li { margin-top: 4px; }
        .guest-chat-staff { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--color-outline-variant); font-size: 11px; color: var(--color-on-surface-variant); }
        .guest-chat-input { display: flex; gap: 8px; padding: 12px; background: var(--color-surface-dim); border-top: 1px solid var(--color-outline-variant); }
        .guest-chat-input input { flex: 1; min-width: 0; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--color-outline); background: var(--color-surface); color: var(--color-on-surface); }
        .guest-chat-input input:focus { outline: none; border-color: var(--color-primary); box-shadow: 0 0 0 4px var(--color-primary-light); }
        .guest-chat-input .btn-tonal, .guest-chat-input .btn-filled { min-width: 72px; }
        @keyframes dash { to { stroke-dashoffset: -30; } }
        .guest-broadcast-banner { box-sizing: border-box; }
        @media (max-width: 1024px) {
          .guest-grid { grid-template-columns: 1fr !important; }
          .guest-grid > aside { order: 2; }
          .guest-broadcast-banner { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 768px) {
          .guest-chat-card { min-height: 420px; }
          .guest-broadcast-banner { padding: 16px !important; }
          .guest-broadcast-actions { grid-template-columns: 1fr !important; min-width: 0 !important; }
        }
      `}</style>
    </div>
  );
}
