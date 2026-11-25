-- CreateEnum
CREATE TYPE "GdTipoColaborador" AS ENUM ('RECEPCAO', 'CAMPO');

-- CreateEnum
CREATE TYPE "GdTipoUnidade" AS ENUM ('RECEPCAO_INDIVIDUAL', 'EQUIPE_CAMPO');

-- CreateEnum
CREATE TYPE "GdTipoOcorrencia" AS ENUM ('FERIAS', 'FOLGA', 'ATESTADO', 'PLANTAO', 'TREINAMENTO', 'ADMINISTRATIVO', 'SEM_META', 'FALHA_REDE', 'DDOS', 'FALTA_MATERIAL', 'INFRAESTRUTURA', 'CLIENTE_INDISPONIVEL', 'OUTRA');

-- CreateEnum
CREATE TYPE "GdPeriodicidade" AS ENUM ('DIARIA', 'SEMANAL', 'MENSAL');

-- CreateEnum
CREATE TYPE "GdSentidoMeta" AS ENUM ('MAIOR_MELHOR', 'MENOR_MELHOR');

-- CreateEnum
CREATE TYPE "GdTipoRelatorio" AS ENUM ('DIARIO_UNIDADE', 'DIARIO_CONSOLIDADO', 'SEMANAL');

-- CreateEnum
CREATE TYPE "GdStatusRelatorio" AS ENUM ('EM_ANDAMENTO', 'AGUARDANDO_SINCRONIZACAO', 'AGUARDANDO_REVISAO', 'FECHADO', 'REVISADO');

-- CreateEnum
CREATE TYPE "GdStatusSync" AS ENUM ('SUCESSO', 'PARCIAL', 'FALHA');

-- CreateEnum
CREATE TYPE "GdStatusVinculo" AS ENUM ('SUGERIDO', 'CONFIRMADO', 'REJEITADO');

-- CreateEnum
CREATE TYPE "GdStatusAjuste" AS ENUM ('PENDENTE', 'APROVADO', 'REJEITADO');

-- CreateEnum
CREATE TYPE "GdSeveridade" AS ENUM ('INFO', 'ATENCAO', 'CRITICA');

-- CreateTable
CREATE TABLE "gd_colaboradores" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "GdTipoColaborador" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "usuarioId" TEXT,
    "funcionarioId" TEXT,
    "opaAtendenteId" TEXT,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gd_colaboradores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gd_unidades" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "GdTipoUnidade" NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gd_unidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gd_composicoes" (
    "id" TEXT NOT NULL,
    "unidadeId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "inicio" DATE NOT NULL,
    "fim" DATE,
    "papel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gd_composicoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gd_unidade_equipes" (
    "id" TEXT NOT NULL,
    "unidadeId" TEXT NOT NULL,
    "equipeId" TEXT NOT NULL,
    "inicio" DATE NOT NULL,
    "fim" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gd_unidade_equipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gd_ocorrencias" (
    "id" TEXT NOT NULL,
    "tipo" "GdTipoOcorrencia" NOT NULL,
    "unidadeId" TEXT,
    "colaboradorId" TEXT,
    "inicio" DATE NOT NULL,
    "fim" DATE NOT NULL,
    "justificativa" TEXT NOT NULL,
    "diaNaoTrabalhado" BOOLEAN NOT NULL DEFAULT false,
    "criadoPor" TEXT NOT NULL,
    "aprovadoPor" TEXT,
    "aprovadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gd_ocorrencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gd_ajustes_chamado" (
    "id" TEXT NOT NULL,
    "chamadoId" TEXT NOT NULL,
    "ocorrenciaId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "status" "GdStatusAjuste" NOT NULL DEFAULT 'PENDENTE',
    "solicitadoPor" TEXT NOT NULL,
    "decididoPor" TEXT,
    "decididoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gd_ajustes_chamado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gd_metas" (
    "id" TEXT NOT NULL,
    "indicador" TEXT NOT NULL,
    "unidadeId" TEXT,
    "colaboradorId" TEXT,
    "tipoServico" TEXT,
    "periodicidade" "GdPeriodicidade" NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "sentido" "GdSentidoMeta" NOT NULL DEFAULT 'MAIOR_MELHOR',
    "faixaAtencaoPct" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "vigenciaInicio" DATE NOT NULL,
    "vigenciaFim" DATE,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoPor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gd_metas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gd_configuracoes" (
    "chave" TEXT NOT NULL,
    "valor" JSONB NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gd_configuracoes_pkey" PRIMARY KEY ("chave")
);

-- CreateTable
CREATE TABLE "gd_snapshots_dia" (
    "id" TEXT NOT NULL,
    "unidadeId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "dados" JSONB NOT NULL,
    "origem" TEXT NOT NULL,
    "calculadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gd_snapshots_dia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gd_indicadores_manuais" (
    "id" TEXT NOT NULL,
    "unidadeId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "indicador" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "justificativa" TEXT,
    "usuario" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gd_indicadores_manuais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gd_relatorios" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "tipo" "GdTipoRelatorio" NOT NULL,
    "unidadeId" TEXT,
    "periodoInicio" DATE NOT NULL,
    "periodoFim" DATE NOT NULL,
    "revisao" INTEGER NOT NULL DEFAULT 1,
    "status" "GdStatusRelatorio" NOT NULL DEFAULT 'EM_ANDAMENTO',
    "dados" JSONB NOT NULL,
    "observacaoGestor" TEXT,
    "planoAcao" TEXT,
    "ultimaSincronizacao" TIMESTAMP(3),
    "geradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechadoPor" TEXT,
    "fechadoEm" TIMESTAMP(3),
    "revisadoPor" TEXT,
    "revisadoEm" TIMESTAMP(3),

    CONSTRAINT "gd_relatorios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gd_relatorio_eventos" (
    "id" TEXT NOT NULL,
    "relatorioId" TEXT NOT NULL,
    "revisao" INTEGER NOT NULL,
    "acao" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "detalhe" TEXT,
    "em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gd_relatorio_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gd_observacoes" (
    "id" TEXT NOT NULL,
    "unidadeId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "texto" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gd_observacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gd_sync_logs" (
    "id" TEXT NOT NULL,
    "fonte" TEXT NOT NULL,
    "modo" TEXT NOT NULL,
    "periodoDe" DATE,
    "periodoAte" DATE,
    "status" "GdStatusSync" NOT NULL,
    "registros" INTEGER NOT NULL DEFAULT 0,
    "mensagem" TEXT,
    "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fimEm" TIMESTAMP(3),

    CONSTRAINT "gd_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gd_opa_atendimentos" (
    "id" TEXT NOT NULL,
    "opaId" TEXT NOT NULL,
    "atendenteOpaId" TEXT,
    "status" TEXT,
    "criadoEm" TIMESTAMP(3),
    "atualizadoEm" TIMESTAMP(3),
    "payload" JSONB NOT NULL,
    "sincronizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gd_opa_atendimentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gd_vinculos_opa_chamado" (
    "id" TEXT NOT NULL,
    "opaId" TEXT NOT NULL,
    "chamadoId" TEXT NOT NULL,
    "status" "GdStatusVinculo" NOT NULL DEFAULT 'SUGERIDO',
    "metodo" TEXT NOT NULL,
    "confirmadoPor" TEXT,
    "confirmadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gd_vinculos_opa_chamado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gd_notificacoes" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "severidade" "GdSeveridade" NOT NULL DEFAULT 'INFO',
    "unidadeId" TEXT,
    "dados" JSONB,
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "resolvida" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lidaEm" TIMESTAMP(3),

    CONSTRAINT "gd_notificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gd_colaboradores_tipo_ativo_idx" ON "gd_colaboradores"("tipo", "ativo");

-- CreateIndex
CREATE INDEX "gd_colaboradores_opaAtendenteId_idx" ON "gd_colaboradores"("opaAtendenteId");

-- CreateIndex
CREATE INDEX "gd_composicoes_unidadeId_inicio_idx" ON "gd_composicoes"("unidadeId", "inicio");

-- CreateIndex
CREATE INDEX "gd_composicoes_colaboradorId_idx" ON "gd_composicoes"("colaboradorId");

-- CreateIndex
CREATE INDEX "gd_unidade_equipes_unidadeId_inicio_idx" ON "gd_unidade_equipes"("unidadeId", "inicio");

-- CreateIndex
CREATE INDEX "gd_unidade_equipes_equipeId_idx" ON "gd_unidade_equipes"("equipeId");

-- CreateIndex
CREATE INDEX "gd_ocorrencias_unidadeId_inicio_idx" ON "gd_ocorrencias"("unidadeId", "inicio");

-- CreateIndex
CREATE INDEX "gd_ocorrencias_colaboradorId_inicio_idx" ON "gd_ocorrencias"("colaboradorId", "inicio");

-- CreateIndex
CREATE INDEX "gd_ajustes_chamado_chamadoId_idx" ON "gd_ajustes_chamado"("chamadoId");

-- CreateIndex
CREATE UNIQUE INDEX "gd_ajustes_chamado_chamadoId_ocorrenciaId_key" ON "gd_ajustes_chamado"("chamadoId", "ocorrenciaId");

-- CreateIndex
CREATE INDEX "gd_metas_indicador_ativo_idx" ON "gd_metas"("indicador", "ativo");

-- CreateIndex
CREATE INDEX "gd_metas_unidadeId_idx" ON "gd_metas"("unidadeId");

-- CreateIndex
CREATE INDEX "gd_snapshots_dia_data_idx" ON "gd_snapshots_dia"("data");

-- CreateIndex
CREATE UNIQUE INDEX "gd_snapshots_dia_unidadeId_data_key" ON "gd_snapshots_dia"("unidadeId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "gd_indicadores_manuais_unidadeId_data_indicador_key" ON "gd_indicadores_manuais"("unidadeId", "data", "indicador");

-- CreateIndex
CREATE INDEX "gd_relatorios_tipo_periodoInicio_idx" ON "gd_relatorios"("tipo", "periodoInicio");

-- CreateIndex
CREATE UNIQUE INDEX "gd_relatorios_chave_revisao_key" ON "gd_relatorios"("chave", "revisao");

-- CreateIndex
CREATE INDEX "gd_relatorio_eventos_relatorioId_em_idx" ON "gd_relatorio_eventos"("relatorioId", "em");

-- CreateIndex
CREATE INDEX "gd_observacoes_unidadeId_data_idx" ON "gd_observacoes"("unidadeId", "data");

-- CreateIndex
CREATE INDEX "gd_sync_logs_fonte_iniciadoEm_idx" ON "gd_sync_logs"("fonte", "iniciadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "gd_opa_atendimentos_opaId_key" ON "gd_opa_atendimentos"("opaId");

-- CreateIndex
CREATE INDEX "gd_opa_atendimentos_atendenteOpaId_criadoEm_idx" ON "gd_opa_atendimentos"("atendenteOpaId", "criadoEm");

-- CreateIndex
CREATE INDEX "gd_vinculos_opa_chamado_chamadoId_idx" ON "gd_vinculos_opa_chamado"("chamadoId");

-- CreateIndex
CREATE UNIQUE INDEX "gd_vinculos_opa_chamado_opaId_chamadoId_key" ON "gd_vinculos_opa_chamado"("opaId", "chamadoId");

-- CreateIndex
CREATE UNIQUE INDEX "gd_notificacoes_chave_key" ON "gd_notificacoes"("chave");

-- CreateIndex
CREATE INDEX "gd_notificacoes_lida_createdAt_idx" ON "gd_notificacoes"("lida", "createdAt");

-- AddForeignKey
ALTER TABLE "gd_composicoes" ADD CONSTRAINT "gd_composicoes_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "gd_unidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gd_composicoes" ADD CONSTRAINT "gd_composicoes_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "gd_colaboradores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gd_unidade_equipes" ADD CONSTRAINT "gd_unidade_equipes_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "gd_unidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gd_ajustes_chamado" ADD CONSTRAINT "gd_ajustes_chamado_ocorrenciaId_fkey" FOREIGN KEY ("ocorrenciaId") REFERENCES "gd_ocorrencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gd_snapshots_dia" ADD CONSTRAINT "gd_snapshots_dia_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "gd_unidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gd_relatorio_eventos" ADD CONSTRAINT "gd_relatorio_eventos_relatorioId_fkey" FOREIGN KEY ("relatorioId") REFERENCES "gd_relatorios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

