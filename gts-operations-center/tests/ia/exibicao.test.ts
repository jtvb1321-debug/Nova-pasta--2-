import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { camposDe, formatarValor, type GrupoIxc } from '@/lib/diagnosticoConexao/dadosIxc'
import { organizarAba, tomDe } from '@/lib/diagnosticoConexao/exibicao'

describe('exibicao: valores do IXC em texto legivel', () => {
  it('codigos de situacao viram o texto que o IXC mostra; codigo desconhecido fica como esta', () => {
    assert.equal(formatarValor('status', 'I'), 'Inativo'); assert.equal(formatarValor('status', 'A'), 'Ativo'); assert.equal(formatarValor('status', 'ZZ'), 'ZZ')
    assert.equal(formatarValor('status_internet', 'CM'), 'Bloqueio manual'); assert.equal(formatarValor('status_internet', 'D'), 'Desativada')
    assert.equal(formatarValor('status_velocidade', 'R'), 'Reduzida'); assert.equal(formatarValor('autenticacao', 'L'), 'PPPoE (login e senha)'); assert.equal(formatarValor('tipo_conexao_mapa', 'F'), 'Fibra')
  })
  it('S/N vira Sim/Nao, mas "status" e "tipo" com N nao viram "Nao" (N pode ser Negativado)', () => {
    assert.equal(formatarValor('bloqueio_automatico', 'S'), 'Sim'); assert.equal(formatarValor('renovacao_automatica', 'N'), 'Não'); assert.equal(formatarValor('Ativo', 'S'), 'Sim')
    assert.equal(formatarValor('status', 'N'), 'Negativado')
  })
  it('datas, dinheiro e unidades', () => {
    assert.equal(formatarValor('dt_ult_bloq_manual', '2026-10-05 14:30:00'), '05/10/2026 14:30'); assert.equal(formatarValor('pago_ate_data', '2026-11-10'), '10/11/2026'); assert.equal(formatarValor('nao_bloquear_ate', '2026-10-30'), '30/10/2026')
    assert.match(formatarValor('valor_contrato', '89.900000000'), /R\$\s?89,90/); assert.match(formatarValor('valor_produto', '99.9'), /R\$\s?99,90/)
    assert.equal(formatarValor('sinal_rx', '-24.31'), '-24,31 dBm'); assert.equal(formatarValor('temperatura', '34'), '34 °C'); assert.equal(formatarValor('voltagem', '3.28'), '3,28 V')
    assert.equal(formatarValor('download', '620M'), '620 Mbps'); assert.equal(formatarValor('tempo_conectado', '67477'), '18h 44min'); assert.match(formatarValor('download_atual', '4634235783'), /GB$/)
  })
  it('o filtro de segredos continua valendo (formatar nao libera nada)', () => {
    const r = camposDe({ status: 'A', senha: 'x', usuario_router1: 'admin', cnpj_cpf: '1', valor_contrato: '10' })
    assert.deepEqual(r.campos.map(c => c.campo), ['status', 'valor_contrato']); assert.equal(r.protegidos, 3)
  })
})

describe('exibicao: abas Contrato, Plano e Fibra', () => {
  const c = (campo: string, valor: string) => ({ campo, rotulo: campo, valor })
  const grupos: GrupoIxc[] = [
    { id: 'cliente', titulo: 'Cliente', campos: [c('razao', 'ACME')] },
    { id: 'contrato', titulo: 'Contrato', campos: [c('data_ativacao', '10/01/2024'), c('status', 'Ativo'), c('status_internet', 'Bloqueio automático'), c('campo_novo_do_ixc', 'x'), c('dt_ult_bloq_auto', '01/10/2026')] },
    { id: 'plano', titulo: 'Plano de venda', campos: [c('nome', 'PLANO 600'), c('tipo', 'Internet'), c('valor_contrato', 'R$ 89,90')] },
    { id: 'velocidade', titulo: 'Plano de velocidade (RADIUS)', campos: [c('grupo', 'GRUPO_600'), c('download', '620 Mbps'), c('tipo', 'Internet'), c('qos_ativo', 'Sim')] },
    { id: 'fibra', titulo: 'ONU e fibra (aba Fibra)', campos: [c('sinal_rx', '-24 dBm'), c('onu_tipo', 'ITBS'), c('ponno', '3')] },
    { id: 'caixa', titulo: 'Caixa FTTH', campos: [c('descricao', 'CTO-12'), c('status', 'Ativo')] },
  ]
  it('contrato: secoes na ordem do layout; o que nao tem lugar vai para "outros"', () => {
    const o = organizarAba(grupos, 'contrato')
    assert.deepEqual(o.secoes.map(s => s.titulo), ['Situação', 'Datas', 'Bloqueios, desbloqueios e suspensão'])
    assert.deepEqual(o.secoes[0].campos.map(x => x.campo), ['status', 'status_internet']); assert.deepEqual(o.outros.map(x => x.campo), ['campo_novo_do_ixc'])
    assert.ok(!o.secoes.flatMap(s => s.campos).some(x => x.campo === 'razao'), 'dados do cliente nao entram na aba do contrato')
  })
  it('plano junta plano de venda e velocidade sem confundir campos de mesmo nome (tipo)', () => {
    const o = organizarAba(grupos, 'plano')
    assert.deepEqual(o.secoes.map(s => s.titulo), ['Plano de venda', 'Velocidade (RADIUS)'])
    assert.equal(o.secoes[0].campos.find(x => x.campo === 'tipo')!.valor, 'Internet'); assert.deepEqual(o.secoes[1].campos.map(x => x.campo), ['grupo', 'download', 'tipo'])
    assert.equal(o.outros.length, 1); assert.match(o.outros[0].rotulo, /^Plano de velocidade \(RADIUS\) · /)
  })
  it('fibra: ONU, sinal, posicao na rede e caixa, com a caixa separada da ONU', () => {
    const o = organizarAba(grupos, 'fibra')
    assert.deepEqual(o.secoes.map(s => s.titulo), ['ONU', 'Leitura de sinal', 'Posição na rede', 'Caixa FTTH'])
    assert.deepEqual(o.secoes[3].campos.map(x => x.campo), ['descricao', 'status'])
  })
  it('aba sem dados: vazia, sem erro', () => {
    const o = organizarAba([], 'contrato'); assert.deepEqual(o.secoes, []); assert.deepEqual(o.outros, [])
  })
  it('cor dos chips: bloqueio e negativado em vermelho, atraso em amarelo, ativo em verde, desconhecido neutro', () => {
    assert.equal(tomDe('status_internet', 'Ativa'), 'ok'); assert.equal(tomDe('status_internet', 'Bloqueio automático'), 'perigo'); assert.equal(tomDe('status_internet', 'Financeiro em atraso'), 'alerta')
    assert.equal(tomDe('status', 'Negativado'), 'perigo'); assert.equal(tomDe('status', 'Ativo'), 'ok'); assert.equal(tomDe('status', 'Inativo'), 'neutro')
    assert.equal(tomDe('status_velocidade', 'Reduzida'), 'alerta'); assert.equal(tomDe('contrato_suspenso', 'Sim'), 'alerta'); assert.equal(tomDe('status_internet', 'Codigo novo'), 'neutro')
  })
})
