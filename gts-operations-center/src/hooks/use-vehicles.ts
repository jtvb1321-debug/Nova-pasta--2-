// src/hooks/use-vehicles.ts
import { useQuery } from '@tanstack/react-query'
import type { VeiculoRastreado } from '@/types'

const VELOCIDADE_ALERTA = parseInt(process.env.NEXT_PUBLIC_VELOCIDADE_ALERTA || '80')

async function fetchVehicles(): Promise<VeiculoRastreado[]> {
  const res = await fetch('/api/vehicles')
  if (!res.ok) throw new Error('Erro ao carregar veículos')
  return res.json()
}

export function useVehicles(refetchInterval = 30000) {
  const query = useQuery({
    queryKey: ['vehicles'],
    queryFn: fetchVehicles,
    refetchInterval,
  })

  const veiculos = query.data ?? []
  const online = veiculos.filter(v => v.online)
  const offline = veiculos.filter(v => !v.online)
  const emAlerta = veiculos.filter(v => v.velocidade > VELOCIDADE_ALERTA)

  return {
    ...query,
    veiculos,
    online,
    offline,
    emAlerta,
    totalOnline: online.length,
    totalOffline: offline.length,
    totalAlerta: emAlerta.length,
  }
}
