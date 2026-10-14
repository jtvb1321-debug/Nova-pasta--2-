# Consulta SOMENTE LEITURA: por que o vinculo do Bernardo nao encontrou o usuario/funcionario (tamanho do nome, vinculo, equipe).
$ErrorActionPreference = 'Stop'
$envFile = 'C:\Users\GTSNET\Projetos\Nova-pasta--2-\gts-operations-center\.env'
function Ler-Variavel($nome) {
  $linha = Get-Content $envFile | Where-Object { $_ -match "^\s*$nome\s*=" } | Select-Object -First 1
  if (-not $linha) { return $null }
  return ($linha -replace "^\s*$nome\s*=\s*", '').Trim().Trim('"').Trim("'")
}
$url = Ler-Variavel 'DIRECT_URL'; if (-not $url) { $url = Ler-Variavel 'DATABASE_URL' }
$url = $url -replace '\?.*$', ''; $url = $url -replace ':6543/', ':5432/'
$psql = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
$sql = @'
SET default_transaction_read_only = on;
SELECT u.id, length(u.nome) AS tam_nome, u.ativo, u.role::text AS papel, (SELECT count(*) FROM funcionarios f WHERE f."usuarioId" = u.id) AS vinculos
FROM usuarios u WHERE u.nome ILIKE '%bernardo%';
SELECT f.id, f.nome, length(f.nome) AS tam_nome, f.ativo, f."usuarioId" IS NOT NULL AS tem_login, length(e.nome) AS tam_equipe
FROM funcionarios f JOIN equipes e ON e.id = f."equipeId" WHERE e.nome LIKE 'Equipe 05%';
'@
$sql | & $psql $url -X -P pager=off -f -
