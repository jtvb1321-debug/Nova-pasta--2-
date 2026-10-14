-- Cria a "Equipe 05 — Bernardo e Pedro" nos mesmos padroes das Equipes 01 a 04:
--   * nome no formato "Equipe NN — Nome e Nome" (travessao como nas outras);
--   * status AGUARDANDO, sem hora de inicio nem localizacao;
--   * dois funcionarios com cargo "Técnico", ativos, sem telefone e SEM login (o login do Bernardo e do Pedro
--     se cria depois na tela Usuarios);
--   * sem veiculo e sem escalas por enquanto.
-- So INSERE (nao altera nem apaga nada). Tudo ou nada: se a equipe ja existir, para com erro e nada e' gravado.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM equipes WHERE nome = 'Equipe 05 — Bernardo e Pedro') THEN
    RAISE EXCEPTION 'A Equipe 05 — Bernardo e Pedro ja existe';
  END IF;
END $$;

WITH nova AS (
  INSERT INTO equipes (id, nome, status, "updatedAt")
  VALUES (gen_random_uuid()::text, 'Equipe 05 — Bernardo e Pedro', 'AGUARDANDO', now())
  RETURNING id
)
INSERT INTO funcionarios (id, nome, cargo, ativo, "equipeId", "updatedAt")
SELECT gen_random_uuid()::text, p.nome, 'Técnico', true, nova.id, now()
FROM nova, (VALUES ('Bernardo'), ('Pedro')) AS p(nome);

COMMIT;
