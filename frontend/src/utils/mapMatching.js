/**
 * Find the best matching zone for a location string.
 * Used by AdvancedMap and LiveMap to position hazard overlays.
 */
export function findBestZoneMatch(zones, locationStr) {
  if (!zones || !locationStr) return null;
  const loc = locationStr.toLowerCase().replace(/-/g, '_').replace(/\s+/g, '_');

  // 1. Exact ID match
  const exact = zones.find((z) => z.id === loc);
  if (exact) return exact;

  // 2. Partial ID match
  const partial = zones.find((z) => loc.includes(z.id) || z.id.includes(loc.split('_')[0]));
  if (partial) return partial;

  // 3. Name match (case-insensitive, space/underscore flexible)
  const src = locationStr.toLowerCase().replace(/_/g, ' ');
  const nameMatch = zones.find((z) => {
    const name = z.name.toLowerCase();
    return name.includes(src) || src.includes(name.split(' ')[0]);
  });
  if (nameMatch) return nameMatch;

  // 4. Type keyword match
  const typeMap = {
    kitchen: 'kitchen', lobby: 'lobby', restaurant: 'restaurant',
    pool: 'pool', corridor: 'corridor', clinic: 'clinic',
    medical: 'clinic', stairwell: 'stairwell', 'front desk': 'front_desk',
    conference: 'conference', room: 'room', exit: 'exit',
  };
  for (const [keyword, typeId] of Object.entries(typeMap)) {
    if (src.includes(keyword)) {
      const typeMatch = zones.find((z) => z.id.includes(typeId) || z.zone_type === typeId);
      if (typeMatch) return typeMatch;
    }
  }

  return null;
}
