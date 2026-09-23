// Troca de senha obrigatoria apos a correcao do login: quem nao trocou a
// propria senha desde esta data e levado para /trocar-senha ao entrar.
// A troca fica registrada na auditoria (logs) com a acao abaixo.
export const TROCA_OBRIGATORIA_DESDE = new Date('2026-09-23T00:00:00-03:00')

export const ACAO_SENHA_ALTERADA = 'SENHA_ALTERADA'

// Senha inicial do seed e do criar-admin: nao pode ser escolhida como nova.
export const SENHA_PADRAO = 'gts2024'

export const SENHA_MIN = 8
