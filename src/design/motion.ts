import type { Variants } from 'framer-motion'

// ─── Spring configs ────────────────────────────────────────────────────────

export const springs = {
  /** Quick hover/press feedback */
  snappy: { type: 'spring', stiffness: 420, damping: 37, mass: 0.8 },
  /** Smooth panel transitions */
  smooth: { type: 'spring', stiffness: 260, damping: 33, mass: 1 },
  /** Window open/expand */
  expand: { type: 'spring', stiffness: 270, damping: 32, mass: 0.9 },
  /** Tahoe Spotlight pill-to-panel morph */
  spotlight: { type: 'spring', stiffness: 320, damping: 34, mass: 0.86 },
  /** Deliberate compact Spotlight focus-in/focus-out resize */
  spotlightFocus: { type: 'spring', stiffness: 180, damping: 26, mass: 0.95 },
  /** Menu / popover */
  menu: { type: 'spring', stiffness: 340, damping: 35, mass: 0.9 }
} as const

// ─── Common animation variants ────────────────────────────────────────────

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.18, ease: [0.25, 0.1, 0.25, 1] } }
}

export const slideUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: springs.smooth }
}

/** Bottom-anchored task sheet; enter and exit use the same physical path. */
export const sheet: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.985, transition: springs.smooth },
  visible: { opacity: 1, y: 0, scale: 1, transition: springs.smooth }
}

export const spotlightContent: Variants = {
  hidden: {
    opacity: 0,
    y: -8,
    scale: 0.985,
    filter: 'blur(4px)',
    transition: springs.spotlight
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: springs.spotlight
  }
}

export const spotlightActions: Variants = {
  hidden: {
    opacity: 0,
    x: -10,
    scale: 0.88,
    filter: 'blur(3px)',
    transition: springs.spotlightFocus
  },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: { ...springs.spotlightFocus, delay: 0.025 }
  }
}

export const slideDown: Variants = {
  hidden: { opacity: 0, y: -6 },
  visible: { opacity: 1, y: 0, transition: springs.menu }
}

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.94 },
  visible: { opacity: 1, scale: 1, transition: springs.snappy }
}

export const resultRow: Variants = {
  hidden: { opacity: 0, x: -4 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { ...springs.smooth, delay: Math.min(i, 5) * 0.018 }
  })
}

// ─── Window size variants ─────────────────────────────────────────────────

export const COMPACT_HEIGHT = 60
export const SEARCH_HEIGHT = 480
export const TODO_HEIGHT = 640
/** AI chat reuses the larger workspace height to avoid new native geometry cases. */
export const AI_HEIGHT = 640

// ─── Hover/press button motion ────────────────────────────────────────────

export const buttonTap = { scale: 0.97 }
export const buttonHover = { scale: 1.02 }
