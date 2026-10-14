# Aplica vincular-bernardo-equipe05.sql no banco de producao (UPDATE de uma coluna, tudo-ou-nada) e confere o resultado.
# O backup antes da alteracao ja foi feito: C:\Users\GTSNET\Projetos\backups-gtscenter\backup-pre-vinculo-bernardo-20261014.dump
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
Get-Content -Raw -Encoding UTF8 (Join-Path $PSScriptRoot 'vincular-bernardo-equipe05.sql') | & $psql $url -X -v ON_ERROR_STOP=1 -P pager=off -f -
if ($LASTEXITCODE -ne 0) { throw "psql falhou (codigo $LASTEXITCODE) - nada foi gravado" }
'--- conferencia ---'
& (Join-Path $PSScriptRoot 'tecnicos-e-equipe05-somente-leitura.ps1')
