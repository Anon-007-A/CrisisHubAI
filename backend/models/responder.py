from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime

class Responder(BaseModel):
    id: str
    name: str
    role: Literal['fire_team', 'medical', 'security', 'management', 'admin', 'evacuation_lead', 'liaison']
    status: Literal['available', 'dispatched', 'responding', 'on_scene', 'offline'] = 'available'
    location: str
    zone_id: Optional[str] = None
    coordinates: Optional[dict] = None  # {x, y} for map display
    assigned_incident_id: Optional[str] = None
    eta_seconds: Optional[int] = None
    readiness: Literal['ready', 'preparing', 'unavailable'] = 'ready'
    contact_channel: str = 'radio'  # 'radio', 'phone', 'push', 'sms'
    contact_number: Optional[str] = None
    team_lead_id: Optional[str] = None
    certification: Optional[str] = None  # e.g. 'cpr_certified', 'hazmat_trained'
    last_position_update: Optional[datetime] = None
    response_time_avg_seconds: int = 0
    incidents_responded: int = 0
