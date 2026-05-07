import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useReservations } from '../src/hooks/useReservations'
import { useReservationFilters } from '../src/hooks/useReservationFilters'
import FilterBar from './reservations/FilterBar'
import ReservationsTable from './reservations/ReservationsTable'
import ReservationDetailsPanel from './reservations/ReservationDetailsPanel'

/**
 * Booking Hub — omnichannel reservations page.
 *
 * Layout:
 *   - Page header (title + subtitle)
 *   - FilterBar (channel, status, search, date range, price range)
 *   - ReservationsTable (TanStack v8, server-side pagination/sort)
 *   - ReservationDetailsPanel (slides in when a row's "Détails" is clicked)
 */
export default function Reservations() {
  const { t } = useTranslation('reservations')
  const { filters, setFilter, reset } = useReservationFilters()
  const { data, isLoading, isFetching, error } = useReservations(filters)
  const [openId, setOpenId] = useState(null)

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{t('title')}</h2>
          <p>{t('subtitle')}</p>
        </div>
      </div>

      <div className="page-body">
        <FilterBar filters={filters} setFilter={setFilter} onReset={reset} />

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 12 }}>
            {t('error.fetch')}: {error.message}
          </div>
        )}

        <ReservationsTable
          data={data?.data}
          total={data?.total || 0}
          page={filters.page}
          pageSize={filters.pageSize}
          sort={filters.sort}
          order={filters.order}
          isLoading={isLoading}
          isFetching={isFetching}
          onSortChange={(sort, order) => {
            setFilter('sort', sort)
            setFilter('order', order)
          }}
          onPageChange={(p) => setFilter('page', p)}
          onView={setOpenId}
        />
      </div>

      <ReservationDetailsPanel id={openId} onClose={() => setOpenId(null)} />
    </div>
  )
}
