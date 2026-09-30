// Desempenho por equipe no relatorio "Chamados & Qualidade": calculado na
// tela a partir dos chamados ja carregados (sem endpoint novo). Os valores
// podem ser corrigidos antes do PDF, como o resto da revisao.

export interface LinhaEquipe {
  equipe: string
  chamados: number
  finalizados: number
  instalacoes: number // instalacoes finalizadas
  rechamados: number // chamados reincidentes gerados por atendimento desta equipe
  slaResposta: number | null // % dentro do SLA de resposta
  slaResolucao: number | null // % dentro do SLA de resolucao
  // Quantos chamados tinham SLA medido (peso do % na linha de total).
  medidosResposta: number
  medidosResolucao: number
}

const SEM_EQUIPE = 'Sem equipe'
const pct = (dentro: number, medidos: number) => (medidos > 0 ? Math.round((dentro / medidos) * 1000) / 10 : null)

// Equipe que fez o atendimento anterior de cada rechamado. Primeiro procura
// nos chamados ja carregados; o que for de outro periodo busca pelo id.
async function equipesDeOrigem(chamados: any[]): Promise<Map<string, string>> {
  const porId = new Map<string, string>()
  for (const c of chamados) if (c.id) porId.set(c.id, c.equipe?.nome || SEM_EQUIPE)
  const faltando = [...new Set(chamados
    .filter(c => c.reincidente && c.chamadoOrigemReincidenciaId && !porId.has(c.chamadoOrigemReincidenciaId))
    .map(c => c.chamadoOrigemReincidenciaId as string))]
  for (let i = 0; i < faltando.length; i += 8) {
    await Promise.all(faltando.slice(i, i + 8).map(async id => {
      try {
        const r = await fetch(`/api/tickets/${id}`)
        if (!r.ok) return
        const c = await r.json()
        porId.set(id, c?.equipe?.nome || SEM_EQUIPE)
      } catch { /* sem a origem, conta para a equipe que atendeu o rechamado */ }
    }))
  }
  return porId
}

export async function calcularDesempenhoEquipes(chamados: any[]): Promise<LinhaEquipe[]> {
  const origem = await equipesDeOrigem(chamados)
  const linhas = new Map<string, LinhaEquipe & { dentroResposta: number; dentroResolucao: number }>()
  const linha = (nome: string) => {
    let l = linhas.get(nome)
    if (!l) {
      l = { equipe: nome, chamados: 0, finalizados: 0, instalacoes: 0, rechamados: 0, slaResposta: null, slaResolucao: null, medidosResposta: 0, medidosResolucao: 0, dentroResposta: 0, dentroResolucao: 0 }
      linhas.set(nome, l)
    }
    return l
  }

  for (const c of chamados) {
    const l = linha(c.equipe?.nome || SEM_EQUIPE)
    l.chamados++
    if (c.status === 'FINALIZADO') {
      l.finalizados++
      if (c.tipo === 'INSTALACAO') l.instalacoes++
    }
    if (c.dentroSlaResposta != null) { l.medidosResposta++; if (c.dentroSlaResposta) l.dentroResposta++ }
    if (c.dentroSlaResolucao != null) { l.medidosResolucao++; if (c.dentroSlaResolucao) l.dentroResolucao++ }
    if (c.reincidente) {
      const responsavel = (c.chamadoOrigemReincidenciaId && origem.get(c.chamadoOrigemReincidenciaId)) || c.equipe?.nome || SEM_EQUIPE
      linha(responsavel).rechamados++
    }
  }

  return [...linhas.values()]
    .map(({ dentroResposta, dentroResolucao, ...l }) => ({ ...l, slaResposta: pct(dentroResposta, l.medidosResposta), slaResolucao: pct(dentroResolucao, l.medidosResolucao) }))
    .sort((a, b) => (a.equipe === SEM_EQUIPE ? 1 : b.equipe === SEM_EQUIPE ? -1 : b.chamados - a.chamados || a.equipe.localeCompare(b.equipe)))
}

// Linha de total a partir das linhas (ja editadas): somas e % ponderado
// pela quantidade de chamados com SLA medido.
export function totalDesempenho(linhas: LinhaEquipe[]) {
  const soma = (k: keyof LinhaEquipe) => linhas.reduce((s, l) => s + (Number(l[k]) || 0), 0)
  const ponderado = (k: 'slaResposta' | 'slaResolucao', peso: 'medidosResposta' | 'medidosResolucao') => {
    const comValor = linhas.filter(l => l[k] != null && l[peso] > 0)
    const pesos = comValor.reduce((s, l) => s + l[peso], 0)
    return pesos > 0 ? Math.round((comValor.reduce((s, l) => s + (l[k] as number) * l[peso], 0) / pesos) * 10) / 10 : null
  }
  return {
    chamados: soma('chamados'),
    finalizados: soma('finalizados'),
    instalacoes: soma('instalacoes'),
    rechamados: soma('rechamados'),
    slaResposta: ponderado('slaResposta', 'medidosResposta'),
    slaResolucao: ponderado('slaResolucao', 'medidosResolucao'),
  }
}
