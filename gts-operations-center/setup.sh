#!/bin/bash
# setup.sh - Instalação automática do GTS Operations Center

set -e

echo ""
echo "================================================"
echo "  GTS OPERATIONS CENTER - Setup Automático"
echo "================================================"
echo ""

# Verificar Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js não encontrado. Instale Node.js 18+ e tente novamente."
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "❌ Node.js 18+ é necessário. Versão atual: $(node -v)"
  exit 1
fi

echo "✅ Node.js $(node -v) encontrado"

# Verificar .env
if [ ! -f .env ]; then
  echo ""
  echo "📋 Criando .env a partir do .env.example..."
  cp .env.example .env
  echo "⚠️  IMPORTANTE: Edite o arquivo .env com suas configurações antes de continuar."
  echo "   Principalmente: DATABASE_URL e NEXTAUTH_SECRET"
  echo ""
  read -p "Pressione ENTER após editar o .env para continuar..."
fi

# Instalar dependências
echo ""
echo "📦 Instalando dependências..."
npm install

# Gerar cliente Prisma
echo ""
echo "🔧 Gerando cliente Prisma..."
npm run db:generate

# Sincronizar banco
echo ""
echo "🗄️  Sincronizando banco de dados..."
npm run db:push

# Popular banco
echo ""
echo "🌱 Populando banco com dados iniciais..."
npm run db:seed

echo ""
echo "================================================"
echo "  ✅ Setup concluído com sucesso!"
echo "================================================"
echo ""
echo "  Para iniciar: npm run dev"
echo "  Acesse:       http://localhost:3000"
echo ""
echo "  Login admin:  admin@gtsnet.com.br / gts2024"
echo "================================================"
echo ""
