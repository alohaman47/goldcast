import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

const TOC_ITEMS = [
  { id: 'data', label: 'Data & provenance' },
  { id: 'features', label: 'Features' },
  { id: 'model', label: 'The model' },
  { id: 'walkforward', label: 'Walk-forward' },
  { id: 'cones', label: 'Cones & ghost candles' },
  { id: 'dictionary', label: 'Data dictionary' },
]

/**
 * Sticky in-page TOC (methodology.md, layout): right rail 200px at ≥1280px,
 * gold 2px left bar on the active section, updated via scroll-spy.
 */
export default function Toc() {
  const [active, setActive] = useState<string>('data')

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id)
        }
      },
      { rootMargin: '-25% 0px -65% 0px' },
    )
    for (const item of TOC_ITEMS) {
      const el = document.getElementById(item.id)
      if (el) obs.observe(el)
    }
    return () => obs.disconnect()
  }, [])

  return (
    <motion.nav
      aria-label="Methodology sections"
      className="sticky top-24 hidden w-[200px] shrink-0 xl:block"
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.05 } } }}
    >
      <span className="label-caps mb-3 block">On this page</span>
      <ul className="flex flex-col">
        {TOC_ITEMS.map((item) => (
          <motion.li key={item.id} variants={{ hidden: { opacity: 0, x: 8 }, show: { opacity: 1, x: 0 } }}>
            <a
              href={`#${item.id}`}
              className={cn(
                'block border-l-2 py-1.5 pl-3 text-[13px] transition-colors duration-150',
                active === item.id
                  ? 'border-gold font-semibold text-gold'
                  : 'border-line text-text2 hover:border-linestrong hover:text-text1',
              )}
            >
              {item.label}
            </a>
          </motion.li>
        ))}
      </ul>
    </motion.nav>
  )
}
