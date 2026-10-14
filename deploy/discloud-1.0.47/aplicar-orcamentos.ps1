# Aplica prisma\migracoes-sql\20261014_orcamentos.sql no banco de producao (so CRIA 3 tabelas novas, tudo-ou-nada)
# e confere o resultado. Backup antes: C:\Users\GTSNET\Projetos\backups-gtscenter\backup-pre-orcamentos-20261014.dump
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
$sql = 'C:\Users\GTSNET\Projetos\wt-orbia-ai\gts-operations-center\prisma\migracoes-sql\20261014_orcamentos.sql'

'--- antes: as tabelas ainda nao devem existir ---'
"select table_name from information_schema.tables where table_schema='public' and table_name in ('empresas','orcamentos','itens_orcamento') order by 1;" | & $psql $url -X -t -A -v ON_ERROR_STOP=1 -f -
Get-Content -Raw -Encoding UTF8 $sql | & $psql $url -X -1 -v ON_ERROR_STOP=1 -P pager=off -f -
if ($LASTEXITCODE -ne 0) { throw "psql falhou (codigo $LASTEXITCODE) - nada foi gravado" }
'--- conferencia ---'
"select table_name, (select count(*) from information_schema.columns c where c.table_name=t.table_name and c.table_schema='public') as colunas from information_schema.tables t where table_schema='public' and table_name in ('empresas','orcamentos','itens_orcamento') order by 1;" | & $psql $url -X -t -A -v ON_ERROR_STOP=1 -f -
