// Mapeamento do OPA Suite conforme a DOCUMENTACAO PUBLICA da API (colecao Postman publicada em api.opasuite.com.br):
//  - autenticacao: cabecalho "Authorization: Bearer <token>" (token gerado no cadastro de usuarios, perfil de permissoes do tipo API);
//  - listagem: GET /api/v1/atendimento com corpo JSON { filter, options: { limit, skip } };
//  - filtros: dataInicialAbertura/dataFinalAbertura e dataInicialEncerramento/dataFinalEncerramento (AAAA-MM-DD; maximo de 1 ano), status, id_atendente;
//  - resposta: { status, code, data: [ ... ] } com _id, id_atendente, protocolo, date (criacao), fim (encerramento) e status.
// Situacoes documentadas no exemplo da API: "F" (finalizado) e "EA" (em atendimento). Nao ha codigo documentado para
// abandonado/fila: ficam vazios (a sincronizacao avisa se aparecer um codigo desconhecido).
// A API de listagem NAO informa assumido/primeira resposta/transferencia/SLA/resolucao remota; a nota esta em "avaliacoes",
// cuja estrutura os exemplos nao mostram: por isso esses indicadores seguem "Nao disponivel".
import type { ConfigOpa } from '../config'
import { SCHEMAS_CONFIG } from '../config'

export function presetOpaSuite(): ConfigOpa {
  return SCHEMAS_CONFIG.opa.parse({
    caminhoLista: '/api/v1/atendimento',
    caminhoUsuarios: '/api/v1/usuario/',
    cabecalhoAuth: 'Authorization',
    prefixoAuth: 'Bearer ',
    estilo: 'CORPO',
    paginacao: 'SKIP',
    paramInicio: 'dataInicialAbertura', paramFim: 'dataFinalAbertura',
    paramInicioAlt: 'dataInicialEncerramento', paramFimAlt: 'dataFinalEncerramento',
    paramStatus: 'status', buscarEmAberto: true,
    paramPagina: 'skip', paramLimite: 'limit', tamanhoPagina: 100,
    formatoParamData: 'DATA',
    caminhoItens: 'data',
    campos: { id: '_id', atendenteId: 'id_atendente', protocolo: 'protocolo', criadoEm: 'date', finalizadoEm: 'fim', situacao: 'status' },
    situacoes: { finalizado: ['F'], emAtendimento: ['EA'], abandonado: [], aberto: [] },
  })
}
