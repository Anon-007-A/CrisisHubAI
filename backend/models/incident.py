from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional, Literal
from datetime import datetime

class IncidentInput(BaseModel):
    report_text: str = Field(..., min_length=3, max_length=2000, description="Incident description from reporter")
    location_hint: Optional[str] = Field(None, max_length=500, description="Venue location or zone")
    reporter_role: Literal['guest', 'staff'] = Field('guest', description="Role of person reporting")
    image_data: Optional[str] = Field(None, description="Base64-encoded image data")
    
    @field_validator('report_text')
    @classmethod
    def validate_report_text(cls, v: str) -> str:
        """Ensure report text is not just whitespace"""
        if not v.strip():
            raise ValueError("Report text cannot be empty or whitespace only")
        return v.strip()
    
    @field_validator('location_hint')
    @classmethod
    def validate_location(cls, v: Optional[str]) -> Optional[str]:
        """Validate location hint if provided"""
        if v is not None and isinstance(v, str):
            v = v.strip()
            if len(v) == 0:
                return None
        return v

class IncidentClassification(BaseModel):
    incident_type: Literal['fire', 'medical', 'security', 'false_alarm']
    severity: Literal['low', 'medium', 'high', 'critical']
    location: str = Field(..., min_length=1, max_length=500)
    summary: str = Field(..., min_length=5, max_length=1000)
    responders_needed: list[str]
    evacuation_required: bool
    suggested_safe_zone: Optional[str] = None
    confidence: float = Field(..., ge=0.0, le=1.0)
    ai_reasoning: Optional[str] = None
    
    @field_validator('location')
    @classmethod
    def validate_location_nonempty(cls, v: str) -> str:
        """Ensure location is not empty"""
        if not v or not v.strip():
            raise ValueError("Location cannot be empty")
        return v.strip()
    
    @field_validator('confidence')
    @classmethod
    def validate_confidence(cls, v: float) -> float:
        """Ensure confidence is between 0 and 1"""
        if not (0.0 <= v <= 1.0):
            raise ValueError("Confidence must be between 0.0 and 1.0")
        return round(v, 2)  # Round to 2 decimal places
    
    @field_validator('responders_needed')
    @classmethod
    def validate_responders(cls, v: list) -> list:
        """Ensure at least one responder is needed"""
        if not v or len(v) == 0:
            raise ValueError("At least one responder must be needed")
        # Filter out duplicates
        return list(set(v))

class AutonomousAction(BaseModel):
    action: str
    detail: str
    authority: Optional[str] = None
    reasoning: Optional[str] = None
    timestamp: Optional[str] = None

class OperatorAction(BaseModel):
    actor: str
    actor_id: Optional[str] = None
    action: str
    detail: str
    reason: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    approval_gate: Literal['operator', 'lead', 'external'] = 'operator'

class Incident(BaseModel):
    id: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    input: IncidentInput
    classification: Optional[IncidentClassification] = None
    status: Literal['detected', 'verified', 'escalated', 'responding', 'contained', 'resolved', 'false_alarm'] = 'detected'
    lifecycle_state: Literal['detected', 'verified', 'escalated', 'responding', 'contained', 'resolved', 'false_alarm'] = 'detected'
    lifecycle_history: list[dict] = []  # {state, timestamp, actor, reason}
    assigned_responders: list[str] = []
    evacuation_route: Optional[dict] = None
    autonomous_actions: list[dict] = []
    operator_actions: list[OperatorAction] = []
    mttm_seconds: Optional[int] = None
    ack_time_seconds: Optional[int] = None  # Time to first acknowledgement
    resolved_at: Optional[datetime] = None
    verified_at: Optional[datetime] = None
    escalated_at: Optional[datetime] = None
    toil_saved: int = 0
    false_alarm_reason: Optional[str] = None
    priority: Literal['low', 'medium', 'high', 'critical'] = 'medium'
    sla_response_seconds: int = 120
    sla_breach: bool = False
