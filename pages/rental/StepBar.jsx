export const STEPS = ['Scan ID', 'Rental Details', 'Photos', 'Contrat & Facture']

export default function StepBar({ current }) {
  return (
    <div className="steps">
      {STEPS.map((label, i) => (
        <div key={i} className="step-item">
          <div className={`step-circle ${i < current ? 'done' : i === current ? 'active' : ''}`}>
            {i < current ? '✓' : i + 1}
          </div>
          <span className={`step-label${i === current ? ' active' : ''}`}>{label}</span>
          {i < STEPS.length - 1 && <div className={`step-line${i < current ? ' done' : ''}`} />}
        </div>
      ))}
    </div>
  )
}
