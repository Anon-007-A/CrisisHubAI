// 5 realistic demo incidents for offline/demo mode
// Timestamps are computed relative to now for fresh time-ago labels

const now = Date.now();
const mins = (n) => new Date(now - n * 60_000).toISOString();

const DEMO_INCIDENTS = [
  {
    id: 'demo-001',
    timestamp: mins(2),
    input: {
      report_text: 'Heavy smoke detected in the kitchen area. Guests are evacuating the restaurant. Fire alarm triggered automatically by ceiling sensors.',
      location_hint: 'Kitchen',
      reporter_role: 'staff',
    },
    classification: {
      incident_type: 'fire',
      severity: 'critical',
      location: 'Kitchen',
      summary: 'Active fire detected via thermal signature analysis. Ceiling sprinklers activated. Smoke spreading toward Corridor 1F-B. Immediate evacuation required.',
      responders_needed: ['fire_team', 'medical', 'management', 'security'],
      evacuation_required: true,
      suggested_safe_zone: 'South Main Exit',
      confidence: 0.96,
      ai_reasoning: 'Multimodal analysis detected smoke plumes in image + thermal anomaly keywords. Cross-referenced with venue sensor data: ceiling sprinklers triggered in Kitchen zone at 23:14 UTC. Severity escalated to CRITICAL due to enclosed space and proximity to Restaurant with 45+ guests.',
    },
    status: 'responding',
    assigned_responders: ['Alex Chen', 'Sarah Kim', 'Priya Nair', 'Mike Torres'],
    evacuation_route: {
      path: ['kitchen', 'stairwell_b', 'exit_east'],
      exit: 'exit_east',
      steps: ['Kitchen', 'Stairwell B', 'East Service Exit'],
    },
    autonomous_actions: [
      { action: 'dispatch', detail: 'Fire Team 1 auto-dispatched via North Stairwell', timestamp: mins(1.8) },
      { action: 'alert', detail: 'Google Chat webhook sent to #fire-response', timestamp: mins(1.7) },
      { action: 'evacuate', detail: 'A* pathfinding rerouted guests away from Corridor 1F-B', timestamp: mins(1.5) },
      { action: 'escalate', detail: 'Local fire department notified via external dispatch', timestamp: mins(1.2) },
    ],
    mttm_seconds: null,
  },
  {
    id: 'demo-002',
    timestamp: mins(8),
    input: {
      report_text: 'Guest collapsed in the lobby area near the front desk. Appears unconscious, breathing but unresponsive. Possible cardiac event.',
      location_hint: 'Main Lobby',
      reporter_role: 'staff',
    },
    classification: {
      incident_type: 'medical',
      severity: 'high',
      location: 'Main Lobby',
      summary: 'Unconscious guest near Front Desk. Cardiac event suspected based on witness reports. AED deployment recommended. Medical team dispatched.',
      responders_needed: ['medical', 'security'],
      evacuation_required: false,
      suggested_safe_zone: null,
      confidence: 0.89,
      ai_reasoning: 'Text analysis identified cardiac emergency keywords (collapsed, unconscious, unresponsive). No visual hazards detected. Location mapped to Main Lobby zone. Severity set to HIGH - not CRITICAL as breathing confirmed. AED station located 12m from incident at Front Desk.',
    },
    status: 'responding',
    assigned_responders: ['Sarah Kim', 'James Wu'],
    evacuation_route: null,
    autonomous_actions: [
      { action: 'dispatch', detail: 'Medical responder Sarah Kim dispatched from Clinic', timestamp: mins(7.5) },
      { action: 'alert', detail: 'Google Chat webhook sent to #medical-response', timestamp: mins(7.4) },
      { action: 'equipment', detail: 'AED unit at Front Desk flagged for immediate retrieval', timestamp: mins(7.3) },
    ],
    mttm_seconds: null,
  },
  {
    id: 'demo-003',
    timestamp: mins(22),
    input: {
      report_text: 'Suspicious individual attempting to access restricted areas near the Pool Deck. Refuses to show room key. Acting aggressively toward staff.',
      location_hint: 'Pool Deck',
      reporter_role: 'staff',
    },
    classification: {
      incident_type: 'security',
      severity: 'medium',
      location: 'Pool Deck',
      summary: 'Unauthorized access attempt at Pool Deck. Individual displaying aggressive behavior. Security team dispatched for confrontation de-escalation.',
      responders_needed: ['security'],
      evacuation_required: false,
      suggested_safe_zone: null,
      confidence: 0.82,
      ai_reasoning: 'Behavioral keywords flagged: "aggressive", "refuses". No weapon indicators detected — severity limited to MEDIUM. Location verified as Pool Deck, restricted zone after 22:00. Single security responder sufficient for de-escalation protocol.',
    },
    status: 'responding',
    assigned_responders: ['Mike Torres'],
    evacuation_route: null,
    autonomous_actions: [
      { action: 'dispatch', detail: 'Security officer Mike Torres dispatched', timestamp: mins(21) },
      { action: 'alert', detail: 'Google Chat webhook sent to #security', timestamp: mins(21) },
    ],
    mttm_seconds: null,
  },
  {
    id: 'demo-004',
    timestamp: mins(45),
    input: {
      report_text: 'Fire alarm went off in Conference Room A but no smoke or fire visible. Appears to be a false alarm triggered by steam from catering setup.',
      location_hint: 'Conference A',
      reporter_role: 'staff',
    },
    classification: {
      incident_type: 'false_alarm',
      severity: 'low',
      location: 'Conference A',
      summary: 'False alarm in Conference A. Steam from catering equipment triggered smoke detector. No actual hazard present. System reset recommended.',
      responders_needed: ['security'],
      evacuation_required: false,
      suggested_safe_zone: null,
      confidence: 0.94,
      ai_reasoning: 'Report explicitly mentions "no smoke or fire visible" and identifies catering steam as probable cause. Cross-referenced with venue alarm log: single detector triggered (zone C-A-01), no corroborating sensors. Classified as FALSE_ALARM with 94% confidence.',
    },
    status: 'resolved',
    assigned_responders: ['James Wu'],
    evacuation_route: null,
    autonomous_actions: [
      { action: 'dispatch', detail: 'Security officer dispatched for verification', timestamp: mins(44) },
      { action: 'resolve', detail: 'Confirmed false alarm, detector reset', timestamp: mins(35) },
    ],
    mttm_seconds: 600,
  },
  {
    id: 'demo-005',
    timestamp: mins(90),
    input: {
      report_text: 'Water leak detected in Room 201 on the second floor. Water seeping under the door into the 2F corridor. Possible pipe burst.',
      location_hint: 'Room 201',
      reporter_role: 'guest',
    },
    classification: {
      incident_type: 'security',
      severity: 'medium',
      location: 'Room 201',
      summary: 'Water leak / pipe burst in Room 201, 2F. Water spreading to corridor. Maintenance and management dispatched. Power isolation recommended.',
      responders_needed: ['security', 'management'],
      evacuation_required: false,
      suggested_safe_zone: null,
      confidence: 0.78,
      ai_reasoning: 'Infrastructure damage detected: "pipe burst", "water seeping". Classified as SECURITY (property damage). Severity MEDIUM as no immediate life threat but escalation risk if electrical systems are affected. Recommended isolating power to 2F wing as precaution.',
    },
    status: 'resolved',
    assigned_responders: ['Priya Nair', 'Mike Torres'],
    evacuation_route: null,
    autonomous_actions: [
      { action: 'dispatch', detail: 'Management + security dispatched', timestamp: mins(88) },
      { action: 'alert', detail: 'Maintenance team notified via Google Chat', timestamp: mins(87) },
      { action: 'resolve', detail: 'Pipe isolated, water cleanup initiated', timestamp: mins(60) },
    ],
    mttm_seconds: 1800,
  },
];

export default DEMO_INCIDENTS;
