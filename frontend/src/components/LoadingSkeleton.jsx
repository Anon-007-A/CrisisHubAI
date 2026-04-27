import SkeletonCard from './dashboard/SkeletonCard';

export default function LoadingSkeleton() {
  return (
    <div style={{ padding: '40px 20px' }}>
      <SkeletonCard count={3} />
    </div>
  );
}
