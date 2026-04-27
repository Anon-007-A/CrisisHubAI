from pydantic import BaseModel, Field
from typing import Optional
import uuid

class CCTVFeed(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    camera_code: str
    label: str
    floor_id: str
    zone_id: str
    status: str = 'online' # online, offline, alerting
    stream_url: Optional[str] = None
    snapshot_url: Optional[str] = None
    direction: Optional[str] = None
    metadata: dict = {}
