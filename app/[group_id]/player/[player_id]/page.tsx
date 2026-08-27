'use client'

import { use } from 'react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

interface Props {
  params: Promise<{ group_id: string; player_id: string }>
}

export default function PlayerProfilePage({ params }: Props) {
  const { group_id } = use(params)
  const router = useRouter()

  useEffect(() => {
    router.replace(`/${group_id}`)
  }, [group_id, router])

  return null
}
