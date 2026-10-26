// Dados 100% ficticios do IXC FALSO (servidor local scripts/ixc-falso.ts e testes). Imita o formato da API: POST /webservice/v1/<tabela> com {qtype, query, oper, page, rp, sortname, sortorder}.
const pad = (n: number) => String(n).padStart(2, '0')
const SP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
/** Horario como o IXC grava (relogio de Brasilia), para os testes nao dependerem do fuso da maquina. */
const fmtSP = (d: Date) => { const p: Record<string, string> = {}; for (const x of SP.formatToParts(d)) if (x.type !== 'literal') p[x.type] = x.value; return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}` }
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`

const cliente = [
  { id: '9001', cnpj_cpf: '111.222.333-44', ie_identidade: 'RG-SEGREDO-99', endereco: 'Rua Teste', numero: '10', bairro: 'Centro', cep: '64000-000', email: 'cliente.um@teste.invalid', data_cadastro: '2024-03-10', razao: 'CLIENTE TESTE IA DIAGNOSTICO UM', fantasia: '', cidade: '1', telefone_celular: '(86) 90000-0001', fone: '' },
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
  { id: '7001', id_cliente: '9001', id_vd_contrato: '11', status: 'A', status_internet: 'A', status_velocidade: 'N', contrato: 'FIBRA 300 MEGA', data_ativacao: '2024-01-10', data_cadastro_sistema: '2024-01-05 10:00:00', data_renovacao: '2026-01-10', data_expiracao: '2027-01-10', bloqueio_automatico: 'S', renovacao_automatica: 'S', fidelidade: '12', tempo_permanencia: '12', tipo: 'I', tipo_cobranca: 'P', dt_ult_bloq_auto: '2026-08-12 00:10:00', dt_ult_desbloq_auto: '2026-08-13 09:00:00', contrato_suspenso: 'N', endereco: 'Rua Teste', numero: '100', bairro: 'Centro', campo_novo_do_ixc: 'valor ainda sem layout' },
  { id: '7002', id_cliente: '9002', id_vd_contrato: '12', status: 'A', status_internet: 'A', status_velocidade: 'N', contrato: 'FIBRA 500 MEGA' },
  { id: '7003', id_cliente: '9002', id_vd_contrato: '11', status: 'A', status_internet: 'CA', status_velocidade: 'R', contrato: 'FIBRA 300 MEGA' },
  ...cancelados,
]
const vd_contratos = [{ id: '11', nome: 'FIBRA 300 MEGA', valor_contrato: '79.900000000', Ativo: 'S', tipo: 'I', tipo_pessoa: 'T', logins_simultaneos: '1', moeda: 'BRL' }, { id: '12', nome: 'FIBRA 500 MEGA' }]
const radgrupos = [{ id: '21', grupo: 'PLANO 300M', download: '310M', upload: '155M', valor_produto: '79.900000000', tipo: 'I', prioridade: '1', qos_ativo: 'N' }, { id: '22', grupo: 'PLANO 500M', download: '510M', upload: '255M' }]
const radusuarios = [
  { id: '1', login: 'teste.diag.um', senha: 'SENHA-PPPOE-FALSA', usuario_router1: 'admin-falso', senha_router1: 'SENHA-R1-FALSA', senha_rede_sem_fio: 'SENHA-WIFI-FALSA', porta_http: '80', porta_router2: '8080', tipo_acesso: 'http', id_transmissor: '2', id_caixa_ftth: '354', ftth_porta: '2', interface_transmissao: '269', mtu: '1500', autenticacao: 'L', tipo_conexao_mapa: 'F', pd_ipv6: '', id_cliente: '9001', id_contrato: '7001', id_grupo: '21', online: 'S', ativo: 'S', ip: '10.10.0.21', mac: 'AA:BB:CC:00:10:01', onu_mac: '48575443AABB0001', ultima_conexao_final: '0000-00-00 00:00:00', tempo_conectado: '67477', download_atual: '4634235783', upload_atual: '528551714', ultima_atualizacao: fmt(new Date(Date.now() - 600_000)), motivo_desconexao: '', count_desconexao: '', ultima_conexao_inicial: fmt(new Date(Date.now() - 6 * 3600_000)), tipo_conexao: 'Ethernet', conexao: 'eth 0/3/4096.153', concentrador: '1' },
  { id: '2', login: 'teste.diag.dois.a', id_transmissor: '2', id_caixa_ftth: '355', ftth_porta: '1', interface_transmissao: '270', mtu: '1500', autenticacao: 'L', tipo_conexao_mapa: 'F', pd_ipv6: '2001:db8:1::/56', id_cliente: '9002', id_contrato: '7002', id_grupo: '22', online: 'N', ativo: 'S', ip: '', mac: '', onu_mac: '', ultima_conexao_final: '2026-09-01 09:30:00', tempo_conectado: '0', download_atual: '0', upload_atual: '0', ultima_atualizacao: '2026-09-01 09:30:00', motivo_desconexao: 'Lost-Carrier', count_desconexao: '3', ultima_conexao_inicial: '2026-09-01 08:00:00', tipo_conexao: 'Ethernet', conexao: '', concentrador: '1' },
  { id: '3', login: 'teste.diag.dois.b', id_transmissor: '2', id_caixa_ftth: '356', ftth_porta: '1', interface_transmissao: '271', mtu: '1500', autenticacao: 'L', tipo_conexao_mapa: 'F', pd_ipv6: '', id_cliente: '9002', id_contrato: '7003', id_grupo: '21', online: 'S', ativo: 'S', ip: '10.10.0.23', mac: 'AA:BB:CC:00:10:03', onu_mac: 'ZTEGAABB0003', ultima_conexao_final: '0000-00-00 00:00:00', tempo_conectado: '7200', download_atual: '1073741824', upload_atual: '104857600', ultima_atualizacao: fmt(new Date(Date.now() - 300_000)), motivo_desconexao: '', count_desconexao: '1', ultima_conexao_inicial: fmt(new Date(Date.now() - 2 * 3600_000)), tipo_conexao: 'Ethernet', conexao: '', concentrador: '1' },
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

// Aba "Fibra" do login (radpop_radio_cliente_fibra): sinal, temperatura, tensao, modelo. Sinal "0" = sem leitura.
const fibraOriginal = [
  { id: '1', id_login: '1', id_contrato: '7001', onu_tipo: 'ITBS-1200R', mac: '48575443AABB0001', sinal_rx: '-21.30', sinal_tx: '-23.10', temperatura: '31.00', voltagem: '3.30', data_sinal: fmt(new Date(Date.now() - 3600_000)), causa_ultima_queda: '', distancia_onu: '' },
  { id: '2', id_login: '2', id_contrato: '7002', onu_tipo: 'FHTT-WKE2', mac: '4648545400000002', sinal_rx: '-29.50', sinal_tx: '-24.00', temperatura: '40.50', voltagem: '3.20', data_sinal: '2026-09-01 09:00:00', causa_ultima_queda: 'Falta de energia', distancia_onu: '1850' },
  { id: '3', id_login: '3', id_contrato: '7003', onu_tipo: 'xPON-ONT1', mac: '5A54454700000003', sinal_rx: '0', sinal_tx: '0', temperatura: '0', voltagem: '0', data_sinal: '0000-00-00 00:00:00', causa_ultima_queda: '', distancia_onu: '' },
]

// ---- Rede (OLT, PON, caixa, historico optico, vizinhos, OS). Valores ficticios; horarios relativos a agora, no relogio de Brasilia.
const h = (horas: number) => fmtSP(new Date(Date.now() - horas * 3_600_000))
const radpop_radio = [{ id: '2', descricao: 'OLT-TESTE', ativo: 'S', fabricante_modelo: 'HW', modelo: 'MA5603T', fwversion: 'MA5600V800R015C00', id_pop: '1', uptime: '10d 0h 0m', login: 'NAO-DEVE-SAIR', senha: 'NAO-DEVE-SAIR' }]
const radpop = [{ id: '1', pop: 'POP TESTE' }]
const rad_caixa_ftth = [{ id: '354', descricao: 'CX TESTE 01', capacidade: '8', status: 'A' }, { id: '355', descricao: 'CX TESTE 02', capacidade: '8', status: 'A' }]
const fibraBase = { id_transmissor: '2', slotno: '1', ponno: '14', ponid: '0/1/14', id_perfil: '22', vlan: '130', vlan_pppoe: '130', tipo_autenticacao: 'MAC', comandos: 'NAO-DEVE-SAIR' }
// Posicao de rede de cada ONU do cadastro original (mesma OLT/PON dos vizinhos abaixo).
const redePorLogin: Record<string, any> = {
  '1': { ...fibraBase, onu_numero: '19', id_caixa_ftth: '354', porta_ftth: '2' },
  '2': { ...fibraBase, onu_numero: '20', id_caixa_ftth: '355', porta_ftth: '1' },
  '3': { ...fibraBase, ponno: '15', ponid: '0/1/15', onu_numero: '21', id_caixa_ftth: '356', porta_ftth: '1' },
}
const radpop_radio_cliente_fibra = [
  ...fibraOriginal.map(r => ({ ...r, ...redePorLogin[r.id_login] })),
  // ONUs vizinhas na mesma PON (para o resumo da PON): 3 com sinal (1 fraco) e 2 sem leitura; uma de OUTRA OLT com o mesmo ponid (nao conta).
  ...[['6001', '-22.10'], ['6002', '-23.40'], ['6003', '-28.90'], ['6004', '0'], ['6005', '0']].map(([id, rx], i) => ({ ...fibraBase, id, id_login: String(100 + i), onu_numero: String(30 + i), sinal_rx: rx, sinal_tx: rx === '0' ? '0' : '-30.00', temperatura: '0', voltagem: '0', data_sinal: h(2) })),
  { ...fibraBase, id: '6006', id_login: '106', id_transmissor: '3', onu_numero: '1', sinal_rx: '-20.00', sinal_tx: '-30.00', data_sinal: h(2) },
]
// Historico: login 1 = 12 leituras a cada 3 h com queda de ~4 dB nas ultimas; login 2 = so zeros e uma leitura valida antiga.
const radpop_radio_cliente_fibra_historico = [
  ...Array.from({ length: 12 }, (_, i) => ({ id: String(8000 + i), id_cliente_fibra: '1', sinal_rx: i < 10 ? '-20.10' : '-24.20', sinal_tx: '-31.00', temperatura: '35.00', voltagem: '3.24', data_sinal: h((11 - i) * 3 + 1) })),
  ...Array.from({ length: 8 }, (_, i) => ({ id: String(8100 + i), id_cliente_fibra: '2', sinal_rx: i === 7 ? '-19.74' : '0.00', sinal_tx: i === 7 ? '-27.70' : '0.00', temperatura: i === 7 ? '33.00' : '0.00', voltagem: i === 7 ? '3.22' : '0.00', data_sinal: h((7 - i) * 3 + 100) })),
]
// Vizinhos da caixa 355 (a do login 2 offline): 3 outros logins, 2 offline (um caiu ha 2 h) e 1 online. Caixa 354: so um vizinho online.
const vizinhos = [
  { id: '201', id_caixa_ftth: '355', online: 'N', ultima_conexao_final: h(2), login: 'NAO-DEVE-SAIR', senha: 'NAO-DEVE-SAIR', id_cliente: '9201' },
  { id: '202', id_caixa_ftth: '355', online: 'N', ultima_conexao_final: h(90), login: 'NAO-DEVE-SAIR', senha: 'NAO-DEVE-SAIR', id_cliente: '9202' },
  { id: '203', id_caixa_ftth: '355', online: 'S', ultima_conexao_final: '0000-00-00 00:00:00', login: 'NAO-DEVE-SAIR', senha: 'NAO-DEVE-SAIR', id_cliente: '9203' },
  { id: '204', id_caixa_ftth: '354', online: 'S', ultima_conexao_final: '0000-00-00 00:00:00', login: 'NAO-DEVE-SAIR', senha: 'NAO-DEVE-SAIR', id_cliente: '9204' },
]
const su_oss_assunto = [{ id: '10', assunto: 'Suporte tecnico internet lenta' }, { id: '11', assunto: 'Cobranca presencial' }]
const su_oss_chamado = [
  { id: '3001', id_login: '2', id_cliente: '9002', id_assunto: '11', status: 'A', prioridade: 'N', data_abertura: h(48), data_fechamento: '0000-00-00 00:00:00', mensagem: 'TEXTO-DO-CLIENTE-NAO-DEVE-SAIR' },
  { id: '3000', id_login: '2', id_cliente: '9002', id_assunto: '10', status: 'F', prioridade: 'N', data_abertura: h(400), data_fechamento: h(380), mensagem: 'TEXTO-DO-CLIENTE-NAO-DEVE-SAIR' },
]

// Historico do contrato (eventos que explicam quedas administrativas). Contrato 7002 = login 2 (teste.diag.dois.a).
const cliente_contrato_historico = [
  { id: '9100', id_cliente: '9002', id_contrato: '7002', data: h(30), tipo: 'Desconectou usuários', historico: 'Desconectou usuário 2 do contrato 7002.' },
  { id: '9101', id_cliente: '9002', id_contrato: '7002', data: h(31), tipo: 'Bloqueio Manual', historico: 'Bloqueio manual contrato ID : 7002' },
  { id: '9102', id_cliente: '9002', id_contrato: '7002', data: h(200), tipo: 'Ativa Internet', historico: 'Internet liberada contrato 7002' },
  { id: '9103', id_cliente: '9002', id_contrato: '7002', data: h(201), tipo: 'Falha ao desconectar usuários', historico: 'Falha ao desconectar usuário 2 do contrato 7002.' },
  { id: '9104', id_cliente: '9002', id_contrato: '7002', data: h(300), tipo: 'Envia Email', historico: 'Email: Aviso de pendência de pagamento contato@exemplo.invalid' },
  { id: '9105', id_cliente: '9002', id_contrato: '7002', data: h(301), tipo: 'Atualiza data pago', historico: 'Atualizou data pago do contrato 7002. CRE 5' },
  { id: '9106', id_cliente: '9002', id_contrato: '7002', data: h(24 * 120), tipo: 'Desconectou usuários', historico: 'Desconectou usuário 2 do contrato 7002 (muito antigo).' },
]

const TABELAS: Record<string, any[]> = { cliente, cliente_contrato, vd_contratos, radgrupos, radusuarios: [...radusuarios, ...vizinhos], radacct: sessoes(), cidade: [{ id: '1', nome: 'Cidade Teste' }], rad_caixa_ftth, radpop_radio, radpop, radpop_radio_cliente_fibra, radpop_radio_cliente_fibra_historico, su_oss_assunto, su_oss_chamado, cliente_contrato_historico }

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
