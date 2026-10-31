# Somente leitura: fechamentos de bonificacao ja aprovados (periodo, equipe, saldo, quem aprovou). Nao altera nada.
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
select to_char("periodoInicio",'YYYY-MM-DD') as inicio, to_char("periodoFim",'YYYY-MM-DD') as fim, "equipeNome" as equipe,
       "creditosCentavos" as creditos, "debitosCentavos" as debitos, "saldoCentavos" as saldo, to_char("aprovadoEm" at time zone 'America/Sao_Paulo','DD/MM HH24:MI') as aprovado_em
from fechamentos_bonificacao order by "periodoInicio" desc, "equipeNome" limit 40;
select count(*) as total_fechamentos from fechamentos_bonificacao;
'@
$sql | & $psql $url -X -P pager=off -v ON_ERROR_STOP=1 -f -
