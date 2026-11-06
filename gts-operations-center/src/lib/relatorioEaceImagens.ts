// So no navegador: baixa as fotos de evidencia e reduz (lado maior 900 px, JPEG 0.72) para o PDF nao ficar gigante.
// Foto que nao abre (arquivo ausente no servidor, erro de rede) vira null e o PDF mostra "Foto indisponivel".

const LADO_MAXIMO = 900
const QUALIDADE = 0.72
const SIMULTANEAS = 4

async function reduzir(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { cache: 'force-cache' })
    if (!r.ok) return null
    const blob = await r.blob()
    if (!blob.type.startsWith('image/')) return null
    const bmp = await createImageBitmap(blob)
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bmp.width * escala))
    canvas.height = Math.max(1, Math.round(bmp.height * escala))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    bmp.close?.()
    return canvas.toDataURL('image/jpeg', QUALIDADE)
  } catch {
    return null
  }
}

export async function carregarImagensParaPdf(urls: string[], aoProgredir?: (feitas: number, total: number) => void): Promise<Record<string, string | null>> {
  const unicas = [...new Set(urls)]
  const resultado: Record<string, string | null> = {}
  let proxima = 0, feitas = 0
  async function trabalhador() {
    while (proxima < unicas.length) {
      const url = unicas[proxima++]
      resultado[url] = await reduzir(url)
      aoProgredir?.(++feitas, unicas.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(SIMULTANEAS, unicas.length) }, trabalhador))
  return resultado
}
