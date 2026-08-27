'use client'

import { Input } from '@heroui/react'

interface PinInputProps {
  id?: string
  placeholder?: string
  value: string
  onChange: (value: string) => void
  variant?: 'primary' | 'secondary'
}

export default function PinInput({ id, placeholder = '••••', value, onChange, variant }: PinInputProps) {
  return (
    <Input
      id={id}
      type="password"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      variant={variant}
    />
  )
}
