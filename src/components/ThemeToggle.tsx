'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return (
      <button
        id="theme-toggle"
        className="w-9 h-9 border border-border rounded-md flex items-center justify-center"
        aria-label="Toggle theme"
      >
        <div className="w-4 h-4" />
      </button>
    )
  }

  return (
    <button
      id="theme-toggle"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="w-9 h-9 border border-border rounded-md flex items-center justify-center
                 hover:bg-surface-hover transition-colors duration-150 cursor-pointer"
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? (
        <Sun className="w-4 h-4 text-foreground" />
      ) : (
        <Moon className="w-4 h-4 text-foreground" />
      )}
    </button>
  )
}
