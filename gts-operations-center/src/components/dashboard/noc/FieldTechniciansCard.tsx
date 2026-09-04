'use client'

import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { UserRound, MapPin, Navigation } from 'lucide-react'
import { GlassCard, CardHeader } from './GlassCard'
import { NOC, formatarTempoRelativo } from './theme'

interface Funcionario {
  nome: string
  avatar: string | null
  cargo: string | null
}

interface TecnicoCampo {
  id: string
  equipe: string
  status: string
  funcionarios: Funcionario[]
  cidade: string | null
  chamadoAtual: { id: string; cliente: string; tipo: string } | null
  gps: { latitude: number; longitude: number; online: boolean; velocidade: number; ultimaAtualizacao: string } | null
}

async function fetchTecnicos() {
  const res = await fetch('/api/dashboard/tecnicos')
  if (!res.ok) throw new Error('Erro ao buscar tecnicos em campo')
  return res.json()
}

const STATUS_CFG: Record<string, { label: string; cor: string }> = {
  ATIVIDADE: { label: 'Em Atividade', cor: NOC.alerta },
  DESLOCAMENTO: { label: 'Deslocamento', cor: NOC.azulClaro },
  AGUARDANDO: { label: 'Disponivel', cor: NOC.sucesso },
}

export function FieldTechniciansCard() {
  const { data } = useQuery({ queryKey: ['dashboard-tecnicos'], queryFn: fetchTecnicos, refetchInterval: 20000 })
  const tecnicos: TecnicoCampo[] = data?.tecnicos ?? []

  return (
    <GlassCard className="h-full flex flex-col" delay={0.4}>
      <CardHeader
        title="Tecnicos em Campo"
        icon={<UserRound className="w-4 h-4" style={{ color: NOC.azulClaro }} />}
      />
      <div className="flex-1 overflow-y-auto space-y-2" style={{ maxHeight: 340 }}>
        {tecnicos.length === 0 ? (
          <p className="text-sm text-center py-10" style={{ color: NOC.textoSecundario }}>Nenhuma equipe ativa</p>
        ) : tecnicos.map((t, i) => {
          const cfg = STATUS_CFG[t.status] ?? STATUS_CFG.AGUARDANDO
          const funcionario = t.funcionarios[0]
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-3 p-2.5 rounded-xl border"
              style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)' }}
            >
              <div className="relative flex-shrink-0">
                {funcionario?.avatar ? (
                  <img src={funcionario.avatar} alt={funcionario.nome} className="w-9 h-9 rounded-full object-cover" />
                ) : (
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: `${NOC.azulPrimario}22`, color: NOC.azulClaro }}>
                    {funcionario?.nome?.slice(0, 2).toUpperCase() ?? t.equipe.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2" style={{ backgroundColor: cfg.cor, borderColor: NOC.card }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate" style={{ color: NOC.texto }}>{funcionario?.nome ?? t.equipe}</p>
                <div className="flex items-center gap-1 text-[11px]" style={{ color: cfg.cor }}>
                  {cfg.label}
                </div>
                {t.chamadoAtual && (
                  <p className="text-[11px] truncate" style={{ color: NOC.textoSecundario }}>{t.chamadoAtual.cliente}</p>
                )}
                <div className="flex items-center gap-2 mt-0.5 text-[10px]" style={{ color: NOC.cinza }}>
                  {t.cidade && (
                    <span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" /> {t.cidade}</span>
                  )}
                  {t.gps && (
                    <span className="flex items-center gap-0.5">
                      <Navigation className="w-2.5 h-2.5" />
                      {t.gps.online ? `GPS ativo · ${formatarTempoRelativo(t.gps.ultimaAtualizacao)}` : 'GPS offline'}
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </GlassCard>
  )
}
