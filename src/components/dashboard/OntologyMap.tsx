import { motion } from 'framer-motion'
import { CandlestickChart, DollarSign, Landmark, Newspaper, Percent } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const EASE = [0.16, 1, 0.3, 1] as [number, number, number, number]

interface Node {
  id: string
  icon: LucideIcon
  title: string
  status: string
  tone: 'gold' | 'neutral' | 'red'
}

const NODES: Node[] = [
  { id: 'xauusd', icon: CandlestickChart, title: 'XAUUSD', status: 'Target', tone: 'gold' },
  { id: 'dxy', icon: DollarSign, title: 'DXY', status: '↓ Weak', tone: 'neutral' },
  { id: 'us10y', icon: Percent, title: 'US10Y 3.92%', status: '↓ 6.1 bps', tone: 'neutral' },
  { id: 'fed', icon: Landmark, title: 'FED', status: 'Hawkish Bias', tone: 'red' },
  { id: 'nfp', icon: Newspaper, title: 'NFP', status: 'In 2 days', tone: 'red' },
]

const EDGES = [
  { from: 0, to: 1, label: 'Inverse −0.68', tone: '#2EBD85', flow: true },
  { from: 1, to: 2, label: 'Inverse −0.63', tone: '#2EBD85', flow: true },
  { from: 2, to: 3, label: 'Direct +0.54', tone: '#F2493F', flow: false },
  { from: 3, to: 4, label: 'Direct +0.45', tone: '#F2493F', flow: false },
]

const NODE_W = 140
const NODE_H = 64
const GAP = 26
const X0 = 10
const Y0 = 40

const nodeX = (i: number) => X0 + i * (NODE_W + GAP)

/** E. Ontology Strip — market context map (dashboard.md §E). Context only, not alpha. */
export default function OntologyMap() {
  const svgW = X0 * 2 + NODES.length * NODE_W + (NODES.length - 1) * GAP
  const svgH = 220

  return (
    <section className="panel p-4" aria-label="Ontology map — market context">
      <h2 className="panel-title">Ontology Map — Market Context</h2>
      <div className="mt-3 overflow-x-auto">
        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="min-w-[720px]" role="img" aria-label="Market context node map: XAUUSD, DXY, US10Y, FED, NFP with correlation edges">
          {/* edges */}
          {EDGES.map((e, i) => {
            const x1 = nodeX(e.from) + NODE_W
            const y1 = Y0 + NODE_H / 2
            const x2 = nodeX(e.to)
            const y2 = Y0 + NODE_H / 2
            const midX = (x1 + x2) / 2
            return (
              <g key={`e${i}`}>
                <motion.path
                  d={`M ${x1} ${y1} C ${midX} ${y1 - 14}, ${midX} ${y2 - 14}, ${x2} ${y2}`}
                  fill="none"
                  stroke={e.tone}
                  strokeOpacity={0.7}
                  strokeWidth={1.2}
                  strokeDasharray={e.flow ? '5 4' : undefined}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.5, delay: 0.7 + i * 0.12, ease: EASE }}
                >
                  {e.flow && (
                    <animate attributeName="stroke-dashoffset" from="0" to="-72" dur="8s" repeatCount="indefinite" />
                  )}
                </motion.path>
                <motion.text
                  x={midX}
                  y={y1 - 22}
                  textAnchor="middle"
                  fill={e.tone}
                  fontSize={10}
                  fontFamily='"JetBrains Mono", monospace'
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1 + i * 0.12, duration: 0.3 }}
                >
                  {e.label}
                </motion.text>
              </g>
            )
          })}

          {/* dashed feedback edge NFP → XAUUSD */}
          <motion.path
            d={`M ${nodeX(4) + NODE_W / 2} ${Y0 + NODE_H} C ${nodeX(4) + NODE_W / 2} ${svgH - 10}, ${nodeX(0) + NODE_W / 2} ${svgH - 10}, ${nodeX(0) + NODE_W / 2} ${Y0 + NODE_H + 6}`}
            fill="none"
            stroke="#8A93A3"
            strokeOpacity={0.6}
            strokeWidth={1}
            strokeDasharray="4 4"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.6, delay: 1.3, ease: EASE }}
          />
          <motion.text
            x={(nodeX(0) + nodeX(4) + NODE_W) / 2}
            y={svgH - 16}
            textAnchor="middle"
            fill="#8A93A3"
            fontSize={10}
            fontFamily='"JetBrains Mono", monospace'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.7, duration: 0.3 }}
          >
            NFP → XAUUSD Inverse −0.41
          </motion.text>

          {/* nodes */}
          {NODES.map((n, i) => {
            const Icon = n.icon
            const border = n.tone === 'gold' ? '#E8B23A' : n.tone === 'red' ? 'rgba(242,73,63,0.55)' : '#2A3542'
            const x = nodeX(i)
            return (
              <motion.g
                key={n.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.25 + i * 0.09, ease: EASE }}
                style={{ transformOrigin: `${x + NODE_W / 2}px ${Y0 + NODE_H / 2}px` }}
              >
                <rect x={x} y={Y0} width={NODE_W} height={NODE_H} rx={8} fill="#11161D" stroke={border} strokeWidth={1} />
                <foreignObject x={x} y={Y0} width={NODE_W} height={NODE_H}>
                  <div className="flex h-full flex-col items-center justify-center gap-0.5">
                    <Icon size={16} className={n.tone === 'gold' ? 'text-gold' : n.tone === 'red' ? 'text-down' : 'text-text1'} />
                    <span className="font-display text-[13px] font-semibold text-text0">{n.title}</span>
                    <span className="font-mono text-[10px] text-text2">{n.status}</span>
                  </div>
                </foreignObject>
              </motion.g>
            )
          })}
        </svg>
      </div>
      <p className="micro-mono mt-2">
        Context only — fundamentals added +0.0 accuracy over price-only features (Phase 2). Shown for situational
        awareness, not as alpha.
      </p>
    </section>
  )
}
