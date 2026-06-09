import { useMemo } from 'react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Eye, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import SourceChannelBadge from './SourceChannelBadge'
import StatusBadge from './StatusBadge'
import { formatRange } from '../../src/utils/timezone'

/**
 * Map between the table's column IDs and the backend sort keys.
 * Columns not in this map are not sortable on the server.
 */
const SORT_MAP = {
  customer: 'customer_name',
  period:   'start_date',
  price:    'total_price',
}

export default function ReservationsTable({
  data,
  total,
  page,
  pageSize,
  sort,
  order,
  onSortChange,
  onPageChange,
  onView,
  isLoading,
  isFetching,
}) {
  const { t } = useTranslation('reservations')

  const columns = useMemo(
    () => [
      {
        id: 'source',
        header: t('columns.source'),
        cell: ({ row }) => <SourceChannelBadge source={row.original.source_channel} />,
      },
      {
        id: 'customer',
        header: t('columns.customer'),
        cell: ({ row }) => (
          <div>
            <div style={{ fontWeight: 600 }}>{row.original.customer_name}</div>
            <div style={{ fontSize: 12, color: 'var(--text3, #999)' }}>
              {row.original.customer_contact}
            </div>
          </div>
        ),
      },
      {
        id: 'car',
        header: t('columns.car'),
        cell: ({ row }) => row.original.car_model,
      },
      {
        id: 'period',
        header: t('columns.period'),
        cell: ({ row }) =>
          formatRange(row.original.start_date, row.original.end_date),
      },
      {
        id: 'price',
        header: t('columns.price'),
        cell: ({ row }) =>
          `${row.original.total_price} ${row.original.currency || 'MAD'}`,
      },
      {
        id: 'status',
        header: t('columns.status'),
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'actions',
        header: t('columns.actions'),
        cell: ({ row }) => (
          <button
            className="btn-outline-ink"
            style={{ padding: '4px 10px', fontSize: 12 }}
            onClick={() => onView(row.original.id)}
          >
            <Eye size={13} /> {t('actions.view')}
          </button>
        ),
      },
    ],
    [t, onView]
  )

  const table = useReactTable({
    data: data || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount: Math.max(1, Math.ceil((total || 0) / pageSize)),
  })

  const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize))

  const toggleSort = (colId) => {
    const backendCol = SORT_MAP[colId]
    if (!backendCol) return
    const newOrder =
      sort === backendCol && order === 'desc' ? 'asc' : 'desc'
    onSortChange(backendCol, newOrder)
  }

  return (
    <div className="card">
      <div className="card-body" style={{ padding: 0, position: 'relative' }}>
        {isFetching && !isLoading && (
          <div
            style={{
              position: 'absolute',
              top: 8,
              insetInlineEnd: 12,
              fontSize: 11,
              color: 'var(--text3, #999)',
              zIndex: 1,
            }}
          >
            {t('loading.refreshing')}…
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              {table.getHeaderGroups().map(hg => (
                <tr key={hg.id}>
                  {hg.headers.map(h => {
                    const sortable = !!SORT_MAP[h.id]
                    const isActiveSort = SORT_MAP[h.id] === sort
                    return (
                      <th
                        key={h.id}
                        onClick={() => sortable && toggleSort(h.id)}
                        style={{
                          textAlign: 'start',
                          padding: '12px 14px',
                          fontSize: 12,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: 0.4,
                          color: 'var(--text2)',
                          borderBottom: '1px solid var(--border, #E5E1DA)',
                          cursor: sortable ? 'pointer' : 'default',
                          userSelect: 'none',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {sortable && (
                          <ArrowUpDown
                            size={11}
                            style={{
                              marginInlineStart: 4,
                              opacity: isActiveSort ? 1 : 0.4,
                            }}
                          />
                        )}
                      </th>
                    )
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td
                    colSpan={columns.length}
                    style={{ padding: 24, textAlign: 'center', color: 'var(--text2)' }}
                  >
                    {t('loading.initial')}…
                  </td>
                </tr>
              )}
              {!isLoading && table.getRowModel().rows.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length}
                    style={{ padding: 24, textAlign: 'center', color: 'var(--text3, #999)' }}
                  >
                    {t('empty')}
                  </td>
                </tr>
              )}
              {!isLoading &&
                table.getRowModel().rows.map(row => (
                  <tr
                    key={row.id}
                    style={{ borderBottom: '1px solid var(--border, #E5E1DA)' }}
                  >
                    {row.getVisibleCells().map(cell => (
                      <td
                        key={cell.id}
                        style={{ padding: '12px 14px', fontSize: 13, verticalAlign: 'middle' }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination footer */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 14px',
          borderTop: '1px solid var(--border, #E5E1DA)',
          fontSize: 12,
          color: 'var(--text2)',
        }}
      >
        <div>
          {t('pagination.showing', {
            from: total === 0 ? 0 : (page - 1) * pageSize + 1,
            to: Math.min(page * pageSize, total || 0),
            total: total || 0,
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="btn-outline-ink"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            style={{ padding: '4px 8px' }}
          >
            <ChevronLeft size={14} />
          </button>
          <span>
            {page} / {totalPages}
          </span>
          <button
            className="btn-outline-ink"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            style={{ padding: '4px 8px' }}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
