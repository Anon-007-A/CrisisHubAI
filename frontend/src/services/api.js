import axios from 'axios';
import { DEMO_VENUE_LAYOUT } from '../data/venueLayout';
import { MOCK_RESPONDERS } from '../lib/mockData';

const API_BASE_URL = "https://crisishub-backend-218461081005.asia-south1.run.app";
const BROADCAST_CACHE_KEY = 'crisisHub.latestBroadcast';
const BROADCAST_FEED_CACHE_KEY = 'crisisHub.broadcastFeed';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 5000,
});

// Add Authorization header to every request
apiClient.interceptors.request.use((config) => {
  const token = import.meta.env.VITE_CRISISUB_API_KEY || 'demo-key-2026';
  config.headers.Authorization = `Bearer ${token}`;
  return config;
});

function unwrapError(error, fallbackMessage) {
  return error?.response?.data?.detail || error?.message || fallbackMessage;
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readStoredJson(key, fallback = null) {
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredJson(key, value) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota / privacy mode issues.
  }
}

function cacheBroadcast(broadcast) {
  if (!broadcast) return broadcast;
  const feed = readStoredJson(BROADCAST_FEED_CACHE_KEY, []);
  const nextFeed = [broadcast, ...feed.filter((item) => item.id !== broadcast.id)].slice(0, 10);
  writeStoredJson(BROADCAST_CACHE_KEY, broadcast);
  writeStoredJson(BROADCAST_FEED_CACHE_KEY, nextFeed);
  return broadcast;
}

function getCachedBroadcast() {
  return readStoredJson(BROADCAST_CACHE_KEY, null);
}

function getCachedBroadcastFeed() {
  return readStoredJson(BROADCAST_FEED_CACHE_KEY, []);
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function findZone(layout, value) {
  if (!value) return null;
  const zones = layout?.zones || [];
  const target = normalizeText(value);
  return zones.find((zone) => {
    const id = normalizeText(zone.id);
    const name = normalizeText(zone.name);
    return target === id || target === name || target.includes(id) || id.includes(target);
  }) || null;
}

function getOriginZone(payload) {
  const layout = DEMO_VENUE_LAYOUT;
  const incidentType = normalizeText(payload?.incident_type || 'security');
  const location = payload?.location;
  const explicit = findZone(layout, location);
  if (explicit) return explicit;

  const fallbackByType = {
    fire: 'kitchen',
    medical: 'lobby',
    security: 'front_desk',
    false_alarm: 'front_desk',
  };

  return findZone(layout, fallbackByType[incidentType] || 'lobby') || layout.zones[0];
}

function getSafeZone(payload, occupancyPercent) {
  const layout = DEMO_VENUE_LAYOUT;
  const requested = findZone(layout, payload?.safe_zone_id);
  if (requested && requested.zone_type === 'assembly_point') return requested;

  const assemblyPoints = layout.zones.filter((zone) => zone.zone_type === 'assembly_point');
  return assemblyPoints
    .slice()
    .sort((a, b) => (b.capacity || 0) - (a.capacity || 0) + ((occupancyPercent || 0) - (occupancyPercent || 0)))[0]
    || assemblyPoints[0]
    || null;
}

function distanceBetweenZones(zoneA, zoneB) {
  const a = zoneA?.coordinates;
  const b = zoneB?.coordinates;
  if (!a || !b) return 9999;
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2;
  const by = b.y + b.height / 2;
  return Math.hypot(ax - bx, ay - by);
}

function buildHazards(originZone, severity, incidentType, horizon, blockedExits) {
  const layout = DEMO_VENUE_LAYOUT;
  const depthLimit = Math.max(1, Math.ceil(horizon / 5));
  const zonesOnFloor = layout.zones.filter((zone) => zone.floor === originZone.floor);
  const sorted = zonesOnFloor
    .map((zone) => ({ zone, dist: distanceBetweenZones(originZone, zone) }))
    .sort((a, b) => a.dist - b.dist);

  const hazardZones = sorted
    .filter(({ zone }, idx) => idx < depthLimit + 2 && !blockedExits.includes(zone.id))
    .map(({ zone }, idx) => ({
      zone_id: zone.id,
      name: zone.name,
      floor: zone.floor,
      severity: idx === 0 ? severity : severity === 'critical' ? 'high' : severity,
      intensity: Number(Math.max(0.2, 1 - idx * 0.18).toFixed(2)),
      incident_type: incidentType,
    }));

  if (!hazardZones.some((item) => item.zone_id === originZone.id)) {
    hazardZones.unshift({
      zone_id: originZone.id,
      name: originZone.name,
      floor: originZone.floor,
      severity,
      intensity: 1,
      incident_type: incidentType,
    });
  }

  return hazardZones;
}

function buildRoute(originZone, blockedExits) {
  const exits = DEMO_VENUE_LAYOUT.zones.filter((zone) => zone.zone_type === 'exit' && !blockedExits.includes(zone.id));
  if (!exits.length) {
    return { path: [originZone.id], exit: 'unknown', steps: [originZone.name], risk_cost: 999 };
  }

  const bestExit = exits
    .map((zone) => ({ zone, dist: distanceBetweenZones(originZone, zone) }))
    .sort((a, b) => a.dist - b.dist)[0]?.zone || exits[0];

  return {
    path: [originZone.id, bestExit.id],
    exit: bestExit.id,
    steps: [originZone.name, bestExit.name],
    risk_cost: Math.round(distanceBetweenZones(originZone, bestExit) / 25),
  };
}

function simulateResponders(originZone, delayMinutes, incidentType) {
  return MOCK_RESPONDERS.slice(0, 8).map((responder) => {
    const responderZone = findZone(DEMO_VENUE_LAYOUT, responder.zone_id || responder.location) || originZone;
    const roleBonus = incidentType === 'fire' && responder.role === 'fire_team'
      ? -1
      : incidentType === 'medical' && responder.role === 'medical'
        ? -1
        : 0;
    return {
      id: responder.id,
      name: responder.name,
      role: responder.role,
      current_zone_id: responderZone.id,
      projected_zone_id: originZone.id,
      eta_minutes: Math.max(1, Math.round(distanceBetweenZones(responderZone, originZone) / 120) + delayMinutes + roleBonus),
      projected_path: responderZone.id === originZone.id ? [originZone.id] : [responderZone.id, originZone.id],
      status: responder.status,
    };
  });
}

function buildPressureMap(originZone, hazardZones, blockedExits, evacuationTrigger, safeZoneId, occupancyPercent) {
  const hazardIds = new Set(hazardZones.map((item) => item.zone_id));
  const safeZone = safeZoneId ? findZone(DEMO_VENUE_LAYOUT, safeZoneId) : null;
  const pressure = {};

  DEMO_VENUE_LAYOUT.zones.forEach((zone) => {
    const dist = distanceBetweenZones(originZone, zone);
    const base = Math.max(0.08, 0.35 - (dist / 1000));
    const hazardBoost = hazardIds.has(zone.id) ? 0.36 : 0;
    const exitBoost = zone.zone_type === 'exit' && blockedExits.includes(zone.id) ? 0.18 : 0;
    const evacBoost = evacuationTrigger && zone.zone_type === 'assembly_point' ? 0.1 : 0;
    const safeBoost = safeZone && zone.id === safeZone.id ? 0.22 : 0;
    const crowdBoost = Math.min(0.35, (occupancyPercent / 100) * 0.35);
    pressure[zone.id] = Number(Math.min(1, base + hazardBoost + exitBoost + evacBoost + safeBoost + crowdBoost).toFixed(2));
  });

  return pressure;
}

function riskScore(hazardZones, pressureMap, blockedExits, delayMinutes, evacuationTrigger) {
  const peakPressure = Math.max(...Object.values(pressureMap), 0);
  const hazardWeight = hazardZones.reduce((sum, zone) => sum + (zone.intensity || 0), 0);
  const score = 28
    + hazardZones.length * 8
    + hazardWeight * 12
    + blockedExits.length * 7
    + delayMinutes * 4
    + (evacuationTrigger ? 8 : 0)
    + peakPressure * 20;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function recommendAction(incidentType, risk, evacuationTrigger, blockedExits) {
  if (incidentType === 'fire' || risk >= 70 || evacuationTrigger) {
    return blockedExits.length
      ? 'Escalate to evacuation immediately and reroute guests through the safest unblocked exits.'
      : 'Escalate to evacuation immediately and move guests toward the safest assembly point.';
  }
  if (incidentType === 'medical') {
    return 'Keep the area clear, deploy the nearest medical team, and maintain a controlled access corridor.';
  }
  if (incidentType === 'security') {
    return 'Stabilize access control, isolate the affected zone, and move nearby guests out of sight lines.';
  }
  return 'Continue monitoring, keep responders staged, and prepare for fast escalation if conditions change.';
}

function buildLocalTwinSimulation(payload) {
  const incidentType = normalizeText(payload?.incident_type || 'fire') || 'fire';
  const severity = normalizeText(payload?.severity || 'high') || 'high';
  const blockedExits = Array.isArray(payload?.blocked_exits) ? payload.blocked_exits : [];
  const responderDelayMinutes = Number(payload?.responder_delay_minutes || 0);
  const occupancyPercent = Number(payload?.occupancy_percent || 62);
  const evacuationTrigger = payload?.evacuation_trigger ?? incidentType === 'fire';
  const horizons = Array.isArray(payload?.horizons) && payload.horizons.length ? payload.horizons : [5, 10, 15];
  const originZone = getOriginZone(payload);
  const safeZone = getSafeZone(payload, occupancyPercent);
  const maxHorizon = Math.max(...horizons.map((value) => Number(value) || 0).filter((value) => value > 0));

  const hazardsByHorizon = {};
  const routeByHorizon = {};
  horizons.forEach((horizon) => {
    const key = String(Number(horizon) || 0);
    const hazards = buildHazards(originZone, severity, incidentType, Number(horizon) || 5, blockedExits);
    hazardsByHorizon[key] = hazards;
    routeByHorizon[key] = buildRoute(originZone, blockedExits);
  });

  const finalHazards = hazardsByHorizon[String(maxHorizon)] || hazardsByHorizon[String(horizons[0])] || [];
  const route = routeByHorizon[String(maxHorizon)] || buildRoute(originZone, blockedExits);
  const pressureMap = buildPressureMap(originZone, finalHazards, blockedExits, evacuationTrigger, safeZone?.id, occupancyPercent);
  const baselineSafeZone = getSafeZone({ safe_zone_id: safeZone?.id }, Math.min(occupancyPercent, 55));
  const baselinePressureMap = buildPressureMap(originZone, buildHazards(originZone, severity, incidentType, 5, []), [], incidentType === 'fire', baselineSafeZone?.id, Math.min(occupancyPercent, 55));
  const baselineRisk = riskScore(buildHazards(originZone, severity, incidentType, 5, []), baselinePressureMap, [], 0, incidentType === 'fire');
  const scenarioRisk = riskScore(finalHazards, pressureMap, blockedExits, responderDelayMinutes, evacuationTrigger);
  const projectedResponders = simulateResponders(originZone, responderDelayMinutes, incidentType);
  const briefing = {
    title: `${incidentType.replace(/_/g, ' ')} twin brief`,
    summary: `Risk is ${scenarioRisk}/100. The scenario shows ${finalHazards.length} active hazard zones and ${blockedExits.length} blocked exits.`,
    recommended_action: recommendAction(incidentType, scenarioRisk, evacuationTrigger, blockedExits),
    guest_announcement: evacuationTrigger
      ? 'Please follow staff directions, use the safest available exit, and move calmly to the nearest assembly point.'
      : 'Please remain calm, follow staff directions, and avoid the affected area while support is coordinated.',
    rationale: 'Local twin fallback generated from venue layout, responder travel time, exit availability, and crowd pressure.',
    mode: 'fallback',
  };

  return {
    snapshot_id: `twin-${Date.now().toString(36)}`,
    generated_at: new Date().toISOString(),
    request: {
      incident_id: payload?.incident_id || null,
      incident_type: incidentType,
      location: payload?.location || originZone.name,
      severity,
      blocked_exits: blockedExits,
      responder_delay_minutes: responderDelayMinutes,
      occupancy_percent: occupancyPercent,
      safe_zone_id: payload?.safe_zone_id || safeZone?.id || null,
      evacuation_trigger: evacuationTrigger,
      horizons,
    },
    baseline: {
      origin_zone: originZone.id,
      hazards: buildHazards(originZone, severity, incidentType, 5, []),
      route: buildRoute(originZone, []),
      routes: { '5': buildRoute(originZone, []) },
      pressure_map: baselinePressureMap,
      projected_responders: simulateResponders(originZone, 0, incidentType),
      safe_zone: {
        zone_id: baselineSafeZone?.id || null,
        name: baselineSafeZone?.name || null,
        capacity: baselineSafeZone?.capacity || 0,
        occupancy_percent: Math.min(occupancyPercent, 55),
        pressure: Number((Math.min(occupancyPercent, 55) / 100 * 0.65 + 0.25).toFixed(2)),
        remaining_capacity: Math.max(0, (baselineSafeZone?.capacity || 100) - Math.round((baselineSafeZone?.capacity || 100) * 0.5)),
      },
      safe_zone_choice_id: baselineSafeZone?.id || null,
      risk_score: baselineRisk,
      recommended_action: recommendAction(incidentType, baselineRisk, incidentType === 'fire', []),
      blocked_exits: [],
      occupancy_percent: Math.min(occupancyPercent, 55),
      responder_delay_minutes: 0,
      evacuation_trigger: incidentType === 'fire',
    },
    scenario: {
      origin_zone: originZone.id,
      hazards: hazardsByHorizon,
      route,
      routes: routeByHorizon,
      pressure_map: pressureMap,
      projected_responders: projectedResponders,
      safe_zone: {
        zone_id: safeZone?.id || null,
        name: safeZone?.name || null,
        capacity: safeZone?.capacity || 0,
        occupancy_percent: occupancyPercent,
        pressure: Number(Math.min(1, occupancyPercent / 100 * 0.65 + 0.25).toFixed(2)),
        remaining_capacity: Math.max(0, (safeZone?.capacity || 100) - Math.round((safeZone?.capacity || 100) * Math.min(1, occupancyPercent / 100 * 0.65 + 0.25))),
      },
      safe_zone_choice_id: safeZone?.id || null,
      risk_score: scenarioRisk,
      recommended_action: recommendAction(incidentType, scenarioRisk, evacuationTrigger, blockedExits),
      blocked_exits: blockedExits.slice().sort(),
      occupancy_percent: occupancyPercent,
      responder_delay_minutes: responderDelayMinutes,
      evacuation_trigger: evacuationTrigger,
    },
    deltas: {
      risk_score: scenarioRisk - baselineRisk,
      blocked_exits: blockedExits.length,
      safe_zone_pressure: 0,
      eta_shift_minutes: responderDelayMinutes,
    },
    metadata: {
      venue_name: DEMO_VENUE_LAYOUT?.venue?.name || 'Venue',
      zones: DEMO_VENUE_LAYOUT?.zones?.length || 0,
      responders: MOCK_RESPONDERS.length,
      mode: 'fallback',
    },
    briefing,
    share_text: `${briefing.title}: ${briefing.summary} Recommended action: ${briefing.recommended_action}`,
  };
}

function buildOfflineBroadcast(payload) {
  const timestamp = new Date().toISOString();
  const title = String(payload?.title || 'Guest safety notice').trim() || 'Guest safety notice';
  const message = String(payload?.message || payload?.guest_announcement || 'Please stay calm and follow staff directions.').trim()
    || 'Please stay calm and follow staff directions.';

  return {
    id: payload?.id || `broadcast-local-${Date.now()}`,
    timestamp,
    incident_id: payload?.incident_id || null,
    incident_type: payload?.incident_type || 'unknown',
    location: payload?.location || null,
    scope: payload?.scope || 'venue',
    floor: payload?.floor ?? null,
    zone_id: payload?.zone_id ?? null,
    tone: payload?.tone || 'calm',
    title,
    message,
    audience: payload?.audience || (payload?.scope === 'venue' ? 'All guests' : String(payload?.scope || 'targeted guests').replace(/_/g, ' ')),
    operator_name: payload?.operator_name || 'Operator',
    status: payload?.draft_only ? 'draft' : 'active',
    draft: {
      title,
      message,
      guest_actions: payload?.guest_actions || ['Stay calm', 'Follow staff directions', 'Move to the nearest safe exit'],
      recommended_action: payload?.recommended_action || null,
    },
    snapshot: payload?.snapshot || null,
    ack_counts: payload?.ack_counts || { safe: 0, need_help: 0, trapped: 0, cannot_evacuate: 0 },
    latest_ack: payload?.latest_ack || null,
    fallback: true,
  };
}

export async function fetchIncidents(limit = 20) {
  const response = await apiClient.get('/api/incidents', { params: { limit } });
  return response.data;
}

export async function fetchResponders() {
  const response = await apiClient.get('/api/responders');
  return response.data;
}

export async function fetchAuditLogs(limit = 100, incidentId = null) {
  const response = await apiClient.get('/api/audit', {
    params: { limit, incident_id: incidentId || undefined },
  });
  return response.data;
}

export async function createIncidentReport({ reportText, locationHint, reporterRole = 'guest', imageFile = null }) {
  const formData = new FormData();
  formData.set('report_text', reportText);
  formData.set('location_hint', locationHint);
  formData.set('reporter_role', reporterRole);
  if (imageFile) {
    formData.set('image', imageFile);
  }

  const response = await apiClient.post('/api/report', formData);
  return response.data;
}

export async function resolveIncident(incidentId) {
  const response = await apiClient.patch(`/api/incidents/${incidentId}/resolve`);
  return response.data;
}

export async function updateIncidentStatus(incidentId, status) {
  const response = await apiClient.patch(`/api/incidents/${incidentId}/status`, { status });
  return response.data;
}

export async function assignResponderToIncident(incidentId, responderId) {
  const response = await apiClient.patch(`/api/incidents/${incidentId}/assign`, { responder_id: responderId });
  return response.data;
}

export async function acknowledgeIncident(incidentId, payload = { actor: 'Operator', reason: 'Operator acknowledged' }) {
  const response = await apiClient.patch(`/api/incidents/${incidentId}/acknowledge`, payload);
  return response.data;
}

export async function verifyVideoEvent(eventId, payload = { actor: 'Operator', reason: 'Verified via CCTV interface' }) {
  const response = await apiClient.patch(`/api/video-events/${eventId}/verify`, payload);
  return response.data;
}

export async function generateAAR(incidentId) {
  const response = await apiClient.post(`/api/incidents/${incidentId}/aar`);
  return response.data;
}

export async function sendGuestChatMessage({ message, location, context = {} }) {
  const response = await apiClient.post('/api/guest/chat', { message, location, context });
  return response.data;
}

export async function simulateCrisisTwin(payload) {
  try {
    const response = await apiClient.post('/api/twin/simulate', payload);
    return response.data;
  } catch (error) {
    console.warn('Twin simulation API unavailable, using local fallback:', error?.response?.status || error?.message);
    return buildLocalTwinSimulation(payload);
  }
}

export async function fetchBroadcasts({ limit = 10, incidentId = null, activeOnly = false } = {}) {
  try {
    const response = await apiClient.get('/api/broadcasts', {
      params: {
        limit,
        incident_id: incidentId || undefined,
        active_only: activeOnly || undefined,
      },
    });
    const list = response.data || [];
    list.forEach((broadcast) => cacheBroadcast(broadcast));
    return list;
  } catch (error) {
    if (error?.response) throw error;
    const cached = getCachedBroadcastFeed();
    return incidentId
      ? cached.filter((broadcast) => broadcast.incident_id === incidentId)
      : cached.slice(0, limit);
  }
}

export async function fetchActiveBroadcast() {
  try {
    const response = await apiClient.get('/api/broadcasts/active');
    const broadcast = response.data || null;
    if (broadcast) cacheBroadcast(broadcast);
    return broadcast;
  } catch (error) {
    if (error?.response) throw error;
    return getCachedBroadcast();
  }
}

export async function createBroadcast(payload) {
  try {
    const response = await apiClient.post('/api/broadcasts', payload);
    if (response?.data?.broadcast && !payload?.draft_only) cacheBroadcast(response.data.broadcast);
    return response.data;
  } catch (error) {
    if (error?.response) throw error;
    const broadcast = buildOfflineBroadcast(payload);
    if (!payload?.draft_only) cacheBroadcast(broadcast);
    return { broadcast, draft: broadcast.draft };
  }
}

export async function acknowledgeBroadcast(broadcastId, payload) {
  try {
    const response = await apiClient.post(`/api/broadcasts/${broadcastId}/ack`, payload);
    const ackResult = response.data || {};
    const active = getCachedBroadcast();
    if (active && active.id === broadcastId) {
      const responseType = payload?.response_type || 'received';
      const updated = {
        ...active,
        ack_counts: {
          ...(active.ack_counts || {}),
          [responseType]: (active.ack_counts?.[responseType] || 0) + 1,
        },
        latest_ack: {
          response_type: responseType,
          message: payload?.message || responseType,
          timestamp: new Date().toISOString(),
        },
      };
      cacheBroadcast(updated);
    }
    return ackResult;
  } catch (error) {
    if (error?.response) throw error;
    const active = getCachedBroadcast();
    if (active && active.id === broadcastId) {
      const responseType = payload?.response_type || 'received';
      const updated = {
        ...active,
        ack_counts: {
          ...(active.ack_counts || {}),
          [responseType]: (active.ack_counts?.[responseType] || 0) + 1,
        },
        latest_ack: {
          response_type: responseType,
          message: payload?.message || responseType,
          timestamp: new Date().toISOString(),
        },
      };
      cacheBroadcast(updated);
      return {
        id: `ack-local-${Date.now()}`,
        broadcast_id: broadcastId,
        status: 'received',
        help_type: payload?.help_type || 'other',
        offline: true,
      };
    }
    throw error;
  }
}

export async function fetchGuestHelpRequests({ limit = 50, status = null } = {}) {
  const response = await apiClient.get('/api/guest-help', {
    params: {
      limit,
      status: status || undefined,
    },
  });
  return response.data;
}

export function getApiErrorMessage(error, fallbackMessage = 'Backend request failed') {
  return unwrapError(error, fallbackMessage);
}
