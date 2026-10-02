// IP real do cliente, considerando o proxy do Discloud - reaproveitado por
// rate limit (auth.ts) e auditoria (auditLog.ts) para nao duplicar a mesma
// extracao em cada lugar.
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()

  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp.trim()

  return 'unknown'
}
