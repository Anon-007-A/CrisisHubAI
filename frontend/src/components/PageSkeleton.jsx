export default function PageSkeleton() {
  return (
    <div className="page-shell">
      <div className="page-hero" style={{ background: 'rgba(33,33,33,0.5)' }}>
        <div style={{ flex: 1 }}>
          <div style={{
            height: 12,
            width: 60,
            backgroundColor: 'rgba(255,255,255,0.1)',
            borderRadius: 4,
            marginBottom: 12,
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          }} />
          <div style={{
            height: 32,
            width: '60%',
            backgroundColor: 'rgba(255,255,255,0.1)',
            borderRadius: 4,
            marginBottom: 10,
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite 0.1s',
          }} />
          <div style={{
            height: 14,
            width: '80%',
            backgroundColor: 'rgba(255,255,255,0.05)',
            borderRadius: 4,
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite 0.2s',
          }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginTop: 20 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{
            backgroundColor: 'rgba(33,33,33,0.3)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            padding: 16,
            animation: `pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite ${i * 0.1}s`,
          }}>
            <div style={{
              height: 20,
              width: '70%',
              backgroundColor: 'rgba(255,255,255,0.1)',
              borderRadius: 4,
              marginBottom: 12,
            }} />
            <div style={{
              height: 16,
              width: '100%',
              backgroundColor: 'rgba(255,255,255,0.05)',
              borderRadius: 4,
              marginBottom: 8,
            }} />
            <div style={{
              height: 16,
              width: '90%',
              backgroundColor: 'rgba(255,255,255,0.05)',
              borderRadius: 4,
            }} />
          </div>
        ))}
      </div>
    </div>
  );
}
