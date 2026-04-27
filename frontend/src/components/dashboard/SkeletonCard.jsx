export default function SkeletonCard({ count = 2 }) {
  return (
    <div className="skeleton-list">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton-card">
          <div className="skeleton-line skeleton-line-wide" />
          <div className="skeleton-line skeleton-line-mid" />
          <div className="skeleton-line skeleton-line-short" />
        </div>
      ))}
    </div>
  );
}
