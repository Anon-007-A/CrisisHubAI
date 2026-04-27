/**
 * Calculate a risk priority score for an incident.
 * Used to sort the incident console from highest to lowest risk.
 */
export function calculateRiskScore(incident) {
  if (!incident) return 0;
  const sev = incident.classification?.severity;
  const conf = incident.classification?.confidence || 0.8;
  const hasRoute = incident.evacuation_route ? 1.3 : 1;
  const isStale = !incident.assigned_responders?.length ? 1.4 : 1;
  const sevScore = sev === 'critical' ? 100 : sev === 'high' ? 70 : sev === 'medium' ? 40 : 20;
  const minsElapsed = Math.min(60, Math.max(0, (Date.now() - new Date(incident.timestamp).getTime()) / 60000));
  const ageBonus = sev === 'critical' && minsElapsed > 5 ? 20 : 0;
  return Math.round((sevScore * conf * hasRoute * isStale) + ageBonus);
}
