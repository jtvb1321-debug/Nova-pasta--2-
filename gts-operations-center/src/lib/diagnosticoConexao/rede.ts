import { listarIXC } from '@/lib/ixc'
import { comCache } from '@/lib/inmapCache'
import type { LoginIxc } from '@/lib/ixcCliente'
import { leitura } from './equipamento'
import { agoraNoRelogioDoIxc, horasEntre } from './horarioIxc'
import { limitesRx, type LimitesRx } from './limites'
import type {
  Disponibilidade, HistoricoOptico, LeituraOptica, OltIxc, OrdemServicoIxc, PosicaoOnu, RedeIxc, VizinhancaCaixa, VizinhancaPon,
} from './tipos'

// Rede do assinante, tudo LIDO DO IXC (somente leitura): posicao da ONU (OLT, slot, PON, VLANs), historico das leituras opticas
// que o IXC guarda, vizinhos da mesma caixa e da mesma PON, e as ordens de servico do login.
//
// Tabelas usadas (campos conferidos na API real, so o necessario - nunca login/senha de equipamento):
//   radpop_radio_cliente_fibra            aba Fibra: id_transmissor (OLT), slotno, ponno, onu_numero, ponid, id_perfil, vlan*, onu_tipo...
//   radpop_radio_cliente_fibra_historico  id_cliente_fibra, sinal_rx, sinal_tx, temperatura, voltagem, data_sinal
//   radpop_radio                          OLT: descricao, fabricante_modelo (HW/VSOL), modelo, fwversion, ativo, id_pop, uptime
//   radpop                                POP: pop (nome)
//   rad_caixa_ftth                        caixa: descricao, capacidade
//   radusuarios                           vizinhos da caixa (SO CONTAGENS: nada de login/senha dos outros)
//   su_oss_chamado / su_oss_assunto       ordens de servico do login (sem o texto da mensagem do cliente)
//
// Nada aqui consulta a OLT diretamente: sao dados que o IXC ja coletou. "Leitura atual" = a ultima que o IXC registrou (veja a data).

export { agoraNoRelogioDoIxc, horasEntre, limitesRx }
export type { LimitesRx }

const texto = (v: unknown): string | null => {
  const s = v == null ? '' : String(v).trim()
  return s && s.toLowerCase() !== 'null' ? s : null
}
const inteiro = (v: unknown): number | null => {
  const n = Number(String(v ?? '').trim())
  return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : null
}
const dataValida = (v: unknown): string | null => {
  const s = texto(v)
  return s && !s.startsWith('0000') ? s : null
}

export const FABRICANTES_OLT: Record<string, string> = { HW: 'Huawei', VSOL: 'VSOL' }
export const ROTULO_STATUS_OS: Record<string, string> = { A: 'Aberta', F: 'Finalizada' }

// ------------------------------------------------------------------ mapeadores puros (testados sem rede)
export function mapearOlt(reg: any, pop: string | null): OltIxc | null {
  if (!reg || !texto(reg.id)) return null
  const fab = texto(reg.fabricante_modelo)
  return {
    id: String(reg.id), nome: texto(reg.descricao), fabricante: fab ? (FABRICANTES_OLT[fab.toUpperCase()] ?? fab) : null,
    modelo: texto(reg.modelo), firmware: texto(reg.fwversion), ativa: reg.ativo === 'S', pop, uptime: texto(reg.uptime),
  }
}

export function mapearPosicao(fibra: any | null, login: LoginIxc | null, olt: OltIxc | null, caixa: { nome: string | null; capacidade: number | null } | null): PosicaoOnu {
  const vlans = fibra ? ([
    ['VLAN', fibra.vlan], ['VLAN PPPoE', fibra.vlan_pppoe], ['VLAN DHCP', fibra.vlan_dhcp], ['VLAN TR-069', fibra.vlan_tr69], ['VLAN IPTV', fibra.vlan_iptv], ['VLAN VoIP', fibra.vlan_voip], ['Outras VLANs', fibra.vlan_outros],
  ] as [string, unknown][]).map(([rotulo, v]) => ({ rotulo, valor: texto(v) })).filter((x): x is { rotulo: string; valor: string } => !!x.valor) : []
  // "VLAN" e "VLAN PPPoE" iguais: mostra so uma.
  const unicas = vlans.filter((v, i) => !(v.rotulo === 'VLAN PPPoE' && vlans.some((o, j) => j < i && o.rotulo === 'VLAN' && o.valor === v.valor)))
  const idCaixa = texto(fibra?.id_caixa_ftth) ?? login?.idCaixaFtth ?? null
  return {
    olt, ponId: texto(fibra?.ponid), slot: texto(fibra?.slotno), pon: texto(fibra?.ponno), onuNumero: texto(fibra?.onu_numero), perfilId: texto(fibra?.id_perfil),
    modeloOnu: texto(fibra?.onu_tipo), autenticacao: texto(fibra?.tipo_autenticacao), vlans: unicas,
    caixa: idCaixa ? { id: idCaixa, nome: caixa?.nome ?? login?.caixaFtth ?? null, capacidade: caixa?.capacidade ?? null, porta: texto(fibra?.porta_ftth) ?? login?.portaFtth ?? null } : null,
    interfaceTransmissao: login?.interfaceTransmissao ?? null, mtu: login?.mtu ?? null,
  }
}

export function mapearLeitura(reg: any): (LeituraOptica & { bruto: string }) | null {
  const em = dataValida(reg?.data_sinal)
  if (!em) return null
  return { em, rxDbm: leitura(reg.sinal_rx), txDbm: leitura(reg.sinal_tx), temperaturaC: leitura(reg.temperatura), voltagemV: leitura(reg.voltagem), bruto: em }
}

const mediana = (v: number[]) => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

/** Historico das leituras do IXC: ordena, separa "sem sinal" (todas as leituras zeradas) e acha a ultima leitura valida. */
export function resumirHistorico(regs: any[]): HistoricoOptico {
  const todas = regs.map(mapearLeitura).filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => a.em.localeCompare(b.em))
  const comSinal = todas.filter(l => l.rxDbm != null || l.txDbm != null)
  const intervalos: number[] = []
  for (let i = 1; i < todas.length; i++) { const h = horasEntre(todas[i - 1].em, todas[i].em); if (h != null && h > 0) intervalos.push(h) }
  const m = mediana(intervalos)
  const limpa = ({ bruto: _b, ...l }: LeituraOptica & { bruto: string }): LeituraOptica => l
  return {
    leituras: comSinal.map(limpa), semSinal: todas.length - comSinal.length, lidas: todas.length,
    ultimaValida: comSinal.length ? limpa(comSinal[comSinal.length - 1]) : null, intervaloHoras: m != null ? Math.round(m * 10) / 10 : null,
  }
}

/** Vizinhos da mesma caixa (SO contagens; o proprio login fica de fora). "Caiu recente" = offline com ultima conexao final nas ultimas horas. */
export function resumirCaixa(logins: any[], idProprio: string | null, capacidade: number | null, agoraIxc: string, janelaHoras = 6): VizinhancaCaixa {
  const outros = logins.filter(l => String(l.id) !== idProprio)
  const offline = outros.filter(l => l.online === 'N')
  const caidos = offline.filter(l => { const f = dataValida(l.ultima_conexao_final); if (!f) return false; const h = horasEntre(f, agoraIxc); return h != null && h >= 0 && h <= janelaHoras })
  const online = outros.filter(l => l.online === 'S').length
  return { total: outros.length, online, offline: offline.length, indefinidos: outros.length - online - offline.length, capacidade, caidosRecentes: caidos.length }
}

/** Visao da PON pelas leituras que o IXC guarda na aba Fibra (RX zerado = sem leitura). Mesma OLT e mesmo ponid. */
export function resumirPon(regs: any[], oltId: string, ponId: string, limites: LimitesRx): VizinhancaPon {
  const dessa = regs.filter(r => String(r.id_transmissor) === oltId && texto(r.ponid) === ponId)
  const rx = dessa.map(r => leitura(r.sinal_rx))
  const validos = rx.filter((x): x is number => x != null)
  const datas = dessa.map(r => dataValida(r.data_sinal)).filter((x): x is string => !!x).sort()
  return {
    ponId, totalOnus: dessa.length, comLeitura: validos.length, semLeitura: dessa.length - validos.length,
    rxFraco: validos.filter(x => x < limites.atencaoMin).length, rxMedianoDbm: mediana(validos) != null ? Math.round(mediana(validos)! * 100) / 100 : null,
    ultimaLeituraEm: datas.length ? datas[datas.length - 1] : null,
  }
}

export function mapearOs(reg: any, assunto: string | null): OrdemServicoIxc {
  const status = texto(reg.status)
  return {
    id: String(reg.id), abertaEm: dataValida(reg.data_abertura), fechadaEm: dataValida(reg.data_fechamento), status,
    statusRotulo: status ? (ROTULO_STATUS_OS[status.toUpperCase()] ?? status) : null, assunto, prioridade: texto(reg.prioridade),
  }
}

// ------------------------------------------------------------------ leitura no IXC
const um = (tabela: string, id: string) => listarIXC(tabela, { qtype: 'id', query: id, oper: '=', rp: 1 }).then(r => r[0] ?? null)
const MIN = 60_000

/** Projecoes minimas: o que fica em cache nunca inclui login, senha, IP, MAC nem comandos de outros clientes. */
const projetarCaixa = (l: any[]) => l.map(x => ({ id: x.id, online: x.online, ultima_conexao_final: x.ultima_conexao_final }))
const projetarPon = (l: any[]) => l.map(x => ({ id_transmissor: x.id_transmissor, ponid: x.ponid, sinal_rx: x.sinal_rx, data_sinal: x.data_sinal }))

async function lerOlt(id: string): Promise<OltIxc | null> {
  return comCache(`rede-olt:${id}`, async () => {
    const reg = await um('radpop_radio', id)
    if (!reg) return null
    const idPop = texto(reg.id_pop)
    const pop = idPop ? texto((await um('radpop', idPop).catch(() => null))?.pop) : null
    return mapearOlt(reg, pop)
  }, 15 * MIN)
}
async function lerCaixa(id: string): Promise<{ nome: string | null; capacidade: number | null } | null> {
  return comCache(`rede-caixa:${id}`, async () => { const r = await um('rad_caixa_ftth', id); return r ? { nome: texto(r.descricao), capacidade: inteiro(r.capacidade) } : null }, 30 * MIN)
}
async function lerAssunto(id: string): Promise<string | null> {
  return comCache(`rede-assunto:${id}`, async () => texto((await um('su_oss_assunto', id))?.assunto), 6 * 60 * MIN)
}

const falha = (o: string) => ({ disponivel: false as const, motivo: `Falha ao consultar ${o} no IXC. Tente de novo; isto NÃO indica que o equipamento esteja fora do ar.` })

export type FibraLida = { tipo: 'ok'; reg: any | null } | { tipo: 'erro' }

/** Aba Fibra do login (1 consulta). Erro de consulta e' diferente de "o IXC nao tem registro". */
export async function lerFibraRegistro(idLogin: string | null): Promise<FibraLida> {
  if (!idLogin || !/^\d+$/.test(idLogin)) return { tipo: 'ok', reg: null }
  try {
    const r: any[] = await listarIXC('radpop_radio_cliente_fibra', { qtype: 'id_login', query: idLogin, oper: '=', rp: 1 })
    return { tipo: 'ok', reg: r[0] ?? null }
  } catch { return { tipo: 'erro' } }
}

export async function lerRede(login: LoginIxc | null, fibra: FibraLida, agora: Date): Promise<RedeIxc> {
  const consultadoEm = agora.toISOString()
  const semLogin = { disponivel: false as const, motivo: 'Este contrato não tem login de conexão cadastrado no IXC.' }
  if (!login) return { consultadoEm, posicao: semLogin, historico: semLogin, vizinhanca: semLogin, ordensServico: semLogin }
  const agoraIxc = agoraNoRelogioDoIxc(agora)
  const reg = fibra.tipo === 'ok' ? fibra.reg : null
  const oltId = texto(reg?.id_transmissor) ?? login.oltId
  const idCaixa = texto(reg?.id_caixa_ftth) ?? login.idCaixaFtth

  // posicao
  let olt: OltIxc | null = null
  let posicao: RedeIxc['posicao']
  if (fibra.tipo === 'erro' && !oltId) posicao = falha('a aba Fibra')
  else {
    try {
      const [o, cx] = await Promise.all([oltId ? lerOlt(oltId).catch(() => null) : Promise.resolve(null), idCaixa ? lerCaixa(idCaixa).catch(() => null) : Promise.resolve(null)])
      olt = o
      posicao = !reg && !oltId ? { disponivel: false, motivo: 'O IXC não tem registro da ONU (aba Fibra) nem a OLT do login.' } : { disponivel: true, ...mapearPosicao(reg, login, o, cx) }
    } catch { posicao = falha('a OLT') }
  }
  const limites = limitesRx(olt, texto(reg?.onu_tipo))

  const [historico, vizinhanca, os] = await Promise.all([
    (async (): Promise<RedeIxc['historico']> => {
      if (fibra.tipo === 'erro') return falha('a aba Fibra')
      const idFibra = texto(reg?.id)
      if (!idFibra) return { disponivel: false, motivo: 'Sem registro da ONU (aba Fibra) no IXC, não há histórico de leituras.' }
      try {
        const regs: any[] = await listarIXC('radpop_radio_cliente_fibra_historico', { qtype: 'id_cliente_fibra', query: idFibra, oper: '=', rp: 120, sortname: 'id', sortorder: 'desc' })
        if (!regs.length) return { disponivel: false, motivo: 'O IXC não tem leituras históricas para esta ONU.' }
        return { disponivel: true, ...resumirHistorico(regs) }
      } catch { return falha('o histórico de leituras') }
    })(),
    (async (): Promise<RedeIxc['vizinhanca']> => {
      try {
        const [caixa, pon] = await Promise.all([
          idCaixa ? comCache(`rede-vcaixa:${idCaixa}`, () => listarIXC('radusuarios', { qtype: 'id_caixa_ftth', query: idCaixa, oper: '=', rp: 80 }).then(projetarCaixa), 5 * MIN).then(l => resumirCaixa(l, login.id, (null as number | null), agoraIxc)).catch(() => null) : Promise.resolve(null),
          oltId && texto(reg?.ponid) ? comCache(`rede-vpon:${oltId}:${reg.ponid}`, () => listarIXC('radpop_radio_cliente_fibra', { qtype: 'ponid', query: String(reg.ponid), oper: '=', rp: 400 }).then(projetarPon), 10 * MIN).then(l => resumirPon(l, oltId, String(reg.ponid), limites)).catch(() => null) : Promise.resolve(null),
        ])
        if (!caixa && !pon) return { disponivel: false, motivo: 'Sem caixa FTTH nem PON identificadas para comparar com os vizinhos.' }
        const cap = posicao.disponivel ? posicao.caixa?.capacidade ?? null : null
        return { disponivel: true, caixa: caixa ? { ...caixa, capacidade: cap } : null, pon }
      } catch { return falha('os vizinhos da caixa/PON') }
    })(),
    (async (): Promise<RedeIxc['ordensServico']> => {
      if (!login.id) return { disponivel: false, motivo: 'Login sem identificador no IXC.' }
      try {
        const regs: any[] = await listarIXC('su_oss_chamado', { qtype: 'id_login', query: login.id, oper: '=', rp: 10, sortname: 'id', sortorder: 'desc' })
        const assuntos = new Map<string, string | null>()
        for (const a of [...new Set(regs.map(r => texto(r.id_assunto)).filter((x): x is string => !!x))]) assuntos.set(a, await lerAssunto(a).catch(() => null))
        return { disponivel: true, total: regs.length, recentes: regs.map(r => mapearOs(r, assuntos.get(texto(r.id_assunto) ?? '') ?? null)) }
      } catch { return falha('as ordens de serviço') }
    })(),
  ])
  return { consultadoEm, posicao, historico, vizinhanca, ordensServico: os }
}
