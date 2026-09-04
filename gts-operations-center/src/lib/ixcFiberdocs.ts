const IXC_BASE = 'https://ixc.gtsnet.com.br'
const TIMEOUT_MS = 20000

// O IXC (ou algo na frente dele) rejeita chamadas sem esses cabecalhos de
// navegador de verdade - sem eles, o login falha mesmo com usuario/senha certos.
const HEADERS_NAVEGADOR: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'Origin': IXC_BASE,
  'Referer': `${IXC_BASE}/app/login`,
  'X-Requested-With': 'XMLHttpRequest',
}

interface SessaoFiberdocs {
  cookie: string
  userId: string
  expiraEm: number
}

let sessaoCache: SessaoFiberdocs | null = null
let loginEmAndamento: Promise<SessaoFiberdocs> | null = null

let projetosCache: { dados: { id: string; nome: string }[]; expiraEm: number } | null = null
let projetosEmAndamento: Promise<{ id: string; nome: string }[]> | null = null

async function fetchComTimeout(url: string, opcoes: RequestInit = {}): Promise<Response> {
  const controle = new AbortController()
  const timeoutId = setTimeout(() => controle.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...opcoes, signal: controle.signal })
  } finally {
    clearTimeout(timeoutId)
  }
}

function extrairCookies(res: Response, acumulado: Record<string, string>) {
  const setCookies = (res.headers as any).getSetCookie?.() as string[] | undefined
  for (const sc of setCookies || []) {
    const par = sc.split(';')[0]
    const idx = par.indexOf('=')
    if (idx > 0) acumulado[par.slice(0, idx).trim()] = par.slice(idx + 1).trim()
  }
}

function serializarCookies(mapa: Record<string, string>) {
  return Object.entries(mapa).map(([k, v]) => `${k}=${v}`).join('; ')
}

async function autenticar(): Promise<SessaoFiberdocs> {
  const usuario = process.env.IXC_FIBERDOCS_USER
  const senha = process.env.IXC_FIBERDOCS_PASS
  if (!usuario || !senha) {
    throw new Error('IXC_FIBERDOCS_USER ou IXC_FIBERDOCS_PASS nao configurados no .env')
  }

  const cookies: Record<string, string> = {}

  const resInicial = await fetchComTimeout(`${IXC_BASE}/app/login`, {
    headers: HEADERS_NAVEGADOR,
  })
  extrairCookies(resInicial, cookies)

  const formEmail = new FormData()
  formEmail.append('email', usuario)
  const resEmail = await fetchComTimeout(`${IXC_BASE}/api-module/auth/login`, {
    method: 'POST',
    headers: { ...HEADERS_NAVEGADOR, Cookie: serializarCookies(cookies) },
    body: formEmail,
  })
  extrairCookies(resEmail, cookies)
  const textoEmail = await resEmail.text()
  const dadosEmail = (() => { try { return JSON.parse(textoEmail) } catch { return null } })()
  if (dadosEmail?.status !== '1') {
    console.error('[FiberDocs] Resposta inesperada na etapa de e-mail:', textoEmail.slice(0, 300))
    throw new Error('Falha na etapa de e-mail do login no IXC/FiberDocs')
  }

  let dadosSenha: any = null
  const MAX_TENTATIVAS_SENHA = 3
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_SENHA; tentativa++) {
    const formSenha = new FormData()
    formSenha.append('password', senha)
    const resSenha = await fetchComTimeout(`${IXC_BASE}/api-module/auth/login`, {
      method: 'POST',
      headers: { ...HEADERS_NAVEGADOR, Cookie: serializarCookies(cookies) },
      body: formSenha,
    })
    extrairCookies(resSenha, cookies)
    const textoSenha = await resSenha.text()
    dadosSenha = (() => { try { return JSON.parse(textoSenha) } catch { return null } })()

    if (dadosSenha?.status === '1') break

    const msg = dadosSenha?.messages?.[0]?.body || ''
    // O IXC so permite uma sessao ativa por usuario. A propria mensagem de erro
    // instrui a "tentar novamente" - reenviar assume a sessao anterior.
    const sessaoConflitante = /sess[aã]o ativa/i.test(msg)
    if (!sessaoConflitante || tentativa === MAX_TENTATIVAS_SENHA) {
      console.error('[FiberDocs] Resposta inesperada na etapa de senha:', textoSenha.slice(0, 300))
      break
    }
    await new Promise(r => setTimeout(r, 1500))
  }

  if (dadosSenha?.status !== '1') {
    const msg = dadosSenha?.messages?.[0]?.body || 'verifique usuario/senha no .env'
    throw new Error(`Falha na etapa de senha do login no IXC/FiberDocs (${msg})`)
  }

  const cookieHeader = serializarCookies(cookies)

  const resPrefs = await fetchComTimeout(`${IXC_BASE}/api-module/fiberdocs/config/get-preferences-config`, {
    headers: { ...HEADERS_NAVEGADOR, Cookie: cookieHeader },
  })
  const dadosPrefs = await resPrefs.json().catch(() => null)
  const userId = dadosPrefs?.data?.user_id
  if (!userId) {
    throw new Error('Login no FiberDocs ok, mas nao foi possivel obter o user_id')
  }

  // TTL longo de proposito: o IXC permite apenas uma sessao ativa por usuario,
  // entao relogar com frequencia demais pode brigar com o login pessoal de quem
  // usa esse mesmo usuario no navegador. Prefira um usuario dedicado no .env.
  return { cookie: cookieHeader, userId: String(userId), expiraEm: Date.now() + 4 * 60 * 60 * 1000 }
}

// Garante que, mesmo com varias chamadas simultaneas sem sessao em cache,
// so acontece UM login por vez (o IXC so aceita uma sessao ativa por usuario).
async function obterSessao(forcar = false): Promise<SessaoFiberdocs> {
  if (!forcar && sessaoCache && sessaoCache.expiraEm > Date.now()) return sessaoCache

  if (!loginEmAndamento) {
    loginEmAndamento = autenticar()
      .then(sessao => { sessaoCache = sessao; return sessao })
      .finally(() => { loginEmAndamento = null })
  }

  return loginEmAndamento
}

interface OpcoesChamada {
  method?: string
  body?: any
  urlencoded?: boolean
}

async function chamarFiberdocsComSessao(caminho: string, sessao: SessaoFiberdocs, opcoes: OpcoesChamada) {
  const headers: Record<string, string> = { ...HEADERS_NAVEGADOR, Cookie: sessao.cookie, Referer: `${IXC_BASE}/app/fiberdocs` }
  let body: any
  if (opcoes.body !== undefined) {
    if (opcoes.urlencoded) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded'
      body = opcoes.body
    } else {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(opcoes.body)
    }
  }

  const res = await fetchComTimeout(`${IXC_BASE}/api-module/fiberdocs/${caminho}`, {
    method: opcoes.method || 'POST',
    headers,
    body,
  })
  if (!res.ok) throw new Error(`Erro HTTP ${res.status} em fiberdocs/${caminho}`)
  return res.json().catch(() => null)
}

async function chamarFiberdocs(caminho: string, opcoes: OpcoesChamada = {}): Promise<any> {
  // Evita relogar a toda falha: o IXC permite so uma sessao ativa por usuario,
  // entao relogar sem necessidade pode brigar com quem usa esse login no navegador.
  // 1a tentativa: sessao em cache (ou login se nao houver nenhuma ainda).
  // 2a tentativa: mesma sessao de novo (cobre falha transitoria de rede).
  // 3a tentativa: forca um novo login, so se as duas anteriores falharem.
  let sessao = await obterSessao()

  for (let tentativa = 0; tentativa < 3; tentativa++) {
    if (tentativa === 2) sessao = await obterSessao(true)
    const json = await chamarFiberdocsComSessao(caminho, sessao, opcoes)
    if (json?.status === 'success') return json
    if (tentativa === 2) {
      throw new Error(`Resposta invalida de fiberdocs/${caminho}: ${JSON.stringify(json)?.slice(0, 200)}`)
    }
  }

  throw new Error(`Falha ao chamar fiberdocs/${caminho}`)
}

const FILTROS_CABOS_PADRAO = {
  show_cables_direction: 'S',
  show_cables_from_other_projects: 'N',
  cable_status: 'all',
  cable_pattern: 'all',
  cable_manufacturer: [],
  cable_models: [],
  cable_power_loss: [],
  cable_loose_tube_number: [],
  cable_fibers_by_loose_tube: [],
  cable_type: [],
}

const FILTROS_CAIXAS_PADRAO = {
  show_box_description: 'N',
  show_ftth_boxes_from_other_projects: 'N',
  ftth_boxes_map_type: 'default',
  ftth_box_status: 'all',
  available_ports: 'all',
  ftth_box_type: 'all',
  ftth_box_capacity: 'all',
  ftth_box_transmitter: [],
  ftth_box_fiber_interface: [],
  ftth_box_technology: [],
  ftth_box_style: [],
}

// Lista de projetos muda raramente - cache de alguns minutos evita repetir
// essa chamada extra a cada busca de cabos/caixas.
async function buscarProjetosCacheado(): Promise<{ id: string; nome: string }[]> {
  if (projetosCache && projetosCache.expiraEm > Date.now()) return projetosCache.dados

  if (!projetosEmAndamento) {
    projetosEmAndamento = (async () => {
      const sessao = await obterSessao()
      const json = await chamarFiberdocs('df-projeto/get-all', {
        urlencoded: true,
        body: `userId=${sessao.userId}`,
      })
      const lista = (json.data || []).map((p: any) => ({ id: String(p.id), nome: p.text }))
      projetosCache = { dados: lista, expiraEm: Date.now() + 10 * 60 * 1000 }
      return lista
    })().finally(() => { projetosEmAndamento = null })
  }

  return projetosEmAndamento
}

export async function buscarProjetosFiberdocs(): Promise<{ id: string; nome: string }[]> {
  return buscarProjetosCacheado()
}

export async function buscarCabosFiberdocs(): Promise<any[]> {
  const projetos = await buscarProjetosCacheado()
  const projectIds = projetos.map(p => p.id)
  const json = await chamarFiberdocs('cable/get-cables', {
    body: {
      viewType: 'filters',
      projectIds,
      viewConnectedElementsOtherProjects: 'not',
      independentElements: [],
      filters: FILTROS_CABOS_PADRAO,
    },
  })
  return Array.isArray(json.data) ? json.data : Object.values(json.data || {})
}

export async function buscarEmendasFiberdocs(): Promise<any[]> {
  const projetos = await buscarProjetosCacheado()
  const projectIds = projetos.map(p => p.id)
  const json = await chamarFiberdocs('splice-box/get-splice-boxes', {
    body: {
      viewType: 'filters',
      projectIds,
      viewConnectedElementsOtherProjects: 'not',
      independentElements: [],
      filters: {},
    },
  })
  return Array.isArray(json.data) ? json.data : Object.values(json.data || {})
}

export async function buscarCaixasFiberdocs(): Promise<any[]> {
  const projetos = await buscarProjetosCacheado()
  const projectIds = projetos.map(p => p.id)
  const json = await chamarFiberdocs('rad-caixa-ftth/get-boxes', {
    body: {
      viewType: 'filters',
      projectIds,
      viewConnectedElementsOtherProjects: 'not',
      independentElements: [],
      filters: FILTROS_CAIXAS_PADRAO,
    },
  })
  return Array.isArray(json.data) ? json.data : Object.values(json.data || {})
}
