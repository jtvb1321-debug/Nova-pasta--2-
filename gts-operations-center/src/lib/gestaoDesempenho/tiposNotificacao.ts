// Tipos de notificacao do modulo (arquivo neutro, sem banco): usado pelo servidor e pelas telas.
export const TIPOS_NOTIFICACAO = [
  'SLA_ABAIXO_LIMITE', 'CHAMADOS_VENCIDOS', 'META_NAO_ATINGIDA', 'AUMENTO_RECHAMADAS', 'ACUMULO_PENDENCIAS',
  'FALHA_INTEGRACAO_OPA', 'RELATORIO_DIARIO_DISPONIVEL', 'RELATORIO_SEMANAL_DISPONIVEL', 'RELATORIO_AGUARDANDO_REVISAO',
] as const
export type TipoNotificacao = (typeof TIPOS_NOTIFICACAO)[number]

export const ROTULO_NOTIFICACAO: Record<TipoNotificacao, string> = {
  SLA_ABAIXO_LIMITE: 'SLA abaixo do limite',
  CHAMADOS_VENCIDOS: 'Chamados vencidos',
  META_NAO_ATINGIDA: 'Meta não atingida',
  AUMENTO_RECHAMADAS: 'Aumento de rechamadas',
  ACUMULO_PENDENCIAS: 'Acúmulo de pendências',
  FALHA_INTEGRACAO_OPA: 'Falha na integração com o OPA',
  RELATORIO_DIARIO_DISPONIVEL: 'Relatório diário disponível',
  RELATORIO_SEMANAL_DISPONIVEL: 'Relatório semanal disponível',
  RELATORIO_AGUARDANDO_REVISAO: 'Relatório aguardando revisão',
}
