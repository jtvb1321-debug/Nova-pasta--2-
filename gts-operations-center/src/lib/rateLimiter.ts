// Limitador de tentativas em memoria - sem Redis/dependencia nova de
// proposito: o plano do Discloud ja esta com a RAM quase no limite, entao
// isso precisa ser leve. So serve para um unico processo (nao distribuido),
// o que e suficiente aqui (a app roda numa instancia so).
interface Registro {
  tentativas: number
  resetEm: number
}

const JANELA_MS = 15 * 60 * 1000
const LIMITE_TENTATIVAS = 5

const registros = new Map<string, Registro>()

// Limpeza periodica para o Map nao crescer indefinidamente com chaves
// expiradas (ips/emails que nunca mais tentam de novo).
setInterval(() => {
  const agora = Date.now()
  for (const [chave, registro] of registros) {
    if (registro.resetEm <= agora) registros.delete(chave)
  }
}, JANELA_MS).unref()

export function excedeuLimite(chave: string): boolean {
  const registro = registros.get(chave)
  if (!registro) return false
  if (registro.resetEm <= Date.now()) {
    registros.delete(chave)
    return false
  }
  return registro.tentativas >= LIMITE_TENTATIVAS
}

export function registrarFalha(chave: string): void {
  const agora = Date.now()
  const registro = registros.get(chave)
  if (!registro || registro.resetEm <= agora) {
    registros.set(chave, { tentativas: 1, resetEm: agora + JANELA_MS })
    return
  }
  registro.tentativas += 1
}

export function limparTentativas(chave: string): void {
  registros.delete(chave)
}
