'use client'

import { useEffect, useState, use, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, Checkbox, Drawer, ListBox, Modal, Select, Separator, Spinner, Table } from '@heroui/react'
import { CircleXmark, CirclePlus, CircleDollar, TrashBin, Pencil, ChartColumn, ArrowUp, ArrowDown } from '@gravity-ui/icons'
import { supabase } from '@/lib/supabase'
import { advanceBlindLevel, registerElimination, registerAddon, finishGame, getGameState, registerFinalPosition, addRebuyToElimination, removeRebuyFromElimination, discardGame, reorderEliminations } from '@/app/actions/games'

interface Props {
  params: Promise<{ group_id: string; game_id: string }>
}

interface Attendee {
  id: string
  name: string
  is_guest: boolean
  guest_name?: string
}

interface GameConfig {
  points_per_kill?: number
  points_per_attendance?: number
  points_per_rebuy?: number
  points_per_addon?: number
  max_rebuys_per_player?: number
  rebuy_close_level?: number | null
  blind_levels?: Array<{ small: number; big: number; duration: number; ante?: number }>
  ante_start_level?: number
  ante_amount?: number
  entry_amount?: number
  rebuy_amount?: number
  addon_amount?: number
  kill_amount?: number
  reserve_per_game?: number
  points_position_scale?: number[]
  points_position_increment?: number
  points_count_guests?: boolean
  addon_enabled?: boolean
  addon_level?: number
  prize_entries?: Array<{ position: number; type: 'percentage' | 'fixed'; value: number }>
}

interface GameEvent {
  id: string
  type: string
  player_id: string | null
  eliminated_by_player_id: string | null
  guest_name: string | null
  eliminated_by_guest_name: string | null
  position: number | null
  created_at: string
}

function calcPot(cfg: GameConfig, attendees: Attendee[], evts: GameEvent[]): number {
  const entryAmount = cfg.entry_amount ?? 0
  const rebuyAmount = cfg.rebuy_amount ?? 0
  const addonAmount = cfg.addon_amount ?? 0
  const killAmount = cfg.kill_amount ?? 0
  const reservePerGame = cfg.reserve_per_game ?? 0
  const totalEntry = attendees.length * entryAmount
  const totalRebuys = evts.filter((e) => e.type === 'rebuy').length * rebuyAmount
  const totalAddons = evts.filter((e) => e.type === 'addon').length * addonAmount
  // Todas las kills se pagan, no solo las permanentes
  const totalKills = evts.filter((e) => e.type === 'elimination').length
  const totalKillsPaid = totalKills * killAmount
  return Math.max(0, totalEntry + totalRebuys + totalAddons - totalKillsPaid - reservePerGame)
}

function calcPrizeForPosition(position: number, pot: number, prizeEntries: Array<{ position: number; type: 'percentage' | 'fixed'; value: number }>): number {
  const entry = prizeEntries.find((p) => p.position === position)
  if (!entry) return 0
  if (entry.type === 'fixed') return entry.value
  // Para porcentajes: restar todos los premios fijos del bote primero
  const totalFixed = prizeEntries
    .filter((p) => p.type === 'fixed')
    .reduce((s, p) => s + p.value, 0)
  const distributablePot = Math.max(0, pot - totalFixed)
  return Math.round(distributablePot * entry.value / 100)
}

function calcPositionPoints(position: number, totalPlayers: number, scale: number[], increment = 1): number {
  if (scale && scale.length > 0) {
    const idx = position - 1
    if (idx < scale.length) return scale[idx]
    return 0
  }
  const pts = Math.max(0, (totalPlayers - (position - 1)) * increment)
  return pts
}

export default function GamePage({ params }: Props) {
  const { group_id, game_id } = use(params)
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [gameName, setGameName] = useState('')
  const [gameStatus, setGameStatus] = useState('active')
  const [blindLevel, setBlindLevel] = useState(0)
  const [config, setConfig] = useState<GameConfig>({})
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [events, setEvents] = useState<GameEvent[]>([])
  const [activePlayers, setActivePlayers] = useState<Attendee[]>([])
  const [showRebuyModal, setShowRebuyModal] = useState(false)
  const [showDiscardModal, setShowDiscardModal] = useState(false)
  const [showSummaryModal, setShowSummaryModal] = useState(false)
  const [showEditOrderModal, setShowEditOrderModal] = useState(false)
  const [orderDraft, setOrderDraft] = useState<GameEvent[]>([])
  const [headerHeight, setHeaderHeight] = useState(260)
  const [gameStartedAt, setGameStartedAt] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState('00:00')
  const headerRef = useRef<HTMLDivElement>(null)
  const [selectedElim, setSelectedElim] = useState<Attendee | null>(null)
  const [selectedKiller, setSelectedKiller] = useState<Attendee | null>(null)
  const [selectedRebuyPlayer, setSelectedRebuyPlayer] = useState<Attendee | null>(null)
  const [paymentQueue, setPaymentQueue] = useState<Array<{ name: string; kills: number; amount: number; prizeAmount?: number }>>([])
  const [pendingFinish, setPendingFinish] = useState<{ winner: Attendee; allAtt: Attendee[]; allEvts: GameEvent[] } | null>(null)
  const [saving, setSaving] = useState(false)
  const [finished, setFinished] = useState(false)
  const [finalResults, setFinalResults] = useState<Array<{ name: string; position: number; total_points: number }>>([])

  const computeActive = useCallback((allAttendees: Attendee[], allEvents: GameEvent[]) => {
    const rebuyEvts = allEvents.filter((e) => e.type === 'rebuy')
    const elimEvts = allEvents.filter((e) => e.type === 'elimination')
    const active: Attendee[] = []
    for (const att of allAttendees) {
      const matchFn = (e: GameEvent) =>
        att.is_guest ? e.guest_name === att.guest_name : e.player_id === att.id
      const myElims = elimEvts.filter(matchFn)
      if (myElims.length === 0) { active.push(att); continue }
      const myRebuys = rebuyEvts.filter(matchFn)
      if (myRebuys.length >= myElims.length) active.push(att)
    }
    return active
  }, [])

  const load = useCallback(async () => {
    const { events: evts, attendees: atts, game } = await getGameState(game_id)
    if (!game) { setLoading(false); return }

    setGameName(game.name)
    setGameStatus(game.status)
    setBlindLevel(game.current_blind_level)
    if ((game as unknown as { created_at?: string }).created_at) {
      setGameStartedAt((game as unknown as { created_at: string }).created_at)
    }

    const { data: season } = await supabase
      .from('seasons')
      .select('config')
      .eq('id', game.season_id)
      .single()

    const cfg: GameConfig = (season?.config as GameConfig) ?? {}
    setConfig(cfg)

    const allAttendees: Attendee[] = atts.map((a) => ({
      id: a.player_id ?? a.guest_name ?? '',
      name: a.is_guest ? (a.guest_name ?? 'Invitado') : '',
      is_guest: a.is_guest,
      guest_name: a.guest_name ?? undefined,
    }))

    const playerIds = atts.filter((a) => !a.is_guest && a.player_id).map((a) => a.player_id!)
    if (playerIds.length > 0) {
      const { data: playerNames } = await supabase
        .from('players')
        .select('id, name')
        .in('id', playerIds)
      for (const att of allAttendees) {
        if (!att.is_guest) {
          const p = playerNames?.find((p) => p.id === att.id)
          if (p) att.name = p.name
        }
      }
    }

    setAttendees(allAttendees)
    setEvents(evts as GameEvent[])
    setActivePlayers(computeActive(allAttendees, evts as GameEvent[]))
    setLoading(false)
  }, [game_id, computeActive])

  useEffect(() => { load() }, [load])

  // Cuando se vacía la cola de pagos y hay un finish pendiente, ejecutarlo
  useEffect(() => {
    if (!pendingFinish || paymentQueue.length > 0) return
    const { winner, allAtt, allEvts } = pendingFinish
    setPendingFinish(null)
    handleFinishGame(winner, allAtt, allEvts)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFinish, paymentQueue])

  useEffect(() => {
    if (!headerRef.current) return
    const obs = new ResizeObserver(() => {
      if (headerRef.current) setHeaderHeight(headerRef.current.offsetHeight)
    })
    obs.observe(headerRef.current)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!gameStartedAt || finished) return
    const tick = () => {
      const diff = Math.floor((Date.now() - new Date(gameStartedAt).getTime()) / 1000)
      const h = Math.floor(diff / 3600)
      const m = Math.floor((diff % 3600) / 60)
      const s = diff % 60
      const pad = (n: number) => String(n).padStart(2, '0')
      setElapsed(h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`)
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [gameStartedAt, finished])

  const currentBlind = config.blind_levels?.[blindLevel]
  const maxRebuys = config.max_rebuys_per_player ?? 2
  // null/0 = sin cierre: las recompras nunca se cierran por nivel
  const rebuyCloseLevel = config.rebuy_close_level ?? null

  const addonEnabled = config.addon_enabled ?? false
  const addonLevel = config.addon_level ?? 999
  const canAddonByLevel = addonEnabled && blindLevel === addonLevel - 1

  function getPlayerRebuys(att: Attendee) {
    return events.filter((e) =>
      (e.type === 'rebuy' || e.type === 'addon') &&
      (att.is_guest ? e.guest_name === att.guest_name : e.player_id === att.id)
    ).length
  }

  function canPlayerAddon(att: Attendee) {
    return canAddonByLevel && getPlayerRebuys(att) < maxRebuys
  }

  async function handleEliminate() {
    if (!selectedElim) return
    setSaving(true)

    const position = activePlayers.length
    const pid = selectedElim.is_guest ? null : selectedElim.id
    const killerPid = selectedKiller?.is_guest ? null : (selectedKiller?.id ?? null)
    const elimGuestName = selectedElim.is_guest ? selectedElim.name : null
    const killerGuestName = selectedKiller?.is_guest ? selectedKiller.name : null

    await registerElimination(game_id, pid, killerPid, position, false, elimGuestName, killerGuestName)

    // Calcular remaining localmente
    const remaining = activePlayers.filter((p) => p.id !== selectedElim.id)

    setSelectedElim(null)
    setSelectedKiller(null)

    // Actualizar eventos desde BD
    const { events: newEvts } = await getGameState(game_id)
    setEvents(newEvts as GameEvent[])

    // Calcular pago de kills + premio de posición
    {
      const killAmount = config.kill_amount ?? 0
      const evts = newEvts as GameEvent[]

      const myKills = killAmount > 0
        ? evts.filter((e) => e.type === 'elimination' && (
            selectedElim.is_guest
              ? e.eliminated_by_guest_name === selectedElim.name
              : e.eliminated_by_player_id === selectedElim.id
          )).length
        : 0
      const killsAmt = myKills * killAmount

      // Premio por posición del jugador eliminado
      const prizeEntries = config.prize_entries ?? []
      const pot = calcPot(config, attendees, evts)
      const prize = calcPrizeForPosition(position, pot, prizeEntries)

      if (killsAmt > 0 || prize > 0) {
        setPaymentQueue((q) => [...q, {
          name: selectedElim.name,
          kills: myKills,
          amount: killsAmt,
          prizeAmount: prize > 0 ? prize : undefined,
        }])
      }
    }

    if (remaining.length <= 1) {
      const winner = remaining[0] ?? activePlayers.find((p) => p.id !== selectedElim.id) ?? activePlayers[0]
      const evts = newEvts as GameEvent[]
      const elimEvts = evts.filter((e) => e.type === 'elimination')

      // Pago del ganador (posición 1): kills + premio
      {
        const killAmt = config.kill_amount ?? 0
        const winnerKills = killAmt > 0
          ? elimEvts.filter((e) => winner.is_guest
              ? e.eliminated_by_guest_name === winner.name
              : e.eliminated_by_player_id === winner.id
            ).length
          : 0
        const winnerKillsAmt = winnerKills * killAmt

        const prizeEntries = config.prize_entries ?? []
        const pot = calcPot(config, attendees, evts)
        const winnerPrize = calcPrizeForPosition(1, pot, prizeEntries)

        if (winnerKillsAmt > 0 || winnerPrize > 0) {
          setPaymentQueue((q) => [...q, {
            name: winner.name,
            kills: winnerKills,
            amount: winnerKillsAmt,
            prizeAmount: winnerPrize > 0 ? winnerPrize : undefined,
          }])
        }
      }

      setPendingFinish({ winner, allAtt: attendees, allEvts: evts })
    } else {
      setActivePlayers(remaining)
    }

    setSaving(false)
  }

  async function handleFinishGame(winner: Attendee, allAtt: Attendee[], allEvts: GameEvent[]) {
    const elimEvts = allEvts.filter((e) => e.type === 'elimination')
    const rebuyEvts = allEvts.filter((e) => e.type === 'rebuy')
    const cfg = config

    const positionMap: Record<string, number> = {}
    const processedElims: string[] = []

    for (const e of elimEvts) {
      // Usar el mismo identificador unificado que att.id: UUID para oficiales, guest_name para guests
      const key = e.player_id ?? e.guest_name ?? ''
      const rebuysDespues = rebuyEvts.filter((r) => {
        const rKey = r.player_id ?? r.guest_name ?? ''
        return rKey === key && r.created_at > e.created_at
      }).length
      const elimAnteriores = processedElims.filter((p) => p === key).length
      if (rebuysDespues <= elimAnteriores) {
        positionMap[key] = e.position ?? 0
      }
      processedElims.push(key)
    }
    positionMap[winner.id] = 1

    const countGuests = cfg.points_count_guests ?? false
    const totalPlayers = countGuests ? allAtt.length : allAtt.filter((a) => !a.is_guest).length
    const scale = cfg.points_position_scale ?? []
    const increment = cfg.points_position_increment ?? 1
    const pkill = cfg.points_per_kill ?? 1
    const patt = cfg.points_per_attendance ?? 1
    const prebuy = cfg.points_per_rebuy ?? -1

    // Usar att.id como clave unificada (para guests es guest_name, para oficiales es UUID)
    const killsMap: Record<string, number> = {}
    for (const e of elimEvts) {
      const key = e.eliminated_by_player_id ?? e.eliminated_by_guest_name ?? ''
      if (key) killsMap[key] = (killsMap[key] ?? 0) + 1
    }

    const rebuysMap: Record<string, number> = {}
    for (const e of rebuyEvts) {
      const key = e.player_id ?? e.guest_name ?? ''
      if (key) rebuysMap[key] = (rebuysMap[key] ?? 0) + 1
    }

    // Calcular premios por posición
    const prizeEntries = cfg.prize_entries ?? []
    const pot = calcPot(cfg, allAtt, allEvts)

    const results = allAtt.map((att) => {
      const pid = att.is_guest ? null : att.id
      const pos = positionMap[att.id] ?? totalPlayers
      const kills = killsMap[att.id] ?? 0
      const rebuys = rebuysMap[att.id] ?? 0
      const ptPos = calcPositionPoints(pos, totalPlayers, scale, increment)
      const ptKills = kills * pkill
      const ptAtt = (!att.is_guest || countGuests) ? patt : 0
      const ptRebuy = rebuys * prebuy
      const total = ptPos + ptKills + ptAtt + ptRebuy

      const prize = calcPrizeForPosition(pos, pot, prizeEntries)

      return {
        player_id: pid,
        is_guest: att.is_guest,
        guest_name: att.is_guest ? att.name : null,
        position: pos,
        points_position: ptPos,
        points_kills: ptKills,
        points_attendance: ptAtt,
        points_rebuy: ptRebuy,
        points_addon: 0,
        total_points: total,
        kills_count: kills,
        rebuys_count: rebuys,
        prize_amount: prize,
      }
    })

    // Registrar posición #1 del ganador para el narrador
    const winnerPid = winner.is_guest ? null : winner.id
    await registerFinalPosition(game_id, winnerPid, 1)

    await finishGame(game_id, '', results)
    setGameStatus('finished')
    setFinished(true)
    setFinalResults(
      results
        .sort((a, b) => b.total_points - a.total_points)
        .map((r) => ({
          name: r.is_guest ? (r.guest_name ?? 'Invitado') : (allAtt.find((a) => a.id === (r.player_id ?? ''))?.name ?? ''),
          position: r.position,
          total_points: r.total_points,
        }))
    )
  }

  // Devuelve el evento rebuy que "revive" a esta eliminacion, si existe.
  // Empareja en orden cronologico: cada eliminacion consume el primer rebuy
  // libre que ocurre despues de ella. Una eliminacion sin rebuy emparejado
  // es una muerte final.
  function getRebuyForElim(e: GameEvent): GameEvent | null {
    const key = e.player_id ?? e.guest_name ?? ''
    const sameKey = (x: GameEvent) => (x.player_id ?? x.guest_name ?? '') === key
    const mine = events
      .filter((x) => sameKey(x) && (x.type === 'elimination' || x.type === 'rebuy'))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))

    const pendientes: GameEvent[] = []
    const pares = new Map<string, GameEvent>()
    for (const ev of mine) {
      if (ev.type === 'elimination') pendientes.push(ev)
      else {
        const elim = pendientes.shift()
        if (elim) pares.set(elim.id, ev)
      }
    }
    return pares.get(e.id) ?? null
  }

  // El check se muestra segun cupo de recompras, ignorando el nivel de ciegas:
  // corregir un registro pasado no es otorgar una recompra nueva.
  function canToggleRebuy(e: GameEvent): boolean {
    const att = attendees.find((a) =>
      e.guest_name ? a.guest_name === e.guest_name : a.id === e.player_id
    )
    if (!att) return false
    if (getRebuyForElim(e)) return true
    return getPlayerRebuys(att) < maxRebuys
  }

  async function handleToggleElimRebuy(e: GameEvent) {
    setSaving(true)
    try {
      if (getRebuyForElim(e)) {
        // Al quitar la recompra el jugador vuelve a estar eliminado:
        // recuperar la posicion que le toca segun cuantos siguen vivos.
        await removeRebuyFromElimination(e.id, activePlayers.length)
      } else {
        await addRebuyToElimination(e.id)
      }
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function handleDiscardGame() {
    setSaving(true)
    try {
      await discardGame(game_id)
      router.push(`/${group_id}/admin`)
    } catch {
      setSaving(false)
      setShowDiscardModal(false)
    }
  }

  // Resumen en vivo de la jugada actual: posicion provisional, kills y puntos.
  // Misma formula que handleFinishGame, pero sin cerrar la jugada.
  function buildLiveSummary() {
    const elimEvts = events.filter((e) => e.type === 'elimination')
    const rebuyEvts = events.filter((e) => e.type === 'rebuy')

    // Posicion definitiva solo de quienes no revivieron
    const positionMap: Record<string, number> = {}
    const processed: string[] = []
    for (const e of elimEvts) {
      const key = e.player_id ?? e.guest_name ?? ''
      const rebuysDespues = rebuyEvts.filter((r) => {
        const rKey = r.player_id ?? r.guest_name ?? ''
        return rKey === key && r.created_at > e.created_at
      }).length
      const elimAnteriores = processed.filter((x) => x === key).length
      if (rebuysDespues <= elimAnteriores) positionMap[key] = e.position ?? 0
      processed.push(key)
    }

    const countGuests = config.points_count_guests ?? false
    const totalPlayers = countGuests ? attendees.length : attendees.filter((a) => !a.is_guest).length
    const scale = config.points_position_scale ?? []
    const increment = config.points_position_increment ?? 1
    const pkill = config.points_per_kill ?? 1
    const patt = config.points_per_attendance ?? 1
    const prebuy = config.points_per_rebuy ?? -1

    const killsMap: Record<string, number> = {}
    for (const e of elimEvts) {
      const key = e.eliminated_by_player_id ?? e.eliminated_by_guest_name ?? ''
      if (key) killsMap[key] = (killsMap[key] ?? 0) + 1
    }
    const rebuysMap: Record<string, number> = {}
    for (const e of rebuyEvts) {
      const key = e.player_id ?? e.guest_name ?? ''
      if (key) rebuysMap[key] = (rebuysMap[key] ?? 0) + 1
    }

    const sigueVivo = (att: Attendee) => activePlayers.some((p) => p.id === att.id)

    return attendees
      .map((att) => {
        const vivo = sigueVivo(att)
        // Los que siguen jugando aun no tienen posicion: se estima la mejor posible
        const pos = vivo ? activePlayers.length : (positionMap[att.id] ?? totalPlayers)
        const kills = killsMap[att.id] ?? 0
        const rebuys = rebuysMap[att.id] ?? 0
        const ptPos = calcPositionPoints(pos, totalPlayers, scale, increment)
        const ptKills = kills * pkill
        const ptAtt = (!att.is_guest || countGuests) ? patt : 0
        const ptRebuy = rebuys * prebuy
        return {
          id: att.id,
          name: att.name,
          vivo,
          position: pos,
          kills,
          rebuys,
          total: ptPos + ptKills + ptAtt + ptRebuy,
        }
      })
      .sort((a, b) => {
        if (a.vivo !== b.vivo) return a.vivo ? -1 : 1
        return a.vivo ? b.total - a.total : a.position - b.position
      })
  }

  // Abre el editor con las salidas definitivas (las revividas no tienen posicion)
  function openEditOrder() {
    const salidas = events
      .filter((e) => e.type === 'elimination' && e.position != null && !getRebuyForElim(e))
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    setOrderDraft(salidas)
    setShowEditOrderModal(true)
  }

  function moveInDraft(idx: number, dir: -1 | 1) {
    const target = idx + dir
    if (target < 0 || target >= orderDraft.length) return
    const next = [...orderDraft]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setOrderDraft(next)
  }

  async function handleSaveOrder() {
    setSaving(true)
    try {
      // Las posiciones disponibles son las mismas, reasignadas segun el nuevo orden
      const posiciones = orderDraft
        .map((e) => e.position ?? 0)
        .sort((a, b) => a - b)
      await reorderEliminations(
        orderDraft.map((e, i) => ({ eventId: e.id, position: posiciones[i] }))
      )
      setShowEditOrderModal(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function handleVoluntaryRebuy() {
    if (!selectedRebuyPlayer) return
    setSaving(true)
    const pid = selectedRebuyPlayer.is_guest ? null : selectedRebuyPlayer.id
    await registerAddon(game_id, pid)
    setShowRebuyModal(false)
    setSelectedRebuyPlayer(null)
    await load()
    setSaving(false)
  }

  if (loading) return <div className="flex justify-center mt-16"><Spinner /></div>

  if (finished) {
    return (
      <div className="p-4 max-w-md mx-auto">
        <div className="mt-4 mb-4 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Jugada finalizada</h1>
          <p className="text-sm text-muted mt-1">{gameName}</p>
        </div>

        <Card className="mb-6 overflow-hidden p-0">
          <Table>
            <Table.ScrollContainer>
              <Table.Content aria-label="Resultados finales">
                <Table.Header>
                  <Table.Column isRowHeader className="w-8">#</Table.Column>
                  <Table.Column>Jugador</Table.Column>
                  <Table.Column className="text-right">Pts</Table.Column>
                </Table.Header>
                <Table.Body>
                  {finalResults.map((r) => (
                    <Table.Row key={r.position}>
                      <Table.Cell className="text-muted font-mono text-sm">{r.position}</Table.Cell>
                      <Table.Cell className="font-medium">{r.name}</Table.Cell>
                      <Table.Cell className="text-right font-semibold">{r.total_points}</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        </Card>

        <Button onPress={() => router.push(`/${group_id}/admin`)} className="w-full" size="lg">
          Volver al panel
        </Button>
      </div>
    )
  }

  const blindLevels = config.blind_levels ?? []
  const prevBlind = blindLevel > 0 ? blindLevels[blindLevel - 1] : null
  const nextBlind = blindLevel + 1 < blindLevels.length ? blindLevels[blindLevel + 1] : null

  return (
    <>
    {/* Layout fijo: header + carrusel + recompra */}
    <div ref={headerRef} className="fixed top-[44px] left-0 right-0 z-30 bg-background">
      <div className="px-4 pt-3 pb-2 max-w-md mx-auto">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-mono text-muted w-16">{elapsed}</span>
          <h1 className="text-xl font-semibold tracking-tight">{gameName}</h1>
          <div className="w-16 flex justify-end">
            <button
              onClick={() => setShowDiscardModal(true)}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-[var(--surface-secondary)] text-danger active:opacity-60 transition-opacity"
              aria-label="Descartar jugada"
            >
              <TrashBin width={18} />
            </button>
          </div>
        </div>

      {/* Carrusel de niveles de ciegas */}
      {(() => {
        // Construir secuencia virtual de slots: niveles de ciegas + slot "Sin recompras" + slot "Add-on"
        // Cada slot: { type: 'blind' | 'no_rebuy' | 'addon', index: number (para blinds) }
        type Slot =
          | { type: 'blind'; idx: number }
          | { type: 'no_rebuy' }
          | { type: 'addon' }

        const slots: Slot[] = []
        const levels = config.blind_levels ?? []
        const addonLevel = config.addon_level ?? 999
        const addonEnabled = config.addon_enabled ?? false

        for (let i = 0; i < levels.length; i++) {
          slots.push({ type: 'blind', idx: i })
          // Insertar "Sin recompras" justo después del último nivel con recompras
          if (rebuyCloseLevel && i === rebuyCloseLevel - 1 && rebuyCloseLevel < levels.length) {
            slots.push({ type: 'no_rebuy' })
          }
          // Insertar "Add-on" después del nivel configurado
          if (addonEnabled && i === addonLevel - 1) {
            slots.push({ type: 'addon' })
          }
        }

        // Posición actual en la secuencia virtual
        const currentSlotIdx = slots.findIndex(
          (s) => s.type === 'blind' && s.idx === blindLevel
        )

        const prevSlot = currentSlotIdx > 0 ? slots[currentSlotIdx - 1] : null
        const nextSlot = currentSlotIdx < slots.length - 1 ? slots[currentSlotIdx + 1] : null

        // Navegar a un slot: si es blind lo activa, si es especial busca el blind más cercano en esa dirección
        function navigateToSlot(slotIdx: number, direction: 'prev' | 'next') {
          const slot = slots[slotIdx]
          if (slot.type === 'blind') {
            advanceBlindLevel(game_id, slot.idx)
            setBlindLevel(slot.idx)
            return
          }
          // Para slots especiales buscar el blind más cercano en la misma dirección de navegación
          const step = direction === 'prev' ? -1 : 1
          for (let i = slotIdx + step; i >= 0 && i < slots.length; i += step) {
            const s = slots[i]
            if (s.type === 'blind') {
              advanceBlindLevel(game_id, s.idx)
              setBlindLevel(s.idx)
              return
            }
          }
        }

        function renderSideCard(slot: Slot, slotIdx: number, direction: 'prev' | 'next') {
          if (slot.type === 'blind') {
            const b = levels[slot.idx]
            return (
              <Card
                variant="secondary"
                className="opacity-50 cursor-pointer active:opacity-30 transition-opacity"
                onClick={() => navigateToSlot(slotIdx, direction)}
              >
                <Card.Content className="py-3 flex flex-col items-center gap-0.5">
                  <p className="text-xs text-muted">Nivel {slot.idx + 1}</p>
                  <p className="text-lg font-bold">{b.small}/{b.big}</p>
                  {slot.idx >= (config.ante_start_level ?? 999) && (
                    <p className="text-xs text-muted">A:{config.ante_amount ?? 0}</p>
                  )}
                </Card.Content>
              </Card>
            )
          }
          if (slot.type === 'no_rebuy') {
            return (
              <Card
                variant="secondary"
                className="opacity-50 cursor-pointer active:opacity-30 transition-opacity"
                onClick={() => navigateToSlot(slotIdx, direction)}
              >
                <Card.Content className="py-3 flex flex-col items-center gap-0.5">
                  <CircleXmark className="text-danger" width={16} />
                  <p className="text-xs font-medium text-muted text-center leading-tight mt-0.5">Sin<br/>recompras</p>
                </Card.Content>
              </Card>
            )
          }
          if (slot.type === 'addon') {
            return (
              <Card
                variant="secondary"
                className="opacity-50 cursor-pointer active:opacity-30 transition-opacity"
                onClick={() => navigateToSlot(slotIdx, direction)}
              >
                <Card.Content className="py-3 flex flex-col items-center gap-0.5">
                  <CirclePlus className="text-success" width={16} />
                  <p className="text-xs font-medium text-muted text-center leading-tight mt-0.5">Add-on</p>
                </Card.Content>
              </Card>
            )
          }
          return null
        }

        return (
          <div className="flex items-center gap-2 mb-2">
            {/* Anterior */}
            <div className="flex-1">
              {prevSlot ? renderSideCard(prevSlot, currentSlotIdx - 1, 'prev') : <div />}
            </div>

            {/* Actual */}
            <div className="flex-[1.6]">
              <Card className="bg-[var(--accent)] border-0 shadow-none">
                <Card.Content className="py-5 flex flex-col items-center gap-1">
                  <p className="text-xs font-medium text-white/70">Nivel {blindLevel + 1}</p>
                  {currentBlind ? (
                    <>
                      <p className="text-3xl font-bold text-white tracking-tight">
                        {currentBlind.small}/{currentBlind.big}
                      </p>
                      {blindLevel >= (config.ante_start_level ?? 999) && (
                        <p className="text-sm text-white/70">Ante: {config.ante_amount ?? 0}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-white/70">Sin niveles</p>
                  )}
                </Card.Content>
              </Card>
            </div>

            {/* Siguiente */}
            <div className="flex-1">
              {nextSlot ? renderSideCard(nextSlot, currentSlotIdx + 1, 'next') : <div />}
            </div>
          </div>
        )
      })()}

      </div>{/* fin zona fija */}
    </div>{/* fin fixed */}

    {/* Zona scrolleable: tabla de actividad */}
    <div className="max-w-md mx-auto px-4 pb-[130px]" style={{ paddingTop: headerHeight - 12 }}>
      {/* Acciones de la jugada: add-on · editar orden · resumen */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex gap-1.5">
          {addonEnabled && (
            <button
              onClick={() => setShowRebuyModal(true)}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-[var(--surface-secondary)] active:opacity-60 transition-opacity"
              aria-label="Add-on"
            >
              <CircleDollar width={18} />
            </button>
          )}
          <button
            onClick={openEditOrder}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-[var(--surface-secondary)] active:opacity-60 transition-opacity"
            aria-label="Editar orden de salidas"
          >
            <Pencil width={18} />
          </button>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setShowSummaryModal(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-[var(--surface-secondary)] active:opacity-60 transition-opacity"
            aria-label="Resumen de la jugada"
          >
            <ChartColumn width={18} />
          </button>
        </div>
      </div>
      {(() => {
        const filtered = events.filter((e) => e.type === 'elimination')
        if (filtered.length === 0) return (
          <p className="text-sm text-muted text-center py-8">La partida acaba de comenzar...</p>
        )
        return (
          <Card className="overflow-hidden p-0">
            <Table>
              <Table.ScrollContainer>
                <Table.Content aria-label="Actividad de la partida">
                  <Table.Header>
                    <Table.Column isRowHeader>Jugador</Table.Column>
                    <Table.Column>Sale por</Table.Column>
                    <Table.Column className="text-center">Recompra</Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {[...filtered].reverse().map((e) => {
                      const playerName = e.guest_name
                        ?? attendees.find((a) => a.id === e.player_id)?.name
                        ?? '?'
                      const killerName = e.eliminated_by_guest_name
                        ?? (e.eliminated_by_player_id
                          ? attendees.find((a) => a.id === e.eliminated_by_player_id)?.name
                          : undefined)
                      const hasRebuy = !!getRebuyForElim(e)
                      const canToggle = canToggleRebuy(e)
                      return (
                        <Table.Row key={e.id}>
                          <Table.Cell>
                            <div className="flex flex-col">
                              <span className="text-sm font-medium leading-tight">{playerName}</span>
                              <span className="text-xs text-muted">
                                {new Date(e.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </Table.Cell>
                          <Table.Cell>
                            <span className="text-sm">{killerName ?? '—'}</span>
                          </Table.Cell>
                          <Table.Cell>
                            <div className="flex justify-center">
                            {canToggle ? (
                              <Checkbox
                                isSelected={hasRebuy}
                                isDisabled={saving}
                                onChange={() => handleToggleElimRebuy(e)}
                                aria-label={`Recompra de ${playerName}`}
                              >
                                <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
                              </Checkbox>
                            ) : (
                              <span className="text-xs text-muted">—</span>
                            )}
                            </div>
                          </Table.Cell>
                        </Table.Row>
                      )
                    })}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          </Card>
        )
      })()}
    </div>

    {/* Modal: Resumen de la jugada en curso */}
    <Modal.Backdrop isOpen={showSummaryModal} onOpenChange={setShowSummaryModal}>
      <Modal.Container>
        <Modal.Dialog className="max-h-[85vh] flex flex-col">
          <Modal.Header>
            <Modal.Heading>Resumen de la jugada</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="overflow-y-auto">
            {(() => {
              const filas = buildLiveSummary()
              if (filas.length === 0) return <p className="text-sm text-muted py-2">Sin datos todavía.</p>
              return (
                <Card className="overflow-hidden p-0">
                  <Table>
                    <Table.ScrollContainer>
                      <Table.Content aria-label="Resumen de la jugada">
                        <Table.Header>
                          <Table.Column isRowHeader>Jugador</Table.Column>
                          <Table.Column className="text-center">Pos</Table.Column>
                          <Table.Column className="text-center">Kills</Table.Column>
                          <Table.Column className="text-right">Pts</Table.Column>
                        </Table.Header>
                        <Table.Body>
                          {filas.map((r) => (
                            <Table.Row key={r.id}>
                              <Table.Cell>
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium leading-tight">{r.name}</span>
                                  <span className={`text-xs ${r.vivo ? 'text-accent' : 'text-muted'}`}>
                                    {r.vivo ? 'Jugando' : 'Eliminado'}
                                    {r.rebuys > 0 ? ` · ${r.rebuys} rec.` : ''}
                                  </span>
                                </div>
                              </Table.Cell>
                              <Table.Cell className="text-center font-mono text-sm">
                                {r.vivo ? '—' : r.position}
                              </Table.Cell>
                              <Table.Cell className="text-center font-mono text-sm">{r.kills}</Table.Cell>
                              <Table.Cell className="text-right font-semibold">{r.total}</Table.Cell>
                            </Table.Row>
                          ))}
                        </Table.Body>
                      </Table.Content>
                    </Table.ScrollContainer>
                  </Table>
                </Card>
              )
            })()}
            <p className="text-xs text-muted mt-3">
              Los jugadores en mesa aún no tienen posición definitiva: sus puntos son provisionales.
            </p>
          </Modal.Body>
          <Modal.Footer>
            <Button onPress={() => setShowSummaryModal(false)} className="flex-1">Cerrar</Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>

    {/* Modal: Editar orden de salidas */}
    <Modal.Backdrop isOpen={showEditOrderModal} onOpenChange={setShowEditOrderModal}>
      <Modal.Container>
        <Modal.Dialog className="max-h-[85vh] flex flex-col">
          <Modal.Header>
            <Modal.Heading>Editar orden de salidas</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="overflow-y-auto">
            {orderDraft.length === 0 ? (
              <p className="text-sm text-muted py-2">Todavía no hay salidas registradas.</p>
            ) : (
              <>
                <p className="text-xs text-muted mb-3">
                  El primero de la lista es quien salió antes (peor posición).
                </p>
                <div className="flex flex-col gap-2">
                  {orderDraft.map((e, i) => {
                    const nombre = e.guest_name
                      ?? attendees.find((a) => a.id === e.player_id)?.name
                      ?? '?'
                    const posiciones = orderDraft.map((x) => x.position ?? 0).sort((a, b) => a - b)
                    return (
                      <div key={e.id} className="flex items-center gap-2">
                        <span className="text-sm font-mono text-muted w-7 shrink-0">#{posiciones[i]}</span>
                        <span className="text-sm flex-1 truncate">{nombre}</span>
                        <button
                          onClick={() => moveInDraft(i, -1)}
                          disabled={i === 0}
                          className="w-8 h-8 rounded-full flex items-center justify-center bg-[var(--surface-secondary)] disabled:opacity-30 active:opacity-60"
                          aria-label={`Subir a ${nombre}`}
                        >
                          <ArrowUp width={16} />
                        </button>
                        <button
                          onClick={() => moveInDraft(i, 1)}
                          disabled={i === orderDraft.length - 1}
                          className="w-8 h-8 rounded-full flex items-center justify-center bg-[var(--surface-secondary)] disabled:opacity-30 active:opacity-60"
                          aria-label={`Bajar a ${nombre}`}
                        >
                          <ArrowDown width={16} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="ghost" onPress={() => setShowEditOrderModal(false)} isDisabled={saving}>
              Cancelar
            </Button>
            <Button
              onPress={handleSaveOrder}
              isDisabled={saving || orderDraft.length === 0}
              isPending={saving}
              className="flex-1"
            >
              Guardar orden
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>

    {/* Modal: Confirmar descarte de la jugada */}
    <Modal.Backdrop isOpen={showDiscardModal} onOpenChange={setShowDiscardModal}>
      <Modal.Container>
        <Modal.Dialog>
          <Modal.Header>
            <Modal.Heading>¿Descartar esta jugada?</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <p className="text-sm text-muted">
              La jugada <span className="font-medium text-white">{gameName}</span> se invalida:
              no suma puntos ni aparece en el historial, y se borran las eliminaciones y
              recompras registradas. Podrás iniciar una jugada nueva.
            </p>
            <p className="text-sm text-danger mt-2">Esta acción no se puede deshacer.</p>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="ghost" onPress={() => setShowDiscardModal(false)} isDisabled={saving}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onPress={handleDiscardGame}
              isDisabled={saving}
              isPending={saving}
              className="flex-1"
            >
              Sí, descartar
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>

    {/* Modal: Cola de pagos pendientes */}
    <Modal.Backdrop isOpen={paymentQueue.length > 0} onOpenChange={() => {}}>
      <Modal.Container>
        <Modal.Dialog>
          <Modal.Header>
            <Modal.Heading>Pago pendiente</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            {paymentQueue[0] && (() => {
              const p = paymentQueue[0]
              const total = p.amount + (p.prizeAmount ?? 0)
              return (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-muted">Se debe pagar a:</p>
                  <p className="text-xl font-semibold">{p.name}</p>
                  <p className="text-3xl font-bold">${total}</p>
                  {p.kills > 0 && (
                    <p className="text-xs text-muted">{p.kills} kill{p.kills > 1 ? 's' : ''} × ${p.amount / p.kills} = <span className="text-foreground">${p.amount}</span></p>
                  )}
                  {(p.prizeAmount ?? 0) > 0 && (
                    <p className="text-xs text-muted">Premio posición: <span className="text-foreground">${p.prizeAmount}</span></p>
                  )}
                  {paymentQueue.length > 1 && (
                    <p className="text-xs text-muted mt-1">+{paymentQueue.length - 1} pago{paymentQueue.length > 2 ? 's' : ''} más pendiente{paymentQueue.length > 2 ? 's' : ''}</p>
                  )}
                </div>
              )
            })()}
          </Modal.Body>
          <Modal.Footer>
            <Button className="flex-1" onPress={() => setPaymentQueue((q) => q.slice(1))}>
              Marcar como pagado
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>

    {/* Drawer: Recompra / Add-on */}
    <Drawer.Backdrop
      isOpen={showRebuyModal}
      onOpenChange={(open) => { setShowRebuyModal(open); if (!open) setSelectedRebuyPlayer(null) }}
      variant="blur"
    >
      <Drawer.Content placement="bottom">
        <Drawer.Dialog className="max-h-[80vh] flex flex-col">
          <Drawer.Handle />
          <Drawer.Header>
            <Drawer.Heading>Add-on</Drawer.Heading>
          </Drawer.Header>
          <Drawer.Body className="overflow-y-auto">
            {(() => {
              const list = attendees.filter((p) => canPlayerAddon(p))
              if (list.length === 0) return (
                <p className="text-sm text-muted py-2">Ningún jugador puede hacer add-on ahora.</p>
              )
              return (
                <div className="grid grid-cols-2 gap-2">
                  {list.map((p) => (
                    <Card
                      key={p.id}
                      className={`cursor-pointer transition-all bg-[var(--surface-secondary)] ${
                        selectedRebuyPlayer?.id === p.id ? 'ring-[3px] ring-inset ring-[var(--accent)]' : ''
                      }`}
                      onClick={() => setSelectedRebuyPlayer(p)}
                    >
                      <Card.Content className="flex flex-col gap-1 py-3 px-3">
                        <span className="text-sm font-medium leading-tight">{p.name}</span>
                        <span className="text-xs text-muted">{getPlayerRebuys(p)}/{maxRebuys} usadas</span>
                      </Card.Content>
                    </Card>
                  ))}
                </div>
              )
            })()}
          </Drawer.Body>
          <Drawer.Footer>
            <Button
              variant="ghost"
              onPress={() => { setShowRebuyModal(false); setSelectedRebuyPlayer(null) }}
            >
              Cancelar
            </Button>
            <Button
              onPress={handleVoluntaryRebuy}
              isDisabled={!selectedRebuyPlayer || saving}
              isPending={saving}
              className="flex-1"
            >
              Confirmar add-on
            </Button>
          </Drawer.Footer>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>

    {/* Barra inferior de eliminación */}
    <div className="fixed bottom-[64px] left-0 right-0 bg-background z-40">
      <Separator />
      <div className="flex flex-col gap-2 p-3 max-w-md mx-auto">
        <div className="flex gap-2">
          <Select
            fullWidth
            placeholder="Sale..."
            value={selectedElim?.id ?? null}
            onChange={(key) => {
              const p = activePlayers.find((p) => p.id === String(key)) ?? null
              setSelectedElim(p)
              setSelectedKiller(null)
            }}
          >
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover placement="top">
              <ListBox>
                {activePlayers.map((p) => (
                  <ListBox.Item key={p.id} id={p.id} textValue={p.name}>
                    {p.name}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>

          <Select
            fullWidth
            placeholder="Killer..."
            value={selectedKiller?.id ?? null}
            onChange={(key) => {
              const p = activePlayers.find((p) => p.id === String(key)) ?? null
              setSelectedKiller(p)
            }}
          >
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover placement="top">
              <ListBox>
                {activePlayers
                  .filter((p) => p.id !== selectedElim?.id)
                  .map((p) => (
                    <ListBox.Item key={p.id} id={p.id} textValue={p.name}>
                      {p.name}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </div>

        <Button
          onPress={handleEliminate}
          isDisabled={!selectedElim || saving}
          isPending={saving}
          variant="danger"
          className="w-full"
          size="lg"
        >
          Confirmar salida
        </Button>
      </div>
    </div>
    </>
  )
}
