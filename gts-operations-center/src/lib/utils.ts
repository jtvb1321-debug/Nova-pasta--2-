// src/lib/utils.ts
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

/**
 * Combina classes CSS com suporte a Tailwind
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Converte data do formato RastroSystem "dd/MM/yyyy HH:mm:ss" para Date
 */
function parseDataRastro(date: Date | string): Date {
  if (date instanceof Date) return date

  if (typeof date === 'string' && date.includes('/')) {
    const [datePart, timePart] = date.split(' ')
    const [day, month, year] = datePart.split('/')
    return new Date(`${year}-${month}-${day}T${timePart || '00:00:00'}`)
  }

  const parsed = new Date(date)
  return isNaN(parsed.getTime()) ? new Date() : parsed
}

/**
 * Formata data para exibição
 */
export function formatDate(date: Date | string, pattern = 'dd/MM/yyyy') {
  try {
    return format(parseDataRastro(date), pattern, { locale: ptBR })
  } catch {
    return '—'
  }
}

/**
 * Formata data e hora
 */
export function formatDateTime(date: Date | string) {
  try {
    return format(parseDataRastro(date), 'dd/MM/yyyy HH:mm', { locale: ptBR })
  } catch {
    return '—'
  }
}

/**
 * Tempo relativo (ex: "há 5 minutos")
 */
export function timeAgo(date: Date | string) {
  try {
    return formatDistanceToNow(parseDataRastro(date), { addSuffix: true, locale: ptBR })
  } catch {
    return '—'
  }
}

/**
 * Formata valor monetário em BRL
 */
export function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

/**
 * Formata número com separador de milhar
 */
export function formatNumber(value: number, decimals = 0) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

/**
 * Formata velocidade em km/h
 */
export function formatSpeed(kmh: number) {
  return `${Math.round(kmh)} km/h`
}

/**
 * Retorna cor baseada em velocidade
 */
export function getSpeedColor(kmh: number, limite = 80) {
  if (kmh > limite) return '#EF4444'
  if (kmh > limite * 0.8) return '#F59E0B'
  return '#10B981'
}

/**
 * Calcula diferença de tempo em formato legível
 */
export function getDuration(start: Date | string, end?: Date | string) {
  try {
    const inicio = parseDataRastro(start)
    const fim = end ? parseDataRastro(end) : new Date()
    const diff = fim.getTime() - inicio.getTime()
    const horas = Math.floor(diff / 3600000)
    const minutos = Math.floor((diff % 3600000) / 60000)
    if (horas > 0) return `${horas}h ${minutos}min`
    return `${minutos}min`
  } catch {
    return '—'
  }
}

/**
 * Trunca texto longo
 */
export function truncate(text: string, maxLength = 50) {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

/**
 * Iniciais do nome
 */
export function getInitials(name: string) {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2)
}

/**
 * Verifica se quantidade está abaixo do mínimo
 */
export function isEstoqueBaixo(atual: number, minimo: number) {
  return atual <= minimo
}

/**
 * Formata coordenadas geográficas
 */
export function formatCoords(lat: number, lng: number) {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
}

/**
 * Slugify string
 */
export function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

/**
 * Gera cor consistente baseada em string
 */
export function stringToColor(str: string) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const h = hash % 360
  return `hsl(${h}, 65%, 50%)`
}