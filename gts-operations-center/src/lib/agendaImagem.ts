import puppeteer from 'puppeteer'
import { TIPO_CHAMADO_LABELS } from '@/types'

interface ChamadoAgenda {
  cliente: string
  tipo: string
  equipe?: string | null
  horaAgendada?: string | null
}

const TIPO_COR_HEX: Record<string, string> = {
  INSTALACAO: '#60a5fa',
  MANUTENCAO: '#facc15',
  RETIRADA: '#f87171',
  SUPORTE: '#c084fc',
  ROMPIMENTO_MASSIVO: '#ef4444',
}

const LARGURA_IMAGEM = 640

function tipoLabel(tipo: string) {
  return (TIPO_CHAMADO_LABELS as Record<string, string>)[tipo] || tipo
}

function corDoTipo(tipo: string) {
  return TIPO_COR_HEX[tipo] || '#9ca3af'
}

function escapeHtml(texto: string) {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function ordenarPorHora(a: ChamadoAgenda, b: ChamadoAgenda) {
  return (a.horaAgendada || '99:99').localeCompare(b.horaAgendada || '99:99')
}

// Layout vertical (equipe -> lista de chamados empilhados por horario) - uma
// grade horizontal larga fica ilegivel quando o Telegram encolhe a foto pra
// caber na tela do celular, entao a imagem e estreita e alta de proposito.
function montarHtml(chamados: ChamadoAgenda[], dataLabel: string): string {
  const porEquipe = new Map<string, ChamadoAgenda[]>()
  for (const c of chamados) {
    const equipe = c.equipe || 'Sem equipe'
    if (!porEquipe.has(equipe)) porEquipe.set(equipe, [])
    porEquipe.get(equipe)!.push(c)
  }

  const secoesEquipe = Array.from(porEquipe.entries()).map(([equipe, itens]) => {
    const linhas = itens.sort(ordenarPorHora).map(item => `
      <div class="linha">
        <div class="horario">${escapeHtml(item.horaAgendada || '-')}</div>
        <div class="barra" style="background:${corDoTipo(item.tipo)}"></div>
        <div class="info">
          <div class="cliente">${escapeHtml(item.cliente)}</div>
          <div class="tipo" style="color:${corDoTipo(item.tipo)}">${escapeHtml(tipoLabel(item.tipo))}</div>
        </div>
      </div>
    `).join('')

    return `
      <div class="equipe">
        <div class="equipe-nome">${escapeHtml(equipe)}</div>
        <div class="lista">${linhas}</div>
      </div>
    `
  }).join('')

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; }
          body { background: #0B1120; }
          .container { width: ${LARGURA_IMAGEM}px; }
          .header { background: #111827; border-radius: 12px 12px 0 0; padding: 18px 20px; border-bottom: 3px solid #f97316; }
          .header h1 { color: #ffffff; font-size: 20px; font-weight: 800; }
          .header p { color: #f97316; font-size: 13px; margin-top: 4px; font-weight: 600; }
          .corpo { background: #111827; border-radius: 0 0 12px 12px; padding: 4px 0 12px; }
          .equipe { padding: 14px 20px 4px; }
          .equipe-nome { font-size: 13px; color: #fb923c; font-weight: 700; margin-bottom: 8px; }
          .lista { display: flex; flex-direction: column; gap: 8px; }
          .linha { display: flex; align-items: stretch; gap: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; overflow: hidden; padding: 10px 12px; }
          .horario { font-size: 13px; color: #d1d5db; font-family: monospace; font-weight: 700; width: 42px; flex-shrink: 0; display: flex; align-items: center; }
          .barra { width: 3px; flex-shrink: 0; border-radius: 2px; }
          .info { min-width: 0; flex: 1; }
          .cliente { font-size: 14px; color: #ffffff; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .tipo { font-size: 11px; font-weight: 600; margin-top: 2px; }
        </style>
      </head>
      <body>
        <div class="container" id="capture">
          <div class="header">
            <h1>AGENDA DE AMANHÃ</h1>
            <p>${escapeHtml(dataLabel)}</p>
          </div>
          <div class="corpo">
            ${secoesEquipe}
          </div>
        </div>
      </body>
    </html>
  `
}

export async function gerarImagemAgenda(chamados: ChamadoAgenda[], dataLabel: string): Promise<Buffer> {
  const html = montarHtml(chamados, dataLabel)

  const executablePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  const browser = await puppeteer.launch({ headless: true, executablePath, args: ['--no-sandbox'] })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: LARGURA_IMAGEM + 40, height: 800 })
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const elemento = await page.$('#capture')
    const screenshot = await (elemento
      ? elemento.screenshot({ type: 'png' })
      : page.screenshot({ type: 'png', fullPage: true }))
    return Buffer.from(screenshot)
  } finally {
    await browser.close()
  }
}
