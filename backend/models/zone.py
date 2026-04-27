from pydantic import BaseModel
from typing import Optional, Literal

class Zone(BaseModel):
    id: str
    name: str
    floor: int
    zone_type: Literal['corridor', 'room', 'stairwell', 'exit', 'assembly_point', 'medical', 'kitchen', 'lobby', 'office', 'other']
    coordinates: dict  # {x, y, width, height} for SVG rendering
    capacity: Optional[int] = None
    exits: list[str] = []  # Connected zone IDs
    hazard_zones: list[str] = []  # Adjacent hazard zones
    is_blocked: bool = False
    cctv_nodes: list[str] = []
    sensor_nodes: list[str] = []
    svg_path: Optional[str] = None  # SVG path for rendering
