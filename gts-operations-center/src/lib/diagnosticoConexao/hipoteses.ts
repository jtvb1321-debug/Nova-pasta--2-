import { agoraNoRelogioDoIxc, horasEntre } from './horarioIxc'
import { limitesRx } from './limites'
import type { Confianca, DiagnosticoConexao, Hipotese } from './tipos'

// Motor de hipoteses (regras fixas, sem IA): cruza o que o IXC informou sobre a conexao, a ONU, o historico optico e os vizinhos.
// Regras de honestidade:
//  - e' HIPOTESE, nunca conclusao: cada uma traz as evidencias, o horario delas, o grau de confianca e o proximo teste;
//  - com dados so do IXC a confianca maxima e' "media" (o IXC le a OLT a cada algumas horas; nao ha alarme LOS nem estado GPON em tempo real);
//  - falha ao consultar o IXC NUNCA vira "equipamento offline";
//  - consumo acumulado (GB) nao e' velocidade; velocidade, latencia e perda nao sao medidas aqui.

const FRESCOR_MAX_H = 8 // acima disso a leitura e' "desatualizada" (o IXC costuma ler a cada ~3 h)
const QUEDA_RELEVANTE_DB = 3

const hora = (iso: string | null) => (iso ? iso.replace(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2}).*$/, '$3/$2/$1 $4') : null)
const dbm = (v: number) => `${v.toLocaleString('pt-BR')} dBm`
const ev = (texto: string, em: string | null = null) => ({ texto, em: hora(em) })

export function gerarHipoteses(d: Pick<DiagnosticoConexao, 'identificacao' | 'equipamento' | 'rede' | 'sessaoAtual'>, agora: Date): Hipotese[] {
  const out: Hipotese[] = []
  const agoraIxc = agoraNoRelogioDoIxc(agora)
  const { rede, equipamento: eq, identificacao: id } = d
  const login = id.login
  const pos = rede.posicao.disponivel ? rede.posicao : null
  const hist = rede.historico.disponivel ? rede.historico : null
  const viz = rede.vizinhanca.disponivel ? rede.vizinhanca : null
  const limites = limitesRx(pos?.olt ?? null, pos?.modeloOnu ?? null)

  // Leitura mais recente conhecida (aba Fibra) e a ultima VALIDA do historico.
  const atual = eq.disponivel ? { rx: eq.sinalRxDbm, tx: eq.sinalTxDbm, em: eq.leituraEm } : null
  const emIxc = (s: string | null) => (s && /^\d{2}\/\d{2}\/\d{4}/.test(s) ? s.replace(/^(\d{2})\/(\d{2})\/(\d{4})\s*(.*)$/, '$3-$2-$1 $4') : s)
  const idadeAtual = atual?.em ? horasEntre(emIxc(atual.em)!, agoraIxc) : null
  const ultima = hist?.ultimaValida ?? null
  const idadeUltima = ultima ? horasEntre(ultima.em, agoraIxc) : null

  // --- Falha de coleta (cenario E): nunca "offline por falha de consulta"
  const falhas = [rede.posicao, rede.historico, rede.vizinhanca].filter(x => !x.disponivel && /^Falha ao consultar/.test(x.motivo))
  if (falhas.length) {
    out.push({
      id: 'falha-coleta', titulo: 'Falha ao consultar parte dos dados no IXC', severidade: 'atencao', confianca: 'alta',
      evidencias: falhas.map(x => ev(!x.disponivel ? x.motivo : '')),
      proximoTeste: 'Repita a consulta em alguns instantes. Enquanto houver falha de coleta, não conclua que a ONU, a PON ou a OLT estão fora do ar.',
    })
  }

  // --- Leitura desatualizada
  if (idadeAtual != null && idadeAtual > FRESCOR_MAX_H) {
    out.push({
      id: 'leitura-desatualizada', titulo: 'Leitura óptica desatualizada', severidade: 'info', confianca: 'alta',
      evidencias: [ev(`A última leitura registrada no IXC tem ${idadeAtual.toLocaleString('pt-BR')} h (o IXC costuma atualizar a cada poucas horas).`, emIxc(atual!.em))],
      proximoTeste: 'Trate o sinal como referência histórica. Uma leitura nova depende da próxima coleta do IXC ou da consulta direta à OLT (ainda não disponível no GTS Center).',
    })
  }

  const offline = login ? !login.online : null
  const bloqueado = /bloqueio|atraso|desativ/i.test(id.contrato.internet ?? '')

  // --- Cenario A/C: login OFFLINE
  if (login && offline) {
    const evid = [ev('Login PPPoE offline no IXC.', d.sessaoAtual.disponivel ? (d.sessaoAtual.atualizadoEm ?? null) : null)]
    if (ultima) evid.push(ev(`Última leitura óptica válida: RX ${ultima.rxDbm != null ? dbm(ultima.rxDbm) : 'sem valor'}${idadeUltima != null ? ` (há ${idadeUltima.toLocaleString('pt-BR')} h)` : ''}.`, ultima.em))
    if (hist && hist.semSinal > 0) evid.push(ev(`${hist.semSinal} das últimas ${hist.lidas} leituras estão sem sinal (zeradas no IXC).`))
    if (atual && atual.rx == null) evid.push(ev('A leitura atual da ONU está sem sinal (zerada).', emIxc(atual.em)))

    const cx = viz?.caixa
    const pon = viz?.pon
    const vizinhosCaidos = cx && cx.total >= 2 && cx.offline >= Math.max(2, Math.ceil(cx.total / 2))
    const ponSemLeitura = pon && pon.totalOnus >= 5 && pon.semLeitura >= Math.ceil(pon.totalOnus / 2)
    let titulo: string, confianca: Confianca, proximo: string
    if (vizinhosCaidos) {
      evid.push(ev(`${cx!.offline} de ${cx!.total} outros clientes da mesma caixa FTTH também estão offline${cx!.caidosRecentes ? ` (${cx!.caidosRecentes} caíram nas últimas horas)` : ''}.`))
      titulo = 'Possível falha coletiva na caixa/ramal de derivação'; confianca = 'media'
      proximo = 'Confirme em campo a caixa e o ramal (splitter, conectores, fibra de alimentação). Consulte a OLT por alarme LOS na PON (ainda não disponível no GTS Center) antes de concluir qualquer defeito na OLT.'
    } else if (ponSemLeitura) {
      evid.push(ev(`${pon!.semLeitura} de ${pon!.totalOnus} ONUs da PON ${pon!.ponId} estão sem leitura no IXC.`, pon!.ultimaLeituraEm))
      titulo = 'Possível problema na PON ou no alimentador'; confianca = 'media'
      proximo = 'Verifique os alarmes da porta PON na OLT e a fibra de alimentação. Sem alarme confirmado, não conclua defeito na OLT.'
    } else {
      if (cx && cx.total >= 1) evid.push(ev(cx.offline === 0 && cx.indefinidos === 0 ? `${cx.online} de ${cx.total} outro(s) cliente(s) da mesma caixa estão online: não há sinal de falha coletiva na caixa.` : `Outros clientes da mesma caixa: ${cx.online} online, ${cx.offline} offline${cx.indefinidos ? `, ${cx.indefinidos} com estado indefinido no IXC` : ''} (de ${cx.total}).`))
      const semSinalAgora = (atual && atual.rx == null) || (ultima && (idadeUltima ?? 0) > FRESCOR_MAX_H)
      titulo = semSinalAgora ? 'Falha isolada: ONU sem sinal óptico (desligada, sem energia ou fibra do cliente)' : 'Login offline com sinal óptico recente: investigar autenticação/PPPoE'
      confianca = semSinalAgora ? 'media' : 'baixa'
      proximo = semSinalAgora
        ? 'Peça ao cliente para conferir a energia e os LEDs da ONU. Em campo, meça a potência no drop com power meter e inspecione conectores.'
        : 'A ONU tinha sinal na última leitura: verifique credenciais PPPoE, bloqueio/plano no IXC e logs de autenticação no concentrador. Não atribua à fibra sem evidência.'
    }
    if (bloqueado) evid.push(ev(`Situação da internet no IXC: ${id.contrato.internet}. O contrato bloqueado/desativado pode ser a causa (ou a consequência) de o login estar offline.`))
    out.push({ id: 'login-offline', titulo, severidade: bloqueado ? 'atencao' : 'critico', confianca, evidencias: evid, proximoTeste: proximo })
  }

  // --- Cenario B: sinal degradado (qualquer estado com leitura)
  const rx = atual?.rx ?? null
  if (rx != null) {
    const evid: Hipotese['evidencias'] = []
    let motivo: string | null = null
    if (rx < limites.atencaoMin) { motivo = 'Sinal óptico abaixo do limite de referência'; evid.push(ev(`RX ${dbm(rx)} (referência: ${limites.atencaoMin} a ${limites.atencaoMax} dBm). ${limites.origem}.`, emIxc(atual!.em))) }
    else if (rx > limites.atencaoMax) { motivo = 'Sinal óptico acima do limite de referência (possível saturação)'; evid.push(ev(`RX ${dbm(rx)} (referência: ${limites.atencaoMin} a ${limites.atencaoMax} dBm). ${limites.origem}.`, emIxc(atual!.em))) }
    const anteriores = (hist?.leituras ?? []).filter(l => l.rxDbm != null && l.em !== emIxc(atual!.em)).slice(-12).map(l => l.rxDbm as number)
    if (anteriores.length >= 4) {
      const base = [...anteriores].sort((a, b) => a - b)[Math.floor(anteriores.length / 2)]
      const queda = base - rx
      if (queda >= QUEDA_RELEVANTE_DB) { motivo = motivo ?? 'Queda relevante do sinal óptico'; evid.push(ev(`O RX caiu ${queda.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dB em relação à mediana das leituras anteriores (${dbm(base)}).`, emIxc(atual!.em))) }
    }
    if (motivo) {
      if (viz?.pon && viz.pon.comLeitura >= 5 && viz.pon.rxFraco >= Math.ceil(viz.pon.comLeitura * 0.3)) evid.push(ev(`${viz.pon.rxFraco} de ${viz.pon.comLeitura} ONUs com leitura na PON ${viz.pon.ponId} também estão abaixo do limite: pode ser da PON/alimentador, não só deste cliente.`, viz.pon.ultimaLeituraEm))
      out.push({
        id: 'sinal-degradado', titulo: motivo, severidade: rx < limites.atencaoMin - 3 ? 'critico' : 'atencao', confianca: limites.confirmado ? 'media' : 'baixa', evidencias: evid,
        proximoTeste: 'Limpe e inspecione os conectores, confira curvas e atenuação no drop com power meter e compare com a PON. Os limites são de referência padrão: confirme os valores corretos do modelo de ONU/OLT.',
      })
    }
  }

  // --- Cenario D: online e sem anomalia optica
  if (login && !offline && !out.some(h => h.id === 'sinal-degradado' || h.id === 'login-offline')) {
    const evid = [ev('Login PPPoE online no IXC.')]
    if (rx != null) evid.push(ev(`Sinal RX ${dbm(rx)} dentro da referência (${limites.atencaoMin} a ${limites.atencaoMax} dBm).`, emIxc(atual!.em)))
    else evid.push(ev('Sem leitura óptica atual: não é possível avaliar o sinal.'))
    out.push({
      id: 'sem-evidencia-optica', titulo: 'Sem evidência de falha óptica nos dados do IXC', severidade: 'info', confianca: rx != null ? 'media' : 'baixa', evidencias: evid,
      proximoTeste: 'Se o cliente relata lentidão: faça teste de velocidade com servidor próximo (cabo e Wi-Fi) e verifique o roteador do cliente. O consumo registrado (GB) não mede velocidade, e latência/perda de pacotes não são medidas pelo IXC.',
    })
  }

  // --- Situacao contratual (bloqueio/atraso/desativacao) e ordens de servico em aberto
  if (bloqueado) {
    out.push({
      id: 'bloqueio-contratual', titulo: `Situação da internet no IXC: ${id.contrato.internet}`, severidade: 'atencao', confianca: 'alta',
      evidencias: [ev(`Contrato ${id.contrato.id}: situação do contrato ${id.contrato.status ?? 'não informada'}, internet ${id.contrato.internet}.`)],
      proximoTeste: 'Antes de investigar a rede, confirme no IXC o motivo do bloqueio e se há acordo de pagamento ou desbloqueio pendente.',
    })
  }
  if (rede.ordensServico.disponivel) {
    const abertas = rede.ordensServico.recentes.filter(o => o.status?.toUpperCase() === 'A')
    if (abertas.length) {
      out.push({
        id: 'os-abertas', titulo: `${abertas.length} ordem(ns) de serviço aberta(s) no IXC para este login`, severidade: 'info', confianca: 'alta',
        evidencias: abertas.slice(0, 3).map(o => ev(`OS ${o.id}: ${o.assunto ?? 'assunto não informado'}`, o.abertaEm)),
        proximoTeste: 'Confira o andamento dessas OS antes de abrir outro atendimento.',
      })
    }
  }

  // --- Desconexoes registradas
  if (d.sessaoAtual.disponivel && d.sessaoAtual.desconexoes != null && d.sessaoAtual.desconexoes >= 2) {
    out.push({
      id: 'desconexoes', titulo: 'Desconexões repetidas registradas', severidade: 'atencao', confianca: 'media',
      evidencias: [ev(`O IXC contou ${d.sessaoAtual.desconexoes} desconexão(ões)${d.sessaoAtual.motivoUltimaDesconexao ? `; motivo da última: ${d.sessaoAtual.motivoUltimaDesconexao}` : ''}.`)],
      proximoTeste: 'Correlacione os horários das quedas com o histórico óptico e com eventos da PON; verifique energia e a ONU do cliente.',
    })
  }
  return out
}
