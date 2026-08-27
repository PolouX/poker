'use client'

import { useEffect, useState } from 'react'
import { Button, Card, Checkbox, Input, Label } from '@heroui/react'
import { FolderPlus, TrashBin } from '@gravity-ui/icons'
import { getSeasonPlayers } from '@/app/actions/seasons'
import { createGame, saveAttendees } from '@/app/actions/games'

interface Props {
  season: { id: string; name: string; config: Record<string, unknown> }
  groupId: string
  onDone: (gameId: string) => void
  onCancel: () => void
}

interface Player { id: string; name: string }

export default function StartGameFlow({ season, groupId, onDone, onCancel }: Props) {
  const [step, setStep] = useState(0)
  const [gameName, setGameName] = useState('')
  const [players, setPlayers] = useState<Player[]>([])
  const [attending, setAttending] = useState<Set<string>>(new Set())
  const [guests, setGuests] = useState<string[]>([])
  const [guestName, setGuestName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const config = season.config as { entry_amount?: number }

  useEffect(() => {
    getSeasonPlayers(season.id).then((sps) => {
      const list = sps.map((sp) => ({
        id: sp.player_id,
        name: (sp.players as unknown as { id: string; name: string } | null)?.name ?? '',
      }))
      setPlayers(list)
      setAttending(new Set(list.map((p) => p.id)))
    })
  }, [season.id])

  function toggleAttend(id: string) {
    setAttending((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function addGuest() {
    if (!guestName.trim()) return
    setGuests((g) => [...g, guestName.trim()])
    setGuestName('')
  }

  function removeGuest(i: number) {
    setGuests((g) => g.filter((_, idx) => idx !== i))
  }

  function handleCreateGame() {
    if (!gameName.trim()) return setError('Asigna un nombre a la jugada.')
    setError('')
    setStep(1)
  }

  async function handleConfirmAttendance() {
    setSaving(true)
    setError('')
    try {
      const game = await createGame(season.id, gameName.trim())
      await saveAttendees(game.id, [...attending], guests)
      onDone(game.id)
    } catch {
      setError('Error al guardar asistencia.')
    } finally {
      setSaving(false)
    }
  }

  const entryAmount = config.entry_amount ?? 0
  const total = (attending.size + guests.length) * entryAmount

  if (step === 0) {
    return (
      <div className="flex flex-col px-4 max-w-md mx-auto fixed inset-x-0 top-[44px] bottom-[60px]">
        {/* Icono central */}
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <FolderPlus className="text-foreground opacity-80" style={{ width: 120, height: 120 }} />
          <h1 className="text-xl font-semibold text-center">Nueva jugada</h1>
        </div>

        {/* Input y botones al fondo */}
        <div className="flex flex-col gap-3 pb-6">
          <div className="flex flex-col gap-1">
            <Label htmlFor="game-name">Nombre de la jugada</Label>
            <Input
              id="game-name"
              placeholder="Ej. Viernes 6 Jun"
              value={gameName}
              onChange={(e) => setGameName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateGame() }}
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button variant="ghost" onPress={onCancel}>Cancelar</Button>
            <Button onPress={handleCreateGame} isPending={saving} isDisabled={saving} className="flex-1">
              Siguiente
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Contenido scrollable */}
      <div className="flex-1 overflow-y-auto p-4 pb-[280px]">
        <div className="mt-4 mb-4 text-center">
          <h1 className="text-2xl font-semibold tracking-tight mb-1">Asistencia</h1>
          <p className="text-xs text-muted">{gameName} — Marca los jugadores presentes esta noche.</p>
        </div>

        {/* Barra de invitados arriba */}
        <div className="flex gap-2 mb-4">
          <Input
            className="flex-1"
            placeholder="Agregar invitado..."
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addGuest() }}
          />
          <Button variant="secondary" onPress={addGuest}>Agregar</Button>
        </div>

        {/* Grid combinado: invitados arriba, luego jugadores */}
        <div className="grid grid-cols-2 gap-2">
          {guests.map((g, i) => (
            <Card key={`guest-${i}`} className="cursor-pointer active:opacity-70 transition-opacity border border-primary" onClick={() => removeGuest(i)}>
              <Card.Content className="flex flex-row items-center gap-2 py-3 px-3">
                <span className="text-sm font-medium leading-tight flex-1">{g}</span>
                <TrashBin className="size-4 text-danger shrink-0" />
              </Card.Content>
            </Card>
          ))}
          {players.map((p) => (
            <Card
              key={p.id}
              className="cursor-pointer active:opacity-70 transition-opacity"
              onClick={() => toggleAttend(p.id)}
            >
              <Card.Content className="flex flex-row items-center gap-2 py-3 px-3">
                <Checkbox isSelected={attending.has(p.id)} onChange={() => toggleAttend(p.id)} aria-label={p.name}>
                  <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
                </Checkbox>
                <span className="text-sm font-medium leading-tight">{p.name}</span>
              </Card.Content>
            </Card>
          ))}
        </div>
      </div>

      {/* Footer fijo */}
      <div className="fixed bottom-[60px] left-0 right-0 bg-background border-t border-border p-4 flex flex-col gap-3 z-40">
        <Card variant="secondary">
          <Card.Content>
            <p className="text-xs text-muted mb-1">Total de entradas</p>
            <p className="text-3xl font-bold">${total}</p>
            <p className="text-xs text-muted mt-1">
              {attending.size} jugadores + {guests.length} invitados × ${entryAmount}
            </p>
          </Card.Content>
        </Card>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex gap-2">
          <Button variant="ghost" onPress={() => setStep(0)}>Atrás</Button>
          <Button onPress={handleConfirmAttendance} isPending={saving} isDisabled={saving} className="flex-1">
            Confirmar y comenzar
          </Button>
        </div>
      </div>
    </div>
  )
}
