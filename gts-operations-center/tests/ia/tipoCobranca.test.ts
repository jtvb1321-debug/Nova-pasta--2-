// Tipo de atividade COBRANCA: rotulo, SLA proprio e regra de reincidencia (cobranca nao vira rechamada). Banco de TESTE isolado.
import './ambiente'
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '@/lib/prisma'
import { detectarReincidencia, META_SLA_RESOLUCAO_MINUTOS } from '@/lib/sla'
import { TIPO_CHAMADO_LABELS } from '@/types'

const TEL = '91900000777'
const abertura = new Date('2026-11-27T15:00:00Z')
const finalizadoHa = (dias: number) => new Date(abertura.getTime() - dias * 24 * 60 * 60 * 1000)

const novo = (tipo: 'SUPORTE' | 'COBRANCA', diasAtras: number) => prisma.chamado.create({
  data: { cliente: 'Cliente cobranca (TESTE)', telefone: TEL, endereco: 'Rua A', cidade: 'Castanhal', tipo, status: 'FINALIZADO', dataAbertura: finalizadoHa(diasAtras + 1), dataFim: finalizadoHa(diasAtras) },
})

const limpar = () => prisma.chamado.deleteMany({ where: { telefone: TEL } })
before(limpar)
after(async () => { await limpar() })

describe('tipo COBRANCA', () => {
  it('tem rotulo e meta de SLA propria', () => {
    assert.equal(TIPO_CHAMADO_LABELS.COBRANCA, 'Cobrança')
    assert.equal(META_SLA_RESOLUCAO_MINUTOS.COBRANCA, 24 * 60)
  })

  it('o banco aceita o tipo COBRANCA', async () => {
    const c = await novo('COBRANCA', 2)
    assert.equal(c.tipo, 'COBRANCA')
    await limpar()
  })

  it('suporte logo depois de suporte finalizado continua reincidente (regra existente)', async () => {
    const anterior = await novo('SUPORTE', 2)
    const r = await detectarReincidencia({ cliente: 'Cliente cobranca (TESTE)', telefone: TEL, dataAbertura: abertura, tipo: 'SUPORTE' })
    assert.equal(r.reincidente, true)
    assert.equal(r.chamadoOrigemReincidenciaId, anterior.id)
    assert.equal(r.statusRechamada, 'POSSIVEL')
    await limpar()
  })

  it('cobranca finalizada NAO torna o suporte seguinte reincidente', async () => {
    await novo('COBRANCA', 2)
    const r = await detectarReincidencia({ cliente: 'Cliente cobranca (TESTE)', telefone: TEL, dataAbertura: abertura, tipo: 'SUPORTE' })
    assert.equal(r.reincidente, false)
    await limpar()
  })

  it('cobranca nova NUNCA e marcada como reincidente, mesmo apos um suporte finalizado', async () => {
    await novo('SUPORTE', 2)
    const r = await detectarReincidencia({ cliente: 'Cliente cobranca (TESTE)', telefone: TEL, dataAbertura: abertura, tipo: 'COBRANCA' })
    assert.equal(r.reincidente, false)
    assert.equal(r.statusRechamada, null)
    await limpar()
  })
})
