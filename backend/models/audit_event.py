from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime

class AuditEvent(BaseModel):
    id: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    actor: str
    actor_id: Optional[str] = None
    actor_type: Literal['human', 'ai', 'system']
    action: Literal[
        'incident_created',
        'incident_classified',
        'incident_verified',
        'incident_escalated',
        'incident_responding',
        'incident_contained',
        'incident_resolved',
        'incident_false_alarm',
        'responder_dispatched',
        'responder_acknowledged',
        'responder_arrived',
        'route_calculated',
        'route_updated',
        'alert_created',
        'alert_acknowledged',
        'guest_help_received',
        'guest_guided',
        'escalation_approved',
        'evacuation_initiated',
    ]
    incident_id: Optional[str] = None
    zone_id: Optional[str] = None
    source: Literal['thermal_sensor', 'guest_report', 'cctv', 'operator', 'system', 'panic_button', 'staff_report']
    
    # Rich contextual information
    reason: str  # Detailed, contextual reason for this event
    confidence: Optional[float] = None  # 0.0-1.0 for AI-driven actions
    approval_status: Literal['approved', 'pending', 'rejected', 'auto']
    approval_gate: Literal['operator', 'lead', 'external', 'none']
    approval_by: Optional[str] = None
    approval_timestamp: Optional[datetime] = None
    
    # Linked entities
    linked_entities: list[str] = []  # responder_ids, zone_ids, etc.
    
    # Metadata for traceability
    metadata: dict = {}  # Additional context: sensor_reading, confidence_score, etc.
    
    # Evidence trail
    evidence: Optional[str] = None  # Reference to image, sensor data, etc.
