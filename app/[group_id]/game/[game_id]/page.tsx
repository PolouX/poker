'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, Chip, Separator, Spinner, Table } from '@heroui/react'
import { supabase } from '@/lib/supabase'

interface GameEvent {
  id: string
  type: string
  player_name: string | null
  eliminated_by_name: string | null
  position: number | null
  created_at: string
}

interface GameResult {
  position: number
  name: string
  total_points: number
  kills_count: number
  rebuys_count: number
  prize_amount: number
  is_guest: boolean
}

interface GameInfo {
  id: string
  name: string
  status: string
}

interface Metrics {
  attendees: number
  guests: number
  absent: number
}

interface Props {
  params: Promise<{ group_id: string; game_id: string }>
}

const EVENT_LABELS: Record<string, string> = {
  elimination: 'Eliminacion',
  rebuy: 'Recompra',
  addon: 'Add-on',
  blind_change: 'Cambio de nivel',
}

const EVENT_COLORS: Record<string, 'danger' | 'success' | 'warning' | 'default'> = {
  elimination: 'danger',
  rebuy: 'warning',
  addon: 'success',
  blind_change: 'default',
}

export default function GameDetailPage({ params }: Props) {
  const { group_id, game_id } = use(params)
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [game, setGame] = useState<GameInfo | null>(null)
  const [results, setResults] = useState<GameResult[]>([])
  const [events, setEvents] = useState<GameEvent[]>([])
  const [metrics, setMetrics] = useState<Metrics>({ attendees: 0, guests: 0, absent: 0 })
  const [killAmount, setKillAmount] = useState(0)

  useEffect(() => {
    async function load() {
      const { data: gameData } = await supabase
        .from('games')
        .select('id, name, status, season_id')
        .eq('id', game_id)
        .single()

      if (!gameData) { setLoading(false); return }
      setGame({ id: gameData.id, name: gameData.name, status: gameData.status })

      const { data: resultsData } = await supabase
        .from('game_results')
        .select('position, total_points, kills_count, rebuys_count, prize_amount, is_guest, guest_name, players(name)')
        .eq('game_id', game_id)
        .order('position', { ascending: true })

      const resultsList: GameResult[] = (resultsData ?? []).map((r) => ({
        position: r.position,
        name: r.is_guest
          ? (r.guest_name ?? 'Invitado')
          : ((r.players as unknown as { name: string } | null)?.name ?? 'Jugador'),
        total_points: Number(r.total_points),
        kills_count: r.kills_count,
        rebuys_count: r.rebuys_count,
        prize_amount: Number(r.prize_amount ?? 0),
        is_guest: r.is_guest,
      }))
      setResults(resultsList)

      const { data: eventsData } = await supabase
        .from('game_events')
        .select(`
          id, type, position, created_at, guest_name, eliminated_by_guest_name,
          players!game_events_player_id_fkey(name),
          eliminated_by:players!game_events_eliminated_by_player_id_fkey(name)
        `)
        .eq('game_id', game_id)
        .order('created_at', { ascending: true })

      const eventsList: GameEvent[] = (eventsData ?? []).map((e) => ({
        id: e.id,
        type: e.type,
        player_name: (e as unknown as { guest_name?: string }).guest_name
          ?? (e.players as unknown as { name: string } | null)?.name
          ?? null,
        eliminated_by_name: (e as unknown as { eliminated_by_guest_name?: string }).eliminated_by_guest_name
          ?? (e.eliminated_by as unknown as { name: string } | null)?.name
          ?? null,
        position: e.position,
        created_at: e.created_at,
      }))
      setEvents(eventsList)

      const { data: attendees } = await supabase
        .from('game_attendees')
        .select('is_guest')
        .eq('game_id', game_id)

      const totalAttendees = (attendees ?? []).filter((a) => !a.is_guest).length
      const totalGuests = (attendees ?? []).filter((a) => a.is_guest).length

      const seasonId = gameData.season_id
      let absent = 0
      if (seasonId) {
        const [{ count }, { data: seasonCfg }] = await Promise.all([
          supabase.from('season_players').select('*', { count: 'exact', head: true }).eq('season_id', seasonId),
          supabase.from('seasons').select('config').eq('id', seasonId).single(),
        ])
        absent = Math.max(0, (count ?? 0) - totalAttendees)
        const cfg = seasonCfg?.config as { kill_amount?: number } | null
        setKillAmount(cfg?.kill_amount ?? 0)
      }

      setMetrics({ attendees: totalAttendees, guests: totalGuests, absent })
      setLoading(false)
    }
    load()
  }, [game_id])

  if (loading) {
    return <div className="flex justify-center mt-16"><Spinner /></div>
  }

  if (!game) {
    return <div className="p-4"><p className="text-muted">Jugada no encontrada.</p></div>
  }

  return (
    <div className="p-4 max-w-md mx-auto">
      <Button
        variant="ghost"
        onPress={() => router.push(`/${group_id}`)}
        className="mt-4 mb-4 -ml-2"
        size="sm"
      >
        ← Volver
      </Button>

      <h1 className="text-2xl font-semibold tracking-tight mb-4 text-center">{game.name}</h1>

      {/* Metricas */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Asistentes', value: metrics.attendees },
          { label: 'Invitados', value: metrics.guests },
          { label: 'Faltantes', value: metrics.absent },
        ].map(({ label, value }) => (
          <Card key={label} variant="secondary">
            <Card.Content className="text-center py-3">
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs text-muted mt-0.5">{label}</p>
            </Card.Content>
          </Card>
        ))}
      </div>

      {/* Tabla de posiciones */}
      {results.length > 0 && (() => {
        const hasKills = killAmount > 0 && results.some((r) => r.kills_count > 0)
        const hasPrizes = results.some((r) => r.prize_amount > 0)
        const hasCobro = hasKills || hasPrizes
        return (
          <>
            <h2 className="text-base font-semibold mb-3">Posiciones</h2>
            <Card className="mb-6 overflow-hidden p-0">
              <Table>
                <Table.ScrollContainer>
                  <Table.Content aria-label="Posiciones de la jugada">
                    <Table.Header>
                      <Table.Column isRowHeader className="w-8">#</Table.Column>
                      <Table.Column>Jugador</Table.Column>
                      <Table.Column className="text-right">Pts</Table.Column>
                      <Table.Column className="text-right">K</Table.Column>
                      <Table.Column className="text-right">R</Table.Column>
                      {hasCobro && <Table.Column className="text-right">Cobro</Table.Column>}
                    </Table.Header>
                    <Table.Body>
                      {results.map((r) => {
                        const killsCobro = r.kills_count * killAmount
                        const totalCobro = killsCobro + r.prize_amount
                        return (
                          <Table.Row key={r.position}>
                            <Table.Cell className="text-muted font-mono text-sm">{r.position}</Table.Cell>
                            <Table.Cell>
                              <span className="font-medium text-sm">{r.name}</span>
                              {r.is_guest && (
                                <Chip size="sm" variant="soft" className="ml-1">inv</Chip>
                              )}
                            </Table.Cell>
                            <Table.Cell className="text-right font-semibold">{r.total_points}</Table.Cell>
                            <Table.Cell className="text-right text-muted">{r.kills_count}</Table.Cell>
                            <Table.Cell className="text-right text-muted">{r.rebuys_count}</Table.Cell>
                            {hasCobro && (
                              <Table.Cell className="text-right">
                                {totalCobro > 0 ? `$${totalCobro}` : '—'}
                              </Table.Cell>
                            )}
                          </Table.Row>
                        )
                      })}
                    </Table.Body>
                  </Table.Content>
                </Table.ScrollContainer>
              </Table>
            </Card>
          </>
        )
      })()}

      {/* Historial de eventos */}
      <h2 className="text-base font-semibold mb-3">Historial</h2>
      {events.length === 0 ? (
        <p className="text-sm text-muted">Sin eventos registrados.</p>
      ) : (
        <div className="flex flex-col">
          {events.map((e, i) => (
            <div key={e.id}>
              <div className="flex items-start justify-between gap-2 py-3">
                <div className="flex items-start gap-2">
                  <Chip
                    size="sm"
                    variant="soft"
                    color={EVENT_COLORS[e.type] ?? 'default'}
                    className="mt-0.5 shrink-0"
                  >
                    {EVENT_LABELS[e.type] ?? e.type}
                  </Chip>
                  <div>
                    {e.player_name && (
                      <p className="text-sm font-medium">{e.player_name}</p>
                    )}
                    {e.type === 'elimination' && e.position && (
                      <p className="text-xs text-muted">Pos. {e.position}</p>
                    )}
                    {e.eliminated_by_name && (
                      <p className="text-xs text-muted">Kill: {e.eliminated_by_name}</p>
                    )}
                  </div>
                </div>
                <span className="text-xs text-muted whitespace-nowrap shrink-0">
                  {new Date(e.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {i < events.length - 1 && <Separator />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
