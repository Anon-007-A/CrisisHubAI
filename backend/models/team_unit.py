from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
import uuid

class TeamUnit(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    type: str  # fire, medical, security, maintenance, guest_support
    leader_id: Optional[str] = None
    member_ids: List[str] = []
    readiness: int = 100
    current_assignment: Optional[str] = None
    status: str = 'available'
