import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState } from './EmptyState'

export interface DataTableColumn<T> {
  key: string
  header: ReactNode
  render?: (row: T) => ReactNode
  className?: string
  headerClassName?: string
}

interface DataTablePagination {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  total?: number
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  data: T[]
  keyField: (row: T) => string | number
  loading?: boolean
  skeletonRows?: number
  emptyTitle?: string
  emptyDescription?: string
  toolbar?: ReactNode
  pagination?: DataTablePagination
  onRowClick?: (row: T) => void
}

// Tabela padrao de alta densidade (busca/filtros ficam a cargo de quem usa,
// via o slot `toolbar` - o componente so cuida de render, loading, vazio e
// paginacao) - usa as mesmas classes .gts-table ja centralizadas.
export function DataTable<T>({
  columns, data, keyField, loading, skeletonRows = 5,
  emptyTitle = 'Nenhum registro encontrado', emptyDescription,
  toolbar, pagination, onRowClick,
}: DataTableProps<T>) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#111827]/90 overflow-hidden">
      {toolbar && (
        <div className="p-3 border-b border-white/10">{toolbar}</div>
      )}

      <div className="overflow-x-auto">
        <table className="gts-table">
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.key} className={cn('px-4 pt-4', col.headerClassName)}>{col.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: skeletonRows }).map((_, i) => (
                <tr key={i}>
                  {columns.map(col => (
                    <td key={col.key} className="px-4"><div className="h-4 skeleton rounded" /></td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-0">
                  <EmptyState icon={<Inbox className="w-full h-full" />} title={emptyTitle} description={emptyDescription} />
                </td>
              </tr>
            ) : data.map(row => (
              <tr
                key={keyField(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(onRowClick && 'cursor-pointer')}
              >
                {columns.map(col => (
                  <td key={col.key} className={cn('px-4', col.className)}>
                    {col.render ? col.render(row) : (row as any)[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
          <p className="text-xs text-gray-500 font-mono">
            Pagina {pagination.page} de {pagination.totalPages}
            {pagination.total != null && ` · ${pagination.total} registro(s)`}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="p-1.5 rounded-md border border-white/10 text-gray-400 hover:text-white hover:border-white/20 disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="p-1.5 rounded-md border border-white/10 text-gray-400 hover:text-white hover:border-white/20 disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
