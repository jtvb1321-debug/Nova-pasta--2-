-- Adiciona o tipo de atividade COBRANCA ao enum TipoChamado.
-- So acrescenta um valor ao enum: nao altera nem apaga nenhum dado. Pode rodar mais de uma vez (IF NOT EXISTS).
-- Rodar FORA de transacao e ANTES de publicar a versao do app que usa o tipo.
ALTER TYPE "TipoChamado" ADD VALUE IF NOT EXISTS 'COBRANCA';
