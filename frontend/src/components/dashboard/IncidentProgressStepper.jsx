import { INCIDENT_STEPS, getIncidentStep } from '../../lib/mockData';

export default function IncidentProgressStepper({ incident }) {
  const currentStep = getIncidentStep(incident);
  const currentStepIndex = INCIDENT_STEPS.findIndex(s => s.value === currentStep);

  return (
    <div style={{ marginTop: 16, padding: '12px 0' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        {INCIDENT_STEPS.map((step, index) => (
          <div key={step.value} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            {/* Step Circle */}
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background:
                  index === currentStepIndex
                    ? 'var(--color-primary)'
                    : index < currentStepIndex
                      ? 'var(--color-success)'
                    : 'var(--color-surface-container-high)',
                color:
                  index <= currentStepIndex
                    ? 'white'
                    : 'var(--color-on-surface-variant)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.75rem',
                flexShrink: 0,
              }}
            >
              {index + 1}
            </div>

            {/* Connecting Line */}
            {index < INCIDENT_STEPS.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  background:
                    index < currentStepIndex
                      ? 'var(--color-primary)'
                      : 'var(--color-surface-container-high)',
                  margin: '0 8px',
                }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step Labels */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
          marginTop: 8,
        }}
      >
        {INCIDENT_STEPS.map((step, index) => (
          <div key={step.value} style={{ flex: 1 }}>
            <p
              className="t-caption"
              style={{
                textAlign: 'center',
                color:
                  index <= currentStepIndex
                    ? 'var(--color-on-surface)'
                    : 'var(--color-on-surface-variant)',
                fontWeight: index <= currentStepIndex ? 600 : 400,
                fontSize: '0.7rem',
              }}
            >
              {step.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
