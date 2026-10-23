# Network Manager — levantamento do IXC e Fase 1 (2026-10-23)

Fase 1 (auditoria) e a parte da Fase 4 que **só depende do IXC**, feitas com a sonda `scripts/ixc-sonda-esquema.mjs`
(somente leitura; imprime só nomes de campos, taxa de preenchimento e códigos curtos) e verificadas contra o IXC real.
O catálogo completo (nomes de campos, sem valores sensíveis) está em `ixc-catalogo.json`.

## O que o IXC desta operação expõe (verificado na API)

| Tabela | Registros | Para que serve aqui |
|---|---|---|
| `radpop_radio_cliente_fibra` (aba Fibra) | ~3.300 | **OLT (`id_transmissor`), slot (`slotno`), porta PON (`ponno`), `ponid` ("0/1/14"), nº da ONU, perfil, VLANs, modelo da ONU, caixa/porta, sinal RX/TX, temperatura, tensão, `data_sinal`** |
| `radpop_radio_cliente_fibra_historico` | ~29,6 milhões | **Histórico das leituras ópticas** (`id_cliente_fibra`, RX, TX, temperatura, tensão, data). Leitura a cada ~3 h; a retenção por ONU é de poucos dias |
| `radpop_radio` | 5 | **As OLTs cadastradas**: descrição, fabricante (`HW` = Huawei, `VSOL`), modelo, firmware, ativa, POP, uptime |
| `radpop` | 8 | POPs (nome) |
| `rad_caixa_ftth` | ~1.600 | Caixas (CTO): descrição, capacidade |
| `radusuarios` | ~6.400 | Login: `id_transmissor` (OLT), `id_caixa_ftth`, `interface_transmissao`, `online` (`S`/`N`/`SS`), concentrador, MTU, contadores |
| `su_oss_chamado` / `su_oss_assunto` | ~78 mil / 112 | Ordens de serviço do login e o nome do assunto |
| `su_ticket`, `su_diagnostico`, `patrimonio` (~110 mil), `cliente_arquivos` | — | Existem; ainda **não usados** (patrimônio por serial pode identificar equipamentos em comodato) |

**Não responde nesta API:** `radacct` (sessões/consumo — por isso o consumo fica "Não disponível pelo IXC"), `radpop_radio_porta*`, `rad_porta_pon`, `ftth_olt`, `olt`, `equipamento`, histórico de conexão, logs de RADIUS.

### Achados que mudam o plano

1. **Há OLTs de dois fabricantes (Huawei e VSOL).** A especificação previa só Huawei: o conector precisa da camada de abstração por fabricante desde a primeira OLT. Modelo visto: Huawei MA5603T (firmware MA5600V800R015C00) na OLT-02.
2. O IXC **já coleta** posição e sinais das ONUs, então **boa parte do pedido (posição, RX/TX atuais, histórico, vizinhos da PON/caixa, OS) é possível agora sem tocar nas OLTs** — implementado, ver abaixo. O que o IXC **não** tem: estado GPON em tempo real, LOS, Dying Gasp, alarmes da PON, eventos da OLT, sessões PPPoE, tráfego, latência/perda.
3. O cadastro `radpop_radio` guarda **login e senha das OLTs** (campos preenchidos). O GTS Center **nunca lê nem usa esses campos** (mapeador com lista fixa de campos; testado). Para a consulta direta, a recomendação é criar uma conta **somente leitura** dedicada, em vez de reaproveitar essas credenciais.
4. Horários do IXC vêm sem fuso; tratamos como relógio de Brasília (confirmar).
5. Ponto de atenção da regra de PON: ONUs "sem leitura" incluem ONUs desligadas e clientes inativos (~38% em PONs reais), então a regra só sinaliza problema na PON quando ≥ 50% das ≥ 5 ONUs estão sem leitura.

## O que foi implementado (branch `feature/rede-ixc`)

- `src/lib/diagnosticoConexao/rede.ts`: leitores do IXC (aba Fibra lida **uma vez**; OLT/POP/caixa/assunto em cache; vizinhos em cache só com **projeção mínima**, sem login/senha/IP/MAC/comandos de outros clientes) e mapeadores puros testados.
- `hipoteses.ts`: motor de regras fixas (cenários A–E da especificação, com dados só do IXC): evidências com horário, confiança (**máxima "média"**), próximo teste; falha de consulta **nunca** vira "offline" (vira "falha de coleta"); bloqueio contratual e OS em aberto entram como explicação.
- `limites.ts`: limites de RX **de referência** (-27 a -8 dBm), marcados como **não confirmados**; ponto de extensão por fabricante/modelo.
- Tela do Diagnóstico de Conexão com abas: Visão geral (como antes) · Hipóteses · ONU e fibra (posição, ópticos atuais, gráfico e tabela do histórico) · Caixa e PON · Ordens de serviço. PDF e resumo do assistente ganharam as mesmas informações (sem PII).
- Testes: `tests/ia/rede.test.ts` (25) com IXC falso ampliado (`scripts/ixc-falso-dados.ts`).

### Testado de verdade × depende de homologação
- **Testado no IXC real (somente leitura):** posição de rede, OLT/POP, histórico, vizinhos da caixa e da PON, OS, hipóteses, em um login online e dois offline.
- **Ainda não existe / depende de equipamento real:** consulta direta às OLTs (SNMP/SSH), estado GPON e alarmes em tempo real, MikroTik, provisionamento/remoção, coleta própria agendada (Fases 2, 3, 5, 6 e 7). Limites de RX por modelo dependem de confirmação.

## Próximos passos sugeridos
1. Confirmar os limites de RX por modelo de ONU/OLT e o fuso dos horários do IXC.
2. Fase 2: escolher onde roda o coletor (rede da GTSNET) e homologar uma OLT Huawei de teste (SNMP v2c/v3, SSH somente leitura); tratar VSOL como segundo conector.
3. Usar `patrimonio` (serial) para confirmar equipamentos em comodato e `su_ticket` no histórico.
