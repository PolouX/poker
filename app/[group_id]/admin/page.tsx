'use client'

import { useState, use } from 'react'
import { InputOTP, REGEXP_ONLY_DIGITS, Spinner } from '@heroui/react'
import { verifyPin } from '@/app/actions/groups'
import AdminPanel from './components/AdminPanel'

interface Props {
  params: Promise<{ group_id: string }>
}

export default function AdminPage({ params }: Props) {
  const { group_id } = use(params)
  const [pin, setPin] = useState('')
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  async function handleComplete(value: string) {
    setChecking(true)
    setError('')
    const ok = await verifyPin(group_id, value)
    if (ok) {
      setVerified(true)
    } else {
      setError('PIN incorrecto.')
      setPin('')
    }
    setChecking(false)
  }

  if (verified) {
    return <AdminPanel groupId={group_id} />
  }

  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] p-6 max-w-md mx-auto -mt-16">
      <h1 className="text-2xl font-semibold tracking-tight mb-8">Administrador</h1>

      {checking ? (
        <Spinner />
      ) : (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-muted mb-1">Ingresa el PIN para acceder</p>
          <InputOTP
            maxLength={4}
            pattern={REGEXP_ONLY_DIGITS}
            value={pin}
            onChange={(val) => {
              setPin(val)
              setError('')
            }}
            onComplete={handleComplete}
            isInvalid={!!error}
            autoFocus
          >
            <InputOTP.Group>
              <InputOTP.Slot index={0} />
              <InputOTP.Slot index={1} />
              <InputOTP.Slot index={2} />
              <InputOTP.Slot index={3} />
            </InputOTP.Group>
          </InputOTP>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      )}
    </div>
  )
}
