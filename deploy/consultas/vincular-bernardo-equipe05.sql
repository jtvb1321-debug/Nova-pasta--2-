-- Vincula o LOGIN do Bernardo (usuario TECNICO sem equipe) ao funcionario "Bernardo" da Equipe 05.
-- O tecnico so enxerga chamados pelo vinculo funcionarios.usuarioId -> equipeId; sem ele a tela dele fica vazia.
-- So faz UPDATE de UMA coluna, e so se: houver exatamente 1 usuario TECNICO "Bernardo" ativo e sem vinculo,
-- e o Bernardo da Equipe 05 ainda estiver sem login. Caso contrario para com erro e nada e' gravado.
-- (ASCII puro: o PowerShell 5.1 estraga acentos e travessao na entrada do psql; o nome do usuario tem espaco sobrando, por isso o btrim.)
BEGIN;

DO $$
DECLARE
  n_usuarios int; n_func int;
BEGIN
  SELECT count(*) INTO n_usuarios FROM usuarios u
   WHERE u.role::text = 'TECNICO' AND u.ativo AND lower(btrim(u.nome)) = 'bernardo'
     AND NOT EXISTS (SELECT 1 FROM funcionarios f WHERE f."usuarioId" = u.id);
  SELECT count(*) INTO n_func FROM funcionarios f JOIN equipes e ON e.id = f."equipeId"
   WHERE e.nome LIKE 'Equipe 05%' AND f.nome = 'Bernardo' AND f."usuarioId" IS NULL AND f.ativo;
  IF n_usuarios <> 1 OR n_func <> 1 THEN
    RAISE EXCEPTION 'Esperava 1 usuario Bernardo sem vinculo (achei %) e 1 funcionario Bernardo livre na Equipe 05 (achei %)', n_usuarios, n_func;
  END IF;
END $$;

UPDATE funcionarios f
   SET "usuarioId" = (SELECT u.id FROM usuarios u WHERE u.role::text = 'TECNICO' AND u.ativo AND lower(btrim(u.nome)) = 'bernardo'
                        AND NOT EXISTS (SELECT 1 FROM funcionarios x WHERE x."usuarioId" = u.id)),
       "updatedAt" = now()
 WHERE f.id = (SELECT f2.id FROM funcionarios f2 JOIN equipes e ON e.id = f2."equipeId"
                WHERE e.nome LIKE 'Equipe 05%' AND f2.nome = 'Bernardo' AND f2."usuarioId" IS NULL AND f2.ativo);

COMMIT;
