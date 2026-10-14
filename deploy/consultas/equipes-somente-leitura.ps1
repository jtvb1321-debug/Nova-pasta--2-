# Consulta SOMENTE LEITURA: lista as equipes, os funcionarios, se tem login, o veiculo e o numero de escalas.
# Serve para criar a equipe nova "nos mesmos padroes". Nao altera nada (transacao somente leitura).
# Nao mostra senha, telefone nem e-mail.
# Uso (PowerShell):  powershell -ExecutionPolicy Bypass -File C:\Users\GTSNET\Projetos\wt-orbia-ai\deploy\consultas\equipes-somente-leitura.ps1
$ErrorActionPreference = 'Stop'

$envFile = 'C:\Users\GTSNET\Projetos\Nova-pasta--2-\gts-operations-center\.env'
if (-not (Test-Path $envFile)) { throw "Nao achei $envFile" }

function Ler-Variavel($nome) {
  $linha = Get-Content $envFile | Where-Object { $_ -match "^\s*$nome\s*=" } | Select-Object -First 1
  if (-not $linha) { return $null }
  return ($linha -replace "^\s*$nome\s*=\s*", '').Trim().Trim('"').Trim("'")
}

$url = Ler-Variavel 'DIRECT_URL'
if (-not $url) { $url = Ler-Variavel 'DATABASE_URL' }
if (-not $url) { throw 'Nao encontrei DATABASE_URL nem DIRECT_URL no .env' }
$url = $url -replace '\?.*$', ''
$url = $url -replace ':6543/', ':5432/'

$psql = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
if (-not (Test-Path $psql)) { throw "Nao achei $psql" }

$sql = @'
SET default_transaction_read_only = on;
SELECT e.nome AS equipe,
       e.status::text AS status,
       f.nome AS funcionario,
       f.cargo,
       f.ativo,
       CASE WHEN f."usuarioId" IS NULL THEN 'sem login' ELSE u.role::text END AS login,
       v.placa,
       (SELECT count(*) FROM escalas_trabalho s WHERE s."equipeId" = e.id) AS escalas
FROM equipes e
LEFT JOIN funcionarios f ON f."equipeId" = e.id
LEFT JOIN usuarios u ON u.id = f."usuarioId"
LEFT JOIN veiculos v ON v."equipeId" = e.id
ORDER BY e.nome, f.nome;
'@

# O SQL entra pela entrada padrao: o PowerShell 5.1 perde as aspas duplas quando o SQL vai em -c.
$sql | & $psql $url -X -P pager=off -f -
if ($LASTEXITCODE -ne 0) { throw "psql falhou (codigo $LASTEXITCODE)" }
