-- Bonificacao: conferencia da devolucao do equipamento na retirada (Aprovar / Reprovar): 4 colunas NOVAS e opcionais em "chamados".
-- So ADICIONA colunas (nulas); nenhum dado existente e' alterado ou apagado.
-- Tudo ou nada (BEGIN/COMMIT). Aplicar APENAS depois de backup e com aprovacao, ANTES de subir o app.
-- Arquivo em UTF-8: aplicar com  psql -f  (nao por pipe do PowerShell 5.1).

BEGIN;

ALTER TABLE "chamados" ADD COLUMN IF NOT EXISTS "devolucaoStatus" TEXT;
ALTER TABLE "chamados" ADD COLUMN IF NOT EXISTS "devolucaoMotivo" TEXT;
ALTER TABLE "chamados" ADD COLUMN IF NOT EXISTS "devolucaoPor" TEXT;
ALTER TABLE "chamados" ADD COLUMN IF NOT EXISTS "devolucaoEm" TIMESTAMP(3);

COMMIT;
