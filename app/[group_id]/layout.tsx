'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { use, useEffect, useState } from 'react'
import { Button, Separator } from '@heroui/react'
import { CrownDiamond, Star, Shield, ChevronLeft } from '@gravity-ui/icons'
import { getGroups } from '@/app/actions/groups'

interface Props {
  children: React.ReactNode
  params: Promise<{ group_id: string }>
}

type Group = { id: string; name: string; created_at: string }

export default function GroupLayout({ children, params }: Props) {
  const { group_id } = use(params)
  const pathname = usePathname()
  const router = useRouter()
  const [groups, setGroups] = useState<Group[]>([])

  useEffect(() => {
    getGroups().then(setGroups)
    document.documentElement.classList.add('dark')
  }, [])

  const tabs = [
    { label: 'Records', href: `/${group_id}/history`, icon: CrownDiamond },
    { label: 'Temporada', href: `/${group_id}`, icon: Star },
    { label: 'Admin', href: `/${group_id}/admin`, icon: Shield },
  ]

  const currentGroup = groups.find((g) => g.id === group_id)

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 flex items-center gap-3 px-3 py-2 border-b border-border bg-background z-40">
        <Button
          size="sm"
          variant="ghost"
          onPress={() => router.push('/')}
          className="shrink-0 h-8 px-2 text-sm font-medium ![--button-fg:var(--accent)] flex items-center gap-1"
        >
          <ChevronLeft width={14} />
          Ver Grupos
        </Button>
        <div className="flex-1" />
        {currentGroup && (
          <span className="text-sm font-semibold text-foreground truncate max-w-[160px]">
            {currentGroup.name}
          </span>
        )}
      </header>

      <div className="flex-1 overflow-y-auto pb-20 pt-[44px]">
        {children}
      </div>

      <nav className="fixed bottom-0 left-0 right-0 bg-background z-50">
        <Separator />
        <div className="flex max-w-md mx-auto">
          {tabs.map((tab) => {
            const isActive =
              tab.href === `/${group_id}`
                ? pathname === `/${group_id}`
                : pathname.startsWith(tab.href)
            const Icon = tab.icon
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex-1 py-3 flex flex-col items-center gap-1 text-xs font-medium transition-colors ${
                  isActive
                    ? 'text-accent border-t-2 border-accent -mt-px'
                    : 'text-muted'
                }`}
              >
                <Icon className="size-5" />
                {tab.label}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
