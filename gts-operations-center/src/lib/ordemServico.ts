// Ordem de Servico (O.S.) gerada pelo sistema a partir do chamado.

// Numero da O.S. mostrado na tela e no PDF: derivado do id do chamado
// (unico e estavel), sem precisar de coluna nova no banco.
export function numeroOS(chamadoId: string): string {
  return `OS-${(chamadoId || '').slice(-8).toUpperCase()}`
}

export type PrioridadeOS = 'NORMAL' | 'URGENTE' | 'CRITICO'

// O servidor grava a prioridade no inicio da observacao ("[URGENTE] — texto")
// e, no EACE, a tela junta "Ref. EACE:", "Falha:" e "Obs.:" em linhas.
export function lerObservacaoOS(obs: string | null | undefined) {
  const bruto = obs || ''
  const prioridade: PrioridadeOS = bruto.includes('[CRITICO]') ? 'CRITICO' : bruto.includes('[URGENTE]') ? 'URGENTE' : 'NORMAL'
  const texto = bruto.replace(/^\s*\[(CRITICO|URGENTE|NORMAL)\]\s*(—|-)?\s*/, '').trim()
  let referencia = '', falha = ''
  const resto: string[] = []
  for (const linha of texto.split('\n')) {
    const l = linha.trim()
    if (/^ref\. eace:/i.test(l)) referencia = l.replace(/^ref\. eace:\s*/i, '')
    else if (/^falha:/i.test(l)) falha = l.replace(/^falha:\s*/i, '')
    else if (l) resto.push(l.replace(/^obs\.:\s*/i, ''))
  }
  return { prioridade, referencia, falha, observacao: resto.join('\n') }
}
