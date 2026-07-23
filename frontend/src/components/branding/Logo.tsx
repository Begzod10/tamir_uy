import type React from 'react'

export type LogoVariant = 'horizontal' | 'vertical' | 'icon'
export type LogoTheme = 'light' | 'dark'

interface LogoProps {
  variant?: LogoVariant
  theme?: LogoTheme
  width?: number | string
  height?: number | string
  alt?: string
  className?: string
}

export function Logo({
  variant = 'horizontal',
  theme = 'light',
  width,
  height,
  alt = 'UyVision',
  className = '',
}: LogoProps): React.ReactNode {
  const getSrc = (): string => {
    const isDark = theme === 'dark'
    switch (variant) {
      case 'horizontal':
        return isDark ? '/logo-dark.svg' : '/logo.svg'
      case 'vertical':
        return isDark ? '/logo-vertical-dark.svg' : '/logo-vertical.svg'
      case 'icon':
        return isDark ? '/icon-dark.svg' : '/icon.svg'
      default:
        return '/logo.svg'
    }
  }

  const getDefaultDimensions = (): { w: string; h: string } => {
    switch (variant) {
      case 'horizontal':
        return { w: '240px', h: '80px' }
      case 'vertical':
        return { w: '80px', h: '120px' }
      case 'icon':
        return { w: '64px', h: '64px' }
      default:
        return { w: '240px', h: '80px' }
    }
  }

  const dims = getDefaultDimensions()
  const w = width || dims.w
  const h = height || dims.h

  return (
    <img
      src={getSrc()}
      alt={alt}
      style={{ width: w, height: h }}
      className={className}
    />
  )
}

export default Logo
