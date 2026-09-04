'use client'

import { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { NOC } from './theme'

interface GlassCardProps {
  children: ReactNode
  className?: string
  noPadding?: boolean
  delay?: number
}

export function GlassCard({ children, className = '', noPadding = false, delay = 0 }: GlassCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className={`rounded-xl border backdrop-blur-md shadow-lg ${noPadding ? '' : 'p-4'} ${className}`}
      style={{
        backgroundColor: `${NOC.card}CC`,
        borderColor: 'rgba(255,255,255,0.05)',
      }}
    >
      {children}
    </motion.div>
  )
}

export function CardHeader({ title, icon, right }: { title: string; icon?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold" style={{ color: NOC.texto }}>{title}</h2>
      </div>
      {right}
    </div>
  )
}
