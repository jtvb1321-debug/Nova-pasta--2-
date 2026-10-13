-- Inteligencia Operacional (assistente de IA somente leitura): tabelas novas.
-- Gerado por: prisma migrate diff (schema de producao -> schema novo). So ADICIONA objetos.
-- Aplicar APENAS depois de backup e com aprovacao. Em teste local use scripts/ia-banco-teste.mjs.

-- CreateEnum
CREATE TYPE "PapelMensagemIA" AS ENUM ('USUARIO', 'ASSISTENTE');

-- CreateEnum
CREATE TYPE "StatusExecucaoFerramentaIA" AS ENUM ('OK', 'NEGADO', 'INVALIDO', 'ERRO');

-- CreateTable
CREATE TABLE "ia_conversas" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "aba" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ia_conversas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ia_mensagens" (
    "id" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "papel" "PapelMensagemIA" NOT NULL,
    "conteudo" TEXT NOT NULL,
    "indicadores" JSONB,
    "referencias" JSONB,
    "recomendacoes" JSONB,
    "extras" JSONB,
    "provedor" TEXT,
    "modelo" TEXT,
    "simulada" BOOLEAN NOT NULL DEFAULT false,
    "erro" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ia_mensagens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ia_execucoes_ferramenta" (
    "id" TEXT NOT NULL,
    "conversaId" TEXT,
    "usuarioId" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "ferramenta" TEXT NOT NULL,
    "parametros" JSONB,
    "status" "StatusExecucaoFerramentaIA" NOT NULL,
    "duracaoMs" INTEGER NOT NULL DEFAULT 0,
    "resumo" TEXT,
    "erro" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ia_execucoes_ferramenta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ia_conversas_usuarioId_updatedAt_idx" ON "ia_conversas"("usuarioId", "updatedAt");

-- CreateIndex
CREATE INDEX "ia_mensagens_conversaId_createdAt_idx" ON "ia_mensagens"("conversaId", "createdAt");

-- CreateIndex
CREATE INDEX "ia_execucoes_ferramenta_usuarioId_createdAt_idx" ON "ia_execucoes_ferramenta"("usuarioId", "createdAt");

-- CreateIndex
CREATE INDEX "ia_execucoes_ferramenta_ferramenta_createdAt_idx" ON "ia_execucoes_ferramenta"("ferramenta", "createdAt");

-- AddForeignKey
ALTER TABLE "ia_mensagens" ADD CONSTRAINT "ia_mensagens_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "ia_conversas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ia_execucoes_ferramenta" ADD CONSTRAINT "ia_execucoes_ferramenta_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "ia_conversas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

