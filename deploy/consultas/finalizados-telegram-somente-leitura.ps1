# Somente leitura: ultimos chamados finalizados, por equipe, com SINAIS (nunca o texto) que podem quebrar a mensagem do Telegram:
# caracteres < > & no relato/cliente/materiais (o Telegram usa HTML) e tamanho do texto.
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
select to_char(c."dataFim" at time zone 'America/Sao_Paulo','DD/MM HH24:MI') as fim,
       coalesce(e.nome,'(sem equipe)') as equipe,
       c.status::text as status, c."fechadoAdmin" as admin,
       length(coalesce(c.relato,'')) as relato_len,
       (coalesce(c.relato,'') ~ '[<>&]') as relato_html,
       (c.cliente ~ '[<>&]') as cliente_html,
       coalesce(json_array_length(nullif(c.fotos,'')::json),0) as fotos
from chamados c left join equipes e on e.id = c."equipeId"
where c.status = 'FINALIZADO' and c."dataFim" > now() - interval '5 days'
order by c."dataFim" desc limit 40;
'@
$sql | & $psql $url -X -P pager=off -v ON_ERROR_STOP=1 -f -
