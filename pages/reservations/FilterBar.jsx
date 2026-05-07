import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'

const SOURCES  = ['all', 'EMAIL', 'WHATSAPP', 'WEBSITE', 'IN_PERSON']
const STATUSES = ['all', 'PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED']

/**
 * Filter bar above the reservations table.
 *
 * All filters are controlled — the parent owns the state via
 * `useReservationFilters`, and `useReservations` automatically refetches
 * as the queryKey changes.
 */
export default function FilterBar({ filters, setFilter, onReset }) {
  const { t } = useTranslation('reservations')

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 10,
        marginBottom: 16,
        padding: 12,
        background: 'var(--surface-2, #F7F5F2)',
        border: '1px solid var(--border, #E5E1DA)',
        borderRadius: 8,
      }}
    >
      {/* Customer search — spans 2 columns on wide screens */}
      <div style={{ position: 'relative', gridColumn: 'span 2' }}>
        <Search
          size={14}
          style={{
            position: 'absolute',
            insetInlineStart: 10,
            top: 11,
            color: 'var(--text3, #999)',
          }}
        />
        <input
          className="form-input"
          style={{ paddingInlineStart: 32 }}
          placeholder={t('filters.search')}
          value={filters.search}
          onChange={e => setFilter('search', e.target.value)}
        />
      </div>

      {/* Source channel */}
      <select
        className="form-input"
        value={filters.source}
        onChange={e => setFilter('source', e.target.value)}
        title={t('columns.source')}
      >
        {SOURCES.map(s => (
          <option key={s} value={s}>
            {t(`source.${s}`)}
          </option>
        ))}
      </select>

      {/* Status */}
      <select
        className="form-input"
        value={filters.status}
        onChange={e => setFilter('status', e.target.value)}
        title={t('columns.status')}
      >
        {STATUSES.map(s => (
          <option key={s} value={s}>
            {t(`status.${s}`)}
          </option>
        ))}
      </select>

      {/* Date range — both filter on start_date */}
      <input
        className="form-input"
        type="date"
        value={filters.dateFrom}
        onChange={e => setFilter('dateFrom', e.target.value)}
        title={t('filters.dateFrom')}
      />
      <input
        className="form-input"
        type="date"
        value={filters.dateTo}
        onChange={e => setFilter('dateTo', e.target.value)}
        title={t('filters.dateTo')}
      />

      {/* Price range */}
      <input
        className="form-input"
        type="number"
        placeholder={t('filters.priceMin')}
        value={filters.priceMin}
        onChange={e => setFilter('priceMin', e.target.value)}
      />
      <input
        className="form-input"
        type="number"
        placeholder={t('filters.priceMax')}
        value={filters.priceMax}
        onChange={e => setFilter('priceMax', e.target.value)}
      />

      <button className="btn-outline-ink" onClick={onReset} style={{ fontSize: 13 }}>
        {t('filters.reset')}
      </button>
    </div>
  )
}
