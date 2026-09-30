// Metas de SLA em minutos. Ajuste aqui quando tiver os prazos reais da GTS.
// Arquivo sem acesso ao banco: pode ser usado nas telas (ex.: Nova O.S.) e no
// servidor (src/lib/sla.ts).
export const META_SLA_RESPOSTA_MINUTOS = 2 * 60 // 2h para iniciar o atendimento

export const META_SLA_RESOLUCAO_MINUTOS: Record<string, number> = {
  SUPORTE: 24 * 60,
  MANUTENCAO: 24 * 60,
  INSTALACAO: 48 * 60,
  RETIRADA: 48 * 60,
  ROMPIMENTO_MASSIVO: 24 * 60,
}
