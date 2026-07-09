# GTS Operations Center

Painel profissional de monitoramento operacional (NOC), Controle de Estoque, Monitoramento de Veículos, Equipes Técnicas e Controle Comercial — desenvolvido para GTSNet.

## Tecnologias

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 15 (App Router) |
| UI | React + TypeScript + TailwindCSS |
| Banco de dados | PostgreSQL + Prisma ORM |
| Autenticação | NextAuth v5 |
| Estado | React Query (TanStack) |
| Formulários | React Hook Form + Zod |
| Mapas | Leaflet + React-Leaflet |
| Gráficos | Chart.js + React-Chartjs-2 |
| Ícones | Lucide React + React Icons |

## Pré-requisitos

- Node.js 18+
- PostgreSQL 14+
- npm ou yarn

## Instalação Rápida

```bash
# 1. Clone ou extraia o projeto
cd gts-operations-center

# 2. Copie o arquivo de ambiente
cp .env.example .env

# 3. Edite o .env com suas configurações
# DATABASE_URL, NEXTAUTH_SECRET, etc.

# 4. Execute o setup automático (instala deps + banco + seed)
npm run setup

# 5. Inicie o servidor de desenvolvimento
npm run dev
```

Acesse: **http://localhost:3000**

## Credenciais Iniciais

| Perfil | E-mail | Senha |
|--------|--------|-------|
| Administrador | admin@gtsnet.com.br | gts2024 |
| Gestor | gestor@gtsnet.com.br | gts2024 |
| Thalita (Vendas) | thalita@gtsnet.com.br | gts2024 |
| Maria (Vendas) | maria@gtsnet.com.br | gts2024 |
| Melke (Vendas) | melke@gtsnet.com.br | gts2024 |
| Kawan (Vendas) | kawan@gtsnet.com.br | gts2024 |

## Scripts Disponíveis

```bash
npm run dev          # Servidor de desenvolvimento
npm run build        # Build de produção
npm run start        # Servidor de produção
npm run db:generate  # Gerar tipos do Prisma
npm run db:push      # Sincronizar schema com banco
npm run db:migrate   # Criar migration
npm run db:seed      # Popular banco com dados iniciais
npm run db:studio    # Abrir Prisma Studio (GUI)
npm run db:reset     # Resetar banco e re-popular
npm run setup        # Instalação completa automática
```

## Estrutura do Projeto

```
src/
├── app/                  # Next.js App Router
│   ├── api/              # API Routes (backend)
│   │   ├── auth/         # NextAuth handlers
│   │   ├── dashboard/    # Stats do dashboard
│   │   ├── inventory/    # CRUD de estoque
│   │   ├── movements/    # Movimentações
│   │   ├── teams/        # Equipes
│   │   ├── tickets/      # Chamados
│   │   ├── vehicles/     # Veículos rastreados
│   │   └── sales/        # Vendas e comissões
│   ├── dashboard/        # Página dashboard
│   ├── inventory/        # Página estoque
│   ├── map/              # Página mapa
│   ├── vehicles/         # Página veículos
│   ├── teams/            # Página equipes
│   ├── tickets/          # Página chamados
│   ├── movements/        # Página movimentações
│   ├── reports/          # Página relatórios
│   ├── sales/            # Página vendas
│   ├── settings/         # Configurações
│   └── login/            # Página de login
├── components/
│   ├── layout/           # Shell, Sidebar, TopBar
│   ├── dashboard/        # Componentes do dashboard
│   ├── inventory/        # Componentes de estoque
│   ├── map/              # Componente de mapa Leaflet
│   ├── teams/            # Componentes de equipes
│   ├── tickets/          # Componentes de chamados
│   ├── sales/            # Componentes de vendas
│   ├── reports/          # Componentes de relatórios
│   └── ui/               # Componentes UI base
├── hooks/                # Custom hooks
├── lib/                  # Prisma, Auth, Utils
├── services/             # Serviço de rastreamento
├── types/                # Tipos TypeScript
└── utils/                # Funções utilitárias
prisma/
├── schema.prisma         # Schema do banco
└── seed/
    └── index.ts          # Seed com dados iniciais
```

## Módulos

### Dashboard
- Cards de KPIs em tempo real
- Mapa com posição dos veículos
- Status das equipes
- Gráfico de consumo de materiais
- Últimas movimentações e chamados

### Estoque
- Categorias: GTSNet, EACE, Ferramentas, Limpeza
- 55+ itens pré-cadastrados via seed
- Alertas visuais para estoque crítico
- Entrada, saída, transferência com histórico
- Exportação Excel e PDF

### Equipes
- 4 equipes com técnicos cadastrados
- Status: Aguardando / Deslocamento / Atividade / Finalizado
- Vinculação com chamados e veículos
- Tempo em atividade

### Chamados
- Tipos: Instalação, Manutenção, Retirada, Suporte
- Reserva de materiais ao iniciar
- Baixa automática ao finalizar
- Histórico completo

### Veículos
- Integração com API RastroSystem
- Mapa dark mode com Leaflet
- Alerta visual e sonoro > 80 km/h
- Histórico de trajeto

### Vendas
- Vendedores: Thalita, Maria, Grazielle, Melke, Kawan
- Aprovação somente por Gestor/Admin
- Comissão automática: R$ 25,00 por venda aprovada
- Ranking mensal com exportação PDF

### Relatórios
- PDF profissional com logo e cabeçalho
- Por equipe, período, vendedor
- Materiais utilizados, chamados, comissões

## Configuração da API de Rastreamento

Edite o `.env`:
```env
RASTREAMENTO_API_URL=https://gtsnet.rastrosystem.com.br/api_v2
RASTREAMENTO_API_TOKEN=seu-token
```

O serviço está em `src/services/rastreamento.service.ts`. Adapte os campos da resposta conforme a documentação real da API RastroSystem.

## Perfis de Acesso

| Perfil | Permissões |
|--------|-----------|
| ADMIN | Acesso total |
| GESTOR | Tudo + aprovar vendas |
| OPERADOR | Dashboard, chamados, estoque, equipes |
| COMERCIAL | Apenas módulo de vendas |

## Produção

```bash
npm run build
npm run start
```

Configure um proxy reverso (nginx/caddy) apontando para a porta 3000.

---

**GTSNet © 2024 — GTS Operations Center**
