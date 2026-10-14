// Equipes de campo consideradas nos paineis operacionais (TV, Agenda,
// Relatorio Diario) - filtro deliberado, nao inclui veiculos de apoio nem
// demais equipes cadastradas. Resolvidas por nome (Equipe nao tem uma flag
// "operacional" propria).
export const EQUIPES_OPERACIONAIS = [
  { chave: 'alex e bernardo', label: 'Alex e Bernardo' },
  // Equipe 02 foi renomeada no cadastro para "Pedro e Heytor": a chave antiga nao encontrava mais a equipe.
  { chave: 'pedro e heytor',  label: 'Pedro e Heytor' },
  { chave: 'bernardo e pedro', label: 'Bernardo e Pedro' },
]
