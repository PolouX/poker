'use client'

import { useEffect, useState, use, useRef } from 'react'
import { Card, Chip, Drawer, Separator, Spinner, Table } from '@heroui/react'

// ── Drawer de detalle de jugada ───────────────────────────────────────────────
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
        const { count } = await supabase
          .from('season_players')
          .select('*', { count: 'exact', head: true })
          .eq('season_id', gameData.season_id)
        absent = Math.max(0, (count ?? 0) - totalAttendees)
      }
      setMetrics({ attendees: totalAttendees, guests: totalGuests, absent })
      setLoading(false)
    }
    load()
  }, [gameId, isOpen])

  const hasPrizes = results.some((r) => r.prize_amount > 0)

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
                            {hasPrizes && <Table.Column className="text-right">$</Table.Column>}
                          </Table.Header>
                          <Table.Body>
                            {results.map((r) => (
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
                                {hasPrizes && (
                                  <Table.Cell className="text-right text-muted">
                                    {r.prize_amount > 0 ? `$${r.prize_amount}` : '—'}
                                  </Table.Cell>
                                )}
                              </Table.Row>
                            ))}
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
import {
  CrownDiamond,
  Medal,
  TargetDart,
  Skull,
  ChartDonut,
  SealCheck,
  ShieldKeyhole,
  Flame,
} from '@gravity-ui/icons'
import { supabase } from '@/lib/supabase'

interface PokerRecord {
  label: string
  value: string | number
  sub?: string
  icon: React.ReactNode
  color: string
}

interface SeasonPodium {
  id: string
  name: string
  image_url: string | null
  top3: Array<{ position: number; player_name: string; player_id: string | null; total_points: number }>
}

interface Props {
  params: Promise<{ group_id: string }>
}

const PODIUM_COLORS = ['text-yellow-400', 'text-slate-300', 'text-amber-600']
const PODIUM_BG = ['bg-yellow-400/10', 'bg-slate-300/10', 'bg-amber-600/10']
const PODIUM_BORDER = ['border-yellow-400/30', 'border-slate-300/30', 'border-amber-600/30']
const POSITION_LABEL = ['1°', '2°', '3°']

// ── Tipos para perfil de jugador en temporada cerrada ─────────────────────────
interface SeasonPlayerStats {
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

interface SeasonGame {
  id: string
  name: string
  winner_name: string | null
}

interface SeasonDrawerData {
  season: SeasonPodium
  players: Array<{ id: string | null; name: string; total_points: number; handicap: number; games_attended: number }>
  games: SeasonGame[]
}

// ── Títulos ───────────────────────────────────────────────────────────────────
function calcTitulo(
  stats: { attendance_pct: number; points_kills: number; points_position: number; rebuys_total: number; avg_position: number },
  allStats: Array<{ points_kills: number; points_position: number; rebuys_total: number; avg_position: number; attendance_pct: number }>
): string[] {
  const titulos: string[] = []
  const sorted_att = [...allStats].sort((a, b) => b.attendance_pct - a.attendance_pct)
  const att_threshold = sorted_att[Math.floor(sorted_att.length * 0.25)]?.attendance_pct ?? 0
  if (stats.attendance_pct >= att_threshold) titulos.push('El que no se pierde una')
  const myRatio = stats.points_kills + stats.points_position > 0
    ? stats.points_kills / (stats.points_kills + stats.points_position) : 0
  const ratios = allStats.map((s) => {
    const total = s.points_kills + s.points_position
    return total > 0 ? s.points_kills / total : 0
  })
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

// ── Pie chart ─────────────────────────────────────────────────────────────────
function PieSlices({ position, kills }: { position: number; kills: number }) {
  const total = position + kills
  const r = 70, cx = 90, cy = 90
  function describeArc(startDeg: number, endDeg: number) {
    const toRad = (d: number) => (d - 90) * (Math.PI / 180)
    const x1 = cx + r * Math.cos(toRad(startDeg)), y1 = cy + r * Math.sin(toRad(startDeg))
    const x2 = cx + r * Math.cos(toRad(endDeg)), y2 = cy + r * Math.sin(toRad(endDeg))
    const large = endDeg - startDeg > 180 ? 1 : 0
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`
  }
  const posAngle = (position / total) * 360
  return (
    <svg width="180" height="180" viewBox="0 0 180 180">
      {kills === 0 ? <circle cx={cx} cy={cy} r={r} fill="var(--accent)" />
        : position === 0 ? <circle cx={cx} cy={cy} r={r} fill="#E0736D" />
        : (<><path d={describeArc(0, posAngle)} fill="var(--accent)" /><path d={describeArc(posAngle, 360)} fill="#E0736D" /></>)}
    </svg>
  )
}

function PieChart({ position, kills, total_points, handicap, attendance_pct }: {
  position: number; kills: number; total_points: number; handicap: number; attendance_pct: number
}) {
  const total = position + kills
  return (
    <div className="flex flex-col items-center gap-4">
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
      {total === 0 ? <p className="text-sm text-muted py-4">Sin puntos aún</p> : (
        <>
          <PieSlices position={position} kills={kills} />
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

// ── Panel de perfil de jugador en temporada cerrada ───────────────────────────
function SeasonPlayerProfilePanel({ groupId, playerId, seasonId, totalGames }: {
  groupId: string; playerId: string; seasonId: string; totalGames: number
}) {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<SeasonPlayerStats | null>(null)

  useEffect(() => {
    if (!playerId || !seasonId) return
    setLoading(true)
    setStats(null)

    async function load() {
      const [{ data: playerData }, { data: seasonCfg }] = await Promise.all([
        supabase.from('players').select('name').eq('id', playerId).single(),
        supabase.from('seasons').select('config').eq('id', seasonId).single(),
      ])
      if (!playerData) { setLoading(false); return }

      const discard = (seasonCfg?.config as { worst_results_to_discard?: number } | null)?.worst_results_to_discard ?? 0

      function discardWorst(scores: number[], attended: number): number {
        if (discard <= 0) return scores.reduce((s, v) => s + v, 0)
        const absences = Math.max(0, totalGames - attended)
        const all = [...scores, ...Array(absences).fill(0)]
        all.sort((a, b) => a - b)
        return all.slice(Math.min(discard, all.length)).reduce((s, v) => s + v, 0)
      }

      const { data: myResults } = await supabase
        .from('game_results')
        .select('total_points, points_position, points_kills, kills_count, rebuys_count, position, games!inner(season_id)')
        .eq('player_id', playerId).eq('games.season_id', seasonId).eq('is_guest', false)

      const attended = myResults?.length ?? 0

      // Aplicar descarte coherente (descartar las mismas jugadas)
      let total_pts: number, pts_pos: number, pts_kills: number
      if (discard > 0 && myResults && myResults.length > 0) {
        const absences = Math.max(0, totalGames - attended)
        const indexed = myResults.map((r, i) => ({ i, total: Number(r.total_points) }))
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
      const att_pct = totalGames > 0 ? Math.round((attended / totalGames) * 100) : 0

      const { data: papaEvents } = await supabase
        .from('game_events')
        .select('eliminated_by_player_id, players!game_events_eliminated_by_player_id_fkey(name), games!inner(season_id)')
        .eq('player_id', playerId).eq('type', 'elimination').eq('games.season_id', seasonId)
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
        .eq('eliminated_by_player_id', playerId).eq('type', 'elimination').eq('games.season_id', seasonId)
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
        .from('season_players').select('player_id').eq('season_id', seasonId)
      const allPlayerIds = (allSeasonPlayers ?? []).map((sp) => sp.player_id)
      const allStatsArr: Array<{ points_kills: number; points_position: number; rebuys_total: number; avg_position: number; attendance_pct: number }> = []
      for (const pid of allPlayerIds) {
        const { data: pr } = await supabase
          .from('game_results')
          .select('total_points, points_position, points_kills, rebuys_count, position, games!inner(season_id)')
          .eq('player_id', pid).eq('games.season_id', seasonId).eq('is_guest', false)
        const pAttended = pr?.length ?? 0
        const pPosScores = pr?.map((r) => Number(r.points_position)) ?? []
        const pKillScores = pr?.map((r) => Number(r.points_kills)) ?? []
        allStatsArr.push({
          points_kills: discardWorst(pKillScores, pAttended),
          points_position: discardWorst(pPosScores, pAttended),
          rebuys_total: pr?.reduce((s, r) => s + r.rebuys_count, 0) ?? 0,
          avg_position: pAttended > 0 ? (pr?.reduce((s, r) => s + r.position, 0) ?? 0) / pAttended : 0,
          attendance_pct: totalGames > 0 ? (pAttended / totalGames) * 100 : 0,
        })
      }

      const titulos = allStatsArr.length > 0
        ? calcTitulo({ attendance_pct: att_pct, points_kills: pts_kills, points_position: pts_pos, rebuys_total: total_rebuys, avg_position: avg_pos }, allStatsArr)
        : []

      setStats({
        name: playerData.name, total_points: total_pts, points_position: pts_pos,
        points_kills: pts_kills, handicap, attendance_pct: att_pct,
        games_attended: attended, total_games: totalGames,
        hijo, papa, rebuys_total: total_rebuys, avg_position: Math.round(avg_pos * 10) / 10, titulos,
      })
      setLoading(false)
    }
    load()
  }, [groupId, playerId, seasonId, totalGames])

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>
  if (!stats) return <p className="text-sm text-muted text-center py-8">Jugador no encontrado.</p>

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-center text-white">{stats.name}</h1>
        {stats.titulos.length > 0 && (
          <div className="flex flex-wrap gap-1.5 justify-center">
            {stats.titulos.map((t) => (
              <Chip key={t} size="md" variant="soft" color={TITULO_COLORS[t] ?? 'secondary'}>
                <TituloIcon titulo={t} />
                <Chip.Label>{t}</Chip.Label>
              </Chip>
            ))}
          </div>
        )}
      </div>
      <Separator />
      <div className="mt-2">
        <h2 className="text-sm font-semibold text-white text-center mb-5">Distribución de puntos</h2>
        <PieChart
          position={stats.points_position} kills={stats.points_kills}
          total_points={stats.total_points} handicap={stats.handicap} attendance_pct={stats.attendance_pct}
        />
      </div>
      <Separator />
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

// ── Drawer de temporada cerrada ───────────────────────────────────────────────
function SeasonDetailDrawer({
  isOpen, onClose, data, groupId,
}: {
  isOpen: boolean
  onClose: () => void
  data: SeasonDrawerData | null
  groupId: string
}) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [playerDrawerOpen, setPlayerDrawerOpen] = useState(false)
  const [seasonTotalGames, setSeasonTotalGames] = useState(0)
  const [selectedGame, setSelectedGame] = useState<SeasonGame | null>(null)
  const [gameDrawerOpen, setGameDrawerOpen] = useState(false)

  useEffect(() => {
    if (data) setSeasonTotalGames(data.games.length)
  }, [data])

  if (!data) return null

  return (
    <>
      <Drawer.Backdrop isOpen={isOpen} onOpenChange={(open) => { if (!open) onClose() }} variant="blur">
        <Drawer.Content placement="bottom">
          <Drawer.Dialog className="max-h-[90vh]">
            <Drawer.Handle />
            <Drawer.CloseTrigger />
            {/* Imagen de la temporada */}
            {data.season.image_url ? (
              <div className="w-full h-48 overflow-hidden rounded-t-2xl">
                <img
                  src={data.season.image_url}
                  alt={data.season.name}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-full h-36 flex flex-col items-center justify-center bg-gradient-to-br from-accent/20 to-accent/5 rounded-t-2xl">
                <CrownDiamond width={40} className="text-accent opacity-40" />
                <p className="text-xs text-muted mt-2">Sin foto de temporada</p>
              </div>
            )}
            <Drawer.Header className="pt-3">
              <Drawer.Heading>{data.season.name}</Drawer.Heading>
            </Drawer.Header>
            <Drawer.Body className="overflow-y-auto pb-8">
              {/* Clasificación */}
              <p className="text-sm font-semibold mb-3 text-center text-white">Clasificación</p>
              {data.players.length === 0 ? (
                <Card variant="transparent" className="text-center py-8 mb-6">
                  <Card.Content><p className="text-sm text-muted">Sin resultados</p></Card.Content>
                </Card>
              ) : (
                <Card className="mb-8 overflow-hidden p-0">
                  <Table>
                    <Table.ScrollContainer>
                      <Table.Content aria-label="Clasificación de temporada">
                        <Table.Header>
                          <Table.Column isRowHeader className="w-8">#</Table.Column>
                          <Table.Column>Jugador</Table.Column>
                          <Table.Column className="text-right w-14">Pts</Table.Column>
                          <Table.Column className="text-right w-16">HCP</Table.Column>
                          <Table.Column className="text-right w-12">A</Table.Column>
                        </Table.Header>
                        <Table.Body>
                          {data.players.map((p, i) => {
                            const nameColor = i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-600' : 'text-white'
                            return (
                            <Table.Row
                              key={p.id ?? p.name}
                              className={p.id ? 'cursor-pointer active:opacity-70 transition-opacity' : ''}
                              onAction={p.id ? () => { setSelectedPlayerId(p.id); setPlayerDrawerOpen(true) } : undefined}
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

              {/* Jugadas */}
              <p className="text-sm font-semibold mb-3 text-center text-white">Jugadas</p>
              {data.games.length === 0 ? (
                <p className="text-sm text-muted text-center">Sin jugadas registradas.</p>
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
                          {data.games.map((g) => (
                            <Table.Row
                              key={g.id}
                              className="cursor-pointer active:opacity-70 transition-opacity"
                              onAction={() => { setSelectedGame(g); setGameDrawerOpen(true) }}
                            >
                              <Table.Cell><span className="font-medium text-sm">{g.name}</span></Table.Cell>
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
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>

      {/* Drawer de perfil de jugador */}
      <Drawer.Backdrop isOpen={playerDrawerOpen} onOpenChange={setPlayerDrawerOpen} variant="blur">
        <Drawer.Content placement="bottom">
          <Drawer.Dialog className="max-h-[85vh]">
            <Drawer.Handle />
            <Drawer.CloseTrigger />
            <Drawer.Body className="overflow-y-auto pb-8">
              {selectedPlayerId && data && (
                <SeasonPlayerProfilePanel
                  groupId={groupId}
                  playerId={selectedPlayerId}
                  seasonId={data.season.id}
                  totalGames={seasonTotalGames}
                />
              )}
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>

      {/* Drawer de detalle de jugada */}
      <GameDetailDrawer
        gameId={selectedGame?.id ?? null}
        gameName={selectedGame?.name ?? ''}
        isOpen={gameDrawerOpen}
        onClose={() => { setGameDrawerOpen(false); setSelectedGame(null) }}
      />
    </>
  )
}

// ── Carrusel del Salón de la Fama ─────────────────────────────────────────────
function FameCarousel({ podiums, onSelect }: {
  podiums: SeasonPodium[]
  onSelect: (p: SeasonPodium) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)

  function onScroll() {
    if (!scrollRef.current) return
    const el = scrollRef.current
    const idx = Math.round(el.scrollLeft / el.offsetWidth)
    setActive(idx)
  }

  if (podiums.length === 0) {
    return (
      <Card variant="transparent" className="text-center py-10">
        <Card.Content>
          <CrownDiamond width={32} className="text-muted mx-auto mb-2 opacity-40" />
          <p className="text-sm text-muted">No hay temporadas finalizadas aún.</p>
        </Card.Content>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-3"
        style={{ scrollbarWidth: 'none' }}
      >
        {podiums.map((p) => (
          <div
            key={p.id}
            className="snap-center shrink-0 w-[calc(100%-32px)] cursor-pointer"
            onClick={() => onSelect(p)}
          >
            <Card className="overflow-hidden active:opacity-80 transition-opacity p-0">
              <div className="flex items-stretch min-h-[120px]">
                {/* Imagen a la izquierda — sin padding, pegada al borde */}
                <div className="relative w-32 shrink-0">
                  {p.image_url ? (
                    <>
                      <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                      {/* Difuminado hacia la derecha */}
                      <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, transparent 30%, var(--card, #18181b) 100%)' }} />
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-accent/15 to-accent/5">
                      <CrownDiamond width={28} className="text-accent opacity-30" />
                    </div>
                  )}
                </div>
                {/* Contenido a la derecha */}
                <div className="flex flex-col justify-center gap-2 pl-5 pr-5 pt-5 pb-7 flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white uppercase tracking-wider text-center">{p.name}</p>
                  <div className="flex flex-col gap-1">
                    {p.top3.map((entry, i) => (
                      <div key={entry.position} className="flex items-center gap-2">
                        <span className={`text-sm font-bold w-5 shrink-0 ${PODIUM_COLORS[i]}`}>
                          {POSITION_LABEL[i]}
                        </span>
                        <span className="text-sm text-white flex-1 truncate">{entry.player_name}</span>
                        <span className="text-xs text-white/60">{entry.total_points} pts</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        ))}
      </div>
      {/* Dots */}
      {podiums.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-1">
          {podiums.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === active ? 'w-4 bg-accent' : 'w-1.5 bg-muted/40'}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function HistoryPage({ params }: Props) {
  const { group_id } = use(params)
  const [loading, setLoading] = useState(true)
  const [records, setRecords] = useState<PokerRecord[]>([])
  const [podiums, setPodiums] = useState<SeasonPodium[]>([])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerData, setDrawerData] = useState<SeasonDrawerData | null>(null)
  const [drawerLoading, setDrawerLoading] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: allSeasons } = await supabase
        .from('seasons').select('id, name, status, image_url, config')
        .eq('group_id', group_id).order('created_at', { ascending: false })

      const seasonIds = (allSeasons ?? []).map((s) => s.id)
      if (seasonIds.length === 0) { setLoading(false); return }

      const { data: allGames } = await supabase
        .from('games').select('id, season_id').in('season_id', seasonIds).eq('status', 'finished')

      const gameIds = (allGames ?? []).map((g) => g.id)
      if (gameIds.length === 0) { setLoading(false); return }

      const { data: allResults } = await supabase
        .from('game_results')
        .select('game_id, player_id, total_points, kills_count, is_guest, guest_name, players(name)')
        .in('game_id', gameIds).eq('is_guest', false)

      // ── Records ──────────────────────────────────────────────────────────────
      let maxNightPts = 0, maxNightPlayer = ''
      for (const r of allResults ?? []) {
        if (Number(r.total_points) > maxNightPts) {
          maxNightPts = Number(r.total_points)
          maxNightPlayer = (r.players as unknown as { name: string } | null)?.name ?? ''
        }
      }

      let maxKillsNight = 0, maxKillsPlayer = ''
      for (const r of allResults ?? []) {
        if (r.kills_count > maxKillsNight) {
          maxKillsNight = r.kills_count
          maxKillsPlayer = (r.players as unknown as { name: string } | null)?.name ?? ''
        }
      }

      // Recopilar puntos por jugada para cada jugador/temporada
      const seasonPlayerScores: { [key: string]: { name: string; scores: number[]; season: string } } = {}
      for (const r of allResults ?? []) {
        if (!r.player_id) continue
        const g = allGames?.find((g) => g.id === r.game_id)
        const key = `${g?.season_id}_${r.player_id}`
        if (!seasonPlayerScores[key]) seasonPlayerScores[key] = { name: (r.players as unknown as { name: string } | null)?.name ?? '', scores: [], season: g?.season_id ?? '' }
        seasonPlayerScores[key].scores.push(Number(r.total_points))
      }

      // Calcular totales con descarte por temporada
      const seasonPlayerPts: { [key: string]: { name: string; total: number; count: number; season: string } } = {}
      for (const [key, data] of Object.entries(seasonPlayerScores)) {
        const seasonObj = (allSeasons ?? []).find((s) => s.id === data.season)
        const discard = (seasonObj?.config as { worst_results_to_discard?: number } | null)?.worst_results_to_discard ?? 0
        const seasonGameCount = (allGames ?? []).filter((g) => g.season_id === data.season).length
        const attended = data.scores.length

        let total: number
        if (discard > 0) {
          const absences = Math.max(0, seasonGameCount - attended)
          const allScores = [...data.scores, ...Array(absences).fill(0)]
          allScores.sort((a, b) => a - b)
          total = allScores.slice(Math.min(discard, allScores.length)).reduce((s, v) => s + v, 0)
        } else {
          total = data.scores.reduce((s, v) => s + v, 0)
        }
        seasonPlayerPts[key] = { name: data.name, total, count: attended, season: data.season }
      }

      const entries = Object.values(seasonPlayerPts)
      entries.sort((a, b) => b.total - a.total)
      const maxSeasonPts = entries[0]
      const minEntry = [...entries].sort((a, b) => a.total - b.total)[0]
      const hcpEntries = entries.filter((e) => e.count > 0).map((e) => ({ ...e, hcp: e.total / e.count }))
      hcpEntries.sort((a, b) => b.hcp - a.hcp)
      const bestHcp = hcpEntries[0]
      const worstHcp = hcpEntries[hcpEntries.length - 1]

      const recordsList: PokerRecord[] = []
      if (maxNightPlayer) recordsList.push({ label: 'Mejor noche', value: maxNightPts, sub: maxNightPlayer, icon: <CrownDiamond width={22} />, color: 'text-yellow-400' })
      if (maxSeasonPts) recordsList.push({ label: 'Mejor temporada', value: maxSeasonPts.total, sub: maxSeasonPts.name, icon: <Medal width={22} />, color: 'text-slate-300' })
      if (maxKillsPlayer) recordsList.push({ label: 'Más kills', value: maxKillsNight, sub: maxKillsPlayer, icon: <TargetDart width={22} />, color: 'text-red-400' })
      if (minEntry) recordsList.push({ label: 'Peor temporada', value: minEntry.total, sub: minEntry.name, icon: <Skull width={22} />, color: 'text-purple-400' })
      if (bestHcp) recordsList.push({ label: 'Mejor HCP', value: Math.round(bestHcp.hcp * 10) / 10, sub: bestHcp.name, icon: <ChartDonut width={22} />, color: 'text-green-400' })
      if (worstHcp) recordsList.push({ label: 'Peor HCP', value: Math.round(worstHcp.hcp * 10) / 10, sub: worstHcp.name, icon: <ChartDonut width={22} />, color: 'text-orange-400' })
      setRecords(recordsList)

      // ── Podios ───────────────────────────────────────────────────────────────
      const closedSeasons = (allSeasons ?? []).filter((s) => s.status === 'closed')
      const podiumsList: SeasonPodium[] = []

      for (const season of closedSeasons) {
        const seasonGameIds = (allGames ?? []).filter((g) => g.season_id === season.id).map((g) => g.id)
        if (seasonGameIds.length === 0) continue
        const discard = (season.config as { worst_results_to_discard?: number } | null)?.worst_results_to_discard ?? 0
        const seasonGameCount = seasonGameIds.length

        // Recopilar scores por jugador
        const spScores: { [key: string]: { id: string; name: string; scores: number[] } } = {}
        for (const r of allResults ?? []) {
          if (!r.player_id || !seasonGameIds.includes(r.game_id)) continue
          if (!spScores[r.player_id]) spScores[r.player_id] = { id: r.player_id, name: (r.players as unknown as { name: string } | null)?.name ?? '', scores: [] }
          spScores[r.player_id].scores.push(Number(r.total_points))
        }

        // Aplicar descarte
        const spTotals = Object.values(spScores).map((p) => {
          const attended = p.scores.length
          let total: number
          if (discard > 0) {
            const absences = Math.max(0, seasonGameCount - attended)
            const all = [...p.scores, ...Array(absences).fill(0)]
            all.sort((a, b) => a - b)
            total = all.slice(Math.min(discard, all.length)).reduce((s, v) => s + v, 0)
          } else {
            total = p.scores.reduce((s, v) => s + v, 0)
          }
          return { id: p.id, name: p.name, total }
        })

        const sorted = spTotals.sort((a, b) => b.total - a.total).slice(0, 3)
        podiumsList.push({
          id: season.id,
          name: season.name,
          image_url: season.image_url ?? null,
          top3: sorted.map((p, i) => ({ position: i + 1, player_name: p.name, player_id: p.id, total_points: p.total })),
        })
      }

      setPodiums(podiumsList)
      setLoading(false)
    }
    load()
  }, [group_id])

  async function openSeasonDrawer(season: SeasonPodium) {
    setDrawerLoading(true)
    setDrawerOpen(true)

    // Obtener config de la temporada para descarte
    const { data: seasonCfg } = await supabase
      .from('seasons').select('config').eq('id', season.id).single()
    const discard = (seasonCfg?.config as { worst_results_to_discard?: number } | null)?.worst_results_to_discard ?? 0

    const { data: gamesData } = await supabase
      .from('games').select('id, name').eq('season_id', season.id).eq('status', 'finished').order('created_at', { ascending: false })

    const seasonGameIds = (gamesData ?? []).map((g) => g.id)
    const totalFinishedGames = seasonGameIds.length

    // Ganadores de cada jugada
    const gamesList: SeasonGame[] = []
    for (const g of gamesData ?? []) {
      const { data: winner } = await supabase
        .from('game_results').select('player_id, guest_name, is_guest, players(name)')
        .eq('game_id', g.id).eq('position', 1).single()
      let winnerName: string | null = null
      if (winner) {
        if (winner.is_guest) winnerName = winner.guest_name
        else winnerName = (winner.players as unknown as { name: string } | null)?.name ?? null
      }
      gamesList.push({ id: g.id, name: g.name, winner_name: winnerName })
    }

    // Clasificación con descarte
    const { data: allResults } = seasonGameIds.length > 0
      ? await supabase.from('game_results').select('player_id, total_points, rebuys_count, players(name)').in('game_id', seasonGameIds).eq('is_guest', false)
      : { data: [] }

    const scoresByPlayer: Record<string, { name: string; scores: number[] }> = {}
    for (const r of allResults ?? []) {
      if (!r.player_id) continue
      if (!scoresByPlayer[r.player_id]) scoresByPlayer[r.player_id] = { name: (r.players as unknown as { name: string } | null)?.name ?? '', scores: [] }
      scoresByPlayer[r.player_id].scores.push(Number(r.total_points))
    }

    const playerList = Object.entries(scoresByPlayer).map(([id, v]) => {
      const attended = v.scores.length
      let total: number
      if (discard > 0) {
        const absences = Math.max(0, totalFinishedGames - attended)
        const allScores = [...v.scores, ...Array(absences).fill(0)]
        allScores.sort((a, b) => a - b)
        total = allScores.slice(Math.min(discard, allScores.length)).reduce((s, val) => s + val, 0)
      } else {
        total = v.scores.reduce((s, val) => s + val, 0)
      }
      return {
        id,
        name: v.name,
        total_points: total,
        handicap: attended > 0 ? Math.round((total / attended) * 10) / 10 : 0,
        games_attended: attended,
      }
    }).sort((a, b) => b.total_points - a.total_points)

    setDrawerData({ season, players: playerList, games: gamesList })
    setDrawerLoading(false)
  }

  if (loading) {
    return <div className="flex justify-center mt-16"><Spinner /></div>
  }

  return (
    <div className="p-4 max-w-md mx-auto">
      {/* Salón de la Fama */}
      <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3 mt-4 flex items-center justify-center gap-2">
        <CrownDiamond width={14} className="text-yellow-400" />
        Salón de la Fama
      </h2>
      <div className="mb-8">
        <FameCarousel podiums={podiums} onSelect={openSeasonDrawer} />
      </div>

      <Separator className="mb-6" />

      {/* Records */}
      <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4 text-center">Records históricos</h2>
      {records.length === 0 ? (
        <p className="text-sm text-muted text-center">Sin datos suficientes aún.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {records.map((r) => (
            <Card key={r.label}>
              <Card.Content className="flex flex-col gap-2 py-4 px-3">
                <div className={`${r.color}`}>{r.icon}</div>
                <div>
                  <p className="text-xs text-muted leading-tight">{r.label}</p>
                  {r.sub && <p className="text-sm font-semibold mt-0.5 text-white">{r.sub}</p>}
                </div>
                <span className="text-2xl font-bold text-white">{r.value}</span>
              </Card.Content>
            </Card>
          ))}
        </div>
      )}

      {/* Drawer de temporada */}
      {drawerLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Spinner />
        </div>
      )}
      <SeasonDetailDrawer
        isOpen={drawerOpen && !drawerLoading}
        onClose={() => { setDrawerOpen(false); setDrawerData(null) }}
        data={drawerData}
        groupId={group_id}
      />
    </div>
  )
}
