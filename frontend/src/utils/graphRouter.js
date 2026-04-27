/**
 * Risk-aware A* pathfinding for Aegis CrisisHub.
 * 
 * Implements the cost function: C = Σ w(e) · (1 + p(h))
 * where p(h) is the hazard probability decaying with distance.
 */

// Severity → hazard probability mapping
const SEVERITY_PROB = {
  critical: 0.95,
  high: 0.70,
  medium: 0.40,
  low: 0.10,
};

function dist(graph, a, b) {
  const n = graph.nodes;
  if (!n[a] || !n[b]) return Infinity;
  return Math.hypot(n[a].x - n[b].x, n[a].y - n[b].y);
}

/**
 * Compute hazard probability at a node considering proximity to hazard epicenters.
 * @param {Object} graph - The venue graph
 * @param {string} node - Node to evaluate  
 * @param {Array} hazardNodes - Array of {node, severity} objects
 * @returns {number} p(h) for the node
 */
function hazardCost(graph, node, hazardNodes) {
  if (!hazardNodes || hazardNodes.length === 0) return 0;
  
  let maxP = 0;
  for (const hz of hazardNodes) {
    const baseP = SEVERITY_PROB[hz.severity] || 0.1;
    if (node === hz.node) return baseP; // Direct hit
    
    const d = dist(graph, node, hz.node);
    if (d < 1) return baseP;
    const decay = baseP / (1 + (d / 150) ** 2);
    maxP = Math.max(maxP, decay);
  }
  return maxP;
}

/**
 * Risk-aware A* pathfinding.
 * Cost = Σ w(e) · (1 + p(h))
 * 
 * @param {Object} graph - Venue graph with nodes and edges
 * @param {string} start - Start node ID
 * @param {string} goal - Goal node ID
 * @param {Array} hazardNodes - Array of {node, severity} objects
 * @returns {Object} {coords, path, riskCost} or empty result
 */
export function astarRisk(graph, start, goal, hazardNodes = []) {
  if (!graph.nodes[start] || !graph.nodes[goal]) return { coords: [], path: [], riskCost: Infinity };
  
  const openSet = [[0, start]];
  const cameFrom = {};
  const gScore = { [start]: 0 };
  
  while (openSet.length) {
    openSet.sort((a, b) => a[0] - b[0]);
    const [, current] = openSet.shift();
    
    if (current === goal) {
      const path = [];
      let c = current;
      while (c in cameFrom) { path.unshift(c); c = cameFrom[c]; }
      path.unshift(start);
      return {
        coords: path.map(n => [graph.nodes[n].y, graph.nodes[n].x]),
        path,
        riskCost: gScore[current],
      };
    }
    
    for (const [neighbor, w] of Object.entries(graph.edges[current] || {})) {
      const pH = hazardCost(graph, neighbor, hazardNodes);
      
      // Critical hazard nodes get infinite cost penalty (impassable)
      const isCriticalHazard = hazardNodes.some(h => h.node === neighbor && (SEVERITY_PROB[h.severity] || 0) >= 0.9);
      const riskWeight = isCriticalHazard ? Infinity : w * (1 + pH);
      
      const tg = gScore[current] + riskWeight;
      if (tg < (gScore[neighbor] ?? Infinity)) {
        cameFrom[neighbor] = current;
        gScore[neighbor] = tg;
        const h = dist(graph, neighbor, goal) / 100;
        openSet.push([tg + h, neighbor]);
      }
    }
  }
  
  return { coords: [], path: [], riskCost: Infinity };
}

/**
 * Legacy A* with simple blocked node list (backward compat).
 */
export function astar(graph, start, goal, blockedNodes = []) {
  const openSet = [[0, start]];
  const cameFrom = {};
  const gScore = { [start]: 0 };
  
  while (openSet.length) {
    openSet.sort((a, b) => a[0] - b[0]);
    const [, current] = openSet.shift();
    
    if (current === goal) {
      const path = [];
      let c = current;
      while (c in cameFrom) { path.unshift(c); c = cameFrom[c]; }
      path.unshift(start);
      return path.map(n => [graph.nodes[n].y, graph.nodes[n].x]);
    }
    
    for (const [neighbor, w] of Object.entries(graph.edges[current] || {})) {
      if (blockedNodes.includes(neighbor)) continue;
      const tg = gScore[current] + w;
      if (tg < (gScore[neighbor] ?? Infinity)) {
        cameFrom[neighbor] = current;
        gScore[neighbor] = tg;
        openSet.push([tg + dist(graph, neighbor, goal) / 100, neighbor]);
      }
    }
  }
  return [];
}

/**
 * Find the safest evacuation route to nearest exit using risk-aware A*.
 */
export function findSafestExit(graph, start, hazardNodes = []) {
  const exits = Object.entries(graph.nodes)
    .filter(([, d]) => d.type === 'exit')
    .map(([k]) => k);
  
  let best = null;
  for (const exit of exits) {
    const result = astarRisk(graph, start, exit, hazardNodes);
    if (result.coords.length > 0 && (!best || result.riskCost < best.riskCost)) {
      best = { ...result, exit };
    }
  }
  return best || { coords: [], path: [], riskCost: Infinity, exit: null };
}
