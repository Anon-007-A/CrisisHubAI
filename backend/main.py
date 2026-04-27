import os, uuid, logging
from dotenv import load_dotenv
load_dotenv() # Load before importing local services

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, Field

from models.incident import IncidentInput, Incident
from agents.classifier_agent import run_classifier
from agents.dispatch_agent import run_dispatch
from agents.routing_agent import run_routing, VENUE_GRAPH
from agents.alert_agent import run_alert
from services.gemini_service import generate_aar, get_gemini_api_key, draft_broadcast_message
from services.twin_service import simulate_crisis_twin
from security import verify_api_token
from services.firestore_service import (
    save_incident,
    get_incident,
    get_incidents,
    update_incident,
    seed_demo_data,
    get_responders,
    get_responder,
    update_responder_status,
    get_audit_entries,
    save_alert,
    get_alerts,
    update_alert,
    save_guest_help,
    get_guest_help_requests,
    update_guest_help,
    save_broadcast,
    get_broadcasts,
    get_active_broadcast,
    update_broadcast,
    save_guest_acknowledgement,
    get_guest_acknowledgements,
    get_zones,
    get_zone,
    get_venue_layout,
    update_responder_position,
    save_audit_entry,
    get_cctv_feeds,
    save_video_event,
    get_video_events,
    update_video_event,
    get_team_units,
    update_team_unit,
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info('Aegis CrisisHub backend starting')
    logger.info(f'Demo mode: Gemini={"MOCK" if not get_gemini_api_key() else "LIVE"}, '
                f'Firestore={"MEMORY" if not os.getenv("FIRESTORE_PROJECT_ID") else "LIVE"}')
    yield
    logger.info('Aegis CrisisHub backend shutting down')

app = FastAPI(
    title='Aegis CrisisHub',
    version='2.0.0',
    description='Autonomous agentic crisis orchestration hub for hospitality venues',
    lifespan=lifespan
)

app.add_middleware(CORSMiddleware,
                   allow_origins=os.getenv('CORS_ORIGINS', '*').split(','),
                   allow_methods=['*'], allow_headers=['*'])


class IncidentStatusPatch(BaseModel):
    status: str


class IncidentAssignmentPatch(BaseModel):
    responder_id: str


class GuestHelpRequest(BaseModel):
    guest_name: Optional[str] = None
    guest_location: str
    help_type: str
    description: str
    severity: str = 'medium'
    special_needs: Optional[str] = None
    contact_method: str = 'app'
    language_preference: str = 'en'


class ResponderPositionUpdate(BaseModel):
    zone_id: str
    coordinates: dict


class IncidentAcknowledgement(BaseModel):
    actor: str
    actor_id: Optional[str] = None
    reason: Optional[str] = None


class GuestChatRequest(BaseModel):
    message: str
    location: Optional[str] = None
    context: Optional[dict] = None


class TwinSimulationRequest(BaseModel):
    incident_id: Optional[str] = None
    incident_type: Optional[str] = 'fire'
    location: Optional[str] = None
    severity: Optional[str] = 'high'
    blocked_exits: list[str] = Field(default_factory=list)
    responder_delay_minutes: int = 0
    occupancy_percent: int = 62
    safe_zone_id: Optional[str] = None
    evacuation_trigger: Optional[bool] = None
    horizons: Optional[list[int]] = None
    snapshot_id: Optional[str] = None


class BroadcastRequest(BaseModel):
    incident_id: Optional[str] = None
    scope: Literal['venue', 'floor', 'zone'] = 'venue'
    floor: Optional[int] = None
    zone_id: Optional[str] = None
    tone: str = 'calm'
    title: Optional[str] = None
    message: Optional[str] = None
    operator_name: str = 'Operator'
    snapshot: Optional[dict] = None
    incident_type: Optional[str] = None
    location: Optional[str] = None
    recommended_action: Optional[str] = None
    guest_announcement: Optional[str] = None
    rationale: Optional[str] = None
    blocked_exits: Optional[list[str]] = None
    safe_zone: Optional[dict] = None
    guest_count: Optional[int] = None
    draft_only: bool = False


class BroadcastAckRequest(BaseModel):
    guest_name: Optional[str] = None
    guest_location: Optional[str] = None
    guest_zone_id: Optional[str] = None
    response_type: Literal['safe', 'need_help', 'trapped', 'cannot_evacuate'] = 'safe'
    message: Optional[str] = None
    incident_id: Optional[str] = None
    help_type: Optional[str] = None
    contact_method: str = 'app'
    language_preference: str = 'en'

# ─── Core Orchestration Endpoint ────────────────────────────

@app.post('/api/report')
async def create_report(
    report_text: str = Form(...),
    location_hint: str = Form(''),
    reporter_role: str = Form('guest'),
    image: UploadFile = File(None),
    token: str = Depends(verify_api_token)):
    """
    Agentic Observe → Reason → Act pipeline:
    1. OBSERVE: Receive multimodal data (text + optional image)
    2. REASON: Gemini classifies incident with AI reasoning chain
    3. ACT: Auto-dispatch responders, compute safe routes, send alerts, escalate to authorities
    
    Requires: Authorization: Bearer <token> header
    """
    try:
        img_bytes = await image.read() if image else None
        
        # Convert image to base64 for storage if present
        import base64
        image_data_b64 = None
        if img_bytes:
            # Validate image size (max 5MB)
            if len(img_bytes) > 5 * 1024 * 1024:
                raise HTTPException(status_code=413, detail="Image size must be less than 5MB")
            
            b64_str = base64.b64encode(img_bytes).decode('utf-8')
            # Detect mime type roughly or just assume jpeg for demo
            mime = image.content_type if image else 'image/jpeg'
            image_data_b64 = f"data:{mime};base64,{b64_str}"

        # Step 1: AI Classification (The Brain)
        classification = await run_classifier(report_text, location_hint, img_bytes)

        incident = Incident(
            id=str(uuid.uuid4()),
            input=IncidentInput(report_text=report_text,
                                location_hint=location_hint,
                                reporter_role=reporter_role,
                                image_data=image_data_b64),
            classification=classification)

        # Step 2: Smart Dispatch with Autonomous Escalation
        assigned, autonomous_actions = await run_dispatch(
            classification, incident.id, report_text)
        incident.assigned_responders = assigned
        incident.autonomous_actions = autonomous_actions
        incident.toil_saved = len(autonomous_actions)

        # Step 3: Dynamic Pathfinding with Risk Cost Function
        if classification.evacuation_required:
            loc_node = classification.location.lower().replace(' ', '_')
            incident.evacuation_route = await run_routing(
                loc_node, hazard_nodes=[loc_node],
                severity=classification.severity,
                description=f"{report_text} {classification.summary}")

        # Step 4: Alert & Finalize
        incident.status = 'responding'
        await save_incident(incident)
        await run_alert(incident)

        logger.info(f'[ORCHESTRATION] Incident {incident.id[:8]} | '
                    f'Type={classification.incident_type} | Severity={classification.severity} | '
                    f'Responders={len(assigned)} | Actions={len(autonomous_actions)}')

        return incident

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f'Report processing error: {e}', exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# ─── Incident Management ────────────────────────────────────

@app.get('/api/incidents')
async def list_incidents(limit: int = 20):
    return await get_incidents(limit)

@app.get('/api/incidents/{incident_id}')
async def get_incident_detail(incident_id: str):
    incident = await get_incident(incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail='Incident not found')
    return incident

@app.get('/api/responders')
async def list_responders():
    return await get_responders()

@app.get('/api/responders/{responder_id}')
async def get_responder_detail(responder_id: str):
    responder = await get_responder(responder_id)
    if not responder:
        raise HTTPException(status_code=404, detail='Responder not found')
    return responder

@app.get('/api/audit')
async def list_audit(incident_id: Optional[str] = None, limit: int = 100):
    return await get_audit_entries(limit=limit, incident_id=incident_id)

@app.patch('/api/incidents/{incident_id}/resolve')
async def resolve_incident(incident_id: str):
    """Resolve incident and compute MTTM (Mean Time to Mitigation)"""
    incident = await get_incident(incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail='Incident not found')

    resolved_at = datetime.utcnow()
    created_at = None
    timestamp_raw = incident.get('timestamp')
    if isinstance(timestamp_raw, str):
        try:
            created_at = datetime.fromisoformat(timestamp_raw.replace('Z', '+00:00')).replace(tzinfo=None)
        except ValueError:
            created_at = None

    updates = {
        'status': 'resolved',
        'resolved_at': resolved_at.isoformat(),
    }
    if created_at:
        updates['mttm_seconds'] = max(0, int((resolved_at - created_at).total_seconds()))
    await update_incident(incident_id, updates)
    
    # Log to audit trail
    await save_audit_entry({
        'id': f"audit-resolve-{incident_id}-{int(datetime.utcnow().timestamp())}",
        'timestamp': resolved_at.isoformat(),
        'actor': 'Operator',
        'actor_type': 'human',
        'action': 'incident_resolved',
        'incident_id': incident_id,
        'source': 'operator',
        'reason': 'Operator confirmed containment before closing.',
        'approval_status': 'approved',
        'approval_gate': 'operator',
    })
    
    return {
        'status': 'resolved',
        'id': incident_id,
        'resolved_at': resolved_at.isoformat(),
        'mttm_seconds': updates.get('mttm_seconds'),
    }


@app.patch('/api/incidents/{incident_id}/status')
async def patch_incident_status(incident_id: str, payload: IncidentStatusPatch):
    incident = await get_incident(incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail='Incident not found')

    updates = {'status': payload.status}
    if payload.status == 'resolved':
        updates['resolved_at'] = datetime.utcnow().isoformat()

    await update_incident(incident_id, updates)
    
    # Log to audit trail
    await save_audit_entry({
        'id': f"audit-status-{incident_id}-{int(datetime.utcnow().timestamp())}",
        'timestamp': datetime.utcnow().isoformat(),
        'actor': 'Operator',
        'actor_type': 'human',
        'action': f"status_changed_to_{payload.status}",
        'incident_id': incident_id,
        'source': 'operator',
        'reason': f"Operator updated status to {payload.status}",
        'approval_status': 'approved',
        'approval_gate': 'operator',
    })

    return {'id': incident_id, 'status': payload.status}

@app.post('/api/incidents/{incident_id}/aar')
async def create_aar(incident_id: str):
    incident = await get_incident(incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail='Incident not found')
    
    # Needs to be resolved before AAR
    if incident.get('status') != 'resolved':
        raise HTTPException(status_code=400, detail='Incident must be resolved before generating an AAR')
        
    audit_logs = await get_audit_entries(limit=500, incident_id=incident_id)
    aar_text = await generate_aar(incident, audit_logs)
    
    # Save the AAR
    updates = {'aar_generated': True, 'aar_text': aar_text}
    await update_incident(incident_id, updates)
    
    # Log to audit trail
    await save_audit_entry({
        'id': f"audit-aar-{incident_id}-{int(datetime.utcnow().timestamp())}",
        'timestamp': datetime.utcnow().isoformat(),
        'actor': 'System AI',
        'actor_type': 'AI',
        'action': 'aar_generated',
        'incident_id': incident_id,
        'source': 'system',
        'reason': 'Generated After-Action Report via Gemini',
        'approval_status': 'approved',
        'approval_gate': 'operator',
    })
    
    return {'id': incident_id, 'aar': aar_text}


@app.patch('/api/incidents/{incident_id}/assign')
async def assign_incident_responder(incident_id: str, payload: IncidentAssignmentPatch):
    incident = await get_incident(incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail='Incident not found')

    responder = await get_responder(payload.responder_id)
    if not responder:
        raise HTTPException(status_code=404, detail='Responder not found')

    assigned = list(dict.fromkeys([*(incident.get('assigned_responders') or []), responder['name']]))
    await update_responder_status(payload.responder_id, 'responding', incident_id)
    await update_incident(incident_id, {'assigned_responders': assigned, 'status': 'responding'})

    # Log to audit trail
    await save_audit_entry({
        'id': f"audit-assign-{incident_id}-{payload.responder_id}-{int(datetime.utcnow().timestamp())}",
        'timestamp': datetime.utcnow().isoformat(),
        'actor': 'Operator',
        'actor_type': 'human',
        'action': 'responder_assigned',
        'incident_id': incident_id,
        'source': 'operator',
        'reason': f"Operator assigned {responder['name']} to incident",
        'approval_status': 'approved',
        'approval_gate': 'operator',
    })

    return {
        'id': incident_id,
        'status': 'responding',
        'assigned_responders': assigned,
        'responder': responder,
    }

# ─── Pathfinding API ─────────────────────────────────────────

@app.post('/api/pathfind')
async def pathfind(start: str = Form(...), goal: str = Form(''),
                   hazard_nodes: str = Form('[]'),
                   severity: str = Form('high')):
    """
    On-demand A* pathfinding with risk cost function.
    hazard_nodes: JSON array of node IDs to avoid
    """
    import json as _json
    try:
        hazards = _json.loads(hazard_nodes)
    except:
        hazards = []

    if not goal:
        # Find nearest safe exit
        result = await run_routing(start, hazards, severity)
    else:
        from agents.routing_agent import astar_risk
        hazard_dict = {n: severity for n in hazards}
        result = astar_risk(start, goal, hazard_dict)

    if not result:
        raise HTTPException(status_code=404, detail='No safe path found')
    return result

# ─── Venue Graph API ─────────────────────────────────────────

@app.get('/api/venue-graph')
async def get_venue_graph():
    """Serve the venue topology graph for frontend map rendering"""
    return VENUE_GRAPH

# ─── Guest Help Endpoints ────────────────────────────────────

@app.post('/api/guest-help')
async def submit_guest_help(request: GuestHelpRequest):
    """Guest submits a help request from the Guest Portal"""
    help_data = {
        'id': str(uuid.uuid4()),
        'timestamp': datetime.utcnow().isoformat(),
        'guest_name': request.guest_name,
        'guest_location': request.guest_location,
        'help_type': request.help_type,
        'description': request.description,
        'severity': request.severity,
        'status': 'received',
        'special_needs': request.special_needs,
        'contact_method': request.contact_method,
        'language_preference': request.language_preference,
        'acknowledged_at': None,
    }
    help_id = await save_guest_help(help_data)
    
    # Log to audit trail
    await save_audit_entry({
        'id': f"audit-guest-{help_id}",
        'timestamp': datetime.utcnow().isoformat(),
        'actor': f"Guest: {request.guest_name or 'Anonymous'}",
        'actor_type': 'human',
        'action': 'guest_help_received',
        'source': 'app',
        'reason': f"{request.help_type}: {request.description}",
        'severity': request.severity,
        'zone_id': request.guest_location,
    })
    
    return {'id': help_id, 'status': 'received', 'timestamp': help_data['timestamp']}


@app.post('/api/guest/chat')
async def guest_chat(request: GuestChatRequest):
    """
    Calming AI chatbot for guests. 
    Provides safety instructions and identifies assigned responders.
    """
    from services.gemini_service import generate_calm_response
    
    # Fetch active responders for context
    responders = await get_responders()
    
    response = await generate_calm_response(
        message=request.message,
        location=request.location,
        responders=responders,
        context=request.context or {}
    )
    
    return response


def _broadcast_help_type(response_type: str, help_type: Optional[str] = None) -> tuple[str, str]:
    if help_type:
        return help_type, {
            'safe': 'resolved',
            'need_help': 'received',
            'trapped': 'escalated',
            'cannot_evacuate': 'escalated',
        }.get(response_type, 'received')

    mapping = {
        'safe': ('other', 'resolved'),
        'need_help': ('evacuation_assistance', 'received'),
        'trapped': ('evacuation_assistance', 'escalated'),
        'cannot_evacuate': ('accessibility', 'escalated'),
    }
    return mapping.get(response_type, ('other', 'received'))


@app.get('/api/broadcasts')
async def list_broadcasts(limit: int = 20, incident_id: Optional[str] = None, active_only: bool = False):
    return await get_broadcasts(limit=limit, incident_id=incident_id, active_only=active_only)


@app.get('/api/broadcasts/active')
async def get_current_broadcast():
    return await get_active_broadcast()


@app.get('/api/broadcasts/{broadcast_id}/acknowledgements')
async def list_broadcast_acknowledgements(broadcast_id: str, limit: int = 50):
    return await get_guest_acknowledgements(limit=limit, broadcast_id=broadcast_id)


@app.post('/api/broadcasts')
async def create_broadcast(request: BroadcastRequest):
    incident = None
    if request.incident_id:
        incident = await get_incident(request.incident_id)
    if not incident:
        incidents = await get_incidents(limit=1)
        incident = incidents[0] if incidents else None
    if not incident and not request.message:
        raise HTTPException(status_code=400, detail='Broadcast requires an active incident or a manual message')

    twin_snapshot = request.snapshot or {}
    broadcast_context = {
        'incident': incident,
        'snapshot': twin_snapshot,
        'incident_type': request.incident_type or (incident or {}).get('classification', {}).get('incident_type'),
        'location': request.location or (incident or {}).get('classification', {}).get('location'),
        'target_scope': request.scope,
        'target_floor': request.floor,
        'target_zone_id': request.zone_id,
        'target_zone_name': request.zone_id.replace('_', ' ') if request.zone_id else None,
        'tone': request.tone,
        'blocked_exits': request.blocked_exits or twin_snapshot.get('scenario', {}).get('blocked_exits') if isinstance(twin_snapshot, dict) else [],
        'safe_zone': request.safe_zone or twin_snapshot.get('scenario', {}).get('safe_zone') if isinstance(twin_snapshot, dict) else None,
        'guest_count': request.guest_count or twin_snapshot.get('scenario', {}).get('guest_count') if isinstance(twin_snapshot, dict) else None,
        'recommended_action': request.recommended_action or twin_snapshot.get('briefing', {}).get('recommended_action') if isinstance(twin_snapshot, dict) else None,
        'guest_announcement': request.guest_announcement or twin_snapshot.get('briefing', {}).get('guest_announcement') if isinstance(twin_snapshot, dict) else None,
        'rationale': request.rationale or twin_snapshot.get('briefing', {}).get('rationale') if isinstance(twin_snapshot, dict) else None,
    }

    draft = await draft_broadcast_message(broadcast_context)
    message = (request.message or draft.get('message') or '').strip()
    if not message:
        raise HTTPException(status_code=400, detail='Unable to draft broadcast message')

    title = (request.title or draft.get('title') or 'Guest safety notice').strip()
    broadcast = {
        'id': f"broadcast-{uuid.uuid4()}",
        'timestamp': datetime.utcnow().isoformat(),
        'incident_id': request.incident_id or (incident or {}).get('id'),
        'incident_type': broadcast_context.get('incident_type') or 'unknown',
        'location': broadcast_context.get('location'),
        'scope': request.scope,
        'floor': request.floor,
        'zone_id': request.zone_id,
        'tone': request.tone,
        'title': title,
        'message': message,
        'audience': draft.get('audience') or ('All guests' if request.scope == 'venue' else request.scope.title()),
        'operator_name': request.operator_name,
        'status': 'active',
        'draft': draft,
        'snapshot': request.snapshot,
        'ack_counts': {'safe': 0, 'need_help': 0, 'trapped': 0, 'cannot_evacuate': 0},
        'latest_ack': None,
    }
    if request.draft_only:
        return {'broadcast': broadcast, 'draft': draft}
    await save_broadcast(broadcast)
    await save_audit_entry({
        'id': f"audit-broadcast-{broadcast['id']}",
        'timestamp': broadcast['timestamp'],
        'actor': request.operator_name,
        'actor_type': 'human',
        'action': 'broadcast_sent',
        'incident_id': broadcast['incident_id'],
        'source': 'operator',
        'reason': f"{broadcast['scope']} broadcast published to guests.",
        'approval_status': 'approved',
        'approval_gate': 'operator',
    })
    return {'broadcast': broadcast, 'draft': draft}


@app.post('/api/broadcasts/{broadcast_id}/ack')
async def acknowledge_broadcast(broadcast_id: str, request: BroadcastAckRequest):
    broadcast = None
    broadcasts = await get_broadcasts(limit=50, incident_id=request.incident_id or None)
    for item in broadcasts:
        if item.get('id') == broadcast_id:
            broadcast = item
            break
    if not broadcast:
        active = await get_active_broadcast()
        if active and active.get('id') == broadcast_id:
            broadcast = active
    if not broadcast:
        raise HTTPException(status_code=404, detail='Broadcast not found')

    response_type = request.response_type
    help_type, status = _broadcast_help_type(response_type, request.help_type)
    ack_time = datetime.utcnow().isoformat()
    help_description = request.message or f'Guest broadcast acknowledgement: {response_type}'
    guest_help = None
    if request.guest_location:
        existing = await get_guest_help_requests(limit=20)
        for item in existing:
            if item.get('guest_location') == request.guest_location and item.get('status') != 'resolved':
                guest_help = item
                break

    guest_help_record = {
        'id': guest_help.get('id') if guest_help else f"guest-{uuid.uuid4()}",
        'timestamp': ack_time,
        'guest_name': request.guest_name,
        'guest_location': request.guest_location or broadcast.get('location') or 'Unknown',
        'guest_zone_id': request.guest_zone_id,
        'help_type': help_type,
        'description': help_description,
        'severity': 'low' if response_type == 'safe' else 'critical' if response_type == 'trapped' else 'high',
        'status': status,
        'assigned_responder_id': None,
        'safe_route': broadcast.get('draft', {}).get('guest_actions'),
        'response_time_seconds': None,
        'resolved_at': ack_time if response_type == 'safe' else None,
        'resolved_by': request.guest_name or 'Guest',
        'special_needs': None,
        'contact_method': request.contact_method,
        'language_preference': request.language_preference,
        'acknowledged_at': ack_time,
        'broadcast_id': broadcast_id,
        'response_type': response_type,
        'message': request.message,
    }

    if guest_help:
        await update_guest_help(guest_help['id'], guest_help_record)
        help_id = guest_help['id']
    else:
        help_id = await save_guest_help(guest_help_record)

    ack_record = {
        'id': f"ack-{uuid.uuid4()}",
        'timestamp': ack_time,
        'broadcast_id': broadcast_id,
        'incident_id': broadcast.get('incident_id'),
        'guest_name': request.guest_name,
        'guest_location': request.guest_location or broadcast.get('location') or 'Unknown',
        'guest_zone_id': request.guest_zone_id,
        'response_type': response_type,
        'status': status,
        'message': request.message,
        'help_id': help_id,
    }
    await save_guest_acknowledgement(ack_record)

    ack_counts = dict(broadcast.get('ack_counts') or {})
    ack_counts[response_type] = int(ack_counts.get(response_type, 0)) + 1
    await update_broadcast(broadcast_id, {
        'ack_counts': ack_counts,
        'latest_ack': ack_record,
    })

    await save_audit_entry({
        'id': f"audit-broadcast-ack-{ack_record['id']}",
        'timestamp': ack_time,
        'actor': request.guest_name or 'Guest',
        'actor_type': 'human',
        'action': 'broadcast_acknowledged',
        'incident_id': broadcast.get('incident_id'),
        'source': 'guest_portal',
        'reason': f"{response_type} response received for broadcast {broadcast_id}.",
        'approval_status': 'approved',
        'approval_gate': 'system',
    })

    return {'id': ack_record['id'], 'broadcast_id': broadcast_id, 'guest_help_id': help_id, 'status': status, 'help_type': help_type}


@app.post('/api/twin/simulate')
async def simulate_twin(request: TwinSimulationRequest):
    """Generate a deterministic crisis digital twin simulation."""
    try:
        payload = request.model_dump(exclude_none=True) if hasattr(request, 'model_dump') else request.dict(exclude_none=True)
        return await simulate_crisis_twin(payload)
    except Exception as exc:
        logger.error(f'Twin simulation failed: {exc}', exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))

@app.get('/api/guest-help')
async def list_guest_help(status: Optional[str] = None, limit: int = 50):
    """Get guest help requests"""
    return await get_guest_help_requests(limit=limit, status=status)

@app.patch('/api/guest-help/{help_id}')
async def update_guest_help_request(help_id: str, updates: dict):
    """Update guest help request status"""
    await update_guest_help(help_id, updates)
    return {'id': help_id, 'updated': updates}

# ─── Venue Layout & Zones ────────────────────────────────────

@app.get('/api/venue-layout')
async def get_venue_layout_endpoint():
    """Get complete venue floor plan layout"""
    return await get_venue_layout()

@app.get('/api/zones')
async def list_zones(floor: Optional[int] = None):
    """Get all zones, optionally filtered by floor"""
    return await get_zones(floor)

@app.get('/api/zones/{zone_id}')
async def get_zone_detail(zone_id: str):
    """Get individual zone details"""
    zone = await get_zone(zone_id)
    if not zone:
        raise HTTPException(status_code=404, detail='Zone not found')
    return zone

# ─── Responder Positioning ──────────────────────────────────

@app.patch('/api/responders/{responder_id}/position')
async def update_responder_pos(responder_id: str, payload: ResponderPositionUpdate):
    """Update responder's current position and zone"""
    responder = await get_responder(responder_id)
    if not responder:
        raise HTTPException(status_code=404, detail='Responder not found')
    
    await update_responder_position(responder_id, payload.zone_id, payload.coordinates)
    
    logger.info(f'Responder {responder_id} moved to zone {payload.zone_id}')
    return {'id': responder_id, 'zone_id': payload.zone_id, 'coordinates': payload.coordinates}

# ─── Incident Acknowledgement ────────────────────────────────

@app.patch('/api/incidents/{incident_id}/acknowledge')
async def acknowledge_incident(incident_id: str, payload: IncidentAcknowledgement):
    """Operator acknowledges an incident"""
    incident = await get_incident(incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail='Incident not found')
    
    ack_time = datetime.utcnow()
    created_at = None
    
    timestamp_raw = incident.get('timestamp')
    if isinstance(timestamp_raw, str):
        try:
            created_at = datetime.fromisoformat(timestamp_raw.replace('Z', '+00:00')).replace(tzinfo=None)
        except ValueError:
            created_at = None
    
    ack_seconds = None
    if created_at:
        ack_seconds = max(0, int((ack_time - created_at).total_seconds()))
    
    updates = {
        'acknowledged_at': ack_time.isoformat(),
        'ack_time_seconds': ack_seconds,
    }
    
    await update_incident(incident_id, updates)
    
    # Log to audit trail
    await save_audit_entry({
        'id': f"audit-ack-{incident_id}",
        'timestamp': ack_time.isoformat(),
        'actor': payload.actor,
        'actor_id': payload.actor_id,
        'actor_type': 'human',
        'action': 'incident_acknowledged',
        'incident_id': incident_id,
        'source': 'operator',
        'reason': payload.reason or 'Incident acknowledged by operator',
        'approval_status': 'approved',
        'approval_gate': 'operator',
    })
    
    return {
        'id': incident_id,
        'acknowledged_at': ack_time.isoformat(),
        'ack_time_seconds': ack_seconds,
    }

# ─── Alert Endpoints ────────────────────────────────────────

@app.get('/api/alerts')
async def list_alerts(incident_id: Optional[str] = None, limit: int = 50):
    """Get all alerts, optionally filtered by incident"""
    return await get_alerts(limit=limit, incident_id=incident_id)

@app.patch('/api/alerts/{alert_id}')
async def update_alert_status(alert_id: str, updates: dict):
    """Update alert status (acknowledge, resolve, etc)"""
    await update_alert(alert_id, updates)
    return {'id': alert_id, 'updated': updates}

# ─── Demo Seed ───────────────────────────────────────────────

@app.post('/api/demo-seed')
async def demo_seed():
    """Populate the store with realistic demo incidents for showcase"""
    incidents = await seed_demo_data()
    return {'seeded': len(incidents), 'ids': [i['id'] for i in incidents]}

# ─── CCTV & Video Intelligence ─────────────────────────────

@app.get('/api/cctv')
async def list_cctv_feeds():
    """Get all CCTV feeds"""
    return await get_cctv_feeds()

@app.get('/api/video-events')
async def list_video_events(incident_id: Optional[str] = None, limit: int = 50):
    """Get video events, optionally filtered by incident"""
    return await get_video_events(limit=limit, incident_id=incident_id)

@app.post('/api/video-events')
async def create_video_event(event: dict):
    """Create a new AI-detected video event"""
    event_id = await save_video_event(event)
    
    # Log to audit trail
    await save_audit_entry({
        'id': f"audit-video-{event_id}",
        'timestamp': datetime.utcnow().isoformat(),
        'actor': 'CCTV-AI',
        'actor_type': 'AI',
        'action': 'video_event_detected',
        'incident_id': event.get('incident_id'),
        'source': 'system',
        'reason': event.get('ai_summary', 'Anomaly detected in video feed'),
        'approval_status': 'pending',
        'approval_gate': 'operator',
    })
    
    return {'id': event_id, 'status': 'created'}

@app.patch('/api/video-events/{event_id}/verify')
async def verify_video_event(event_id: str, payload: IncidentAcknowledgement):
    """Operator verifies an AI video event"""
    updates = {'verification_status': 'verified', 'verified_at': datetime.utcnow().isoformat(), 'verified_by': payload.actor}
    await update_video_event(event_id, updates)
    
    # Log to audit trail
    await save_audit_entry({
        'id': f"audit-video-verify-{event_id}-{int(datetime.utcnow().timestamp())}",
        'timestamp': datetime.utcnow().isoformat(),
        'actor': payload.actor,
        'actor_type': 'human',
        'action': 'video_event_verified',
        'incident_id': None, # Could link to incident if known
        'source': 'operator',
        'reason': payload.reason or 'Video AI detection verified by operator',
        'approval_status': 'approved',
        'approval_gate': 'operator',
    })
    return {'id': event_id, 'status': 'verified'}

# ─── Team Units ──────────────────────────────────────────────

@app.get('/api/team-units')
async def list_team_units():
    """Get all team units"""
    return await get_team_units()

@app.patch('/api/team-units/{unit_id}')
async def update_team_unit_endpoint(unit_id: str, updates: dict):
    """Update team unit readiness/assignment"""
    await update_team_unit(unit_id, updates)
    return {'id': unit_id, 'updated': updates}

# ─── Health & SRE ────────────────────────────────────────────

@app.get('/health')
async def health():
    return {
        'status': 'ok',
        'service': 'Aegis CrisisHub',
        'version': '2.0.0',
        'gemini_mode': 'live' if get_gemini_api_key() else 'demo',
        'firestore_mode': 'live' if os.getenv('FIRESTORE_PROJECT_ID') else 'memory',
    }
