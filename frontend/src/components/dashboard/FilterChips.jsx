const FILTERS = [
  { key: 'all',         label: 'All',         icon: null },
  { key: 'fire',        label: 'Fire',        icon: '🔥' },
  { key: 'medical',     label: 'Medical',     icon: '🏥' },
  { key: 'security',    label: 'Security',    icon: '🔒' },
  { key: 'false_alarm', label: 'False Alarm', icon: '✓' },
];

// Accepts either (active, onChange, counts) OR (filter, setFilter, countByType) for compatibility
export default function FilterChips({ active, onChange, counts = {}, filter, setFilter, countByType }) {
  const activeKey = filter ?? active;
  const handleChange = setFilter ?? onChange;
  const getCount = (key) => {
    if (typeof countByType === 'function') return countByType(key);
    return counts[key] ?? undefined;
  };

  return (
    <div className="filter-chips">
      {FILTERS.map((f) => {
        const count = f.key !== 'all' ? getCount(f.key) : undefined;
        return (
          <button
            key={f.key}
            className={`filter-chip ${activeKey === f.key ? 'selected' : ''}`}
            onClick={() => handleChange(f.key)}
          >
            {f.icon && <span>{f.icon}</span>}
            {f.label}
            {count !== undefined && <span className="filter-count">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
