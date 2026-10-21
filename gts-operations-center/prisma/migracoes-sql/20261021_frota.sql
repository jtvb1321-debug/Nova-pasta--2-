-- Frota (vistoria semanal de viaturas): colunas novas em "veiculos" e tabelas novas (frota_*), mais a carga inicial.
-- Gerado por: prisma migrate diff (schema de producao -> schema novo). So ADICIONA objetos; nada existente e' alterado ou apagado.
-- Tudo ou nada (BEGIN/COMMIT). Aplicar APENAS depois de backup e com aprovacao.
-- Arquivo em UTF-8: aplicar com  psql -f  (nao por pipe do PowerShell 5.1, que estraga os acentos).

BEGIN;

-- CreateEnum
CREATE TYPE "FrotaTipoVistoria" AS ENUM ('SEMANAL', 'CONFERENCIA_INICIAL', 'SAIDA', 'RETORNO', 'AUDITORIA');

-- CreateEnum
CREATE TYPE "FrotaStatusItem" AS ENUM ('OK', 'FALTA', 'AVARIA');

-- CreateEnum
CREATE TYPE "FrotaCombustivel" AS ENUM ('RESERVA', 'UM_QUARTO', 'MEIO', 'TRES_QUARTOS', 'CHEIO');

-- AlterTable
ALTER TABLE "veiculos" ADD COLUMN     "cidadeBase" TEXT,
ADD COLUMN     "excluidoEm" TIMESTAMP(3),
ADD COLUMN     "kmAtual" INTEGER,
ADD COLUMN     "licenciamentoVenceEm" TIMESTAMP(3),
ADD COLUMN     "marca" TEXT,
ADD COLUMN     "patrimonio" TEXT,
ADD COLUMN     "responsavelId" TEXT,
ADD COLUMN     "setor" TEXT,
ADD COLUMN     "uf" TEXT;

-- CreateTable
CREATE TABLE "frota_categorias" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "frota_categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "frota_itens" (
    "id" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "exigido" BOOLEAN NOT NULL DEFAULT false,
    "quantidade" INTEGER,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "frota_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "frota_fotos_obrigatorias" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "frota_fotos_obrigatorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "frota_escopos" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "uf" TEXT,
    "setor" TEXT,

    CONSTRAINT "frota_escopos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "frota_vistorias" (
    "id" TEXT NOT NULL,
    "veiculoId" TEXT NOT NULL,
    "tipo" "FrotaTipoVistoria" NOT NULL DEFAULT 'SEMANAL',
    "vistoriadorId" TEXT NOT NULL,
    "vistoriadorNome" TEXT NOT NULL,
    "placa" TEXT NOT NULL,
    "km" INTEGER NOT NULL,
    "combustivel" "FrotaCombustivel" NOT NULL,
    "observacoes" TEXT,
    "totalOk" INTEGER NOT NULL DEFAULT 0,
    "totalFalta" INTEGER NOT NULL DEFAULT 0,
    "totalAvaria" INTEGER NOT NULL DEFAULT 0,
    "semanaRef" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "frota_vistorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "frota_vistoria_itens" (
    "id" TEXT NOT NULL,
    "vistoriaId" TEXT NOT NULL,
    "itemId" TEXT,
    "categoria" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "quantidade" INTEGER,
    "status" "FrotaStatusItem" NOT NULL,
    "descricao" TEXT,
    "fotoId" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "frota_vistoria_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "frota_fotos" (
    "id" TEXT NOT NULL,
    "vistoriaId" TEXT,
    "veiculoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL,
    "arquivo" TEXT NOT NULL,
    "enviadoPorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "frota_fotos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "frota_categorias_nome_key" ON "frota_categorias"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "frota_itens_categoriaId_nome_key" ON "frota_itens"("categoriaId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "frota_fotos_obrigatorias_nome_key" ON "frota_fotos_obrigatorias"("nome");

-- CreateIndex
CREATE INDEX "frota_escopos_usuarioId_idx" ON "frota_escopos"("usuarioId");

-- CreateIndex
CREATE INDEX "frota_vistorias_veiculoId_criadoEm_idx" ON "frota_vistorias"("veiculoId", "criadoEm");

-- CreateIndex
CREATE INDEX "frota_vistorias_tipo_semanaRef_idx" ON "frota_vistorias"("tipo", "semanaRef");

-- CreateIndex
CREATE INDEX "frota_vistoria_itens_vistoriaId_idx" ON "frota_vistoria_itens"("vistoriaId");

-- CreateIndex
CREATE INDEX "frota_fotos_vistoriaId_idx" ON "frota_fotos"("vistoriaId");

-- CreateIndex
CREATE INDEX "frota_fotos_veiculoId_idx" ON "frota_fotos"("veiculoId");

-- CreateIndex
CREATE UNIQUE INDEX "veiculos_patrimonio_key" ON "veiculos"("patrimonio");

-- CreateIndex
CREATE INDEX "veiculos_uf_idx" ON "veiculos"("uf");

-- CreateIndex
CREATE INDEX "veiculos_responsavelId_idx" ON "veiculos"("responsavelId");

-- AddForeignKey
ALTER TABLE "veiculos" ADD CONSTRAINT "veiculos_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frota_itens" ADD CONSTRAINT "frota_itens_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "frota_categorias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frota_escopos" ADD CONSTRAINT "frota_escopos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frota_vistorias" ADD CONSTRAINT "frota_vistorias_veiculoId_fkey" FOREIGN KEY ("veiculoId") REFERENCES "veiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frota_vistorias" ADD CONSTRAINT "frota_vistorias_vistoriadorId_fkey" FOREIGN KEY ("vistoriadorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frota_vistoria_itens" ADD CONSTRAINT "frota_vistoria_itens_vistoriaId_fkey" FOREIGN KEY ("vistoriaId") REFERENCES "frota_vistorias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frota_fotos" ADD CONSTRAINT "frota_fotos_vistoriaId_fkey" FOREIGN KEY ("vistoriaId") REFERENCES "frota_vistorias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frota_fotos" ADD CONSTRAINT "frota_fotos_veiculoId_fkey" FOREIGN KEY ("veiculoId") REFERENCES "veiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Carga inicial: itens exigidos e fotos obrigatorias (idempotente: so insere o que ainda nao existe).

INSERT INTO "frota_categorias" ("id", "nome", "ordem") VALUES (gen_random_uuid()::text, 'Documentos e controle', 1) ON CONFLICT ("nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'CRLV-e', true, NULL, 1 FROM "frota_categorias" c WHERE c."nome" = 'Documentos e controle' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Cartão de abastecimento', true, NULL, 2 FROM "frota_categorias" c WHERE c."nome" = 'Documentos e controle' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Contato do seguro e assistência 24h', false, NULL, 3 FROM "frota_categorias" c WHERE c."nome" = 'Documentos e controle' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Manual do veículo', false, NULL, 4 FROM "frota_categorias" c WHERE c."nome" = 'Documentos e controle' ON CONFLICT ("categoriaId", "nome") DO NOTHING;

INSERT INTO "frota_categorias" ("id", "nome", "ordem") VALUES (gen_random_uuid()::text, 'Equipamentos obrigatórios', 2) ON CONFLICT ("nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Estepe calibrado e em bom estado', true, NULL, 1 FROM "frota_categorias" c WHERE c."nome" = 'Equipamentos obrigatórios' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Macaco', true, NULL, 2 FROM "frota_categorias" c WHERE c."nome" = 'Equipamentos obrigatórios' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Chave de roda', true, NULL, 3 FROM "frota_categorias" c WHERE c."nome" = 'Equipamentos obrigatórios' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Triângulo de sinalização', true, NULL, 4 FROM "frota_categorias" c WHERE c."nome" = 'Equipamentos obrigatórios' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Cintos de segurança funcionando', true, NULL, 5 FROM "frota_categorias" c WHERE c."nome" = 'Equipamentos obrigatórios' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Extintor de incêndio', false, NULL, 6 FROM "frota_categorias" c WHERE c."nome" = 'Equipamentos obrigatórios' ON CONFLICT ("categoriaId", "nome") DO NOTHING;

INSERT INTO "frota_categorias" ("id", "nome", "ordem") VALUES (gen_random_uuid()::text, 'Condições do veículo', 3) ON CONFLICT ("nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Pneus sem desgaste ou bolhas', true, NULL, 1 FROM "frota_categorias" c WHERE c."nome" = 'Condições do veículo' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Faróis e lanternas', true, NULL, 2 FROM "frota_categorias" c WHERE c."nome" = 'Condições do veículo' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Setas e pisca-alerta', true, NULL, 3 FROM "frota_categorias" c WHERE c."nome" = 'Condições do veículo' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Luz de freio e de ré', true, NULL, 4 FROM "frota_categorias" c WHERE c."nome" = 'Condições do veículo' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Buzina', true, NULL, 5 FROM "frota_categorias" c WHERE c."nome" = 'Condições do veículo' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Limpador e esguicho', true, NULL, 6 FROM "frota_categorias" c WHERE c."nome" = 'Condições do veículo' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Retrovisores', true, NULL, 7 FROM "frota_categorias" c WHERE c."nome" = 'Condições do veículo' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Nível de óleo', true, NULL, 8 FROM "frota_categorias" c WHERE c."nome" = 'Condições do veículo' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Água do radiador', true, NULL, 9 FROM "frota_categorias" c WHERE c."nome" = 'Condições do veículo' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Freio de pé e de mão', true, NULL, 10 FROM "frota_categorias" c WHERE c."nome" = 'Condições do veículo' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Painel sem luzes de alerta', true, NULL, 11 FROM "frota_categorias" c WHERE c."nome" = 'Condições do veículo' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Lataria sem avarias novas', true, NULL, 12 FROM "frota_categorias" c WHERE c."nome" = 'Condições do veículo' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Vidros e para-brisa sem trincas', true, NULL, 13 FROM "frota_categorias" c WHERE c."nome" = 'Condições do veículo' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Limpeza interna', true, NULL, 14 FROM "frota_categorias" c WHERE c."nome" = 'Condições do veículo' ON CONFLICT ("categoriaId", "nome") DO NOTHING;

INSERT INTO "frota_categorias" ("id", "nome", "ordem") VALUES (gen_random_uuid()::text, 'Acessórios da viatura', 4) ON CONFLICT ("nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Adesivação GTSNET', true, NULL, 1 FROM "frota_categorias" c WHERE c."nome" = 'Acessórios da viatura' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Rack ou suporte de escada', true, NULL, 2 FROM "frota_categorias" c WHERE c."nome" = 'Acessórios da viatura' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Caixa de ferramentas com cadeado', true, NULL, 3 FROM "frota_categorias" c WHERE c."nome" = 'Acessórios da viatura' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Kit de primeiros socorros', true, NULL, 4 FROM "frota_categorias" c WHERE c."nome" = 'Acessórios da viatura' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Suporte de celular', false, NULL, 5 FROM "frota_categorias" c WHERE c."nome" = 'Acessórios da viatura' ON CONFLICT ("categoriaId", "nome") DO NOTHING;

INSERT INTO "frota_categorias" ("id", "nome", "ordem") VALUES (gen_random_uuid()::text, 'Ferramentas de fibra óptica', 5) ON CONFLICT ("nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Máquina de fusão', true, NULL, 1 FROM "frota_categorias" c WHERE c."nome" = 'Ferramentas de fibra óptica' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Clivador', true, NULL, 2 FROM "frota_categorias" c WHERE c."nome" = 'Ferramentas de fibra óptica' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Decapador de fibra', true, NULL, 3 FROM "frota_categorias" c WHERE c."nome" = 'Ferramentas de fibra óptica' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Alicate decapador de drop', true, NULL, 4 FROM "frota_categorias" c WHERE c."nome" = 'Ferramentas de fibra óptica' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Caneta óptica (VFL)', true, NULL, 5 FROM "frota_categorias" c WHERE c."nome" = 'Ferramentas de fibra óptica' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Power meter', true, NULL, 6 FROM "frota_categorias" c WHERE c."nome" = 'Ferramentas de fibra óptica' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Álcool isopropílico e lenços', true, NULL, 7 FROM "frota_categorias" c WHERE c."nome" = 'Ferramentas de fibra óptica' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'OTDR', false, NULL, 8 FROM "frota_categorias" c WHERE c."nome" = 'Ferramentas de fibra óptica' ON CONFLICT ("categoriaId", "nome") DO NOTHING;

INSERT INTO "frota_categorias" ("id", "nome", "ordem") VALUES (gen_random_uuid()::text, 'Ferramentas gerais', 6) ON CONFLICT ("nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Alicate universal', true, NULL, 1 FROM "frota_categorias" c WHERE c."nome" = 'Ferramentas gerais' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Alicate de corte', true, NULL, 2 FROM "frota_categorias" c WHERE c."nome" = 'Ferramentas gerais' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Crimpador RJ45', true, NULL, 3 FROM "frota_categorias" c WHERE c."nome" = 'Ferramentas gerais' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Testador de cabo de rede', true, NULL, 4 FROM "frota_categorias" c WHERE c."nome" = 'Ferramentas gerais' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Jogo de chaves fenda/Philips', true, NULL, 5 FROM "frota_categorias" c WHERE c."nome" = 'Ferramentas gerais' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Estilete', true, NULL, 6 FROM "frota_categorias" c WHERE c."nome" = 'Ferramentas gerais' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Trena', true, NULL, 7 FROM "frota_categorias" c WHERE c."nome" = 'Ferramentas gerais' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Parafusadeira com bateria', true, NULL, 8 FROM "frota_categorias" c WHERE c."nome" = 'Ferramentas gerais' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Jogo de brocas', true, NULL, 9 FROM "frota_categorias" c WHERE c."nome" = 'Ferramentas gerais' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Lanterna', true, NULL, 10 FROM "frota_categorias" c WHERE c."nome" = 'Ferramentas gerais' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Escada extensível', true, NULL, 11 FROM "frota_categorias" c WHERE c."nome" = 'Ferramentas gerais' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Multímetro', false, NULL, 12 FROM "frota_categorias" c WHERE c."nome" = 'Ferramentas gerais' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Notebook ou tablet de campo', false, NULL, 13 FROM "frota_categorias" c WHERE c."nome" = 'Ferramentas gerais' ON CONFLICT ("categoriaId", "nome") DO NOTHING;

INSERT INTO "frota_categorias" ("id", "nome", "ordem") VALUES (gen_random_uuid()::text, 'EPIs e sinalização', 7) ON CONFLICT ("nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Capacete com jugular', true, NULL, 1 FROM "frota_categorias" c WHERE c."nome" = 'EPIs e sinalização' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Cinto paraquedista com talabarte', true, NULL, 2 FROM "frota_categorias" c WHERE c."nome" = 'EPIs e sinalização' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Luvas', true, NULL, 3 FROM "frota_categorias" c WHERE c."nome" = 'EPIs e sinalização' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Óculos de proteção', true, NULL, 4 FROM "frota_categorias" c WHERE c."nome" = 'EPIs e sinalização' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Colete refletivo', true, NULL, 5 FROM "frota_categorias" c WHERE c."nome" = 'EPIs e sinalização' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Cones', true, 2, 6 FROM "frota_categorias" c WHERE c."nome" = 'EPIs e sinalização' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Fita zebrada', true, NULL, 7 FROM "frota_categorias" c WHERE c."nome" = 'EPIs e sinalização' ON CONFLICT ("categoriaId", "nome") DO NOTHING;
INSERT INTO "frota_itens" ("id", "categoriaId", "nome", "exigido", "quantidade", "ordem") SELECT gen_random_uuid()::text, c."id", 'Detector de tensão', false, NULL, 8 FROM "frota_categorias" c WHERE c."nome" = 'EPIs e sinalização' ON CONFLICT ("categoriaId", "nome") DO NOTHING;

INSERT INTO "frota_fotos_obrigatorias" ("id", "nome", "ordem") VALUES (gen_random_uuid()::text, 'Frente', 1) ON CONFLICT ("nome") DO NOTHING;
INSERT INTO "frota_fotos_obrigatorias" ("id", "nome", "ordem") VALUES (gen_random_uuid()::text, 'Traseira', 2) ON CONFLICT ("nome") DO NOTHING;
INSERT INTO "frota_fotos_obrigatorias" ("id", "nome", "ordem") VALUES (gen_random_uuid()::text, 'Lateral esquerda', 3) ON CONFLICT ("nome") DO NOTHING;
INSERT INTO "frota_fotos_obrigatorias" ("id", "nome", "ordem") VALUES (gen_random_uuid()::text, 'Lateral direita', 4) ON CONFLICT ("nome") DO NOTHING;
INSERT INTO "frota_fotos_obrigatorias" ("id", "nome", "ordem") VALUES (gen_random_uuid()::text, 'Painel ligado com km e combustível', 5) ON CONFLICT ("nome") DO NOTHING;
INSERT INTO "frota_fotos_obrigatorias" ("id", "nome", "ordem") VALUES (gen_random_uuid()::text, 'Estepe', 6) ON CONFLICT ("nome") DO NOTHING;
INSERT INTO "frota_fotos_obrigatorias" ("id", "nome", "ordem") VALUES (gen_random_uuid()::text, 'Ferramentas e EPIs no compartimento', 7) ON CONFLICT ("nome") DO NOTHING;

COMMIT;
