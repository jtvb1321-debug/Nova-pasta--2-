import type { CampoIxc, GrupoIxc } from './dadosIxc'

// Organiza os campos do IXC (ja sem segredos e sem documentos) nas abas Contrato, Plano e Fibra do Diagnostico,
// na mesma ideia das abas do IXC: secoes com nomes claros, status em destaque e, no fim, os demais campos.
// Funcao pura: so reordena e agrupa o que ja veio do servidor; nada novo e' lido ou exposto aqui.

export type AbaDados = 'contrato' | 'plano' | 'fibra'
export type Tom = 'ok' | 'alerta' | 'perigo' | 'neutro'

export interface CampoOrganizado extends CampoIxc { tom: Tom }
export interface SecaoOrganizada { titulo: string; campos: CampoOrganizado[] }
export interface AbaOrganizada { secoes: SecaoOrganizada[]; outros: CampoOrganizado[]; origem: string[] }

const ORIGEM: Record<AbaDados, string[]> = { contrato: ['contrato'], plano: ['plano', 'velocidade'], fibra: ['fibra', 'caixa'] }

// "grupo:campo". Campo ausente no IXC (vazio/zerado) simplesmente nao aparece.
const LAYOUT: Record<AbaDados, { titulo: string; campos: string[] }[]> = {
  contrato: [
    { titulo: 'Situação', campos: ['status', 'status_internet', 'status_velocidade', 'contrato_suspenso', 'bloqueio_automatico', 'desbloqueio_confianca', 'desbloqueio_confianca_ativo', 'restricao_auto_desbloqueio', 'liberacao_bloqueio_manual', 'situacao_financeira_contrato'].map(c => `contrato:${c}`) },
    { titulo: 'Datas', campos: ['data_cadastro_sistema', 'data_assinatura', 'data', 'data_ativacao', 'data_renovacao', 'data_expiracao', 'pago_ate_data', 'data_cancelamento', 'data_desistencia', 'data_negativacao', 'data_acesso_desativado', 'ultima_atualizacao'].map(c => `contrato:${c}`) },
    { titulo: 'Bloqueios, desbloqueios e suspensão', campos: ['dt_ult_bloq_auto', 'dt_ult_bloq_manual', 'dt_ult_desbloq_auto', 'dt_ult_desbloq_manual', 'dt_ult_des_bloq_conf', 'nao_bloquear_ate', 'data_inicial_suspensao', 'data_final_suspensao', 'data_retomada_contrato'].map(c => `contrato:${c}`) },
    { titulo: 'Contratação e cobrança', campos: ['contrato', 'id_vd_contrato', 'tipo', 'tipo_cobranca', 'fidelidade', 'tempo_permanencia', 'renovacao_automatica', 'aviso_atraso', 'isentar_contrato', 'aplicar_desconto_tempo_bloqueio', 'taxa_improdutiva', 'id_carteira_cobranca', 'id_tipo_contrato', 'id_modelo', 'id_vendedor', 'id_vendedor_ativ', 'motivo_inclusao'].map(c => `contrato:${c}`) },
    { titulo: 'Cancelamento', campos: ['motivo_cancelamento', 'obs_cancelamento', 'origem_cancelamento'].map(c => `contrato:${c}`) },
    { titulo: 'Local de instalação', campos: ['endereco', 'numero', 'complemento', 'bairro', 'cep', 'cidade', 'referencia'].map(c => `contrato:${c}`) },
  ],
  plano: [
    { titulo: 'Plano de venda', campos: ['nome', 'valor_contrato', 'tipo', 'Ativo', 'tipo_pessoa', 'moeda', 'logins_simultaneos', 'limitar_n_logins'].map(c => `plano:${c}`) },
    { titulo: 'Velocidade (RADIUS)', campos: ['grupo', 'download', 'upload', 'valor_produto', 'tipo', 'tipo_franquia', 'prioridade', 'sici_tecnologia', 'type_band_control'].map(c => `velocidade:${c}`) },
  ],
  fibra: [
    { titulo: 'ONU', campos: ['onu_tipo', 'mac', 'id_hardware', 'versao', 'onu_rede_neutra'].map(c => `fibra:${c}`) },
    { titulo: 'Leitura de sinal', campos: ['sinal_rx', 'sinal_tx', 'temperatura', 'voltagem', 'data_sinal', 'causa_ultima_queda', 'distancia_onu'].map(c => `fibra:${c}`) },
    { titulo: 'Posição na rede', campos: ['slotno', 'ponno', 'ponid', 'onu_numero', 'id_perfil', 'tipo_autenticacao', 'vlan', 'vlan_pppoe', 'vlan_dhcp', 'vlan_tr69', 'vlan_voip', 'vlan_iptv', 'vlan_outros', 'id_transmissor', 'id_caixa_ftth', 'porta_ftth'].map(c => `fibra:${c}`) },
    { titulo: 'Caixa FTTH', campos: ['descricao', 'status', 'capacidade', 'tipo', 'endereco', 'numero', 'bairro', 'cep', 'latitude', 'longitude'].map(c => `caixa:${c}`) },
  ],
}

/** Cor do destaque (chip) de campos de situacao. Valor desconhecido fica neutro: nunca inventamos significado. */
export function tomDe(campo: string, valor: string): Tom {
  const v = valor.trim()
  switch (campo) {
    case 'status': return v === 'Ativo' ? 'ok' : /^(Negativado|Desistiu|Cancelado)$/.test(v) ? 'perigo' : 'neutro'
    case 'status_internet': return v === 'Ativa' ? 'ok' : /^(Desativada|Bloqueio manual|Bloqueio automático)$/.test(v) ? 'perigo' : /^(Financeiro em atraso|Aguardando assinatura)$/.test(v) ? 'alerta' : 'neutro'
    case 'status_velocidade': return v === 'Normal' ? 'ok' : v === 'Reduzida' ? 'alerta' : 'neutro'
    case 'contrato_suspenso': return v === 'Sim' ? 'alerta' : v === 'Não' ? 'ok' : 'neutro'
    case 'Ativo': return v === 'Sim' ? 'ok' : v === 'Não' ? 'perigo' : 'neutro'
    default: return 'neutro'
  }
}

/** Campos de situacao que aparecem como chip colorido. */
export const CAMPOS_CHIP = new Set(['status', 'status_internet', 'status_velocidade', 'contrato_suspenso', 'Ativo'])

export function organizarAba(grupos: GrupoIxc[], aba: AbaDados): AbaOrganizada {
  const origem = ORIGEM[aba]
  const presentes = grupos.filter(g => origem.includes(g.id))
  const porChave = new Map<string, CampoIxc>()
  for (const g of presentes) for (const c of g.campos) porChave.set(`${g.id}:${c.campo}`, c)

  const usados = new Set<string>()
  const secoes: SecaoOrganizada[] = []
  for (const s of LAYOUT[aba]) {
    const campos: CampoOrganizado[] = []
    for (const chave of s.campos) {
      const c = porChave.get(chave)
      if (!c || usados.has(chave)) continue
      usados.add(chave)
      campos.push({ ...c, tom: tomDe(c.campo, c.valor) })
    }
    if (campos.length) secoes.push({ titulo: s.titulo, campos })
  }

  const varios = presentes.length > 1
  const outros: CampoOrganizado[] = []
  for (const g of presentes) for (const c of g.campos) {
    const chave = `${g.id}:${c.campo}`
    if (usados.has(chave)) continue
    outros.push({ ...c, rotulo: varios ? `${g.titulo} · ${c.rotulo}` : c.rotulo, tom: 'neutro' })
  }
  return { secoes, outros, origem: presentes.map(g => g.titulo) }
}
