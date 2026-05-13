import { useTranslation } from 'react-i18next'

export const STEPS_KEYS = ['scan', 'rental', 'photos', 'contract']

export default function StepBar({ current }) {
  const { t } = useTranslation('common')
  return (
    <div className="steps">
      {STEPS_KEYS.map((key, i) => (
        <div key={i} className="step-item">
          <div className={`step-circle ${i < current ? 'done' : i === current ? 'active' : ''}`}>
            {i < current ? '✓' : i + 1}
          </div>
          <span className={`step-label${i === current ? ' active' : ''}`}>{t(`pages.newRental.steps.${key}`)}</span>
          {i < STEPS_KEYS.length - 1 && <div className={`step-line${i < current ? ' done' : ''}`} />}
        </div>
      ))}
    </div>
  )
}
