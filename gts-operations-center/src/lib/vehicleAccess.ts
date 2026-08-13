import { prisma } from '@/lib/prisma'

const ROLES_GESTAO_FROTA = ['ADMIN', 'GESTOR', 'OPERADOR']

// Confirma que o usuario pode ler/lancar dados (km, abastecimento, despesa,
// manutencao) de um veiculo especifico: ADMIN/GESTOR/OPERADOR podem qualquer
// veiculo, TECNICO so o da propria equipe, os demais (VENDEDOR/COMERCIAL) nao
// tem acesso. Retorna null quando permitido, ou uma mensagem de erro.
export async function verificarAcessoVeiculo(session: any, veiculoId: string): Promise<string | null> {
  const role = session?.user?.role
  if (ROLES_GESTAO_FROTA.includes(role)) return null

  if (role === 'TECNICO') {
    const veiculo = await prisma.veiculo.findUnique({ where: { id: veiculoId }, select: { equipeId: true } })
    if (!veiculo) return 'Veiculo nao encontrado'
    const funcionario = await prisma.funcionario.findUnique({
      where: { usuarioId: session.user.id },
      select: { equipeId: true },
    })
    if (!funcionario || funcionario.equipeId !== veiculo.equipeId) {
      return 'Este veiculo nao pertence a sua equipe'
    }
    return null
  }

  return 'Sem permissao para acessar dados de veiculo'
}
