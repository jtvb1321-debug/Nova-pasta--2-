import { PrismaClient, UserRole, CategoriaEstoque, StatusEquipe } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed...')

  const senhaHash = await bcrypt.hash('gts2024', 10)

  // USUÁRIOS
  const usuarios = [
    { nome: 'Administrador', email: 'admin@gtsnet.com.br', role: UserRole.ADMIN },
    { nome: 'Herminia Gestor', email: 'gestor@gtsnet.com.br', role: UserRole.GESTOR },
    { nome: 'Thalita Kelly', email: 'thalita@gtsnet.com.br', role: UserRole.COMERCIAL },
    { nome: 'Maria Grazielle', email: 'maria@gtsnet.com.br', role: UserRole.COMERCIAL },
    { nome: 'Melke', email: 'melke@gtsnet.com.br', role: UserRole.COMERCIAL },
    { nome: 'Kawan', email: 'kawan@gtsnet.com.br', role: UserRole.COMERCIAL },
  ]

  for (const u of usuarios) {
    await prisma.usuario.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, senha: senhaHash, ativo: true },
    })
  }

  // EQUIPES
  const equipes = [
    { id: 'equipe-01', nome: 'Equipe 01 — Alex e Bernardo' },
    { id: 'equipe-02', nome: 'Equipe 02 — Heitor e Pedro' },
    { id: 'equipe-03', nome: 'Equipe 03 — Higor' },
    { id: 'equipe-04', nome: 'Equipe 04 — Kaio Felipe' },
    { id: 'equipe-ap1', nome: 'Veículo de Apoio 01' },
    { id: 'equipe-ap2', nome: 'Veículo de Apoio 02' },
  ]

  for (const e of equipes) {
    await prisma.equipe.upsert({
      where: { id: e.id },
      update: { nome: e.nome },
      create: { id: e.id, nome: e.nome, status: StatusEquipe.AGUARDANDO },
    })
  }

  // FUNCIONÁRIOS
  const funcionarios = [
    { nome: 'Alex',        cargo: 'Técnico', equipeId: 'equipe-01' },
    { nome: 'Bernardo',    cargo: 'Técnico', equipeId: 'equipe-01' },
    { nome: 'Heitor',      cargo: 'Técnico', equipeId: 'equipe-02' },
    { nome: 'Pedro',       cargo: 'Técnico', equipeId: 'equipe-02' },
    { nome: 'Higor',       cargo: 'Técnico', equipeId: 'equipe-03' },
    { nome: 'Kaio Felipe', cargo: 'Técnico', equipeId: 'equipe-04' },
  ]

  for (const f of funcionarios) {
    const existe = await prisma.funcionario.findFirst({ where: { nome: f.nome, equipeId: f.equipeId } })
    if (!existe) await prisma.funcionario.create({ data: f })
  }

  // VEÍCULOS
  const veiculos = [
    { placa: 'UKJ3J29', modelo: 'Volkswagen Saveiro', cor: 'Branco', equipeId: 'equipe-01' },
    { placa: 'HNP9017', modelo: 'Volkswagen Saveiro', cor: 'Branco', equipeId: 'equipe-02' },
    { placa: 'OPP3F19', modelo: 'Fiat Mobi',          cor: 'Branco', equipeId: 'equipe-03' },
    { placa: 'NIL8195', modelo: 'Chevrolet Celta',     cor: 'Branco', equipeId: 'equipe-04' },
    { placa: 'HGV9677', modelo: 'Chevrolet Celta',     cor: 'Branco', equipeId: 'equipe-ap1' },
    { placa: 'APOIO02', modelo: 'Mitsubishi L200',     cor: 'Branco', equipeId: 'equipe-ap2' },
  ]

  for (const v of veiculos) {
    await prisma.veiculo.upsert({
      where: { placa: v.placa },
      update: {},
      create: { ...v, ativo: true },
    })
  }

  // ESTOQUE GTSNET
  const itensGTSNet = [
    { codigo: 'GTN-001', descricao: 'Cabo UTP CAT5E (metro)', unidade: 'MT', quantidadeAtual: 500, quantidadeMinima: 100, valorUnitario: 1.50 },
    { codigo: 'GTN-002', descricao: 'Cabo UTP CAT6 (metro)', unidade: 'MT', quantidadeAtual: 300, quantidadeMinima: 100, valorUnitario: 2.80 },
    { codigo: 'GTN-003', descricao: 'Conector RJ45 CAT5E', unidade: 'UN', quantidadeAtual: 500, quantidadeMinima: 100, valorUnitario: 0.50 },
    { codigo: 'GTN-004', descricao: 'Conector RJ45 CAT6', unidade: 'UN', quantidadeAtual: 300, quantidadeMinima: 100, valorUnitario: 0.80 },
    { codigo: 'GTN-005', descricao: 'Switch 8 Portas TP-Link', unidade: 'UN', quantidadeAtual: 10, quantidadeMinima: 3, valorUnitario: 120.00 },
    { codigo: 'GTN-006', descricao: 'Switch 16 Portas TP-Link', unidade: 'UN', quantidadeAtual: 5, quantidadeMinima: 2, valorUnitario: 250.00 },
    { codigo: 'GTN-007', descricao: 'Roteador Mikrotik hAP ac²', unidade: 'UN', quantidadeAtual: 15, quantidadeMinima: 5, valorUnitario: 350.00 },
    { codigo: 'GTN-008', descricao: 'ONU GPON Intelbras', unidade: 'UN', quantidadeAtual: 30, quantidadeMinima: 10, valorUnitario: 180.00 },
    { codigo: 'GTN-009', descricao: 'Splitter Óptico 1x8', unidade: 'UN', quantidadeAtual: 20, quantidadeMinima: 5, valorUnitario: 45.00 },
    { codigo: 'GTN-010', descricao: 'Splitter Óptico 1x16', unidade: 'UN', quantidadeAtual: 15, quantidadeMinima: 5, valorUnitario: 85.00 },
    { codigo: 'GTN-011', descricao: 'Cabo Drop Óptico (metro)', unidade: 'MT', quantidadeAtual: 1000, quantidadeMinima: 200, valorUnitario: 1.20 },
    { codigo: 'GTN-012', descricao: 'Conector SC/APC', unidade: 'UN', quantidadeAtual: 200, quantidadeMinima: 50, valorUnitario: 3.50 },
    { codigo: 'GTN-013', descricao: 'Conector SC/UPC', unidade: 'UN', quantidadeAtual: 200, quantidadeMinima: 50, valorUnitario: 3.20 },
    { codigo: 'GTN-014', descricao: 'CTO 8 Portas', unidade: 'UN', quantidadeAtual: 25, quantidadeMinima: 8, valorUnitario: 65.00 },
    { codigo: 'GTN-015', descricao: 'CTO 16 Portas', unidade: 'UN', quantidadeAtual: 15, quantidadeMinima: 5, valorUnitario: 110.00 },
    { codigo: 'GTN-016', descricao: 'Abraçadeira Nylon 200mm', unidade: 'PC', quantidadeAtual: 500, quantidadeMinima: 100, valorUnitario: 0.10 },
    { codigo: 'GTN-017', descricao: 'Antena 5.8GHz Ubiquiti', unidade: 'UN', quantidadeAtual: 8, quantidadeMinima: 3, valorUnitario: 480.00 },
    { codigo: 'GTN-018', descricao: 'Nobreak 600VA', unidade: 'UN', quantidadeAtual: 5, quantidadeMinima: 2, valorUnitario: 320.00 },
    { codigo: 'GTN-019', descricao: 'ONU GPON Intelbras GF1200', unidade: 'UN', quantidadeAtual: 20, quantidadeMinima: 5, valorUnitario: 210.00 },
    { codigo: 'GTN-020', descricao: 'Conector Fast Ethernet', unidade: 'UN', quantidadeAtual: 300, quantidadeMinima: 50, valorUnitario: 1.50 },
  ]

  const itensEACE = [
    { codigo: 'EACE-001', descricao: 'Access Point Ubiquiti AP-AC-LR', unidade: 'UN', quantidadeAtual: 20, quantidadeMinima: 5, valorUnitario: 650.00 },
    { codigo: 'EACE-002', descricao: 'Access Point Ubiquiti AP-AC-PRO', unidade: 'UN', quantidadeAtual: 15, quantidadeMinima: 5, valorUnitario: 980.00 },
    { codigo: 'EACE-003', descricao: 'Switch POE 8P Ubiquiti', unidade: 'UN', quantidadeAtual: 10, quantidadeMinima: 3, valorUnitario: 750.00 },
    { codigo: 'EACE-004', descricao: 'Injetor POE 48V', unidade: 'UN', quantidadeAtual: 25, quantidadeMinima: 8, valorUnitario: 85.00 },
    { codigo: 'EACE-005', descricao: 'Cabo UTP Externo CAT5E (metro)', unidade: 'MT', quantidadeAtual: 800, quantidadeMinima: 200, valorUnitario: 2.20 },
    { codigo: 'EACE-006', descricao: 'Cabo UTP Externo CAT6 (metro)', unidade: 'MT', quantidadeAtual: 500, quantidadeMinima: 150, valorUnitario: 3.80 },
    { codigo: 'EACE-007', descricao: 'Rack 12U de Parede', unidade: 'UN', quantidadeAtual: 6, quantidadeMinima: 2, valorUnitario: 380.00 },
    { codigo: 'EACE-008', descricao: 'Patch Panel CAT6 24P', unidade: 'UN', quantidadeAtual: 8, quantidadeMinima: 2, valorUnitario: 220.00 },
    { codigo: 'EACE-009', descricao: 'Organizador de Cabos 1U', unidade: 'UN', quantidadeAtual: 15, quantidadeMinima: 5, valorUnitario: 35.00 },
    { codigo: 'EACE-010', descricao: 'Régua de Energia 6T', unidade: 'UN', quantidadeAtual: 10, quantidadeMinima: 3, valorUnitario: 55.00 },
  ]

  const itensFerramentas = [
    { codigo: 'FER-001', descricao: 'Alicate de Crimpagem RJ45', unidade: 'UN', quantidadeAtual: 6, quantidadeMinima: 2, valorUnitario: 45.00 },
    { codigo: 'FER-002', descricao: 'Alicate de Corte Diagonal', unidade: 'UN', quantidadeAtual: 6, quantidadeMinima: 2, valorUnitario: 28.00 },
    { codigo: 'FER-003', descricao: 'Decapador de Cabo Óptico', unidade: 'UN', quantidadeAtual: 4, quantidadeMinima: 2, valorUnitario: 55.00 },
    { codigo: 'FER-004', descricao: 'Fusionadora de Fibra Óptica', unidade: 'UN', quantidadeAtual: 2, quantidadeMinima: 1, valorUnitario: 4500.00 },
    { codigo: 'FER-005', descricao: 'Power Meter Óptico', unidade: 'UN', quantidadeAtual: 3, quantidadeMinima: 1, valorUnitario: 280.00 },
    { codigo: 'FER-006', descricao: 'Escada Alumínio 5m', unidade: 'UN', quantidadeAtual: 4, quantidadeMinima: 2, valorUnitario: 450.00 },
    { codigo: 'FER-007', descricao: 'Furadeira Bosch', unidade: 'UN', quantidadeAtual: 4, quantidadeMinima: 2, valorUnitario: 380.00 },
    { codigo: 'FER-008', descricao: 'Multímetro Digital', unidade: 'UN', quantidadeAtual: 4, quantidadeMinima: 2, valorUnitario: 120.00 },
    { codigo: 'FER-009', descricao: 'Cinto de Segurança EPI', unidade: 'UN', quantidadeAtual: 6, quantidadeMinima: 4, valorUnitario: 180.00 },
    { codigo: 'FER-010', descricao: 'Fita Isolante Rolo', unidade: 'RL', quantidadeAtual: 24, quantidadeMinima: 8, valorUnitario: 5.50 },
  ]

  const itensLimpeza = [
    { codigo: 'LMP-001', descricao: 'Álcool Isopropílico 500ml', unidade: 'FR', quantidadeAtual: 10, quantidadeMinima: 3, valorUnitario: 25.00 },
    { codigo: 'LMP-002', descricao: 'Pano Microfibra', unidade: 'UN', quantidadeAtual: 20, quantidadeMinima: 6, valorUnitario: 8.00 },
    { codigo: 'LMP-003', descricao: 'Spray Limpa Contato', unidade: 'FR', quantidadeAtual: 6, quantidadeMinima: 2, valorUnitario: 22.00 },
    { codigo: 'LMP-004', descricao: 'Ar Comprimido 300ml', unidade: 'FR', quantidadeAtual: 8, quantidadeMinima: 3, valorUnitario: 28.00 },
    { codigo: 'LMP-005', descricao: 'Rodo e Cabo Alumínio', unidade: 'UN', quantidadeAtual: 4, quantidadeMinima: 2, valorUnitario: 35.00 },
  ]

  const todosItens = [
    ...itensGTSNet.map(i => ({ ...i, categoria: CategoriaEstoque.GTSNET })),
    ...itensEACE.map(i => ({ ...i, categoria: CategoriaEstoque.EACE })),
    ...itensFerramentas.map(i => ({ ...i, categoria: CategoriaEstoque.FERRAMENTAS })),
    ...itensLimpeza.map(i => ({ ...i, categoria: CategoriaEstoque.LIMPEZA })),
  ]

  for (const item of todosItens) {
    await prisma.itemEstoque.upsert({
      where: { codigo: item.codigo },
      update: {},
      create: item,
    })
  }

  // CONFIGURAÇÕES
  const configuracoes = [
    { chave: 'empresa_nome', valor: 'GTSNet' },
    { chave: 'empresa_cnpj', valor: '00.000.000/0001-00' },
    { chave: 'empresa_cidade', valor: 'Brasil' },
    { chave: 'rastreamento_api_url', valor: 'https://gtsnet.rastrosystem.com.br/api_v2' },
    { chave: 'rastreamento_api_token', valor: '' },
    { chave: 'velocidade_alerta', valor: '80' },
    { chave: 'comissao_valor', valor: '25.00' },
  ]

  for (const c of configuracoes) {
    await prisma.configuracao.upsert({
      where: { chave: c.chave },
      update: {},
      create: { chave: c.chave, valor: c.valor },
    })
  }

  console.log('✅ Seed concluído!')
  console.log('   admin@gtsnet.com.br / gts2024')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())