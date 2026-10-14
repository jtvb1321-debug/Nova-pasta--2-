-- Orcamentos (empresas, orcamentos e itens): tabelas novas.
-- Gerado por: prisma migrate diff (schema anterior -> schema novo). So ADICIONA objetos.
-- Aplicar APENAS depois de backup e com aprovacao. Em teste local use scripts/ia-banco-teste.mjs.

-- CreateTable
CREATE TABLE "empresas" (
    "id" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "cnpj" TEXT,
    "inscricaoEstadual" TEXT,
    "contatoNome" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "cep" TEXT,
    "endereco" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orcamentos" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "empresaId" TEXT NOT NULL,
    "emissao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validadeDias" INTEGER NOT NULL DEFAULT 15,
    "condicoesPagamento" TEXT,
    "prazoEntrega" TEXT,
    "observacoes" TEXT,
    "descontoGeral" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "criadoPorId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orcamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_orcamento" (
    "id" TEXT NOT NULL,
    "orcamentoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "descricao" TEXT NOT NULL,
    "unidade" TEXT NOT NULL DEFAULT 'un',
    "quantidade" DOUBLE PRECISION NOT NULL,
    "valorUnitario" DOUBLE PRECISION NOT NULL,
    "desconto" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "itens_orcamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "empresas_razaoSocial_idx" ON "empresas"("razaoSocial");

-- CreateIndex
CREATE INDEX "empresas_cnpj_idx" ON "empresas"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "orcamentos_numero_key" ON "orcamentos"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "orcamentos_token_key" ON "orcamentos"("token");

-- CreateIndex
CREATE INDEX "orcamentos_empresaId_idx" ON "orcamentos"("empresaId");

-- CreateIndex
CREATE INDEX "orcamentos_criadoPorId_emissao_idx" ON "orcamentos"("criadoPorId", "emissao");

-- CreateIndex
CREATE INDEX "itens_orcamento_orcamentoId_ordem_idx" ON "itens_orcamento"("orcamentoId", "ordem");

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_orcamento" ADD CONSTRAINT "itens_orcamento_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "orcamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

