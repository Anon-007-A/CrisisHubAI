from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime

class GuestHelp(BaseModel):
    id: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    guest_name: Optional[str] = None
    guest_location: str
    guest_zone_id: Optional[str] = None
    help_type: Literal['evacuation_assistance', 'medical', 'lost', 'panic', 'accessibility', 'family_reunification', 'other']
    description: str
    severity: Literal['low', 'medium', 'high', 'critical']
    status: Literal['received', 'acknowledged', 'in_progress', 'resolved', 'escalated']
    assigned_responder_id: Optional[str] = None
    safe_route: Optional[dict] = None  # {path, exit, steps}
    response_time_seconds: Optional[int] = None
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None
    special_needs: Optional[str] = None  # Mobility, language, medical conditions
    contact_method: Literal['app', 'phone', 'radio', 'in_person']
    language_preference: str = 'en'
    acknowledged_at: Optional[datetime] = None
