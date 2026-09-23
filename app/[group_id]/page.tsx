'use client'

import { useEffect, useState, use } from 'react'
import { Card, Chip, Drawer, Modal, Separator, Spinner, Table } from '@heroui/react'
import { SealCheck, Skull, ShieldKeyhole, Flame, Medal } from '@gravity-ui/icons'
import { supabase } from '@/lib/supabase'
import { effectiveDiscard } from '@/lib/scoring'

interface Player {
  id: string
  name: string
  total_points: number
  handicap: number
  games_attended: number
}

interface Game {
  id: string
  name: string
  winner_name: string | null
}

interface Season {
  id: string
  name: string
  config: { worst_results_to_discard?: number } | null
}

interface GameDetailResult {
  position: number
  name: string
  total_points: number
  kills_count: number
  rebuys_count: number
  prize_amount: number
  is_guest: boolean
}

interface GameElimination {
  id: string
  player_name: string
  eliminated_by_name: string | null
}

interface GameMetrics {
  attendees: number
  guests: number
  absent: number
}

// ── Drawer de detalle de jugada ───────────────────────────────────────────────
function GameDetailDrawer({
  gameId,
  gameName,
  isOpen,
  onClose,
}: {
  gameId: string | null
  gameName: string
  isOpen: boolean
  onClose: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<GameDetailResult[]>([])
  const [eliminations, setEliminations] = useState<GameElimination[]>([])
  const [metrics, setMetrics] = useState<GameMetrics>({ attendees: 0, guests: 0, absent: 0 })
  const [killAmount, setKillAmount] = useState(0)

  useEffect(() => {
    if (!gameId || !isOpen) return
    setLoading(true)
    setResults([])
    setEliminations([])
    setMetrics({ attendees: 0, guests: 0, absent: 0 })

    async function load() {
      const [{ data: resultsData }, { data: eventsData }, { data: attendeesData }, { data: gameData }] = await Promise.all([
        supabase
          .from('game_results')
          .select('position, total_points, kills_count, rebuys_count, prize_amount, is_guest, guest_name, players(name)')
          .eq('game_id', gameId!)
          .order('position', { ascending: true }),
        supabase
          .from('game_events')
          .select('id, type, guest_name, eliminated_by_guest_name, players!game_events_player_id_fkey(name), eliminated_by:players!game_events_eliminated_by_player_id_fkey(name)')
          .eq('game_id', gameId!)
          .eq('type', 'elimination')
          .order('created_at', { ascending: true }),
        supabase
          .from('game_attendees')
          .select('is_guest')
          .eq('game_id', gameId!),
        supabase
          .from('games')
          .select('season_id')
          .eq('id', gameId!)
          .single(),
      ])

      setResults(
        (resultsData ?? []).map((r) => ({
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
      )

      setEliminations(
        (eventsData ?? []).map((e) => ({
          id: e.id,
          player_name:
            (e as unknown as { guest_name?: string }).guest_name ??
            (e.players as unknown as { name: string } | null)?.name ??
            '—',
          eliminated_by_name:
            (e as unknown as { eliminated_by_guest_name?: string }).eliminated_by_guest_name ??
            (e.eliminated_by as unknown as { name: string } | null)?.name ??
            null,
        }))
      )

      const totalAttendees = (attendeesData ?? []).filter((a) => !a.is_guest).length
      const totalGuests = (attendeesData ?? []).filter((a) => a.is_guest).length
      let absent = 0
      if (gameData?.season_id) {
        const [{ count }, { data: seasonCfg }] = await Promise.all([
          supabase.from('season_players').select('*', { count: 'exact', head: true }).eq('season_id', gameData.season_id),
          supabase.from('seasons').select('config').eq('id', gameData.season_id).single(),
        ])
        absent = Math.max(0, (count ?? 0) - totalAttendees)
        const cfg = seasonCfg?.config as { kill_amount?: number } | null
        setKillAmount(cfg?.kill_amount ?? 0)
      }
      setMetrics({ attendees: totalAttendees, guests: totalGuests, absent })
      setLoading(false)
    }
    load()
  }, [gameId, isOpen])

  const hasKills = killAmount > 0 && results.some((r) => r.kills_count > 0)
  const hasPrizes = results.some((r) => r.prize_amount > 0)
  const hasCobro = hasKills || hasPrizes

  return (
    <Drawer.Backdrop isOpen={isOpen} onOpenChange={(open) => { if (!open) onClose() }} variant="blur">
      <Drawer.Content placement="bottom">
        <Drawer.Dialog className="max-h-[85vh]">
          <Drawer.Handle />
          <Drawer.CloseTrigger />
          <Drawer.Header className="pt-3">
            <Drawer.Heading className="text-center w-full">{gameName}</Drawer.Heading>
          </Drawer.Header>
          <Drawer.Body className="overflow-y-auto pb-8">
            {loading ? (
              <div className="flex justify-center py-16"><Spinner /></div>
            ) : (
              <>
                {/* Métricas */}
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
                {results.length === 0 ? (
                  <p className="text-sm text-muted text-center py-8">Sin resultados registrados.</p>
                ) : (
                  <Card className="overflow-hidden p-0 mb-6">
                    <Table>
                      <Table.ScrollContainer>
                        <Table.Content aria-label="Resultados de la jugada">
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
                )}

                {/* Salidas */}
                {eliminations.length > 0 && (
                  <>
                    <p className="text-sm font-semibold text-muted uppercase tracking-wider mb-3 text-center">Salidas</p>
                    <Card className="overflow-hidden p-0">
                      <Table>
                        <Table.ScrollContainer>
                          <Table.Content aria-label="Salidas de la jugada">
                            <Table.Header>
                              <Table.Column isRowHeader>Sale</Table.Column>
                              <Table.Column className="text-right">Por</Table.Column>
                            </Table.Header>
                            <Table.Body>
                              {eliminations.map((e) => (
                                <Table.Row key={e.id}>
                                  <Table.Cell><span className="font-medium text-sm">{e.player_name}</span></Table.Cell>
                                  <Table.Cell className="text-right">
                                    <span className="text-sm text-muted">{e.eliminated_by_name ?? '—'}</span>
                                  </Table.Cell>
                                </Table.Row>
                              ))}
                            </Table.Body>
                          </Table.Content>
                        </Table.ScrollContainer>
                      </Table>
                    </Card>
                  </>
                )}
              </>
            )}
          </Drawer.Body>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  )
}

interface Props {
  params: Promise<{ group_id: string }>
}

// ── tipos para el perfil del jugador ──────────────────────────────────────────
interface PlayerStats {
  name: string
  total_points: number
  points_position: number
  points_kills: number
  handicap: number
  attendance_pct: number
  games_attended: number
  total_games: number
  hijo: string | null
  papa: string | null
  rebuys_total: number
  avg_position: number
  titulos: string[]
}

// ID del jugador Dilan — se usa para inyectar mock data
const DILAN_PLAYER_ID = '66138a2d-373a-4d2e-9a18-c6f291a44f1a'

const DILAN_MOCK: PlayerStats = {
  name: 'DIlan',
  total_points: 142,
  points_position: 98,
  points_kills: 44,
  handicap: 17.8,
  attendance_pct: 85,
  games_attended: 11,
  total_games: 13,
  hijo: 'Carlos',
  papa: 'Fer',
  rebuys_total: 5,
  avg_position: 2.3,
  titulos: ['El asesino', 'El comebacks'],
}

function calcTitulo(
  stats: { attendance_pct: number; points_kills: number; points_position: number; rebuys_total: number; avg_position: number },
  allStats: Array<{ points_kills: number; points_position: number; rebuys_total: number; avg_position: number; attendance_pct: number }>
): string[] {
  const titulos: string[] = []

  const sorted_att = [...allStats].sort((a, b) => b.attendance_pct - a.attendance_pct)
  const att_threshold = sorted_att[Math.floor(sorted_att.length * 0.25)]?.attendance_pct ?? 0
  if (stats.attendance_pct >= att_threshold) titulos.push('El que no se pierde una')

  const ratios = allStats.map((s) => {
    const total = s.points_kills + s.points_position
    return total > 0 ? s.points_kills / total : 0
  })
  const myRatio = stats.points_kills + stats.points_position > 0
    ? stats.points_kills / (stats.points_kills + stats.points_position) : 0
  const sorted_ratio = [...ratios].sort((a, b) => b - a)
  const best_ratio = sorted_ratio[Math.floor(sorted_ratio.length * 0.25)] ?? 0
  const worst_ratio = sorted_ratio[Math.ceil(sorted_ratio.length * 0.75)] ?? 1

  if (myRatio >= best_ratio) titulos.push('El asesino')
  if (myRatio <= worst_ratio) titulos.push('El culon')

  const sorted_rb = [...allStats].sort((a, b) => b.rebuys_total - a.rebuys_total)
  const rb_threshold = sorted_rb[Math.floor(sorted_rb.length * 0.25)]?.rebuys_total ?? 0
  if (stats.rebuys_total > 0 && stats.rebuys_total >= rb_threshold) titulos.push('El comebacks')

  const sorted_pos = [...allStats].sort((a, b) => a.avg_position - b.avg_position)
  const pos_threshold = sorted_pos[Math.floor(sorted_pos.length * 0.25)]?.avg_position ?? 999
  if (stats.avg_position > 0 && stats.avg_position <= pos_threshold) titulos.push('El afortunado')

  return titulos
}

const TITULO_COLORS: Record<string, 'accent' | 'success' | 'warning' | 'danger' | 'default'> = {
  'El que no se pierde una': 'success',
  'El asesino': 'danger',
  'El culon': 'warning',
  'El comebacks': 'accent',
  'El afortunado': 'default',
}

function TituloIcon({ titulo }: { titulo: string }) {
  if (titulo === 'El que no se pierde una') return <SealCheck width={12} />
  if (titulo === 'El asesino') return <Skull width={12} />
  if (titulo === 'El culon') return <ShieldKeyhole width={12} />
  if (titulo === 'El comebacks') return <Flame width={12} />
  if (titulo === 'El afortunado') return <Medal width={12} />
  return null
}

// ── Pie chart SVG ─────────────────────────────────────────────────────────────
function PieSlices({ position, kills }: { position: number; kills: number }) {
  const total = position + kills
  const r = 70
  const cx = 90
  const cy = 90

  function describeArc(startDeg: number, endDeg: number) {
    const toRad = (d: number) => (d - 90) * (Math.PI / 180)
    const x1 = cx + r * Math.cos(toRad(startDeg))
    const y1 = cy + r * Math.sin(toRad(startDeg))
    const x2 = cx + r * Math.cos(toRad(endDeg))
    const y2 = cy + r * Math.sin(toRad(endDeg))
    const large = endDeg - startDeg > 180 ? 1 : 0
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`
  }

  const posAngle = (position / total) * 360

  return (
    <svg width="180" height="180" viewBox="0 0 180 180">
      {kills === 0 ? (
        <circle cx={cx} cy={cy} r={r} fill="var(--accent)" />
      ) : position === 0 ? (
        <circle cx={cx} cy={cy} r={r} fill="#E0736D" />
      ) : (
        <>
          <path d={describeArc(0, posAngle)} fill="var(--accent)" />
          <path d={describeArc(posAngle, 360)} fill="#E0736D" />
        </>
      )}
    </svg>
  )
}

function PieChart({ position, kills, total_points, handicap, attendance_pct }: {
  position: number
  kills: number
  total_points: number
  handicap: number
  attendance_pct: number
}) {
  const total = position + kills

  return (
    <div className="flex flex-col items-center gap-4">
      {/* KPIs row: label arriba, valor abajo */}
      <div className="grid grid-cols-3 w-full gap-2">
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-xs font-medium">Puntos</span>
          <span className="text-2xl font-bold">{total_points}</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-xs font-medium">Handicap</span>
          <span className="text-2xl font-bold">{handicap}</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-xs font-medium">Asistencia</span>
          <span className="text-2xl font-bold">{attendance_pct}%</span>
        </div>
      </div>

      {total === 0 ? (
        <p className="text-sm text-muted py-4">Sin puntos aún</p>
      ) : (
        <>
          <PieSlices position={position} kills={kills} />
          {/* Leyenda */}
          <div className="flex justify-center gap-8 w-full">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-accent shrink-0" />
              <span className="text-sm font-medium">Posición</span>
              <span className="text-sm font-medium">{position} pts</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: '#E0736D' }} />
              <span className="text-sm font-medium">Kills</span>
              <span className="text-sm font-medium">{kills} pts</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Panel de perfil ───────────────────────────────────────────────────────────
function PlayerProfilePanel({ groupId, playerId }: { groupId: string; playerId: string }) {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<PlayerStats | null>(null)

  useEffect(() => {
    if (!playerId) return
    setLoading(true)
    setStats(null)

    // Mock para Dilan
    if (playerId === DILAN_PLAYER_ID) {
      setStats(DILAN_MOCK)
      setLoading(false)
      return
    }

    async function load() {
      const { data: playerData } = await supabase
        .from('players').select('name').eq('id', playerId).single()

      if (!playerData) { setLoading(false); return }

      const { data: seasonData } = await supabase
        .from('seasons').select('id, config').eq('group_id', groupId).eq('status', 'open').single()

      if (!seasonData) {
        setStats({
          name: playerData.name, total_points: 0, points_position: 0, points_kills: 0,
          handicap: 0, attendance_pct: 0, games_attended: 0, total_games: 0,
          hijo: null, papa: null, rebuys_total: 0, avg_position: 0, titulos: [],
        })
        setLoading(false)
        return
      }

      const discardCfg = (seasonData.config as { worst_results_to_discard?: number } | null)?.worst_results_to_discard ?? 0

      const { count: totalGames } = await supabase
        .from('games').select('*', { count: 'exact', head: true })
        .eq('season_id', seasonData.id).eq('status', 'finished')

      const tg = totalGames ?? 0
      // Solo se descarta cuando hay mas jugadas que descartes
      const discard = effectiveDiscard(discardCfg, tg)

      // Funcion para aplicar descarte a un array de puntos por jugada
      function discardWorst(scores: number[], gamesAttended: number): number {
        if (discard <= 0) return scores.reduce((s, v) => s + v, 0)
        const absences = Math.max(0, tg - gamesAttended)
        const allScores = [...scores, ...Array(absences).fill(0)]
        allScores.sort((a, b) => a - b)
        return allScores.slice(Math.min(discard, allScores.length)).reduce((s, v) => s + v, 0)
      }

      const { data: myResults } = await supabase
        .from('game_results')
        .select('total_points, points_position, points_kills, kills_count, rebuys_count, position, games!inner(season_id)')
        .eq('player_id', playerId).eq('games.season_id', seasonData.id).eq('is_guest', false)

      const attended = myResults?.length ?? 0

      // Para el descarte, necesitamos los puntos individuales por jugada
      const myTotalScores = myResults?.map((r) => Number(r.total_points)) ?? []
      const myPosScores = myResults?.map((r) => Number(r.points_position)) ?? []
      const myKillScores = myResults?.map((r) => Number(r.points_kills)) ?? []

      // Identificar cuales jugadas se descartan (por indice en myTotalScores ordenado)
      // Para puntos de posición y kills, descartamos las mismas jugadas que tienen peor total
      let total_pts: number, pts_pos: number, pts_kills: number
      if (discard > 0 && myResults && myResults.length > 0) {
        // Crear indices ordenados por total_points ascendente, luego descartar los primeros N
        // (tambien agregar las ausencias como 0s)
        const absences = Math.max(0, tg - attended)
        const indexed = myResults.map((r, i) => ({ i, total: Number(r.total_points) }))
        // Agregar ausencias como entradas ficticias
        for (let a = 0; a < absences; a++) indexed.push({ i: -1, total: 0 })
        indexed.sort((a, b) => a.total - b.total)
        const discardedIndices = new Set(indexed.slice(0, Math.min(discard, indexed.length)).map((e) => e.i))

        total_pts = 0; pts_pos = 0; pts_kills = 0
        for (let i = 0; i < myResults.length; i++) {
          if (!discardedIndices.has(i)) {
            total_pts += Number(myResults[i].total_points)
            pts_pos += Number(myResults[i].points_position)
            pts_kills += Number(myResults[i].points_kills)
          }
        }
      } else {
        total_pts = myResults?.reduce((s, r) => s + Number(r.total_points), 0) ?? 0
        pts_pos = myResults?.reduce((s, r) => s + Number(r.points_position), 0) ?? 0
        pts_kills = myResults?.reduce((s, r) => s + Number(r.points_kills), 0) ?? 0
      }

      const total_rebuys = myResults?.reduce((s, r) => s + r.rebuys_count, 0) ?? 0
      const sum_position = myResults?.reduce((s, r) => s + r.position, 0) ?? 0
      const avg_pos = attended > 0 ? sum_position / attended : 0
      const handicap = attended > 0 ? Math.round((total_pts / attended) * 10) / 10 : 0
      const att_pct = tg > 0 ? Math.round((attended / tg) * 100) : 0

      const { data: papaEvents } = await supabase
        .from('game_events')
        .select('eliminated_by_player_id, players!game_events_eliminated_by_player_id_fkey(name), games!inner(season_id)')
        .eq('player_id', playerId).eq('type', 'elimination').eq('games.season_id', seasonData.id)
        .not('eliminated_by_player_id', 'is', null)

      const papaCount: Record<string, { name: string; count: number }> = {}
      for (const ev of papaEvents ?? []) {
        const pid = ev.eliminated_by_player_id as string
        const pname = (ev.players as unknown as { name: string } | null)?.name ?? ''
        if (!papaCount[pid]) papaCount[pid] = { name: pname, count: 0 }
        papaCount[pid].count++
      }
      const papa = Object.values(papaCount).sort((a, b) => b.count - a.count)[0]?.name ?? null

      const { data: hijoEvents } = await supabase
        .from('game_events')
        .select('player_id, players!game_events_player_id_fkey(name), games!inner(season_id)')
        .eq('eliminated_by_player_id', playerId).eq('type', 'elimination').eq('games.season_id', seasonData.id)
        .not('player_id', 'is', null)

      const hijoCount: Record<string, { name: string; count: number }> = {}
      for (const ev of hijoEvents ?? []) {
        const pid = ev.player_id as string
        const pname = (ev.players as unknown as { name: string } | null)?.name ?? ''
        if (!hijoCount[pid]) hijoCount[pid] = { name: pname, count: 0 }
        hijoCount[pid].count++
      }
      const hijo = Object.values(hijoCount).sort((a, b) => b.count - a.count)[0]?.name ?? null

      const { data: allSeasonPlayers } = await supabase
        .from('season_players').select('player_id').eq('season_id', seasonData.id)

      const allPlayerIds = (allSeasonPlayers ?? []).map((sp) => sp.player_id)
      const allStatsArr: Array<{ points_kills: number; points_position: number; rebuys_total: number; avg_position: number; attendance_pct: number }> = []

      for (const pid of allPlayerIds) {
        const { data: pr } = await supabase
          .from('game_results')
          .select('total_points, points_position, points_kills, rebuys_count, position, games!inner(season_id)')
          .eq('player_id', pid).eq('games.season_id', seasonData.id).eq('is_guest', false)

        const pAttended = pr?.length ?? 0
        const pPosScores = pr?.map((r) => Number(r.points_position)) ?? []
        const pKillScores = pr?.map((r) => Number(r.points_kills)) ?? []

        allStatsArr.push({
          points_kills: discardWorst(pKillScores, pAttended),
          points_position: discardWorst(pPosScores, pAttended),
          rebuys_total: pr?.reduce((s, r) => s + r.rebuys_count, 0) ?? 0,
          avg_position: pAttended > 0 ? (pr?.reduce((s, r) => s + r.position, 0) ?? 0) / pAttended : 0,
          attendance_pct: tg > 0 ? (pAttended / tg) * 100 : 0,
        })
      }

      const titulos = allStatsArr.length > 0
        ? calcTitulo({ attendance_pct: att_pct, points_kills: pts_kills, points_position: pts_pos, rebuys_total: total_rebuys, avg_position: avg_pos }, allStatsArr)
        : []

      setStats({
        name: playerData.name, total_points: total_pts, points_position: pts_pos,
        points_kills: pts_kills, handicap, attendance_pct: att_pct,
        games_attended: attended, total_games: tg,
        hijo, papa, rebuys_total: total_rebuys, avg_position: Math.round(avg_pos * 10) / 10, titulos,
      })
      setLoading(false)
    }
    load()
  }, [groupId, playerId])

  if (loading) {
    return <div className="flex justify-center py-16"><Spinner /></div>
  }

  if (!stats) {
    return <p className="text-sm text-muted text-center py-8">Jugador no encontrado.</p>
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Nombre */}
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-center text-white">{stats.name}</h1>
        {stats.titulos.length > 0 && (
          <div className="flex flex-wrap gap-1.5 justify-center">
            {stats.titulos.map((t) => (
              <Chip key={t} size="md" variant="soft" color={TITULO_COLORS[t] ?? 'default'}>
                <TituloIcon titulo={t} />
                <Chip.Label>{t}</Chip.Label>
              </Chip>
            ))}
          </div>
        )}
      </div>
      <Separator />

      {/* Distribución de puntos con KPIs integrados */}
      <div className="mt-2">
        <h2 className="text-sm font-semibold text-white text-center mb-5">Distribución de puntos</h2>
        <PieChart
          position={stats.points_position}
          kills={stats.points_kills}
          total_points={stats.total_points}
          handicap={stats.handicap}
          attendance_pct={stats.attendance_pct}
        />
      </div>

      <Separator />

      {/* Rivalidades */}
      <div>
        <h2 className="text-sm font-semibold text-white text-center mb-5">Rivalidades</h2>
        <div className="grid grid-cols-2 gap-4">
          <Card variant="secondary">
            <Card.Content className="pt-4 pb-4 flex flex-col items-center gap-1">
              <span className="text-3xl">💀</span>
              <p className="font-semibold text-center text-sm mt-1 text-white">{stats.papa ?? '—'}</p>
              <p className="text-xs text-muted text-center">Papi</p>
            </Card.Content>
          </Card>
          <Card variant="secondary">
            <Card.Content className="pt-4 pb-4 flex flex-col items-center gap-1">
              <span className="text-3xl">👶</span>
              <p className="font-semibold text-center text-sm mt-1 text-white">{stats.hijo ?? '—'}</p>
              <p className="text-xs text-muted text-center">Eterno Hijo</p>
            </Card.Content>
          </Card>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function SeasonPage({ params }: Props) {
  const { group_id } = use(params)
  const [loading, setLoading] = useState(true)
  const [season, setSeason] = useState<Season | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [games, setGames] = useState<Game[]>([])
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedGame, setSelectedGame] = useState<Game | null>(null)
  const [gameDrawerOpen, setGameDrawerOpen] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: seasonData } = await supabase
        .from('seasons').select('id, name, config').eq('group_id', group_id).eq('status', 'open').single()

      if (!seasonData) { setLoading(false); return }

      setSeason(seasonData as Season)

      const discardCfg = (seasonData.config as { worst_results_to_discard?: number } | null)?.worst_results_to_discard ?? 0

      const { data: resultsData } = await supabase
        .from('game_results')
        .select('player_id, total_points, game_id, games!inner(season_id)')
        .eq('games.season_id', seasonData.id).eq('is_guest', false)

      const { data: seasonPlayers } = await supabase
        .from('season_players').select('player_id, players(id, name)').eq('season_id', seasonData.id)

      const { data: gamesData } = await supabase
        .from('games').select('id, name').eq('season_id', seasonData.id).eq('status', 'finished').order('created_at', { ascending: false })

      const totalFinishedGames = gamesData?.length ?? 0
      // Solo se descarta cuando hay mas jugadas que descartes
      const discard = effectiveDiscard(discardCfg, totalFinishedGames)

      // Recopilar puntos por jugada para cada jugador
      const pointsByPlayer: Record<string, number[]> = {}
      const attendedByPlayer: Record<string, number> = {}
      if (resultsData) {
        for (const r of resultsData) {
          if (!r.player_id) continue
          if (!pointsByPlayer[r.player_id]) pointsByPlayer[r.player_id] = []
          pointsByPlayer[r.player_id].push(Number(r.total_points))
          attendedByPlayer[r.player_id] = (attendedByPlayer[r.player_id] ?? 0) + 1
        }
      }

      // Aplicar descarte: agregar 0s por jugadas no asistidas, luego descartar los N peores
      function applyDiscard(scores: number[], gamesAttended: number): { total: number; count: number } {
        if (discard <= 0) {
          const total = scores.reduce((s, v) => s + v, 0)
          return { total, count: gamesAttended }
        }
        // Agregar 0s por jugadas no asistidas
        const absences = Math.max(0, totalFinishedGames - gamesAttended)
        const allScores = [...scores, ...Array(absences).fill(0)]
        // Ordenar de menor a mayor y descartar los N peores
        allScores.sort((a, b) => a - b)
        const kept = allScores.slice(Math.min(discard, allScores.length))
        const total = kept.reduce((s, v) => s + v, 0)
        return { total, count: gamesAttended }
      }

      const gamesList: Game[] = []
      if (gamesData) {
        for (const g of gamesData) {
          const { data: winner } = await supabase
            .from('game_results').select('player_id, guest_name, is_guest, players(name)')
            .eq('game_id', g.id).eq('position', 1).single()

          let winnerName: string | null = null
          if (winner) {
            if (winner.is_guest) {
              winnerName = winner.guest_name
            } else {
              const wp = winner.players as unknown as { name: string } | null
              winnerName = wp?.name ?? null
            }
          }
          gamesList.push({ id: g.id, name: g.name, winner_name: winnerName })
        }
      }

      const playerList: Player[] = []
      if (seasonPlayers) {
        for (const sp of seasonPlayers) {
          const p = sp.players as unknown as { id: string; name: string } | null
          if (!p) continue
          const scores = pointsByPlayer[sp.player_id] ?? []
          const attended = attendedByPlayer[sp.player_id] ?? 0
          const { total, count } = applyDiscard(scores, attended)
          playerList.push({
            id: p.id, name: p.name, total_points: total,
            handicap: count > 0 ? Math.round((total / count) * 10) / 10 : 0,
            games_attended: count,
          })
        }
        playerList.sort((a, b) => b.total_points - a.total_points)
      }

      setPlayers(playerList)
      setGames(gamesList)
      setLoading(false)
    }
    load()
  }, [group_id])

  function openPlayer(id: string) {
    setSelectedPlayerId(id)
    setModalOpen(true)
  }

  function openGame(game: Game) {
    setSelectedGame(game)
    setGameDrawerOpen(true)
  }

  if (loading) {
    return <div className="flex justify-center mt-16"><Spinner /></div>
  }

  if (!season) {
    return (
      <div className="p-4 max-w-md mx-auto">
        <div className="mt-4 mb-4 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Temporada</h1>
        </div>
        <Card variant="transparent" className="text-center py-10">
          <Card.Content>
            <p className="text-sm text-muted mb-1">No hay ninguna temporada activa.</p>
            <p className="text-xs text-muted">Ve a Admin para iniciar una.</p>
          </Card.Content>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-md mx-auto mt-4">
      {/* Tabla de clasificacion */}
      <p className="text-sm font-semibold text-muted uppercase tracking-wider mb-3 text-center">Clasificación</p>
      {players.length === 0 ? (
        <Card variant="transparent" className="text-center py-8 mb-6">
          <Card.Content>
            <p className="text-sm text-muted">Sin resultados aun</p>
          </Card.Content>
        </Card>
      ) : (
        <Card className="mb-10 overflow-hidden p-0">
          <Table>
            <Table.ScrollContainer>
              <Table.Content aria-label="Clasificacion de la temporada">
                <Table.Header>
                  <Table.Column isRowHeader className="w-8">#</Table.Column>
                  <Table.Column>Jugador</Table.Column>
                  <Table.Column className="text-right w-14">Pts</Table.Column>
                  <Table.Column className="text-right w-16">HCP</Table.Column>
                  <Table.Column className="text-right w-12">A</Table.Column>
                </Table.Header>
                <Table.Body>
                  {players.map((p, i) => {
                    const nameColor = i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-600' : 'text-white'
                    return (
                      <Table.Row
                        key={p.id}
                        className="cursor-pointer active:opacity-70 transition-opacity"
                        onAction={() => openPlayer(p.id)}
                      >
                        <Table.Cell className="text-muted font-mono text-sm">{i + 1}</Table.Cell>
                        <Table.Cell>
                          <span className={`font-medium ${nameColor}`}>{p.name}</span>
                        </Table.Cell>
                        <Table.Cell className="text-right font-semibold">{p.total_points}</Table.Cell>
                        <Table.Cell className="text-right text-muted">{p.handicap}</Table.Cell>
                        <Table.Cell className="text-right text-muted">{p.games_attended}</Table.Cell>
                      </Table.Row>
                    )
                  })}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        </Card>
      )}

      {/* Tabla de jugadas */}
      <p className="text-sm font-semibold text-muted uppercase tracking-wider mb-3 text-center">Jugadas</p>
      {games.length === 0 ? (
        <p className="text-sm text-muted text-center">Sin jugadas registradas aun.</p>
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <Table.ScrollContainer>
              <Table.Content aria-label="Jugadas de la temporada">
                <Table.Header>
                  <Table.Column isRowHeader>Jugada</Table.Column>
                  <Table.Column className="text-right">Ganador</Table.Column>
                </Table.Header>
                <Table.Body>
                  {games.map((g) => (
                    <Table.Row key={g.id} className="cursor-pointer active:opacity-70 transition-opacity" onAction={() => openGame(g)}>
                      <Table.Cell>
                        <span className="font-medium text-sm">{g.name}</span>
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        <span className="text-sm text-muted">{g.winner_name ?? '—'}</span>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        </Card>
      )}

      {/* Modal de perfil de jugador */}
      <Modal.Backdrop isOpen={modalOpen} onOpenChange={setModalOpen} variant="blur">
        <Modal.Container scroll="inside">
          <Modal.Dialog className="max-h-[80vh]">
            <Modal.CloseTrigger />
            <Modal.Body className="pb-8 overflow-y-auto">
              {selectedPlayerId && (
                <PlayerProfilePanel groupId={group_id} playerId={selectedPlayerId} />
              )}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* Drawer de detalle de jugada */}
      <GameDetailDrawer
        gameId={selectedGame?.id ?? null}
        gameName={selectedGame?.name ?? ''}
        isOpen={gameDrawerOpen}
        onClose={() => { setGameDrawerOpen(false); setSelectedGame(null) }}
      />
    </div>
  )
}
