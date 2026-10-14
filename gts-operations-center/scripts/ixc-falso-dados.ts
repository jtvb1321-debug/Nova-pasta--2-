// Dados 100% ficticios do IXC FALSO (servidor local scripts/ixc-falso.ts e testes). Imita o formato da API: POST /webservice/v1/<tabela> com {qtype, query, oper, page, rp, sortname, sortorder}.
const pad = (n: number) => String(n).padStart(2, '0')
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`

const cliente = [
  { id: '9001', razao: 'CLIENTE TESTE IA DIAGNOSTICO UM', fantasia: '', cidade: '1', telefone_celular: '(86) 90000-0001', fone: '' },
  { id: '9002', razao: 'CLIENTE TESTE IA DIAGNOSTICO DOIS', fantasia: 'TESTE DOIS', cidade: '1', telefone_celular: '(86) 90000-0002', fone: '' },
  { id: '9003', razao: 'CLIENTE TESTE CANCELADO TRES', fantasia: '', cidade: '1', telefone_celular: '(86) 90000-0003', fone: '' },
  { id: '9004', razao: 'CLIENTE TESTE CANCELADO QUATRO', fantasia: '', cidade: '1', telefone_celular: '(86) 90000-0004', fone: '' },
]
// Contratos CANCELADOS no mes atual (relatorio "Cancelamento de nao ativo"), de clientes proprios para nao misturar com o diagnostico.
const agora = new Date()
const mesAtual = `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}`
const d = (dia: number) => `${mesAtual}-${pad(dia)}`
const cancelado = (id: string, cliente: string, extra: Record<string, string>) => ({
  id, id_cliente: cliente, id_vd_contrato: '11', status: 'I', status_internet: 'D', status_velocidade: 'N', contrato: 'FIBRA 300 MEGA',
  data_ativacao: '2024-01-10', data_cancelamento: d(25), obs_cancelamento: 'Motivo do Cancelamento: Inadimplência', ...extra,
})
const cancelados = [
  cancelado('7201', '9003', { dt_ult_bloq_manual: d(5) }),                                              // bloqueado ha 20 dias
  cancelado('7202', '9004', { dt_ult_bloq_auto: d(10), dt_ult_desbloq_auto: d(12) }),                    // voltou a ficar ativo
  cancelado('7203', '9003', { dt_ult_bloq_manual: d(24) }),                                             // bloqueio colado no cancelamento
  cancelado('7204', '9004', { data_inicial_suspensao: d(1), obs_cancelamento: 'Motivo do Cancelamento: Mudou de cidade' }), // suspenso
]

const cliente_contrato = [
  { id: '7001', id_cliente: '9001', id_vd_contrato: '11', status: 'A', status_internet: 'A', status_velocidade: 'N', contrato: 'FIBRA 300 MEGA' },
  { id: '7002', id_cliente: '9002', id_vd_contrato: '12', status: 'A', status_internet: 'A', status_velocidade: 'N', contrato: 'FIBRA 500 MEGA' },
  { id: '7003', id_cliente: '9002', id_vd_contrato: '11', status: 'A', status_internet: 'CA', status_velocidade: 'R', contrato: 'FIBRA 300 MEGA' },
  ...cancelados,
]
const vd_contratos = [{ id: '11', nome: 'FIBRA 300 MEGA' }, { id: '12', nome: 'FIBRA 500 MEGA' }]
const radgrupos = [{ id: '21', grupo: 'PLANO 300M', download: '310M', upload: '155M' }, { id: '22', grupo: 'PLANO 500M', download: '510M', upload: '255M' }]
const radusuarios = [
  { id: '1', login: 'teste.diag.um', autenticacao: 'L', tipo_conexao_mapa: 'F', pd_ipv6: '', id_cliente: '9001', id_contrato: '7001', id_grupo: '21', online: 'S', ativo: 'S', ip: '10.10.0.21', mac: 'AA:BB:CC:00:10:01', onu_mac: '48575443AABB0001', ultima_conexao_final: '0000-00-00 00:00:00', tempo_conectado: '67477', download_atual: '4634235783', upload_atual: '528551714', ultima_atualizacao: fmt(new Date(Date.now() - 600_000)), motivo_desconexao: '', count_desconexao: '', ultima_conexao_inicial: fmt(new Date(Date.now() - 6 * 3600_000)), tipo_conexao: 'Ethernet', conexao: 'eth 0/3/4096.153', concentrador: '1', id_caixa_ftth: '0', ftth_porta: '0' },
  { id: '2', login: 'teste.diag.dois.a', autenticacao: 'L', tipo_conexao_mapa: 'F', pd_ipv6: '2001:db8:1::/56', id_cliente: '9002', id_contrato: '7002', id_grupo: '22', online: 'N', ativo: 'S', ip: '', mac: '', onu_mac: '', ultima_conexao_final: '2026-09-01 09:30:00', tempo_conectado: '0', download_atual: '0', upload_atual: '0', ultima_atualizacao: '2026-09-01 09:30:00', motivo_desconexao: 'Lost-Carrier', count_desconexao: '3', ultima_conexao_inicial: '2026-09-01 08:00:00', tipo_conexao: 'Ethernet', conexao: '', concentrador: '1', id_caixa_ftth: '0', ftth_porta: '0' },
  { id: '3', login: 'teste.diag.dois.b', autenticacao: 'L', tipo_conexao_mapa: 'F', pd_ipv6: '', id_cliente: '9002', id_contrato: '7003', id_grupo: '21', online: 'S', ativo: 'S', ip: '10.10.0.23', mac: 'AA:BB:CC:00:10:03', onu_mac: 'ZTEGAABB0003', ultima_conexao_final: '0000-00-00 00:00:00', tempo_conectado: '7200', download_atual: '1073741824', upload_atual: '104857600', ultima_atualizacao: fmt(new Date(Date.now() - 300_000)), motivo_desconexao: '', count_desconexao: '1', ultima_conexao_inicial: fmt(new Date(Date.now() - 2 * 3600_000)), tipo_conexao: 'Ethernet', conexao: '', concentrador: '1', id_caixa_ftth: '0', ftth_porta: '0' },
]

// Sessoes (radacct) so para teste.diag.um (40 dias, deterministico) e teste.diag.dois.b (sem campos de volume).
function sessoes(): any[] {
  const out: any[] = []
  let semente = 7
  const aleatorio = () => { semente = (semente * 1664525 + 1013904223) % 4294967296; return semente / 4294967296 }
  const causas = ['User-Request', 'Lost-Carrier', 'NAS-Reboot', 'Idle-Timeout']
  const hoje = new Date()
  for (let d = 40; d >= 0; d--) {
    const n = 1 + Math.floor(aleatorio() * 3)
    for (let k = 0; k < n; k++) {
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - d, 2 + k * 7, Math.floor(aleatorio() * 59), 0)
      const dur = Math.floor(3600 + aleatorio() * 20_000)
      const fim = new Date(inicio.getTime() + dur * 1000)
      const emCurso = d === 0 && k === n - 1
      const dl = Math.floor(aleatorio() * 6 * 1024 ** 3)
      const ul = Math.floor(aleatorio() * 0.8 * 1024 ** 3)
      out.push({
        id: String(out.length + 1), username: 'teste.diag.um', acctstarttime: fmt(inicio), acctstoptime: emCurso ? '0000-00-00 00:00:00' : fmt(fim),
        acctsessiontime: emCurso ? '0' : String(dur), framedipaddress: '10.10.0.21', acctinputoctets: String(ul), acctoutputoctets: String(dl),
        acctterminatecause: emCurso ? '' : causas[Math.floor(aleatorio() * causas.length)],
      })
    }
  }
  out.push({ id: '9990', username: 'teste.diag.dois.b', acctstarttime: fmt(new Date(Date.now() - 86_400_000)), acctstoptime: '0000-00-00 00:00:00', acctsessiontime: '0', framedipaddress: '10.10.0.23' })
  return out
}

export // Aba "Fibra" do login (radpop_radio_cliente_fibra): sinal, temperatura, tensao, modelo. Sinal "0" = sem leitura.
const radpop_radio_cliente_fibra = [
  { id: '1', id_login: '1', id_contrato: '7001', onu_tipo: 'ITBS-1200R', mac: '48575443AABB0001', sinal_rx: '-21.30', sinal_tx: '-23.10', temperatura: '31.00', voltagem: '3.30', data_sinal: fmt(new Date(Date.now() - 3600_000)), causa_ultima_queda: '', distancia_onu: '' },
  { id: '2', id_login: '2', id_contrato: '7002', onu_tipo: 'FHTT-WKE2', mac: '4648545400000002', sinal_rx: '-29.50', sinal_tx: '-24.00', temperatura: '40.50', voltagem: '3.20', data_sinal: '2026-09-01 09:00:00', causa_ultima_queda: 'Falta de energia', distancia_onu: '1850' },
  { id: '3', id_login: '3', id_contrato: '7003', onu_tipo: 'xPON-ONT1', mac: '5A54454700000003', sinal_rx: '0', sinal_tx: '0', temperatura: '0', voltagem: '0', data_sinal: '0000-00-00 00:00:00', causa_ultima_queda: '', distancia_onu: '' },
]

const TABELAS: Record<string, any[]> = { cliente, cliente_contrato, vd_contratos, radgrupos, radusuarios, radpop_radio_cliente_fibra, radacct: sessoes(), cidade: [{ id: '1', nome: 'Cidade Teste' }], rad_caixa_ftth: [] }

function filtrar(linhas: any[], qtype: string, query: string, oper: string) {
  if (!query && oper !== 'L') return linhas
  const q = String(query).toLowerCase()
  if (oper === 'L') return linhas.filter(l => String(l[qtype] ?? '').toLowerCase().includes(q))
  if (oper === '>=' ) return linhas.filter(l => String(l[qtype] ?? '') >= query)
  if (oper === '>') return linhas.filter(l => Number(l[qtype]) > Number(query))
  return linhas.filter(l => String(l[qtype] ?? '').toLowerCase() === q)
}


/** Responde como o IXC: filtra, ordena e pagina a tabela. Tabela inexistente -> null. */
export function responderIxc(tabela: string, p: any): { page: string; total: string; registros: any[] } | null {
  const base = TABELAS[tabela]
  if (!base) return null
  let linhas = filtrar(base, p.qtype ?? 'id', p.query ?? '', p.oper ?? '=')
  if (p.sortname && linhas.length && p.sortname in linhas[0]) {
    linhas = [...linhas].sort((a, b) => String(a[p.sortname]).localeCompare(String(b[p.sortname])) * (p.sortorder === 'desc' ? -1 : 1))
  }
  const rp = Math.max(1, Number(p.rp ?? 20)); const page = Math.max(1, Number(p.page ?? 1))
  return { page: String(page), total: String(linhas.length), registros: linhas.slice((page - 1) * rp, page * rp) }
}
