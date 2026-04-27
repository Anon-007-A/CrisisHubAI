from models.incident import Incident
import os, json, logging, uuid
from datetime import datetime
from copy import deepcopy

logger = logging.getLogger(__name__)

DEMO_MODE = not os.getenv('GOOGLE_APPLICATION_CREDENTIALS') and not os.getenv('FIRESTORE_PROJECT_ID')

# In-memory store for demo mode
_mem_store = {
    'incidents': {}, 'responders': {}, 'audit_logs': [],
    'team_units': {}, 'cctv_feeds': {}, 'video_events': [],
    'broadcasts': {}, 'guest_acknowledgements': [],
}

db = None
firestore = None

if not DEMO_MODE:
    try:
        from google.cloud import firestore as _firestore
        firestore = _firestore
        db = firestore.AsyncClient(project=os.getenv('FIRESTORE_PROJECT_ID'))
    except Exception as e:
        logger.warning('Firestore SDK unavailable or incompatible (%s) — falling back to DEMO_MODE', e)
        DEMO_MODE = True
        db = None
else:
    logger.warning('No Firestore credentials — running in DEMO_MODE with in-memory store')

def _seed_responders():
    """Load responder seed data into memory store"""
    try:
        seed_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'responders_seed.json')
        with open(seed_path) as f:
            for r in json.load(f):
                _mem_store['responders'][r['id']] = r
        logger.info(f'Seeded {len(_mem_store["responders"])} responders into memory')
    except Exception as e:
        logger.warning(f'Could not load responder seed: {e}')

async def save_audit_entry(entry: dict):
    """Persist a single audit entry to Firestore or demo store."""
    if DEMO_MODE:
        _mem_store['audit_logs'].append(entry)
        return
    doc_id = entry.get('id') or f"audit-{uuid.uuid4()}"
    await db.collection('audit_logs').document(doc_id).set(entry)

async def get_audit_entries(limit: int = 50, incident_id: str = None) -> list:
    if DEMO_MODE:
        entries = _mem_store['audit_logs']
        if incident_id:
            entries = [e for e in entries if e.get('incident_id') == incident_id]
        return sorted(entries, key=lambda x: x.get('timestamp', ''), reverse=True)[:limit]

    query_ref = db.collection('audit_logs').order_by('timestamp', direction=firestore.Query.DESCENDING)
    if incident_id:
        query_ref = query_ref.where('incident_id', '==', incident_id)
    docs = query_ref.limit(limit)
    return [{'id': d.id, **d.to_dict()} async for d in docs.stream()]

async def get_responders() -> list:
    if DEMO_MODE:
        return [deepcopy(r) for r in _mem_store['responders'].values()]
    docs = db.collection('responders').order_by('status')
    return [{'id': d.id, **d.to_dict()} async for d in docs.stream()]

async def get_responder(responder_id: str) -> dict | None:
    if DEMO_MODE:
        return deepcopy(_mem_store['responders'].get(responder_id))
    doc = await db.collection('responders').document(responder_id).get()
    return {'id': doc.id, **doc.to_dict()} if doc.exists else None

async def get_incident(incident_id: str) -> dict | None:
    if DEMO_MODE:
        incident = _mem_store['incidents'].get(incident_id)
        return deepcopy(incident) if incident else None
    doc = await db.collection('incidents').document(incident_id).get()
    return {'id': doc.id, **doc.to_dict()} if doc.exists else None

# Auto-seed responders on import
if DEMO_MODE:
    _seed_responders()

# ─── Incident CRUD ─────────────────────────────────────────

async def _record_incident_audit(incident: Incident):
    if not incident.autonomous_actions:
        return

    for idx, action in enumerate(incident.autonomous_actions):
        detail = action.get('detail') if isinstance(action, dict) else str(action)
        entry = {
            'id': f"audit-{incident.id}-{idx}-{uuid.uuid4().hex[:8]}",
            'incident_id': incident.id,
            'incident_type': incident.classification.incident_type if incident.classification else 'unknown',
            'timestamp': incident.timestamp.isoformat() if incident.timestamp else datetime.utcnow().isoformat(),
            'actor': action.get('authority') if isinstance(action, dict) and action.get('authority') else 'AI-Agent',
            'action': action.get('action') if isinstance(action, dict) and action.get('action') else 'autonomous',
            'detail': detail,
            'type': 'AUTO',
        }
        await save_audit_entry(entry)

async def save_incident(incident: Incident):
    data = incident.model_dump(mode='json')
    if DEMO_MODE:
        _mem_store['incidents'][incident.id] = data
    else:
        await db.collection('incidents').document(incident.id).set(data)
    await _record_incident_audit(incident)

async def get_incidents(limit: int = 20) -> list:
    if DEMO_MODE:
        items = sorted(_mem_store['incidents'].values(),
                       key=lambda x: x.get('timestamp', ''), reverse=True)
        return items[:limit]
    docs = db.collection('incidents').order_by(
        'timestamp', direction=firestore.Query.DESCENDING).limit(limit)
    return [d.to_dict() async for d in docs.stream()]

async def update_incident(incident_id: str, updates: dict):
    if DEMO_MODE:
        if incident_id in _mem_store['incidents']:
            _mem_store['incidents'][incident_id].update(updates)
            if 'status' in updates or 'resolved_at' in updates:
                await save_audit_entry({
                    'id': f"audit-{incident_id}-status-{uuid.uuid4().hex[:8]}",
                    'incident_id': incident_id,
                    'incident_type': _mem_store['incidents'][incident_id].get('classification', {}).get('incident_type', 'unknown'),
                    'timestamp': datetime.utcnow().isoformat(),
                    'actor': 'Ops',
                    'action': 'status_update',
                    'detail': f"Incident status changed to {updates.get('status', 'updated')}",
                    'type': 'MANUAL',
                })
        return
    existing = await get_incident(incident_id)
    await db.collection('incidents').document(incident_id).update(updates)
    if 'status' in updates or 'resolved_at' in updates:
        await save_audit_entry({
            'id': f"audit-{incident_id}-status-{uuid.uuid4().hex[:8]}",
            'incident_id': incident_id,
            'incident_type': updates.get('incident_type', existing.get('classification', {}).get('incident_type', 'unknown') if existing else 'unknown'),
            'timestamp': datetime.utcnow().isoformat(),
            'actor': 'Ops',
            'action': 'status_update',
            'detail': f"Incident status changed to {updates.get('status', 'updated')}",
            'type': 'MANUAL',
        })

# ─── Responder CRUD ────────────────────────────────────────

async def get_available_responders(role: str) -> list:
    if DEMO_MODE:
        return [deepcopy(r) for r in _mem_store['responders'].values()
                if r.get('role') == role and r.get('status') == 'available'][:3]
    docs = db.collection('responders').where(
        'role', '==', role).where('status', '==', 'available').limit(3)
    return [{'id': d.id, **d.to_dict()} async for d in docs.stream()]

async def update_responder_status(responder_id: str, status: str, incident_id: str):
    if DEMO_MODE:
        if responder_id in _mem_store['responders']:
            _mem_store['responders'][responder_id]['status'] = status
            _mem_store['responders'][responder_id]['current_incident'] = incident_id
            await save_audit_entry({
                'id': f"audit-responder-{responder_id}-{uuid.uuid4().hex[:8]}",
                'responder_id': responder_id,
                'incident_id': incident_id,
                'timestamp': datetime.utcnow().isoformat(),
                'actor': _mem_store['responders'][responder_id].get('name', 'Responder'),
                'action': 'responder_status_change',
                'detail': f"Status set to {status} for incident {incident_id}",
                'type': 'MANUAL',
            })
        return
    await db.collection('responders').document(responder_id).update(
        {'status': status, 'current_incident': incident_id})
    await save_audit_entry({
        'id': f"audit-responder-{responder_id}-{uuid.uuid4().hex[:8]}",
        'responder_id': responder_id,
        'incident_id': incident_id,
        'timestamp': datetime.utcnow().isoformat(),
        'actor': responder_id,
        'action': 'responder_status_change',
        'detail': f"Status set to {status} for incident {incident_id}",
        'type': 'MANUAL',
    })

# ─── Demo Seed ─────────────────────────────────────────────

async def seed_demo_data():
    """Populate store with realistic demo incidents for showcase"""
    from datetime import timedelta
    now = datetime.utcnow()

    demos = [
        {
            'id': 'demo-fire-001',
            'timestamp': (now - timedelta(minutes=3)).isoformat(),
            'input': {'report_text': 'Heavy smoke in kitchen, guests evacuating', 'location_hint': 'Kitchen', 'reporter_role': 'staff'},
            'classification': {
                'incident_type': 'fire', 'severity': 'critical', 'location': 'Kitchen',
                'summary': 'Active fire in Kitchen. Sprinklers activated. Smoke spreading to Corridor 1F-B.',
                'responders_needed': ['fire_team', 'medical', 'management', 'security'],
                'evacuation_required': True, 'suggested_safe_zone': 'South Main Exit',
                'confidence': 0.96,
                'ai_reasoning': 'Multimodal analysis detected smoke + thermal anomaly. Ceiling sprinklers triggered. Severity CRITICAL due to enclosed space near Restaurant.',
            },
            'status': 'responding',
            'assigned_responders': ['Alex Chen', 'Sarah Kim', 'Priya Nair', 'Mike Torres'],
            'evacuation_route': {'path': ['kitchen', 'stairwell_b', 'exit_east'], 'exit': 'exit_east',
                                 'steps': ['Kitchen', 'Stairwell B', 'East Service Exit']},
            'autonomous_actions': [
                {'action': 'dispatch', 'detail': 'Fire Team auto-dispatched'},
                {'action': 'alert', 'detail': 'Webhook sent to #fire-response'},
                {'action': 'escalate', 'detail': 'Local fire dept notified'},
            ],
        },
        {
            'id': 'demo-med-002',
            'timestamp': (now - timedelta(minutes=10)).isoformat(),
            'input': {'report_text': 'Guest collapsed near front desk, unresponsive', 'location_hint': 'Main Lobby', 'reporter_role': 'staff'},
            'classification': {
                'incident_type': 'medical', 'severity': 'high', 'location': 'Main Lobby',
                'summary': 'Unconscious guest at Front Desk. Cardiac event suspected. AED deployment recommended.',
                'responders_needed': ['medical', 'security'],
                'evacuation_required': False, 'suggested_safe_zone': None,
                'confidence': 0.89,
                'ai_reasoning': 'Cardiac keywords detected (collapsed, unresponsive). Breathing confirmed → HIGH not CRITICAL. AED station 12m away at Front Desk.',
            },
            'status': 'responding',
            'assigned_responders': ['Sarah Kim', 'James Wu'],
            'evacuation_route': None,
            'autonomous_actions': [
                {'action': 'dispatch', 'detail': 'Medical responder dispatched from Clinic'},
                {'action': 'equipment', 'detail': 'AED at Front Desk flagged for retrieval'},
            ],
        },
    ]

    for d in demos:
        if DEMO_MODE:
            _mem_store['incidents'][d['id']] = d
        else:
            await db.collection('incidents').document(d['id']).set(d)

    return demos

# ─── Alert CRUD ─────────────────────────────────────────────

_mem_store['alerts'] = {}

async def save_alert(alert: dict):
    alert_id = alert.get('id') or f"alert-{uuid.uuid4()}"
    if DEMO_MODE:
        _mem_store['alerts'][alert_id] = alert
    else:
        await db.collection('alerts').document(alert_id).set(alert)
    return alert_id

async def get_alerts(limit: int = 50, incident_id: str = None) -> list:
    if DEMO_MODE:
        alerts = list(_mem_store['alerts'].values())
        if incident_id:
            alerts = [a for a in alerts if a.get('incident_id') == incident_id]
        return sorted(alerts, key=lambda x: x.get('timestamp', ''), reverse=True)[:limit]
    
    query_ref = db.collection('alerts').order_by('timestamp', direction=firestore.Query.DESCENDING)
    if incident_id:
        query_ref = query_ref.where('incident_id', '==', incident_id)
    docs = query_ref.limit(limit)
    return [{'id': d.id, **d.to_dict()} async for d in docs.stream()]

async def update_alert(alert_id: str, updates: dict):
    if DEMO_MODE:
        if alert_id in _mem_store['alerts']:
            _mem_store['alerts'][alert_id].update(updates)
        return
    await db.collection('alerts').document(alert_id).update(updates)

# ─── Guest Help CRUD ────────────────────────────────────────

async def save_broadcast(broadcast: dict):
    broadcast_id = broadcast.get('id') or f"broadcast-{uuid.uuid4()}"
    broadcast['id'] = broadcast_id
    if DEMO_MODE:
        _mem_store['broadcasts'][broadcast_id] = broadcast
    else:
        await db.collection('broadcasts').document(broadcast_id).set(broadcast)
    return broadcast_id


async def get_broadcasts(limit: int = 20, incident_id: str = None, active_only: bool = False) -> list:
    if DEMO_MODE:
        items = list(_mem_store['broadcasts'].values())
        if incident_id:
            items = [item for item in items if item.get('incident_id') == incident_id]
        if active_only:
            items = [item for item in items if item.get('status', 'active') == 'active']
        return sorted(items, key=lambda x: x.get('timestamp', ''), reverse=True)[:limit]

    query_ref = db.collection('broadcasts').order_by('timestamp', direction=firestore.Query.DESCENDING)
    if incident_id:
        query_ref = query_ref.where('incident_id', '==', incident_id)
    if active_only:
        query_ref = query_ref.where('status', '==', 'active')
    docs = query_ref.limit(limit)
    return [{'id': d.id, **d.to_dict()} async for d in docs.stream()]


async def get_active_broadcast() -> dict | None:
    broadcasts = await get_broadcasts(limit=1, active_only=True)
    if broadcasts:
        return broadcasts[0]
    broadcasts = await get_broadcasts(limit=1)
    return broadcasts[0] if broadcasts else None


async def update_broadcast(broadcast_id: str, updates: dict):
    if DEMO_MODE:
        if broadcast_id in _mem_store['broadcasts']:
            _mem_store['broadcasts'][broadcast_id].update(updates)
        return
    await db.collection('broadcasts').document(broadcast_id).update(updates)


async def save_guest_acknowledgement(ack: dict):
    ack_id = ack.get('id') or f"ack-{uuid.uuid4()}"
    ack['id'] = ack_id
    if DEMO_MODE:
        _mem_store['guest_acknowledgements'].append(ack)
    else:
        await db.collection('guest_acknowledgements').document(ack_id).set(ack)
    return ack_id


async def get_guest_acknowledgements(limit: int = 50, broadcast_id: str = None, incident_id: str = None) -> list:
    if DEMO_MODE:
        items = _mem_store['guest_acknowledgements']
        if broadcast_id:
            items = [item for item in items if item.get('broadcast_id') == broadcast_id]
        if incident_id:
            items = [item for item in items if item.get('incident_id') == incident_id]
        return sorted(items, key=lambda x: x.get('timestamp', ''), reverse=True)[:limit]

    query_ref = db.collection('guest_acknowledgements').order_by('timestamp', direction=firestore.Query.DESCENDING)
    if broadcast_id:
        query_ref = query_ref.where('broadcast_id', '==', broadcast_id)
    if incident_id:
        query_ref = query_ref.where('incident_id', '==', incident_id)
    docs = query_ref.limit(limit)
    return [{'id': d.id, **d.to_dict()} async for d in docs.stream()]


_mem_store['guest_help'] = {}

async def save_guest_help(help_request: dict):
    help_id = help_request.get('id') or f"guest-{uuid.uuid4()}"
    if DEMO_MODE:
        _mem_store['guest_help'][help_id] = help_request
    else:
        await db.collection('guest_help').document(help_id).set(help_request)
    return help_id

async def get_guest_help_requests(limit: int = 50, status: str = None) -> list:
    if DEMO_MODE:
        requests = list(_mem_store['guest_help'].values())
        if status:
            requests = [r for r in requests if r.get('status') == status]
        return sorted(requests, key=lambda x: x.get('timestamp', ''), reverse=True)[:limit]
    
    query_ref = db.collection('guest_help').order_by('timestamp', direction=firestore.Query.DESCENDING)
    if status:
        query_ref = query_ref.where('status', '==', status)
    docs = query_ref.limit(limit)
    return [{'id': d.id, **d.to_dict()} async for d in docs.stream()]

async def update_guest_help(help_id: str, updates: dict):
    if DEMO_MODE:
        if help_id in _mem_store['guest_help']:
            _mem_store['guest_help'][help_id].update(updates)
        return
    await db.collection('guest_help').document(help_id).update(updates)

# ─── Zone/Venue Layout ──────────────────────────────────────

_VENUE_LAYOUT = {}

def _load_venue_layout():
    """Load venue floor plan layout"""
    try:
        layout_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'venue_layout.json')
        with open(layout_path) as f:
            data = json.load(f)
            global _VENUE_LAYOUT
            _VENUE_LAYOUT = data
        logger.info(f'Loaded venue layout with {len(data.get("zones", []))} zones')
    except Exception as e:
        logger.warning(f'Could not load venue layout: {e}')

async def get_venue_layout():
    """Get complete venue floor plan with zones"""
    if _VENUE_LAYOUT:
        return deepcopy(_VENUE_LAYOUT)
    return {'venue': {'name': 'Aegis Resort', 'floors': 1}, 'zones': []}

async def get_zones(floor: int = None):
    """Get zones, optionally filtered by floor"""
    layout = await get_venue_layout()
    zones = layout.get('zones', [])
    if floor is not None:
        zones = [z for z in zones if z.get('floor') == floor]
    return zones

async def get_zone(zone_id: str):
    """Get individual zone by ID"""
    zones = await get_zones()
    for zone in zones:
        if zone.get('id') == zone_id:
            return zone
    return None

# ─── Responder Positioning ──────────────────────────────────

_mem_store['responder_positions'] = {}

async def update_responder_position(responder_id: str, zone_id: str, coordinates: dict):
    """Update responder's current position and zone"""
    update_data = {
        'zone_id': zone_id,
        'coordinates': coordinates,
        'last_position_update': datetime.utcnow().isoformat()
    }
    
    if DEMO_MODE:
        if responder_id in _mem_store['responders']:
            _mem_store['responders'][responder_id].update(update_data)
    else:
        await db.collection('responders').document(responder_id).update(update_data)

# ─── Initialize on import ──────────────────────────────────

_load_venue_layout()

# ─── CCTV & Video Intelligence ─────────────────────────────

async def get_cctv_feeds() -> list:
    if DEMO_MODE:
        return list(_mem_store['cctv_feeds'].values())
    docs = db.collection('cctv_feeds')
    return [{'id': d.id, **d.to_dict()} async for d in docs.stream()]

async def save_video_event(event: dict):
    event_id = event.get('id') or f"video-{uuid.uuid4()}"
    if DEMO_MODE:
        _mem_store['video_events'].append(event)
    else:
        await db.collection('video_events').document(event_id).set(event)
    return event_id

async def get_video_events(limit: int = 50, incident_id: str = None) -> list:
    if DEMO_MODE:
        events = _mem_store['video_events']
        if incident_id:
            events = [e for e in events if e.get('incident_id') == incident_id]
        return sorted(events, key=lambda x: x.get('detected_at', ''), reverse=True)[:limit]
    
    query_ref = db.collection('video_events').order_by('detected_at', direction=firestore.Query.DESCENDING)
    if incident_id:
        query_ref = query_ref.where('incident_id', '==', incident_id)
    docs = query_ref.limit(limit)
    return [{'id': d.id, **d.to_dict()} async for d in docs.stream()]

async def update_video_event(event_id: str, updates: dict):
    if DEMO_MODE:
        for ev in _mem_store['video_events']:
            if ev.get('id') == event_id:
                ev.update(updates)
                break
        return
    await db.collection('video_events').document(event_id).update(updates)

# ─── Team Units ─────────────────────────────────────────────

async def get_team_units() -> list:
    if DEMO_MODE:
        return list(_mem_store['team_units'].values())
    docs = db.collection('team_units')
    return [{'id': d.id, **d.to_dict()} async for d in docs.stream()]

async def update_team_unit(unit_id: str, updates: dict):
    if DEMO_MODE:
        if unit_id in _mem_store['team_units']:
            _mem_store['team_units'][unit_id].update(updates)
        return
    await db.collection('team_units').document(unit_id).update(updates)
