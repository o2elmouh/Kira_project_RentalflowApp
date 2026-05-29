import { useTranslation } from 'react-i18next'

/**
 * Renders a "Prolongation demandée jusqu'au X" notice row for a contract that
 * has one or more pending prolongation leads linked to it. Used inside the
 * Contracts table.
 *
 * @param {{
 *   leads: Array<{ id: string, extracted_data: { end_date?: string } }>,
 *   colSpan: number,
 *   onView: () => void,
 * }} props
 */
export default function ProlongationBanner({ leads, colSpan, onView }) {
  const { t } = useTranslation('contracts')
  if (!leads?.length) return null
  const first = leads[0]
  const moreCount = leads.length - 1

  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: 0 }}>
        <div
          style={{
            padding: '6px 10px',
            background: 'rgba(59,130,246,0.08)',
            borderRadius: 6,
            border: '1px solid rgba(59,130,246,0.2)',
            fontSize: 12,
            color: '#2563eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          <span>
            🔔 {t('panel.prolongationRequestedUntil', {
              defaultValue: 'Prolongation demandée jusqu\'au {{date}}',
              date: first.extracted_data?.end_date,
            })}
            {moreCount > 0 && (
              <span style={{ marginLeft: 8, opacity: 0.7 }}>
                {t('panel.prolongationOther', {
                  defaultValue: '+{{count}} autres',
                  count: moreCount,
                })}
              </span>
            )}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onView()
            }}
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              border: 'none',
              background: '#2563eb',
              color: '#fff',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            {t('panel.prolongationView', { defaultValue: 'Voir' })} →
          </button>
        </div>
      </td>
    </tr>
  )
}
