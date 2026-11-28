// Gestao de Desempenho: catalogo de indicadores. Cada um declara a fonte e se existe dado confiavel hoje.
// Indicador SEM fonte nunca vira zero: aparece como "Nao disponivel" (com preenchimento manual opcional).

export type GrupoIndicador = 'CAMPO' | 'RECEPCAO'
export type TipoValor = 'CONTAGEM' | 'PERCENTUAL' | 'MINUTOS' | 'NOTA'
export type FonteIndicador = 'GTSCENTER' | 'OPA' | 'MANUAL'

export interface DefIndicador {
  chave: string
  rotulo: string
  grupo: GrupoIndicador
  tipo: TipoValor
  /** MAIOR_MELHOR: quanto mais, melhor (producao, SLA). MENOR_MELHOR: tempos, pendencias, rechamadas. */
  sentido: 'MAIOR_MELHOR' | 'MENOR_MELHOR'
  fonte: FonteIndicador
  /** false = nao ha fonte confiavel hoje (ver docs/gestao-desempenho/01-AUDITORIA.md). */
  disponivel: boolean
  /** Por que nao esta disponivel, ou observacao de como e' medido. */
  nota?: string
  /** Contagem que cresce com os dias trabalhados (a meta diaria escala por dias efetivamente trabalhados). */
  escalaPorDias?: boolean
  /** Entra na pontuacao opcional de 0 a 100. */
  pontuavel?: boolean
}

export interface Valor {
  valor: number | null
  disponivel: boolean
  /** Dado existe como conceito, mas o periodo nao tem base (ex.: SLA sem nenhum chamado avaliado). */
  semBase?: boolean
  /** Quantidade de registros que sustentam o valor (peso em medias e % semanais). */
  base?: number
  nota?: string
  fonte: FonteIndicador
}

const campo = (d: Omit<DefIndicador, 'grupo' | 'fonte' | 'disponivel'> & Partial<Pick<DefIndicador, 'fonte' | 'disponivel'>>): DefIndicador =>
  ({ grupo: 'CAMPO', fonte: 'GTSCENTER', disponivel: true, ...d })

const NAO_CLASSIFICA = 'O GTSCenter não classifica esse serviço: o tipo do chamado só tem Instalação, Manutenção, Retirada, Suporte e Rompimento, e a subcategoria não é preenchida.'

export const INDICADORES_CAMPO: DefIndicador[] = [
  campo({ chave: 'os_recebidas', rotulo: 'O.S. recebidas', tipo: 'CONTAGEM', sentido: 'MAIOR_MELHOR', escalaPorDias: true, nota: 'Abertas no dia e atribuídas à equipe (sem canceladas e sem encerradas pela gestão).' }),
  campo({ chave: 'os_concluidas', rotulo: 'O.S. concluídas', tipo: 'CONTAGEM', sentido: 'MAIOR_MELHOR', escalaPorDias: true, pontuavel: true, nota: 'Finalizadas no dia pela equipe. Encerradas direto pela gestão ficam de fora.' }),
  campo({ chave: 'os_pendentes', rotulo: 'O.S. pendentes', tipo: 'CONTAGEM', sentido: 'MENOR_MELHOR', pontuavel: true, nota: 'Posição no fechamento do período (não soma dias).' }),
  campo({ chave: 'instalacoes', rotulo: 'Instalações', tipo: 'CONTAGEM', sentido: 'MAIOR_MELHOR', escalaPorDias: true }),
  campo({ chave: 'reinstalacoes', rotulo: 'Reinstalações', tipo: 'CONTAGEM', sentido: 'MAIOR_MELHOR', disponivel: false, fonte: 'MANUAL', nota: NAO_CLASSIFICA }),
  campo({ chave: 'manutencoes', rotulo: 'Manutenções', tipo: 'CONTAGEM', sentido: 'MAIOR_MELHOR', escalaPorDias: true }),
  campo({ chave: 'suportes', rotulo: 'Suportes', tipo: 'CONTAGEM', sentido: 'MAIOR_MELHOR', escalaPorDias: true }),
  campo({ chave: 'retiradas', rotulo: 'Retiradas concluídas e comprovadas', tipo: 'CONTAGEM', sentido: 'MAIOR_MELHOR', escalaPorDias: true, nota: 'Retiradas FINALIZADAS pela equipe no período (não as abertas), com foto de evidência e sem devolução reprovada. Indicador operacional próprio: não entra na qualidade técnica.' }),
  campo({ chave: 'retiradas_sem_comprovacao', rotulo: 'Retiradas finalizadas sem comprovação', tipo: 'CONTAGEM', sentido: 'MENOR_MELHOR', nota: 'Finalizadas sem foto de evidência ou com a devolução do equipamento reprovada: não entram em "Retiradas".' }),
  campo({ chave: 'trocas_equipamento', rotulo: 'Trocas de equipamento', tipo: 'CONTAGEM', sentido: 'MAIOR_MELHOR', disponivel: false, fonte: 'MANUAL', nota: NAO_CLASSIFICA }),
  campo({ chave: 'mudancas_endereco', rotulo: 'Mudanças de endereço', tipo: 'CONTAGEM', sentido: 'MAIOR_MELHOR', disponivel: false, fonte: 'MANUAL', nota: NAO_CLASSIFICA }),
  campo({ chave: 'visitas_improdutivas', rotulo: 'Visitas improdutivas', tipo: 'CONTAGEM', sentido: 'MENOR_MELHOR', nota: 'Chamados com "cliente ausente"; o dia é o do deslocamento/início. Aproximado: o sistema não guarda a data do aviso.' }),
  campo({ chave: 'rechamadas', rotulo: 'Rechamadas confirmadas', tipo: 'CONTAGEM', sentido: 'MENOR_MELHOR', pontuavel: true, nota: 'Só as validadas pelo supervisor, atribuídas à equipe do atendimento de origem.' }),
  campo({ chave: 'taxa_rechamadas', rotulo: 'Taxa de rechamadas', tipo: 'PERCENTUAL', sentido: 'MENOR_MELHOR', nota: 'Rechamadas confirmadas ÷ serviços técnicos concluídos (sem retiradas) × 100.' }),
  campo({ chave: 'retencoes_campo', rotulo: 'Retenções em campo', tipo: 'CONTAGEM', sentido: 'MAIOR_MELHOR', disponivel: false, fonte: 'MANUAL', nota: 'O GTSCenter não registra retenção feita em campo.' }),
  campo({ chave: 'tempo_deslocamento', rotulo: 'Tempo médio de deslocamento', tipo: 'MINUTOS', sentido: 'MENOR_MELHOR', nota: 'A caminho → início do atendimento.' }),
  campo({ chave: 'tempo_execucao', rotulo: 'Tempo médio de execução', tipo: 'MINUTOS', sentido: 'MENOR_MELHOR', nota: 'Início → fim do atendimento.' }),
  campo({ chave: 'tempo_resolucao', rotulo: 'Tempo médio de resolução', tipo: 'MINUTOS', sentido: 'MENOR_MELHOR', nota: 'O mesmo tempo usado no SLA de resolução.' }),
  campo({ chave: 'sla_resolucao_pct', rotulo: 'SLA de resolução', tipo: 'PERCENTUAL', sentido: 'MAIOR_MELHOR', pontuavel: true, nota: 'Regra atual do GTSCenter (lida, não recalculada).' }),
  campo({ chave: 'sla_resposta_pct', rotulo: 'SLA de resposta', tipo: 'PERCENTUAL', sentido: 'MAIOR_MELHOR', nota: 'Regra atual do GTSCenter (lida, não recalculada).' }),
  campo({ chave: 'sla_dentro', rotulo: 'Dentro do SLA (resolução)', tipo: 'CONTAGEM', sentido: 'MAIOR_MELHOR' }),
  campo({ chave: 'sla_fora', rotulo: 'Fora do SLA (resolução)', tipo: 'CONTAGEM', sentido: 'MENOR_MELHOR' }),
  campo({ chave: 'satisfacao', rotulo: 'Satisfação do cliente', tipo: 'NOTA', sentido: 'MAIOR_MELHOR', nota: 'Média das avaliações aprovadas (1 a 5).' }),
]

const NAO_OPA = 'Depende da API do OPA Atendimento (credenciais e documentação ainda não fornecidas).'
const opa = (chave: string, rotulo: string, tipo: TipoValor, sentido: DefIndicador['sentido'], extra: Partial<DefIndicador> = {}): DefIndicador =>
  ({ chave, rotulo, grupo: 'RECEPCAO', tipo, sentido, fonte: 'OPA', disponivel: false, nota: NAO_OPA, ...extra })

export const INDICADORES_RECEPCAO: DefIndicador[] = [
  opa('atend_recebidos', 'Atendimentos recebidos', 'CONTAGEM', 'MAIOR_MELHOR', { escalaPorDias: true }),
  opa('atend_assumidos', 'Atendimentos assumidos', 'CONTAGEM', 'MAIOR_MELHOR', { escalaPorDias: true }),
  opa('atend_finalizados', 'Atendimentos finalizados', 'CONTAGEM', 'MAIOR_MELHOR', { escalaPorDias: true, pontuavel: true }),
  opa('atend_pendentes', 'Atendimentos pendentes', 'CONTAGEM', 'MENOR_MELHOR', { pontuavel: true }),
  opa('atend_transferidos', 'Atendimentos transferidos', 'CONTAGEM', 'MENOR_MELHOR'),
  opa('atend_abandonados', 'Atendimentos abandonados', 'CONTAGEM', 'MENOR_MELHOR'),
  opa('tempo_primeira_resposta', 'Tempo médio de primeira resposta', 'MINUTOS', 'MENOR_MELHOR'),
  opa('tempo_espera', 'Tempo médio de espera', 'MINUTOS', 'MENOR_MELHOR'),
  opa('tempo_atendimento', 'Tempo médio de atendimento', 'MINUTOS', 'MENOR_MELHOR'),
  opa('tempo_resolucao_recepcao', 'Tempo médio de resolução', 'MINUTOS', 'MENOR_MELHOR'),
  opa('atend_dentro_sla', 'Atendimentos dentro do SLA', 'CONTAGEM', 'MAIOR_MELHOR'),
  opa('atend_fora_sla', 'Atendimentos fora do SLA', 'CONTAGEM', 'MENOR_MELHOR'),
  opa('sla_recepcao_pct', 'Cumprimento do SLA', 'PERCENTUAL', 'MAIOR_MELHOR', { pontuavel: true }),
  opa('resolvidos_remoto', 'Problemas resolvidos remotamente', 'CONTAGEM', 'MAIOR_MELHOR'),
  opa('encaminhados_campo', 'Encaminhados para o campo', 'CONTAGEM', 'MENOR_MELHOR', { disponivel: false, nota: 'Cruzamento OPA × chamado exige a API do OPA e a confirmação do gestor.' }),
  opa('taxa_resolucao_remota', 'Taxa de resolução remota', 'PERCENTUAL', 'MAIOR_MELHOR', { pontuavel: true }),
  opa('satisfacao_recepcao', 'Satisfação do cliente', 'NOTA', 'MAIOR_MELHOR'),
  { chave: 'vendas', rotulo: 'Vendas realizadas', grupo: 'RECEPCAO', tipo: 'CONTAGEM', sentido: 'MAIOR_MELHOR', fonte: 'GTSCENTER', disponivel: true, escalaPorDias: true, nota: 'Vendas aprovadas no GTSCenter, só se o colaborador tiver usuário vinculado.' },
  opa('retencoes', 'Retenções realizadas', 'CONTAGEM', 'MAIOR_MELHOR', { fonte: 'MANUAL', nota: 'Sem fonte no sistema: preenchimento manual.' }),
  opa('cancelamentos_solicitados', 'Solicitações de cancelamento', 'CONTAGEM', 'MENOR_MELHOR', { fonte: 'MANUAL', nota: 'Sem fonte no sistema: preenchimento manual (ou OPA, se a API trouxer).' }),
  opa('falhas_triagem', 'Falhas de triagem identificadas', 'CONTAGEM', 'MENOR_MELHOR', { fonte: 'MANUAL', nota: 'Depende da validação do gestor sobre chamados técnicos desnecessários.' }),
]

export const TODOS_INDICADORES: DefIndicador[] = [...INDICADORES_CAMPO, ...INDICADORES_RECEPCAO]
export const INDICADOR_POR_CHAVE: Record<string, DefIndicador> = Object.fromEntries(TODOS_INDICADORES.map(i => [i.chave, i]))

export const indisponivel = (def: DefIndicador): Valor => ({ valor: null, disponivel: false, nota: def.nota, fonte: def.fonte })
export const semBase = (fonte: FonteIndicador = 'GTSCENTER'): Valor => ({ valor: null, disponivel: true, semBase: true, base: 0, fonte })
export const comValor = (valor: number, base?: number, fonte: FonteIndicador = 'GTSCENTER'): Valor => ({ valor, disponivel: true, base, fonte })

/** Formata para exibicao: nunca devolve "0" para indicador indisponivel. */
export function formatarValor(v: Valor, tipo: TipoValor): string {
  if (!v.disponivel) return 'Não disponível'
  if (v.valor === null) return '—'
  const n = v.valor
  switch (tipo) {
    case 'PERCENTUAL': return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
    case 'NOTA': return n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
    case 'MINUTOS': return n >= 60 ? `${Math.floor(n / 60)}h ${String(Math.round(n % 60)).padStart(2, '0')}min` : `${Math.round(n)}min`
    default: return Math.round(n).toLocaleString('pt-BR')
  }
}
