import ast
import json
import logging
import math
import uuid
from collections import deque
from datetime import datetime
from typing import Optional

from agents.routing_agent import VENUE_GRAPH, astar_risk
from services.firestore_service import get_incidents, get_responders, get_venue_layout
from services.gemini_service import call_gemini_rest, get_gemini_api_key

logger = logging.getLogger(__name__)

DEFAULT_HORIZONS = [5, 10, 15]
DEFAULT_SAFE_ZONE_TYPES = {'assembly_point'}


def _clean_text(text: str) -> str:
    cleaned = (text or '').strip()
    cleaned = cleaned.replace('\u2018', "'").replace('\u2019', "'").replace('\u201c', '"').replace('\u201d', '"')
    cleaned = cleaned.replace('\u2013', '-').replace('\u2014', '-').replace('\u2026', '...')
    return cleaned


def _parse_json_payload(text: str) -> Optional[dict]:
    candidate = _clean_text(text)
    candidate = candidate.strip()
    if candidate.startswith('```'):
        candidate = candidate.split('\n', 1)[-1]
        if candidate.endswith('```'):
            candidate = candidate[:-3]
    start = candidate.find('{')
    end = candidate.rfind('}')
    if start != -1 and end != -1 and end > start:
        candidate = candidate[start:end + 1]
    candidate = candidate.replace(',}', '}').replace(',]', ']')
    try:
        parsed = json.loads(candidate)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass
    try:
        parsed = ast.literal_eval(candidate)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass
    return None


def _zone_distance_map() -> dict[str, dict[str, int]]:
    nodes = VENUE_GRAPH.get('nodes', {})
    edges = VENUE_GRAPH.get('edges', {})
    distances: dict[str, dict[str, int]] = {}
    for origin in nodes:
        seen = {origin: 0}
        queue = deque([origin])
        while queue:
            current = queue.popleft()
            for neighbor in edges.get(current, {}):
                if neighbor not in seen:
                    seen[neighbor] = seen[current] + 1
                    queue.append(neighbor)
        distances[origin] = seen
    return distances


ZONE_DISTANCE_MAP = _zone_distance_map()


def _zone_lookup(layout: dict) -> dict[str, dict]:
    return {zone.get('id'): zone for zone in layout.get('zones', []) if zone.get('id')}


def _find_zone(layout: dict, value: Optional[str]) -> Optional[dict]:
    if not value:
        return None
    value_norm = value.strip().lower().replace(' ', '_')
    zone_map = _zone_lookup(layout)
    if value_norm in zone_map:
        return zone_map[value_norm]
    for zone in zone_map.values():
        zone_name = str(zone.get('name', '')).lower().replace(' ', '_')
        if value_norm == zone_name:
            return zone
    return None


def _match_exit_ids(layout: dict, blocked_exits: list[str]) -> set[str]:
    zone_map = _zone_lookup(layout)
    blocked = set()
    for raw in blocked_exits or []:
        zone = _find_zone(layout, raw)
        if zone and zone.get('zone_type') == 'exit':
            blocked.add(zone['id'])
        else:
            raw_norm = str(raw).strip().lower().replace(' ', '_')
            for zone in zone_map.values():
                if zone.get('zone_type') == 'exit':
                    zone_id = str(zone.get('id', '')).lower().replace(' ', '_')
                    zone_name = str(zone.get('name', '')).lower().replace(' ', '_')
                    if raw_norm in {zone_id, zone_name}:
                        blocked.add(zone['id'])
    return blocked


def _severity_rank(severity: str) -> int:
    return {'low': 1, 'medium': 2, 'high': 3, 'critical': 4}.get(severity, 2)


def _severity_from_distance(base: str, distance: int) -> str:
    rank = max(1, _severity_rank(base) - distance)
    return {1: 'low', 2: 'medium', 3: 'high', 4: 'critical'}.get(rank, 'medium')


def _incident_source_zone(layout: dict, payload: dict) -> dict:
    zone = _find_zone(layout, payload.get('location'))
    if zone:
        return zone
    incident_type = (payload.get('incident_type') or 'security').lower()
    fallback_zone = {
        'fire': 'kitchen',
        'medical': 'lobby',
        'security': 'front_desk',
        'false_alarm': 'front_desk',
    }.get(incident_type, 'lobby')
    return _find_zone(layout, fallback_zone) or next((z for z in layout.get('zones', []) if z.get('floor') == 1), layout.get('zones', [{}])[0])


def _shape_hazard_zones(layout: dict, origin_zone: dict, severity: str, horizon: int, incident_type: str) -> list[dict]:
    zone_map = _zone_lookup(layout)
    origin_id = origin_zone.get('id')
    max_depth = max(1, math.ceil(horizon / 5))
    active = []

    for zone in layout.get('zones', []):
        zone_id = zone.get('id')
        if not zone_id or zone.get('floor') != origin_zone.get('floor'):
            continue
        depth = ZONE_DISTANCE_MAP.get(origin_id, {}).get(zone_id)
        if depth is None or depth > max_depth:
            continue
        active.append({
            'zone_id': zone_id,
            'name': zone.get('name'),
            'floor': zone.get('floor'),
            'severity': _severity_from_distance(severity, depth),
            'intensity': round(max(0.2, 1.0 - (depth * 0.22) - (max_depth - depth) * 0.04), 2),
            'incident_type': incident_type,
        })

    if origin_id not in {item['zone_id'] for item in active}:
        active.append({
            'zone_id': origin_id,
            'name': origin_zone.get('name'),
            'floor': origin_zone.get('floor'),
            'severity': severity,
            'intensity': 1.0,
            'incident_type': incident_type,
        })

    return active


def _best_exit_route(origin_zone: dict, blocked_exit_ids: set[str], hazard_zones: list[dict]) -> dict:
    hazard_map = {item['zone_id']: item['severity'] for item in hazard_zones}
    best = None
    exits = [zone_id for zone_id, data in VENUE_GRAPH.get('nodes', {}).items() if data.get('type') == 'exit']
    for exit_id in exits:
        if exit_id in blocked_exit_ids:
            continue
        route = astar_risk(origin_zone['id'], exit_id, hazard_map)
        if route and (best is None or route['risk_cost'] < best['risk_cost']):
            best = route
            best['exit'] = exit_id
    if best:
        return best
    return {'path': [origin_zone.get('id')], 'exit': 'unknown', 'steps': [origin_zone.get('name', 'Use nearest exit')], 'risk_cost': float('inf')}


def _safe_zone_pressure(layout: dict, safe_zone_id: Optional[str], occupancy_percent: int) -> tuple[str, dict]:
    zone_map = _zone_lookup(layout)
    candidate_zones = [
        zone for zone in layout.get('zones', [])
        if zone.get('zone_type') in DEFAULT_SAFE_ZONE_TYPES
    ]
    safe_zone = zone_map.get(safe_zone_id) if safe_zone_id else None
    if not safe_zone:
        safe_zone = max(candidate_zones, key=lambda zone: zone.get('capacity', 0), default=None)
    if not safe_zone:
        safe_zone = next((zone for zone in layout.get('zones', []) if zone.get('zone_type') == 'exit'), layout.get('zones', [{}])[0])
    capacity = max(1, int(safe_zone.get('capacity') or 100))
    pressure = min(1.0, occupancy_percent / 100 * 0.65 + 0.25)
    return safe_zone.get('id'), {
        'zone_id': safe_zone.get('id'),
        'name': safe_zone.get('name'),
        'capacity': capacity,
        'occupancy_percent': occupancy_percent,
        'pressure': round(pressure, 2),
        'remaining_capacity': max(0, capacity - int(capacity * pressure)),
    }


def _simulate_responders(layout: dict, responders: list, origin_zone: dict, responder_delay_minutes: int, incident_type: str) -> list[dict]:
    projected = []
    origin_id = origin_zone.get('id')
    for responder in responders[:8]:
        start_zone = _find_zone(layout, responder.get('zone_id') or responder.get('location'))
        start_id = start_zone.get('id') if start_zone else origin_id
        hop_count = ZONE_DISTANCE_MAP.get(start_id, {}).get(origin_id, 2)
        base_eta = max(1, int(round(hop_count * 1.5 + _severity_rank(responder.get('status', 'available')) * 0.35)))
        role = responder.get('role', '')
        role_bonus = 0
        if incident_type == 'fire' and role == 'fire_team':
            role_bonus = -1
        elif incident_type == 'medical' and role == 'medical':
            role_bonus = -1
        eta_minutes = max(1, base_eta + responder_delay_minutes + role_bonus)
        projected_path = [start_id, origin_id] if start_id != origin_id else [origin_id]
        projected.append({
            'id': responder.get('id'),
            'name': responder.get('name'),
            'role': responder.get('role'),
            'current_zone_id': start_id,
            'projected_zone_id': origin_id,
            'eta_minutes': eta_minutes,
            'projected_path': projected_path,
            'status': responder.get('status'),
        })
    return projected


def _zone_pressure_map(layout: dict, origin_zone: dict, occupancy_percent: int, hazard_zones: list[dict], blocked_exit_ids: set[str], evacuation_trigger: bool, safe_zone_id: Optional[str]) -> dict[str, float]:
    pressure = {}
    origin_id = origin_zone.get('id')
    safe_zone_id = safe_zone_id or ''
    hazard_ids = {item['zone_id'] for item in hazard_zones}
    for zone in layout.get('zones', []):
        zone_id = zone.get('id')
        if not zone_id:
            continue
        depth = ZONE_DISTANCE_MAP.get(origin_id, {}).get(zone_id, 4)
        base = 0.12 + max(0, 0.32 - depth * 0.08)
        hazard_boost = 0.35 if zone_id in hazard_ids else 0.0
        exit_boost = 0.18 if zone.get('zone_type') == 'exit' and zone_id in blocked_exit_ids else 0.0
        evac_boost = 0.12 if evacuation_trigger and zone.get('zone_type') == 'assembly_point' else 0.0
        safe_zone_boost = 0.22 if safe_zone_id and zone_id == safe_zone_id else 0.0
        crowd_boost = min(0.35, occupancy_percent / 100 * 0.35)
        pressure[zone_id] = round(min(1.0, base + hazard_boost + exit_boost + evac_boost + safe_zone_boost + crowd_boost), 2)
    return pressure


def _risk_score(hazard_zones: list[dict], pressure_map: dict[str, float], blocked_exit_ids: set[str], responder_delay_minutes: int, evacuation_trigger: bool) -> int:
    base = 30
    base += len(hazard_zones) * 8
    base += int(sum(item['intensity'] for item in hazard_zones) * 10)
    base += len(blocked_exit_ids) * 7
    base += responder_delay_minutes * 4
    if evacuation_trigger:
        base += 8
    crowd_peak = max(pressure_map.values(), default=0)
    base += int(crowd_peak * 22)
    return max(0, min(100, base))


def _recommendation(incident_type: str, risk_score: int, evacuation_trigger: bool, blocked_exit_ids: set[str]) -> str:
    if incident_type == 'fire' or risk_score >= 70 or evacuation_trigger:
        if blocked_exit_ids:
            return 'Escalate to evacuation immediately and reroute guests through the safest unblocked exits.'
        return 'Escalate to evacuation immediately and push guests toward the safest assembly point.'
    if incident_type == 'medical':
        return 'Keep the area clear, deploy the nearest medical team, and maintain a controlled access corridor.'
    if incident_type == 'security':
        return 'Stabilize access control, isolate the affected zone, and move nearby guests out of sight lines.'
    return 'Continue monitoring, keep responders staged, and prepare for fast escalation if conditions change.'


async def _gemini_brief(simulation: dict) -> dict:
    if not get_gemini_api_key():
        raise ValueError('Gemini not configured')

    prompt = (
        'You are writing a concise crisis command brief for a venue response team.\n'
        'Return ONLY valid JSON with keys: title, summary, recommended_action, guest_announcement, rationale.\n'
        'Keep each field short, direct, and suitable for a live operations room.\n'
        f'Simulation JSON:\n{json.dumps(simulation, indent=2)}'
    )
    text = await call_gemini_rest([{'text': prompt}], system_instruction='Return only JSON.', model='gemini-2.5-flash')
    parsed = _parse_json_payload(text)
    if not isinstance(parsed, dict):
        raise ValueError('Gemini brief was not valid JSON')
    return {
        'title': str(parsed.get('title') or 'Crisis brief').strip(),
        'summary': str(parsed.get('summary') or '').strip(),
        'recommended_action': str(parsed.get('recommended_action') or '').strip(),
        'guest_announcement': str(parsed.get('guest_announcement') or '').strip(),
        'rationale': str(parsed.get('rationale') or '').strip(),
        'mode': 'live',
    }


def _fallback_brief(simulation: dict, risk_score: int, recommendation: str) -> dict:
    incident_type = simulation['request']['incident_type'].replace('_', ' ').title()
    return {
        'title': f'{incident_type} twin brief',
        'summary': f'Risk is {risk_score}/100. The current scenario shows {len(simulation["scenario"]["hazards"])} active hazard zones and {len(simulation["scenario"]["blocked_exits"])} blocked exits.',
        'recommended_action': recommendation,
        'guest_announcement': 'Please follow staff directions, use the safest available exit, and move calmly to the nearest assembly point.',
        'rationale': 'Deterministic twin forecast based on venue layout, responder travel time, exit availability, and crowd pressure.',
        'mode': 'fallback',
    }


async def simulate_crisis_twin(request: dict) -> dict:
    layout = await get_venue_layout()
    responders = await get_responders()
    incidents = await get_incidents(limit=50)
    incident_map = {incident.get('id'): incident for incident in incidents}

    incident_id = request.get('incident_id')
    incident = incident_map.get(incident_id) if incident_id else None

    incident_type = request.get('incident_type') or (
        incident.get('classification', {}).get('incident_type') if incident else 'fire'
    )
    location = request.get('location') or (
        incident.get('classification', {}).get('location') if incident else None
    )
    severity = request.get('severity') or (
        incident.get('classification', {}).get('severity') if incident else 'high'
    )

    source_payload = {
        'incident_type': incident_type,
        'location': location,
        'severity': severity,
    }

    origin_zone = _incident_source_zone(layout, source_payload)
    blocked_exit_ids = _match_exit_ids(layout, request.get('blocked_exits') or [])
    occupancy_percent = int(request.get('occupancy_percent') or 62)
    responder_delay_minutes = int(request.get('responder_delay_minutes') or 0)
    evacuation_trigger = bool(request.get('evacuation_trigger') if request.get('evacuation_trigger') is not None else source_payload['incident_type'] == 'fire')
    safe_zone_id = request.get('safe_zone_id')
    horizons = request.get('horizons') or DEFAULT_HORIZONS
    horizons = [int(value) for value in horizons if int(value) > 0]
    if not horizons:
        horizons = DEFAULT_HORIZONS

    baseline_blocked = set()
    baseline_delay = 0
    baseline_safe_zone = safe_zone_id
    baseline_occupancy = min(occupancy_percent, 55)
    baseline_evac = source_payload['incident_type'] == 'fire'

    def build_state(blocked_ids: set[str], delay_minutes: int, evac_trigger: bool, crowd: int, target_safe_zone: Optional[str]) -> dict:
        hazard_by_horizon = {}
        route_by_horizon = {}
        for horizon in horizons:
            hazards = _shape_hazard_zones(layout, origin_zone, source_payload['severity'], horizon, source_payload['incident_type'])
            hazard_by_horizon[str(horizon)] = hazards
            route_by_horizon[str(horizon)] = _best_exit_route(origin_zone, blocked_ids, hazards)
        final_horizon = str(max(horizons))
        projected_responders = _simulate_responders(layout, responders, origin_zone, delay_minutes, source_payload['incident_type'])
        pressure_map = _zone_pressure_map(layout, origin_zone, crowd, hazard_by_horizon[final_horizon], blocked_ids, evac_trigger, target_safe_zone)
        safe_zone_choice_id, safe_zone = _safe_zone_pressure(layout, target_safe_zone, crowd)
        final_route = route_by_horizon[final_horizon]
        risk_score = _risk_score(hazard_by_horizon[final_horizon], pressure_map, blocked_ids, delay_minutes, evac_trigger)
        return {
            'origin_zone': origin_zone.get('id'),
            'hazards': hazard_by_horizon,
            'route': final_route,
            'routes': route_by_horizon,
            'pressure_map': pressure_map,
            'projected_responders': projected_responders,
            'safe_zone': safe_zone,
            'safe_zone_choice_id': safe_zone_choice_id,
            'risk_score': risk_score,
            'recommended_action': _recommendation(source_payload['incident_type'], risk_score, evac_trigger, blocked_ids),
            'blocked_exits': sorted(blocked_ids),
            'occupancy_percent': crowd,
            'responder_delay_minutes': delay_minutes,
            'evacuation_trigger': evac_trigger,
        }

    baseline = build_state(baseline_blocked, baseline_delay, baseline_evac, baseline_occupancy, baseline_safe_zone)
    scenario = build_state(blocked_exit_ids, responder_delay_minutes, evacuation_trigger, occupancy_percent, safe_zone_id)
    deltas = {
        'risk_score': scenario['risk_score'] - baseline['risk_score'],
        'blocked_exits': len(scenario['blocked_exits']) - len(baseline['blocked_exits']),
        'safe_zone_pressure': round(scenario['safe_zone']['pressure'] - baseline['safe_zone']['pressure'], 2) if scenario['safe_zone'] and baseline['safe_zone'] else 0,
        'eta_shift_minutes': responder_delay_minutes - baseline_delay,
    }

    simulation = {
        'snapshot_id': request.get('snapshot_id') or f'twin-{uuid.uuid4().hex[:10]}',
        'generated_at': datetime.utcnow().isoformat(),
        'request': {
            'incident_id': incident_id,
            'incident_type': source_payload['incident_type'],
            'location': source_payload['location'],
            'severity': source_payload['severity'],
            'blocked_exits': request.get('blocked_exits') or [],
            'responder_delay_minutes': responder_delay_minutes,
            'occupancy_percent': occupancy_percent,
            'safe_zone_id': safe_zone_id,
            'evacuation_trigger': evacuation_trigger,
            'horizons': horizons,
        },
        'baseline': baseline,
        'scenario': scenario,
        'deltas': deltas,
        'metadata': {
            'venue_name': layout.get('venue', {}).get('name'),
            'zones': len(layout.get('zones', [])),
            'responders': len(responders),
        },
    }

    try:
        briefing = await _gemini_brief(simulation)
    except Exception as exc:
        logger.warning(f'Gemini twin brief unavailable: {exc}')
        briefing = _fallback_brief(simulation, scenario['risk_score'], scenario['recommended_action'])

    simulation['briefing'] = briefing
    simulation['share_text'] = (
        f"{briefing['title']}: {briefing['summary']} "
        f"Recommended action: {briefing['recommended_action']}"
    )
    return simulation
