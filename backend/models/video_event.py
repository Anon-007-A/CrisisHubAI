from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
import uuid

class VideoEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    incident_id: Optional[str] = None
    cctv_feed_id: str
    detected_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    event_type: str # smoke_detected, flame_detected, collapse_detected, intrusion_detected, crowding_detected, suspicious_behavior
    confidence: float
    clip_url: Optional[str] = None
    snapshot_url: Optional[str] = None
    ai_summary: str
    verification_status: str = 'pending' # pending, verified, rejected
    linked_audit_event_id: Optional[str] = None
