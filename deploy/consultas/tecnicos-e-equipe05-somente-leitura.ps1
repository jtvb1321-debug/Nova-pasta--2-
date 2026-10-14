# Consulta SOMENTE LEITURA: usuarios TECNICO (nome, ativo, equipe vinculada) e chamados da Equipe 05.
# Nao mostra senha, e-mail nem telefone.
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
SELECT u.nome AS usuario, u.role::text AS papel, u.ativo, COALESCE(e.nome, 'SEM EQUIPE VINCULADA') AS equipe
FROM usuarios u LEFT JOIN funcionarios f ON f."usuarioId" = u.id LEFT JOIN equipes e ON e.id = f."equipeId"
WHERE u.role::text = 'TECNICO' ORDER BY e.nome NULLS FIRST, u.nome;
SELECT c.status::text, c.tipo::text, count(*) AS total, max(c."createdAt") AS ultimo
FROM chamados c JOIN equipes e ON e.id = c."equipeId" WHERE e.nome LIKE 'Equipe 05%' GROUP BY 1, 2 ORDER BY 1, 2;
'@
$sql | & $psql $url -X -P pager=off -f -
