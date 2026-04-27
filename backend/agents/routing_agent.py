import json, heapq, os, math
from typing import Optional

# Load venue graph once at startup
GRAPH_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'venue_graph.json')
try:
    with open(GRAPH_PATH) as f:
        VENUE_GRAPH = json.load(f)
except FileNotFoundError:
    VENUE_GRAPH = {"nodes": {}, "edges": {}}

# ─── Hazard Probability Mapping ────────────────────────────
# Maps AI severity → p(h) for the risk cost function:
#   C = Σ w(e) · (1 + p(h))
SEVERITY_HAZARD_PROB = {
    'critical': 0.95,
    'high': 0.70,
    'medium': 0.40,
    'low': 0.10,
}

def _node_distance(a: str, b: str) -> float:
    """Euclidean distance between node coordinates"""
    nodes = VENUE_GRAPH['nodes']
    if a not in nodes or b not in nodes:
        return float('inf')
    ax, ay = nodes[a]['x'], nodes[a]['y']
    bx, by = nodes[b]['x'], nodes[b]['y']
    return math.hypot(ax - bx, ay - by)


def _hazard_cost(node: str, hazard_nodes: dict) -> float:
    """
    Compute hazard probability for a node considering proximity to hazard epicenters.
    hazard_nodes: dict mapping node_id → severity string
    Returns p(h) for the given node.
    
    Nodes AT the hazard get full p(h).
    Nearby nodes get inverse-square-decayed p(h) based on distance.
    """
    if not hazard_nodes:
        return 0.0
    
    max_p = 0.0
    for hz_node, severity in hazard_nodes.items():
        base_p = SEVERITY_HAZARD_PROB.get(severity, 0.1)
        if node == hz_node:
            return base_p  # Direct hit — full probability
        
        dist = _node_distance(node, hz_node)
        if dist < 1:
            dist = 1
        # Inverse-square decay: hazard influence drops with distance
        # Normalize by 200px (approx 1 room width)
        decay = base_p / (1 + (dist / 150) ** 2)
        max_p = max(max_p, decay)
    
    return max_p


def astar_risk(start: str, goal: str, hazard_nodes: dict = None) -> Optional[dict]:
    """
    A* pathfinding with risk-aware cost function.
    
    Cost = Σ w(e) · (1 + p(h))
    
    where w(e) is the edge weight and p(h) is the real-time hazard probability
    at the destination node.
    
    Args:
        start: Starting node ID
        goal: Goal node ID
        hazard_nodes: dict mapping node_id → severity (e.g. {'kitchen': 'critical'})
    
    Returns:
        dict with path, risk_cost, and steps, or None if no path found
    """
    if start not in VENUE_GRAPH['nodes'] or goal not in VENUE_GRAPH['nodes']:
        return None
    
    hazard_nodes = hazard_nodes or {}
    
    open_set = [(0, 0, start)]  # (f_score, counter, node)
    came_from = {}
    g_score = {start: 0}
    counter = 0
    
    while open_set:
        f, _, current = heapq.heappop(open_set)
        
        if current == goal:
            path = []
            c = current
            while c in came_from:
                path.append(c)
                c = came_from[c]
            path.append(start)
            path = list(reversed(path))
            
            # Calculate total risk cost
            total_risk = g_score[current]
            
            return {
                'path': path,
                'risk_cost': round(total_risk, 3),
                'steps': [VENUE_GRAPH['nodes'][n]['label'] for n in path],
                'hazard_avoidance': [n for n in hazard_nodes if n not in path],
            }
        
        for neighbor, weight in VENUE_GRAPH['edges'].get(current, {}).items():
            # Risk cost function: C = w(e) · (1 + p(h))
            p_h = _hazard_cost(neighbor, hazard_nodes)
            
            # If node IS the hazard epicenter with critical severity, make cost infinite
            if neighbor in hazard_nodes and SEVERITY_HAZARD_PROB.get(hazard_nodes[neighbor], 0) >= 0.9:
                risk_weight = float('inf')
            elif neighbor in hazard_nodes and hazard_nodes[neighbor] == 'smoke_vector':
                risk_weight = weight * 10 * (1 + p_h)  # 10x penalty for smoke vectors
            else:
                risk_weight = weight * (1 + p_h)
            
            tentative_g = g_score[current] + risk_weight
            
            if tentative_g < g_score.get(neighbor, float('inf')):
                came_from[neighbor] = current
                g_score[neighbor] = tentative_g
                h = _node_distance(neighbor, goal) / 100  # Normalized heuristic
                counter += 1
                heapq.heappush(open_set, (tentative_g + h, counter, neighbor))
    
    return None


# Legacy A* (simple blocked nodes) — kept for backward compatibility
def astar(start: str, goal: str, blocked_nodes: list = []) -> Optional[list]:
    """Simple A* with binary node blocking (legacy)."""
    open_set = [(0, start)]
    came_from = {}
    g_score = {start: 0}
    while open_set:
        _, current = heapq.heappop(open_set)
        if current == goal:
            path = []
            while current in came_from:
                path.append(current)
                current = came_from[current]
            path.append(start)
            return list(reversed(path))
        for neighbor, weight in VENUE_GRAPH['edges'].get(current, {}).items():
            if neighbor in blocked_nodes:
                continue
            tentative_g = g_score[current] + weight
            if tentative_g < g_score.get(neighbor, float('inf')):
                came_from[neighbor] = current
                g_score[neighbor] = tentative_g
                f = tentative_g + _node_distance(neighbor, goal) / 100
                heapq.heappush(open_set, (f, neighbor))
    return None


async def run_routing(incident_location: str, hazard_nodes: list = [],
                      severity: str = 'high', description: str = '') -> dict:
    """
    Find safest evacuation route using risk-aware A*.
    
    Converts hazard_nodes list to dict with severity, then finds
    the route with minimum total risk cost to any exit.
    """
    exits = [n for n, d in VENUE_GRAPH['nodes'].items() if d.get('type') == 'exit']
    
    if incident_location not in VENUE_GRAPH['nodes']:
        return {'path': [], 'exit': 'unknown', 'steps': ['Use nearest emergency exit'],
                'risk_cost': float('inf')}
    
    # Build hazard dict: node → severity
    hazard_dict = {node: severity for node in hazard_nodes}
    # The incident location itself is a hazard source
    if incident_location not in hazard_dict:
        hazard_dict[incident_location] = severity

    # Parse description for smoke vectors (e.g., "smoke spreading toward reception")
    desc_lower = description.lower()
    if 'smoke' in desc_lower:
        for node_id, node_data in VENUE_GRAPH['nodes'].items():
            if node_data['label'].lower() in desc_lower and node_id != incident_location:
                # Flag as smoke vector — to trigger 10x penalty
                hazard_dict[node_id] = 'smoke_vector'

    best = None
    for exit_node in exits:
        result = astar_risk(incident_location, exit_node, hazard_dict)
        if result and (best is None or result['risk_cost'] < best['risk_cost']):
            best = result
            best['exit'] = exit_node
    
    if best:
        return best
    
    return {'path': [], 'exit': 'unknown', 'steps': ['Use nearest emergency exit'],
            'risk_cost': float('inf')}
