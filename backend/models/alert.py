from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime

class Alert(BaseModel):
    id: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    incident_id: Optional[str] = None
    alert_type: Literal['incident', 'escalation', 'sos', 'guest_report', 'system']
    severity: Literal['info', 'low', 'medium', 'high', 'critical']
    source: Literal['thermal_sensor', 'guest_report', 'cctv_model', 'panic_button', 'staff_report', 'system']
    title: str
    description: str
    status: Literal['new', 'acknowledged', 'resolved', 'dismissed']
    acknowledged_at: Optional[datetime] = None
    acknowledged_by: Optional[str] = None
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None
    confidence: Optional[float] = None  # 0.0-1.0 for AI-generated alerts
    sla_seconds: int = 120
    sla_breach: bool = False
    zone_id: Optional[str] = None
    location: Optional[str] = None
    assigned_responder_id: Optional[str] = None
    duplicate_alert_ids: list[str] = []  # Grouped alerts from same incident
