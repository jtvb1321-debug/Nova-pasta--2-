-- Frota: Revisoes (manutencoes por viatura, com nota fiscal anexada): duas tabelas novas (frota_revisoes e frota_revisao_anexos).
-- Gerado por: prisma migrate diff (schema de producao -> schema novo). So ADICIONA tabelas; nada existente e' alterado ou apagado.
-- Tudo ou nada (BEGIN/COMMIT). Aplicar APENAS depois de backup e com aprovacao.
-- Arquivo em UTF-8: aplicar com  psql -f  (nao por pipe do PowerShell 5.1).

BEGIN;

-- CreateTable
CREATE TABLE "frota_revisoes" (
    "id" TEXT NOT NULL,
    "veiculoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT,
    "data" TIMESTAMP(3) NOT NULL,
    "km" INTEGER,
    "valorCentavos" INTEGER,
    "fornecedor" TEXT,
    "notaNumero" TEXT,
    "proximaEm" TIMESTAMP(3),
    "proximaEmKm" INTEGER,
    "observacoes" TEXT,
    "registradoPorId" TEXT NOT NULL,
    "registradoPorNome" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "excluidoEm" TIMESTAMP(3),

    CONSTRAINT "frota_revisoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "frota_revisao_anexos" (
    "id" TEXT NOT NULL,
    "revisaoId" TEXT NOT NULL,
    "arquivo" TEXT NOT NULL,
    "nomeOriginal" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "enviadoPorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "frota_revisao_anexos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "frota_revisoes_veiculoId_data_idx" ON "frota_revisoes"("veiculoId", "data");

-- CreateIndex
CREATE INDEX "frota_revisoes_tipo_idx" ON "frota_revisoes"("tipo");

-- CreateIndex
CREATE INDEX "frota_revisao_anexos_revisaoId_idx" ON "frota_revisao_anexos"("revisaoId");

-- AddForeignKey
ALTER TABLE "frota_revisoes" ADD CONSTRAINT "frota_revisoes_veiculoId_fkey" FOREIGN KEY ("veiculoId") REFERENCES "veiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frota_revisoes" ADD CONSTRAINT "frota_revisoes_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frota_revisao_anexos" ADD CONSTRAINT "frota_revisao_anexos_revisaoId_fkey" FOREIGN KEY ("revisaoId") REFERENCES "frota_revisoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;


COMMIT;
