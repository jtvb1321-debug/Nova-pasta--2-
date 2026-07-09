// src/components/dashboard/MaterialChart.tsx
'use client'

import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { BarChart3 } from 'lucide-react'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const MOCK_DATA = {
  labels: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
  datasets: [
    {
      label: 'GTSNet',
      data: [12, 19, 8, 15, 22, 6, 4],
      backgroundColor: 'rgba(37, 99, 235, 0.8)',
      borderRadius: 6,
    },
    {
      label: 'EACE',
      data: [8, 12, 15, 10, 18, 3, 2],
      backgroundColor: 'rgba(16, 185, 129, 0.8)',
      borderRadius: 6,
    },
    {
      label: 'Ferramentas',
      data: [3, 5, 4, 7, 5, 1, 0],
      backgroundColor: 'rgba(245, 158, 11, 0.8)',
      borderRadius: 6,
    },
  ],
}

const OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: { color: '#9CA3AF', font: { size: 11 } },
    },
    tooltip: {
      backgroundColor: '#111827',
      borderColor: 'rgba(255,255,255,0.1)',
      borderWidth: 1,
      titleColor: '#fff',
      bodyColor: '#9CA3AF',
    },
  },
  scales: {
    x: {
      ticks: { color: '#6B7280' },
      grid: { color: 'rgba(255,255,255,0.03)' },
    },
    y: {
      ticks: { color: '#6B7280' },
      grid: { color: 'rgba(255,255,255,0.05)' },
    },
  },
}

export function MaterialChart() {
  return (
    <div className="gts-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-gts-blue" />
          <h2 className="text-sm font-semibold text-white">Consumo de Materiais</h2>
        </div>
        <select className="gts-input py-1 text-xs w-auto">
          <option>Esta semana</option>
          <option>Este mês</option>
          <option>Últimos 3 meses</option>
        </select>
      </div>
      <div className="h-48">
        <Bar data={MOCK_DATA} options={OPTIONS} />
      </div>
    </div>
  )
}
