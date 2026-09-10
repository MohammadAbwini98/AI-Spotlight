import React from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'
import styles from './LiquidGlassSurface.module.css'

type SurfaceProps = HTMLMotionProps<'div'> | HTMLMotionProps<'button'>

interface LiquidGlassSurfaceProps {
  as?: 'div' | 'button'
  variant?: 'default' | 'subtle' | 'strong' | 'sidebar' | 'transparent'
  elevated?: boolean
  className?: string
  children?: React.ReactNode
}

export const LiquidGlassSurface = React.forwardRef<
  HTMLDivElement | HTMLButtonElement,
  LiquidGlassSurfaceProps & SurfaceProps
>(({ as = 'div', variant = 'default', elevated = false, className, children, ...props }, ref) => {
  const classes = [
    styles.surface,
    styles[`variant-${variant}`],
    elevated ? styles.elevated : '',
    className ?? ''
  ]
    .filter(Boolean)
    .join(' ')

  const content = (
    <>
      <span className={styles.inner} aria-hidden="true" />
      {children}
    </>
  )

  if (as === 'button') {
    return (
      <motion.button
        ref={ref as React.ForwardedRef<HTMLButtonElement>}
        className={classes}
        type="button"
        {...(props as HTMLMotionProps<'button'>)}
      >
        {content}
      </motion.button>
    )
  }

  return (
    <motion.div
      ref={ref as React.ForwardedRef<HTMLDivElement>}
      className={classes}
      {...(props as HTMLMotionProps<'div'>)}
    >
      {content}
    </motion.div>
  )
})
LiquidGlassSurface.displayName = 'LiquidGlassSurface'
