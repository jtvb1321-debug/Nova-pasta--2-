# Backup do banco de producao ANTES da migracao da Inteligencia Operacional (1.0.40).
# Le a conexao do .env de producao, sem mostrar a senha na tela, e grava o backup em backups-gtscenter.
# Uso (PowerShell):  powershell -ExecutionPolicy Bypass -File C:\Users\GTSNET\Projetos\wt-orbia-ai\deploy\discloud-1.0.40\backup-producao.ps1
$ErrorActionPreference = 'Stop'

$envFile = 'C:\Users\GTSNET\Projetos\Nova-pasta--2-\gts-operations-center\.env'
if (-not (Test-Path $envFile)) { throw "Nao achei $envFile" }

function Ler-Variavel($nome) {
  $linha = Get-Content $envFile | Where-Object { $_ -match "^\s*$nome\s*=" } | Select-Object -First 1
  if (-not $linha) { return $null }
  return ($linha -replace "^\s*$nome\s*=\s*", '').Trim().Trim('"').Trim("'")
}

# Prefere a conexao direta, se existir; senao a DATABASE_URL.
$url = Ler-Variavel 'DIRECT_URL'
if (-not $url) { $url = Ler-Variavel 'DATABASE_URL' }
if (-not $url) { throw 'Nao encontrei DATABASE_URL nem DIRECT_URL no .env' }

# pg_dump nao aceita os parametros do pooler (?pgbouncer=true...) nem o modo transacao (porta 6543).
$url = $url -replace '\?.*$', ''
$url = $url -replace ':6543/', ':5432/'

$pastaBackup = 'C:\Users\GTSNET\Projetos\backups-gtscenter'
$saida = Join-Path $pastaBackup 'backup-pre-ia-20261013.dump'
$pgDump = 'C:\Program Files\PostgreSQL\17\bin\pg_dump.exe'
if (-not (Test-Path $pgDump)) { throw "Nao achei $pgDump" }
if (Test-Path $saida) { throw "Ja existe $saida - apague ou renomeie antes de repetir" }

& $pgDump $url -n public -Fc -f $saida
if ($LASTEXITCODE -ne 0) { throw "pg_dump falhou (codigo $LASTEXITCODE)" }

$arquivo = Get-Item $saida
if ($arquivo.Length -lt 100000) { throw "Backup pequeno demais ($($arquivo.Length) bytes) - nao confie nele" }
"Backup criado: $($arquivo.Name) - $([math]::Round($arquivo.Length / 1MB, 1)) MB"
