# Aplica a migracao das REVISOES da Frota no banco de producao: faz BACKUP, aplica o SQL (so adiciona colunas/tabelas; tudo ou nada)
# e confere o resultado. Rodar ANTES de publicar o app novo (ele ja le as tabelas frota_revisoes e frota_revisao_anexos).
# Uso (PowerShell):  powershell -ExecutionPolicy Bypass -File C:\Users\GTSNET\Projetos\wt-frota\deploy\consultas\aplicar-frota-revisoes.ps1
# Se algo falhar o SQL nao grava nada (BEGIN/COMMIT). O arquivo SQL e' lido direto pelo psql (-f), que respeita os acentos.
$ErrorActionPreference = 'Stop'

$raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$sqlFile = Join-Path $raiz 'gts-operations-center\prisma\migracoes-sql\20261028_frota_revisoes.sql'
if (-not (Test-Path $sqlFile)) { throw "Nao achei $sqlFile" }

$envFile = 'C:\Users\GTSNET\Projetos\Nova-pasta--2-\gts-operations-center\.env'
if (-not (Test-Path $envFile)) { throw "Nao achei $envFile" }
function Ler-Variavel($nome) {
  $linha = Get-Content $envFile | Where-Object { $_ -match "^\s*$nome\s*=" } | Select-Object -First 1
  if (-not $linha) { return $null }
  return ($linha -replace "^\s*$nome\s*=\s*", '').Trim().Trim('"').Trim("'")
}
$url = Ler-Variavel 'DIRECT_URL'; if (-not $url) { $url = Ler-Variavel 'DATABASE_URL' }
if (-not $url) { throw 'Nao encontrei DATABASE_URL nem DIRECT_URL no .env' }
$url = $url -replace '\?.*$', ''; $url = $url -replace ':6543/', ':5432/'

$psql = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
$pgDump = 'C:\Program Files\PostgreSQL\17\bin\pg_dump.exe'
foreach ($p in @($psql, $pgDump)) { if (-not (Test-Path $p)) { throw "Nao achei $p" } }

# 1) Backup (nome com data/hora; nao sobrescreve)
$pasta = 'C:\Users\GTSNET\Projetos\backups-gtscenter'
New-Item -ItemType Directory -Force $pasta | Out-Null
$backup = Join-Path $pasta ("backup-pre-frota-revisoes-{0}.dump" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
& $pgDump $url -n public -Fc -f $backup
if ($LASTEXITCODE -ne 0) { throw "pg_dump falhou (codigo $LASTEXITCODE) - nada foi alterado" }
$tam = (Get-Item $backup).Length
if ($tam -lt 100000) { throw "Backup pequeno demais ($tam bytes) - nao confie nele; nada foi alterado" }
"Backup criado: $(Split-Path -Leaf $backup) - $([math]::Round($tam / 1MB, 1)) MB"

# 2) Aplica o SQL
$env:PGCLIENTENCODING = 'UTF8'
& $psql $url -X -v ON_ERROR_STOP=1 -P pager=off -f $sqlFile
if ($LASTEXITCODE -ne 0) { throw "psql falhou (codigo $LASTEXITCODE) - nada foi gravado" }

# 3) Conferencia (somente leitura)
'--- conferencia ---'
$conf = @'
SELECT (SELECT count(*) FROM frota_revisoes) AS revisoes,
       (SELECT count(*) FROM frota_revisao_anexos) AS anexos,
       (SELECT count(*) FROM veiculos) AS veiculos_existentes;
'@
$conf | & $psql $url -X -P pager=off -f -
