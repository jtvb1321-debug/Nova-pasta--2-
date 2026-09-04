// Motor de regras do Diagnostico Tecnico - le os resultados dos testes (rede
// local, velocidade, latencia/jitter/perda, DNS, ONU/sinal optico) e produz
// uma classificacao final + origem provavel + recomendacoes. Sempre usa
// linguagem de "provavel"/"possivel causa" (nunca afirma uma causa unica com
// certeza) porque nenhum teste isolado prova definitivamente onde esta o
// problema - e so o cruzamento de varios indicios.

export type Classificacao = 'NORMAL' | 'ATENCAO' | 'POSSIVEL_PROBLEMA' | 'PROBLEMA' | 'INDETERMINADO'

export type OrigemProvavel =
  | 'WIFI' | 'DISPOSITIVO' | 'ROTEADOR' | 'ONU_ONT' | 'FIBRA' | 'SINAL_OPTICO'
  | 'REDE_LOCAL' | 'REDE_GTSNET' | 'DNS' | 'ROTA_EXTERNA' | 'SERVIDOR' | 'INDETERMINADO'

// Labels em texto puro (sem icone/cor) - reaproveitados em qualquer lugar que
// precise so do texto: notificacao do Telegram, PDFs, etc. A versao com
// icone/cor pra tela fica em DiagnosticoRunner.tsx.
export const CLASSIFICACAO_LABEL: Record<Classificacao, string> = {
  NORMAL: 'Normal',
  ATENCAO: 'Atencao',
  POSSIVEL_PROBLEMA: 'Possivel Problema',
  PROBLEMA: 'Problema Identificado',
  INDETERMINADO: 'Nao foi possivel determinar',
}

export const CLASSIFICACAO_EMOJI: Record<Classificacao, string> = {
  NORMAL: '🟢',
  ATENCAO: '🟡',
  POSSIVEL_PROBLEMA: '🟠',
  PROBLEMA: '🔴',
  INDETERMINADO: '⚫',
}

export const ORIGEM_LABEL: Record<OrigemProvavel, string> = {
  WIFI: 'Wi-Fi',
  DISPOSITIVO: 'Dispositivo do cliente',
  ROTEADOR: 'Roteador',
  ONU_ONT: 'ONU/ONT',
  FIBRA: 'Fibra',
  SINAL_OPTICO: 'Sinal Optico',
  REDE_LOCAL: 'Rede Local',
  REDE_GTSNET: 'Rede GTSNET',
  DNS: 'DNS',
  ROTA_EXTERNA: 'Rota Externa',
  SERVIDOR: 'Servidor',
  INDETERMINADO: 'Indeterminado',
}

export const PROBLEMA_ENCONTRADO_LABEL: Record<string, string> = {
  WIFI: 'Wi-Fi', ROTEADOR: 'Roteador', ONU: 'ONU', FIBRA: 'Fibra',
  SINAL: 'Sinal', CONFIGURACAO: 'Configuracao', REDE: 'Rede', OUTRO: 'Outro',
}

export const RESULTADO_FINAL_LABEL: Record<string, string> = {
  RESOLVIDO: 'Resolvido',
  RESOLVIDO_PARCIAL: 'Resolvido parcialmente',
  NAO_RESOLVIDO: 'Nao resolvido',
  ESCALAR: 'Necessario escalar',
  RETORNO: 'Necessario retorno',
}

export interface LimitesDiagnostico {
  limiteJitterAtencaoMs: number
  limiteJitterProblemaMs: number
  limitePerdaAtencaoPct: number
  limitePerdaInstabilidadePct: number
  limiteLatenciaAtencaoMs: number
  limiteLatenciaProblemaMs: number
  limiteSinalAtencaoDbm: number
  limiteSinalCriticoDbm: number
}

export const LIMITES_PADRAO: LimitesDiagnostico = {
  limiteJitterAtencaoMs: 20,
  limiteJitterProblemaMs: 50,
  limitePerdaAtencaoPct: 1,
  limitePerdaInstabilidadePct: 3,
  limiteLatenciaAtencaoMs: 60,
  limiteLatenciaProblemaMs: 120,
  limiteSinalAtencaoDbm: -25,
  limiteSinalCriticoDbm: -28,
}

export interface EntradaDiagnostico {
  planoMbps?: number | null
  downloadMbps?: number | null
  uploadMbps?: number | null
  latenciaGtsnetMs?: number | null
  latenciaExternaMs?: number | null
  jitterMs?: number | null
  perdaPct?: number | null
  dnsOk?: boolean | null
  onuEncontrada?: boolean
  onuStatus?: string | null
  sinalRxDbm?: number | null
}

export interface ResultadoDiagnostico {
  classificacao: Classificacao
  origemProvavel: OrigemProvavel
  // Nivel de confianca da hipotese (0-100) - quanto mais direta a regra que
  // disparou (ex: sinal optico critico), maior a confianca; quando faltam
  // dados a confianca cai, nunca afirmando uma causa com certeza absoluta.
  confianca: number
  // Fatos observados que embasam a hipotese (o que foi medido).
  evidencias: string[]
  // Causa provavel em uma frase, separada das recomendacoes/proximos passos.
  hipotese: string
  recomendacoes: string[]
}

const STATUS_ONU_QUEDA = new Set(['Offline', 'LOS', 'Power failure'])

export function classificar(
  entrada: EntradaDiagnostico,
  limites: LimitesDiagnostico = LIMITES_PADRAO
): ResultadoDiagnostico {
  const {
    planoMbps, downloadMbps, uploadMbps,
    latenciaGtsnetMs, latenciaExternaMs, jitterMs, perdaPct, dnsOk,
    onuEncontrada, onuStatus, sinalRxDbm,
  } = entrada

  const temAlgumDado = [downloadMbps, uploadMbps, latenciaGtsnetMs, jitterMs, perdaPct, sinalRxDbm]
    .some(v => v !== null && v !== undefined) || Boolean(onuEncontrada)

  if (!temAlgumDado) {
    return {
      classificacao: 'INDETERMINADO',
      origemProvavel: 'INDETERMINADO',
      confianca: 0,
      evidencias: [],
      hipotese: 'Nao foi possivel determinar a causa provavel.',
      recomendacoes: ['Nao foi possivel coletar dados suficientes. Repita o diagnostico.'],
    }
  }

  // 1. Sinal optico critico - causa mais "de baixo nivel" da rede, prioridade maxima
  if (sinalRxDbm !== null && sinalRxDbm !== undefined && sinalRxDbm <= limites.limiteSinalCriticoDbm) {
    return {
      classificacao: 'PROBLEMA',
      origemProvavel: 'SINAL_OPTICO',
      confianca: 92,
      evidencias: [`Sinal optico critico (${sinalRxDbm.toFixed(1)} dBm)`],
      hipotese: 'Provavel problema na fibra/conexao optica (conector, drop, CTO ou emenda).',
      recomendacoes: [
        'Verificar conectores',
        'Verificar drop',
        'Verificar CTO',
        'Verificar emenda',
        'Verificar potencia optica na ONU',
        'Revisar fibra',
      ],
    }
  }

  // 2. ONU caida/instavel
  if (onuEncontrada && onuStatus && STATUS_ONU_QUEDA.has(onuStatus)) {
    return {
      classificacao: 'PROBLEMA',
      origemProvavel: 'ONU_ONT',
      confianca: 95,
      evidencias: [`ONU com status "${onuStatus}"`],
      hipotese: 'Provavel problema na ONU (sem alimentacao ou fibra desconectada).',
      recomendacoes: [
        'Verificar alimentacao/fonte da ONU',
        'Verificar conexao da fibra na ONU',
        'Consultar historico de quedas da ONU',
        'Considerar substituicao do equipamento',
      ],
    }
  }

  // 3. Sinal optico em atencao (nao critico, mas fora do ideal)
  if (sinalRxDbm !== null && sinalRxDbm !== undefined && sinalRxDbm <= limites.limiteSinalAtencaoDbm) {
    return {
      classificacao: 'POSSIVEL_PROBLEMA',
      origemProvavel: 'SINAL_OPTICO',
      confianca: 70,
      evidencias: [`Sinal optico proximo do limite (${sinalRxDbm.toFixed(1)} dBm)`],
      hipotese: 'Possivel degradacao na fibra/conectores, ainda nao critica.',
      recomendacoes: [
        'Verificar conectores e emendas',
        'Acompanhar variacao do sinal nas proximas visitas',
      ],
    }
  }

  // 4. Perda de pacotes ou jitter alto - instabilidade de rede
  const perdaAlta = perdaPct !== null && perdaPct !== undefined && perdaPct > limites.limitePerdaInstabilidadePct
  const jitterAlto = jitterMs !== null && jitterMs !== undefined && jitterMs > limites.limiteJitterProblemaMs
  if (perdaAlta || jitterAlto) {
    const gtsnetRuim = latenciaGtsnetMs !== null && latenciaGtsnetMs !== undefined && latenciaGtsnetMs >= limites.limiteLatenciaProblemaMs
    const externaRuim = latenciaExternaMs !== null && latenciaExternaMs !== undefined && latenciaExternaMs >= limites.limiteLatenciaProblemaMs
    if (gtsnetRuim) {
      // Ja instavel para chegar no servidor mais proximo (GTSNET) - indicio de
      // problema entre o cliente e a rede da GTSNET (local/acesso), nao so externo.
      return {
        classificacao: 'POSSIVEL_PROBLEMA',
        origemProvavel: 'REDE_LOCAL',
        confianca: 75,
        evidencias: ['Instabilidade detectada mesmo no trajeto mais curto (servidor GTSNET)'],
        hipotese: 'Possivel problema na rede local/acesso do cliente, nao so externo.',
        recomendacoes: [
          'Repetir o teste',
          'Testar por cabo, sem Wi-Fi',
          'Verificar equipamento (roteador/ONU) e conexoes fisicas',
        ],
      }
    }
    if (externaRuim && !gtsnetRuim) {
      return {
        classificacao: 'POSSIVEL_PROBLEMA',
        origemProvavel: 'ROTA_EXTERNA',
        confianca: 60,
        evidencias: ['Trajeto ate a GTSNET esta normal, mas ate a internet externa nao'],
        hipotese: 'Possivel instabilidade na rota externa/destino, fora da rede da GTSNET.',
        recomendacoes: [
          'Repetir o teste em outro horario',
          'Testar outro destino/servidor de referencia',
          'Verificar se o problema e generalizado (varios clientes) ou so deste cliente',
        ],
      }
    }
    return {
      classificacao: 'POSSIVEL_PROBLEMA',
      origemProvavel: 'REDE_GTSNET',
      confianca: 65,
      evidencias: ['Perda de pacotes ou instabilidade acima do esperado'],
      hipotese: 'Possivel instabilidade na infraestrutura/rota da GTSNET.',
      recomendacoes: [
        'Repetir o teste',
        'Testar por cabo',
        'Verificar infraestrutura/rota',
      ],
    }
  }

  // 5. Velocidade abaixo do esperado, mas sinal/ONU/perda normais ate aqui ->
  // aponta pro lado do cliente (Wi-Fi/dispositivo/roteador), nunca afirmado com certeza.
  if (planoMbps && downloadMbps !== null && downloadMbps !== undefined && downloadMbps < planoMbps * 0.6) {
    return {
      classificacao: 'ATENCAO',
      origemProvavel: 'WIFI',
      confianca: 55,
      evidencias: [`Download (${downloadMbps.toFixed(0)} Mbps) bem abaixo do plano contratado (${planoMbps} Mbps)`],
      hipotese: 'Possivel problema de Wi-Fi/roteador/dispositivo do cliente.',
      recomendacoes: [
        'Verificar distancia e posicionamento do roteador',
        'Testar rede 5 GHz',
        'Verificar interferencia de outros equipamentos',
        'Testar em outro dispositivo',
        'Testar por cabo, sem Wi-Fi',
      ],
    }
  }

  // 6. DNS com falha, internet ok
  if (dnsOk === false) {
    return {
      classificacao: 'ATENCAO',
      origemProvavel: 'DNS',
      confianca: 80,
      evidencias: ['A conexao com a internet esta disponivel, mas foram identificadas falhas na resolucao DNS.'],
      hipotese: 'Provavel problema de configuracao de DNS.',
      recomendacoes: [
        'Verificar servidor DNS configurado no roteador/dispositivo',
        'Testar DNS alternativo (1.1.1.1 ou 8.8.8.8)',
      ],
    }
  }

  // 7. Sinais leves de atencao (perda/jitter/latencia dentro do "atencao", nao "problema")
  const perdaLeve = perdaPct !== null && perdaPct !== undefined && perdaPct > limites.limitePerdaAtencaoPct
  const jitterLeve = jitterMs !== null && jitterMs !== undefined && jitterMs > limites.limiteJitterAtencaoMs
  const latenciaLeve = latenciaGtsnetMs !== null && latenciaGtsnetMs !== undefined && latenciaGtsnetMs > limites.limiteLatenciaAtencaoMs
  if (perdaLeve || jitterLeve || latenciaLeve) {
    return {
      classificacao: 'ATENCAO',
      origemProvavel: 'REDE_GTSNET',
      confianca: 40,
      evidencias: ['Pequenas variacoes de latencia/perda detectadas - dentro do aceitavel, mas vale acompanhar'],
      hipotese: 'Sem causa provavel definida - variacao leve, dentro do aceitavel.',
      recomendacoes: [
        'Repetir o teste em outro momento para confirmar',
      ],
    }
  }

  // 8. Nada de anormal
  return {
    classificacao: 'NORMAL',
    origemProvavel: 'INDETERMINADO',
    confianca: 100,
    evidencias: ['Nao foram identificadas anomalias relevantes durante o diagnostico.'],
    hipotese: 'Conexao dentro dos parametros analisados.',
    recomendacoes: ['Nao foram identificadas anomalias relevantes durante o diagnostico.'],
  }
}
