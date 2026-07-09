// src/hooks/use-inventory.ts
import { useQuery } from '@tanstack/react-query'
import type { ItemEstoque } from '@/types'

interface InventoryParams {
  search?: string
  categoria?: string
  page?: number
  limit?: number
}

interface InventoryResponse {
  data: ItemEstoque[]
  total: number
  page: number
  limit: number
  totalPages: number
}

async function fetchInventory(params: InventoryParams): Promise<InventoryResponse> {
  const q = new URLSearchParams({
    ...(params.search ? { search: params.search } : {}),
    ...(params.categoria ? { categoria: params.categoria } : {}),
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 20),
  })
  const res = await fetch(`/api/inventory?${q}`)
  if (!res.ok) throw new Error('Erro ao carregar estoque')
  return res.json()
}

export function useInventory(params: InventoryParams = {}) {
  return useQuery({
    queryKey: ['inventory', params],
    queryFn: () => fetchInventory(params),
    staleTime: 60000,
  })
}

export function useInventoryAlerts() {
  const query = useQuery({
    queryKey: ['inventory-alerts'],
    queryFn: async () => {
      const res = await fetch('/api/inventory?limit=100')
      if (!res.ok) return { data: [] }
      return res.json()
    },
    staleTime: 60000,
  })

  const itens = query.data?.data ?? []
  const criticos = itens.filter((i: ItemEstoque) => i.quantidadeAtual <= i.quantidadeMinima)

  return {
    ...query,
    criticos,
    totalCriticos: criticos.length,
  }
}
