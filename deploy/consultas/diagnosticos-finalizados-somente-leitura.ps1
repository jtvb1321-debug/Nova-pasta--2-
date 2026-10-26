# Somente leitura: dos chamados finalizados nos ultimos 5 dias, quais tem Diagnostico Tecnico concluido (ANTES/DEPOIS)
# e quanto texto ele geraria (tamanho em caracteres). So contagens e tamanhos, nunca o conteudo.
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
select to_char(c."dataFim" at time zone 'America/Sao_Paulo','DD/MM HH24:MI') as fim, e.nome as equipe,
       d.fase::text as fase, d.status::text as status_diag, d.classificacao::text as classif,
       length(coalesce(d.recomendacoes::text,'')) as recom_len, length(coalesce(d.resumo::text,'')) as resumo_len,
       (d."problemaEncontrado" is not null) as tem_problema, (d."acaoRealizada" is not null) as tem_acao, (d."resultadoFinal" is not null) as tem_resultado
from chamados c join diagnosticos d on d."chamadoId" = c.id left join equipes e on e.id = c."equipeId"
where c.status = 'FINALIZADO' and c."dataFim" > now() - interval '5 days' and d.fase in ('ANTES','DEPOIS')
order by c."dataFim" desc limit 25;
select count(*) as total_finalizados_5d, count(*) filter (where exists (select 1 from diagnosticos d where d."chamadoId"=c.id and d.status='CONCLUIDO' and d.fase in ('ANTES','DEPOIS'))) as com_diagnostico_concluido
from chamados c where c.status='FINALIZADO' and c."dataFim" > now() - interval '5 days' and c."fechadoAdmin" = false;
'@
$sql | & $psql $url -X -P pager=off -v ON_ERROR_STOP=1 -f -
