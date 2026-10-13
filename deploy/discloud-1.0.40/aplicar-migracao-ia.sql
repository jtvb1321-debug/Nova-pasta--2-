-- Inteligencia Operacional (1.0.40): cria 2 tipos e 3 tabelas NOVAS (ia_conversas, ia_mensagens, ia_execucoes_ferramenta).
-- So CRIA objetos: nao altera, nao apaga e nao le nenhuma tabela existente. Tudo ou nada (BEGIN/COMMIT).
-- Fazer o backup (pg_dump) ANTES. Para desfazer: DROP das 3 tabelas e dos 2 tipos abaixo (nada mais depende deles).
BEGIN;


CREATE TYPE "PapelMensagemIA" AS ENUM ('USUARIO', 'ASSISTENTE');

CREATE TYPE "StatusExecucaoFerramentaIA" AS ENUM ('OK', 'NEGADO', 'INVALIDO', 'ERRO');

CREATE TABLE "ia_conversas" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "aba" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ia_conversas_pkey" PRIMARY KEY ("id")
);

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

CREATE INDEX "ia_conversas_usuarioId_updatedAt_idx" ON "ia_conversas"("usuarioId", "updatedAt");

CREATE INDEX "ia_mensagens_conversaId_createdAt_idx" ON "ia_mensagens"("conversaId", "createdAt");

CREATE INDEX "ia_execucoes_ferramenta_usuarioId_createdAt_idx" ON "ia_execucoes_ferramenta"("usuarioId", "createdAt");

CREATE INDEX "ia_execucoes_ferramenta_ferramenta_createdAt_idx" ON "ia_execucoes_ferramenta"("ferramenta", "createdAt");

ALTER TABLE "ia_mensagens" ADD CONSTRAINT "ia_mensagens_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "ia_conversas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ia_execucoes_ferramenta" ADD CONSTRAINT "ia_execucoes_ferramenta_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "ia_conversas"("id") ON DELETE SET NULL ON UPDATE CASCADE;


COMMIT;
