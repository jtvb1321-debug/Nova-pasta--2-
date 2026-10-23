# PROMPT DE DESENVOLVIMENTO — GTS CENTER NETWORK MANAGER

> Especificação original do usuário (recebida em 2026-10-23), guardada na íntegra para a implementação futura.
> Ponto de partida do código e perguntas em aberto: veja `PONTO-DE-PARTIDA.md`.

## 1. CONTEXTO DO PROJETO

Estou desenvolvendo o GTS Center, uma plataforma interna de gestão de operações e infraestrutura de um provedor de internet chamado GTSNet.
Já existe um sistema em funcionamento, incluindo um módulo chamado Diagnóstico de Conexão, integrado ao IXC Provedor.
Atualmente, o módulo permite:

* Pesquisar assinantes pelo nome e consultar seus contratos.
* Consultar código do cliente, plano, login PPPoE e situação contratual.
* Exibir concentrador, MAC, interface de conexão e informações disponíveis no IXC.
* Consultar histórico de conexão e indicadores relacionados à sessão.
* Exibir campos para potência óptica RX/TX, temperatura e tensão da ONU.
* Apresentar indicadores de download e upload contratados e informações sobre a última sessão.

Entretanto, os indicadores ópticos ainda aparecem como “Sem leitura”, pois precisamos implementar o acesso direto à infraestrutura de gerenciamento da rede.

### Objetivo principal

Transformar o módulo atual em um GTS Center Network Manager, semelhante funcionalmente ao SmartOLT, porém integrado ao GTS Center e sem dependência do SmartOLT.
O sistema deverá utilizar o IXC como referência comercial dos assinantes e acessar diretamente as OLTs Huawei, as ONUs/ONTs e os roteadores MikroTik para obter informações técnicas e executar operações autorizadas.
Não quero criar outro sistema independente. Quero evoluir o módulo existente, preservando tudo o que já funciona.

## 2. PRIMEIRA ETAPA OBRIGATÓRIA: ANALISAR O CÓDIGO EXISTENTE

Antes de alterar qualquer arquivo:

1. Analise a estrutura completa do projeto.
2. Identifique a stack, o framework, o banco de dados e a arquitetura atual.
3. Localize o módulo Diagnóstico de Conexão.
4. Identifique as rotas, páginas, componentes, serviços, APIs e tabelas relacionados.
5. Localize a integração existente com o IXC Provedor.
6. Descubra como os dados de clientes, contratos, logins PPPoE, concentradores, MACs e interfaces são obtidos.
7. Identifique os campos que atualmente apresentam “Sem leitura”.
8. Verifique se já existem serviços de gerenciamento de rede, integração com MikroTik, Huawei, SmartOLT ou ferramentas de monitoramento.
9. Identifique o mecanismo de autenticação, as permissões dos usuários e o sistema de auditoria.
10. Verifique a infraestrutura de execução, a rede de gerência disponível e os recursos de hospedagem.

Produza um diagnóstico técnico inicial, informando:

* O que já existe e pode ser reaproveitado.
* O que está implementado parcialmente.
* O que precisa ser desenvolvido.
* Quais informações ainda dependem de confirmação.
* Quais arquivos deverão ser alterados ou criados.

Não presuma que uma integração existe apenas porque há um campo ou uma tela para ela.
Não substitua componentes funcionais sem necessidade.

## 3. ARQUITETURA DE GERENCIAMENTO

Implemente a solução dentro da arquitetura existente, utilizando serviços separados para cada responsabilidade.

### A. Integração IXC Provedor

O IXC deverá continuar como referência para:

* Clientes e contratos.
* Login PPPoE.
* Plano contratado.
* Identificadores disponíveis do assinante.
* Concentrador e informações de conexão.
* Ordens de serviço, quando a integração atual permitir.

Reaproveite a integração existente.
Não invente endpoints, campos ou métodos de autenticação da API do IXC. Verifique o código atual e a documentação disponível antes de implementar novas chamadas.

### B. Conector Huawei OLT

Desenvolva um serviço independente para comunicação direta com as OLTs Huawei.
O serviço deverá permitir, conforme as interfaces e os recursos disponíveis no modelo e na versão do equipamento:

* Consultar estado da OLT.
* Descobrir chassis, placas, slots e portas PON.
* Listar ONUs/ONTs autorizadas e seus estados.
* Identificar serial, MAC e modelo dos equipamentos.
* Consultar potência óptica RX e TX.
* Consultar temperatura e tensão.
* Consultar distância óptica, quando disponível.
* Identificar alarmes LOS e outros estados de falha.
* Consultar histórico e eventos de desconexão.
* Consultar informações de VLAN e perfil de serviço.
* Provisionar e desprovisionar ONUs/ONTs.
* Alterar parâmetros e perfis quando suportado e autorizado.

Avalie as interfaces compatíveis com o equipamento, incluindo:

* SNMP, preferencialmente SNMPv3 quando suportado.
* SSH/CLI para consultas e operações compatíveis.
* Traps SNMP e syslog para eventos assíncronos.
* Outras interfaces oficiais disponibilizadas pelo modelo.

Não presuma que todos os equipamentos Huawei possuem os mesmos comandos ou capacidades.
Antes de implementar comandos de provisionamento ou remoção, identifique o modelo, a versão de software e os procedimentos oficiais compatíveis.
Crie uma camada de abstração para permitir que diferentes modelos de OLT sejam suportados futuramente.
Se não houver acesso ao equipamento, implemente a estrutura do conector, a configuração necessária e os testes com mocks, deixando explícito o que depende da homologação real.

### C. Conector MikroTik

Crie ou amplie um serviço de gerenciamento dos roteadores MikroTik, considerando a versão do RouterOS instalada.
Utilize REST API via HTTPS ou API-SSL, conforme compatibilidade e configuração do equipamento.
Quando suportado e autorizado, obtenha:

* Modelo e versão do RouterOS.
* Uptime, CPU, memória e temperatura.
* Interfaces e estado operacional.
* Tráfego de entrada e saída.
* Sessões PPPoE ativas.
* Informações DHCP.
* Rotas e gateways.
* Estado das interfaces WAN e LAN.
* Informações necessárias para diagnóstico de conectividade.
* Eventos e dados de saúde do equipamento.

Implemente primeiro operações de leitura.
Não habilite APIs, altere firewall ou exponha portas administrativas automaticamente sem aprovação explícita.
Não utilize credenciais administrativas globais quando for possível usar contas de menor privilégio.

## 4. IDENTIFICAÇÃO E VÍNCULO DO ASSINANTE

Quando o operador pesquisar um cliente no GTS Center, o sistema deverá:

1. Consultar os dados já disponíveis no IXC.
2. Identificar o contrato e o login PPPoE.
3. Identificar o MAC e os demais dados técnicos disponíveis.
4. Localizar a ONU/ONT correspondente por identificadores confiáveis.
5. Identificar a OLT, placa e porta PON.
6. Identificar o roteador ou concentrador responsável pela sessão, quando possível.
7. Reunir as informações na tela de diagnóstico.

Não associe equipamentos apenas pelo nome do cliente ou pelo endereço IP.
Utilize serial, MAC, login, identificadores do IXC e inventário da rede para estabelecer vínculos verificáveis.
Se não houver correspondência confiável, mostre que o equipamento não foi identificado e permita uma associação administrativa auditada.
Não invente vínculos entre clientes, ONUs e OLTs.

## 5. EVOLUÇÃO DA TELA DIAGNÓSTICO DE CONEXÃO

Preserve a estrutura visual e as funcionalidades atuais do módulo.
Amplie a tela com abas ou seções adicionais, evitando excesso de informações em uma única área.

### Seção 1 — Identificação do assinante
Manter os dados atuais: nome do cliente, código no IXC, contrato, plano, login PPPoE, MAC, concentrador, interface de conexão, estado da conexão, última sessão.

### Seção 2 — Informações da ONU/ONT
Exibir: estado operacional, serial, MAC, fabricante e modelo, OLT associada, slot e placa, porta PON, VLAN, perfil de serviço, distância óptica (quando disponível), data e hora da última atualização.

### Seção 3 — Indicadores ópticos
Exibir: potência RX em dBm, potência TX em dBm, temperatura em °C, tensão em V, histórico de leituras, gráfico de tendência, horário da leitura, origem dos dados, limites de referência configuráveis por modelo.

Diferencie claramente: leitura atual; leitura histórica; leitura indisponível; recurso não suportado; falha de comunicação com a OLT.
Não apresente valores simulados como dados reais.

### Seção 4 — Estado GPON e alarmes
Exibir: ONU online ou offline; LOS, quando confirmado; Dying Gasp, quando registrado; reinicializações; desconexões e reconexões; alterações de perfil; alarmes da porta PON; eventos relacionados à OLT.

### Seção 5 — MikroTik e conectividade
Exibir, conforme os recursos disponíveis: roteador associado; estado da sessão PPPoE; estado das interfaces; CPU e memória; tráfego WAN; rotas e gateways relevantes; testes de latência, perda de pacotes e conectividade.

### Seção 6 — Logs e histórico
Criar uma visão cronológica dos eventos com: data e hora do evento; equipamento de origem; tipo de evento; descrição; severidade; origem do registro; resultado do processamento.
Diferencie a hora em que o evento ocorreu da hora em que foi recebido pelo GTS Center.

## 6. MOTOR DE DIAGNÓSTICO AUTOMÁTICO

Desenvolva um serviço que cruze os dados do IXC, da OLT Huawei e do MikroTik para gerar hipóteses técnicas justificadas.
Implemente regras iniciais como:

**Cenário A — Possível falha óptica.** Se a ONU estiver offline e houver LOS confirmado, consultar os alarmes e o histórico da PON. Verificar se outras ONUs da mesma porta também estão afetadas. Se houver múltiplas ONUs afetadas, indicar possível falha coletiva, sem concluir automaticamente que a OLT está defeituosa.

**Cenário B — Sinal óptico degradado.** Se a ONU estiver online, mas a potência RX estiver fora dos limites configurados ou apresentar degradação relevante, exibir alerta e histórico. Não utilize um único limite universal para todos os equipamentos.

**Cenário C — ONU online, PPPoE offline.** Verificar o estado GPON, o login, a sessão e os eventos de autenticação disponíveis. Indicar possíveis causas sem atribuir automaticamente a falha à fibra.

**Cenário D — ONU e PPPoE online, mas cliente relata lentidão.** Consultar tráfego, interfaces, CPU, perda de pacotes e latência. Diferenciar dados de consumo acumulado de medições reais de velocidade.

**Cenário E — Falha de gerenciamento.** Se o GTS Center não conseguir consultar uma OLT, não classificar automaticamente todas as ONUs dessa OLT como offline. Mostrar falha de coleta, última leitura válida e horário da última comunicação.

Cada diagnóstico deverá apresentar: hipótese; evidências utilizadas; horário das evidências; grau de confiança; próximo teste recomendado.

## 7. PROVISIONAMENTO E REMOÇÃO DE ONU/ONT

Implemente essas operações somente depois de homologar as consultas de leitura.

**Provisionamento** — o fluxo deverá: (1) localizar a OLT e a porta PON; (2) validar o serial da ONU; (3) verificar se o equipamento já está cadastrado ou provisionado; (4) validar VLAN, perfil, identificadores e parâmetros necessários; (5) mostrar um resumo da operação; (6) solicitar confirmação explícita; (7) verificar permissões do operador; (8) executar apenas comandos previamente autorizados; (9) consultar novamente a OLT; (10) registrar o resultado e atualizar o inventário.

**Remoção** — o fluxo deverá: (1) confirmar o equipamento e o vínculo com o assinante; (2) exibir o impacto potencial sobre o serviço; (3) solicitar confirmação explícita; (4) validar permissões; (5) executar a operação compatível com o modelo; (6) verificar o resultado; (7) registrar a auditoria.

Nunca permita execução arbitrária de comandos de CLI enviados pelo navegador.
Não implemente remoção ou provisionamento genérico antes de confirmar a sintaxe e o comportamento do modelo de OLT utilizado.

## 8. COLETA AUTOMÁTICA E HISTÓRICO

Crie um serviço de coleta separado do fluxo de navegação do usuário. A coleta deverá: atualizar o estado dos equipamentos; armazenar leituras ópticas; registrar mudanças de estado; receber alarmes quando houver suporte; controlar timeout e concorrência; tratar falhas temporárias sem sobrecarregar os equipamentos; registrar erros e duração das consultas; permitir configuração de frequência e retenção.

Comece com frequências conservadoras e ajustáveis, homologando o impacto em uma OLT de teste antes de ampliar para toda a rede.
Não execute uma consulta pesada para todas as ONUs a cada abertura da página.
A interface deverá indicar claramente quando uma leitura estiver desatualizada.

## 9. BANCO DE DADOS

Analise o banco atual antes de criar novas tabelas. Reaproveite as estruturas existentes sempre que fizer sentido.
Se necessário, implemente entidades para: equipamentos de rede; OLTs; placas e portas PON; ONUs/ONTs; roteadores; interfaces; leituras ópticas; histórico de eventos; vínculos com assinantes; execuções de coleta; operações administrativas; auditoria.

Crie migrations compatíveis com a arquitetura atual. Defina índices, integridade referencial, política de retenção e tratamento de duplicidades.
Não armazene senhas de equipamentos em texto puro.
Não altere ou exclua dados de produção sem uma migration revisada e um plano de reversão.

## 10. SEGURANÇA OBRIGATÓRIA

Implemente: controle de acesso baseado em funções; credenciais armazenadas de forma segura no servidor; segregação entre usuários de leitura e de operação; limitação de acesso à rede de gerência; HTTPS para APIs administrativas; validação de entradas; proteção contra execução de comandos arbitrários; auditoria de operações; mascaramento de informações sensíveis nos logs; rate limiting e timeouts; confirmação de operações críticas; tratamento de erros sem exposição de credenciais.

A interface nunca deve acessar diretamente a OLT ou o roteador.
As operações de gerenciamento devem passar pelo backend e por serviços autorizados.

## 11. ESTRATÉGIA DE IMPLEMENTAÇÃO

* **Fase 1 — Auditoria e planejamento.** Analise o projeto existente, documente a arquitetura e identifique os pontos de integração.
* **Fase 2 — Conector Huawei em leitura.** Homologue uma OLT real e obtenha informações de estado, serial, PON, RX/TX, temperatura e tensão, quando suportadas.
* **Fase 3 — Histórico e alarmes.** Implemente coleta, logs, eventos e histórico óptico.
* **Fase 4 — Integração do diagnóstico.** Associe as informações da OLT ao assinante identificado pelo IXC e atualize a tela existente.
* **Fase 5 — MikroTik e diagnóstico integrado.** Implemente a consulta de sessões, interfaces e conectividade.
* **Fase 6 — Provisionamento controlado.** Somente após validação dos modelos, dos comandos, das permissões e dos testes de segurança.
* **Fase 7 — Homologação e implantação gradual.** Teste com uma OLT e um conjunto limitado de ONUs, registre os resultados e amplie progressivamente.

## 12. REGRAS PARA O DESENVOLVIMENTO

* Não recriar o sistema do zero.
* Não remover funcionalidades atuais.
* Não duplicar a integração com o IXC.
* Não inventar endpoints, comandos ou respostas dos equipamentos.
* Não presumir que o modelo ou a versão da OLT já são conhecidos.
* Não simular leituras reais em produção.
* Criar testes unitários e testes de integração com mocks.
* Documentar os requisitos que dependem de acesso a equipamentos reais.
* Preservar autenticação, autorização e auditoria existentes.
* Evitar mudanças desnecessárias de dependências e tecnologias.
* Trabalhar com alterações pequenas, verificáveis e reversíveis.
* Informar claramente quais recursos foram realmente testados e quais ainda dependem de homologação.
* Não executar operações destrutivas em equipamentos de produção durante os testes.

## 13. PRIMEIRA TAREFA

Comece analisando o repositório completo. Não comece imediatamente a modificar arquivos. Primeiro, entregue:

1. Mapa da arquitetura atual.
2. Localização exata do módulo Diagnóstico de Conexão.
3. Fluxo atual de integração com o IXC.
4. Identificação dos campos que hoje apresentam “Sem leitura”.
5. Recursos de gerenciamento de rede já existentes.
6. Lista dos arquivos que precisam ser alterados ou criados.
7. Dependências externas e informações técnicas ainda necessárias.
8. Plano de implementação da Fase 1 e da Fase 2.

Depois dessa análise, apresente o plano e implemente a primeira etapa de forma incremental, preservando o funcionamento do GTS Center.

**Resultado esperado:** um módulo próprio de gerenciamento de rede no GTS Center, integrado ao IXC e capaz de consultar diretamente as OLTs Huawei, gerenciar ONUs/ONTs e monitorar MikroTik, sem dependência do SmartOLT.
