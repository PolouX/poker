'use client'

import { useEffect, useRef, useState } from 'react'
import { Button, Card, Checkbox, Input, Label, Separator, Switch } from '@heroui/react'
import { Pencil, TrashBin } from '@gravity-ui/icons'

import { getGroupPlayers, addPlayer, updatePlayerName, createSeason, type SeasonConfig } from '@/app/actions/seasons'

interface Props {
  groupId: string
  onDone: () => void
  onCancel: () => void
}

interface Player { id: string; name: string }

const DEFAULT_CONFIG: SeasonConfig = {
  points_per_kill: 1,
  points_per_attendance: 1,
  points_per_rebuy: -1,
  points_per_addon: 0,
  points_position_scale: [],
  points_position_increment: 1,
  points_count_guests: false,
  worst_results_to_discard: 0,
  entry_amount: 100,
  rebuy_amount: 100,
  addon_enabled: false,
  addon_amount: 100,
  kill_amount: 0,
  max_rebuys_per_player: 2,
  prize_type: 'percentage',
  prize_structure: [50, 30, 20],
  prize_entries: [
    { position: 1, type: 'percentage', value: 50 },
    { position: 2, type: 'percentage', value: 30 },
    { position: 3, type: 'percentage', value: 20 },
  ],
  reserve_per_game: 0,
  blind_levels: [
    { small: 25, big: 50, duration: 20 },
    { small: 50, big: 100, duration: 20 },
    { small: 75, big: 150, duration: 20 },
    { small: 100, big: 200, duration: 20 },
    { small: 150, big: 300, duration: 20 },
    { small: 200, big: 400, duration: 20 },
  ],
  rebuy_close_level: 3,
  addon_level: 3,
  ante_start_level: 4,
  ante_amount: 25,
}

const STEPS = ['Jugadores', 'Puntos', 'Montos', 'Ciegas']

export default function StartSeasonForm({ groupId, onDone, onCancel }: Props) {
  const [step, setStep] = useState(0)
  const [players, setPlayers] = useState<Player[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [newPlayerName, setNewPlayerName] = useState('')
  const [seasonName, setSeasonName] = useState('')
  const [config, setConfig] = useState<SeasonConfig>(DEFAULT_CONFIG)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [activeBlindIdx, setActiveBlindIdx] = useState(0)
  const [anteEnabled, setAnteEnabled] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getGroupPlayers(groupId).then(setPlayers)
  }, [groupId])

  useEffect(() => {
    if (editingId && editInputRef.current) editInputRef.current.focus()
  }, [editingId])

  function togglePlayer(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleAddPlayer() {
    if (!newPlayerName.trim()) return
    const p = await addPlayer(groupId, newPlayerName.trim())
    setPlayers((prev) => [...prev, p])
    setSelected((prev) => new Set([...prev, p.id]))
    setNewPlayerName('')
  }

  async function handleSaveEdit(id: string) {
    if (!editingName.trim()) { setEditingId(null); return }
    try {
      await updatePlayerName(id, editingName.trim())
      setPlayers((prev) => prev.map((p) => p.id === id ? { ...p, name: editingName.trim() } : p))
    } finally {
      setEditingId(null)
    }
  }

  async function handleCreate() {
    if (!seasonName.trim()) return setError('Asigna un nombre a la temporada.')
    if (selected.size === 0) return setError('Selecciona al menos un jugador.')
    setSaving(true)
    setError('')
    try {
      await createSeason(groupId, seasonName.trim(), [...selected], config)
      onDone()
    } catch {
      setError('Error al crear la temporada.')
    } finally {
      setSaving(false)
    }
  }

  function setNum(field: keyof SeasonConfig, val: string) {
    setConfig((c) => ({ ...c, [field]: Number(val) }))
  }

  return (
    <div className="flex flex-col max-w-md mx-auto fixed inset-x-0 top-[44px] bottom-[60px]">
      {/* Header con steps */}
      <div className="px-4 pt-3 pb-3">
        <h1 className="text-2xl font-semibold tracking-tight mb-4 text-center">Nueva temporada</h1>
        <div className="flex gap-1">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`flex-1 h-1 rounded-full transition-colors ${
                i < step ? 'bg-[var(--accent)]' : 'bg-muted/30'
              }`}
            />
          ))}
        </div>
        <p className="text-xs text-muted mt-2">{STEPS[step]}</p>
      </div>

      {/* Contenido scrollable */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">

        {step === 0 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="season-name">Nombre de la temporada</Label>
              <Input
                id="season-name"
                value={seasonName}
                onChange={(e) => setSeasonName(e.target.value)}
                placeholder="Ej. Temporada 2026"
              />
            </div>

            <Separator />

            <p className="text-sm font-medium">Jugadores participantes</p>

            {/* Input agregar jugador arriba del grid */}
            <div className="flex gap-2">
              <Input
                className="flex-1"
                placeholder="Nuevo jugador..."
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddPlayer() }}
              />
              <Button variant="secondary" onPress={handleAddPlayer}>Agregar</Button>
            </div>

            {/* Grid 2 columnas */}
            <div className="grid grid-cols-2 gap-2">
              {players.map((p) => (
                <Card
                  key={p.id}
                  className="cursor-pointer active:opacity-70 transition-opacity"
                  onClick={() => { if (editingId !== p.id) togglePlayer(p.id) }}
                >
                  <Card.Content className="flex flex-row items-center gap-2 py-3 px-3">
                    <Checkbox
                      isSelected={selected.has(p.id)}
                      onChange={() => togglePlayer(p.id)}
                      aria-label={p.name}
                    >
                      <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
                    </Checkbox>
                    {editingId === p.id ? (
                      <input
                        ref={editInputRef}
                        className="flex-1 bg-transparent text-sm font-medium outline-none border-b border-[var(--accent)] min-w-0"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => handleSaveEdit(p.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(p.id) }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="flex-1 text-sm font-medium leading-tight truncate">{p.name}</span>
                    )}
                    <button
                      className="shrink-0 p-0.5"
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingId(p.id)
                        setEditingName(p.name)
                      }}
                      aria-label="Editar nombre"
                    >
                      <Pencil className="size-3.5 text-[var(--accent)]" />
                    </button>
                  </Card.Content>
                </Card>
              ))}
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-5">
            {/* Controles +/− para puntos */}
            {([
              { label: 'Puntos por kill', field: 'points_per_kill' as keyof SeasonConfig, min: 0 },
              { label: 'Puntos por asistencia', field: 'points_per_attendance' as keyof SeasonConfig, min: 0 },
              { label: 'Puntos por recompra', field: 'points_per_rebuy' as keyof SeasonConfig, min: -10 },
              { label: 'Puntos por add-on', field: 'points_per_addon' as keyof SeasonConfig, min: -10 },
            ] as { label: string; field: keyof SeasonConfig; min: number }[]).map(({ label, field, min }) => (
              <div key={field} className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium flex-1">{label}</span>
                <div className="flex items-center gap-3">
                  <button
                    className="w-8 h-8 rounded-full bg-[var(--surface-secondary)] flex items-center justify-center text-lg font-bold active:opacity-60 transition-opacity"
                    onClick={() => setConfig((c) => ({ ...c, [field]: Math.max(min, (c[field] as number) - 1) }))}
                    type="button"
                  >−</button>
                  <span className="w-6 text-center text-sm font-semibold tabular-nums">{String(config[field])}</span>
                  <button
                    className="w-8 h-8 rounded-full bg-[var(--surface-secondary)] flex items-center justify-center text-lg font-bold active:opacity-60 transition-opacity"
                    onClick={() => setConfig((c) => ({ ...c, [field]: (c[field] as number) + 1 }))}
                    type="button"
                  >+</button>
                </div>
              </div>
            ))}

            <Separator />

            {/* Puntos por posición */}
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium">Puntos por posición</p>
              <p className="text-xs text-muted leading-relaxed">
                El ganador recibe <span className="text-foreground font-medium">N × incremento</span> puntos, donde N es el total de jugadores (o solo no-invitados). Cada lugar anterior recibe uno menos.
              </p>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm flex-1">Incremento por posición</span>
                <div className="flex items-center gap-3">
                  <button
                    className="w-8 h-8 rounded-full bg-[var(--surface-secondary)] flex items-center justify-center text-lg font-bold active:opacity-60 transition-opacity"
                    onClick={() => setConfig((c) => ({ ...c, points_position_increment: Math.max(1, (c.points_position_increment ?? 1) - 1) }))}
                    type="button"
                  >−</button>
                  <span className="w-6 text-center text-sm font-semibold tabular-nums">{config.points_position_increment ?? 1}</span>
                  <button
                    className="w-8 h-8 rounded-full bg-[var(--surface-secondary)] flex items-center justify-center text-lg font-bold active:opacity-60 transition-opacity"
                    onClick={() => setConfig((c) => ({ ...c, points_position_increment: (c.points_position_increment ?? 1) + 1 }))}
                    type="button"
                  >+</button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm">Contar invitados</span>
                  <span className="text-xs text-muted">Incluye invitados en el total de jugadores</span>
                </div>
                <Switch
                  isSelected={config.points_count_guests}
                  onChange={(v) => setConfig((c) => ({ ...c, points_count_guests: v }))}
                  aria-label="Contar invitados"
                >
                  <Switch.Control><Switch.Thumb /></Switch.Control>
                </Switch>
              </div>
            </div>

            <Separator />

            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium">Descarte de peores resultados</p>
              <p className="text-xs text-muted leading-relaxed">
                Al final de la temporada se descartan los <span className="text-foreground font-medium">N peores resultados</span> de cada jugador (incluye jugadas a las que no asistio). Si se pone 0, cuentan todos.
              </p>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm flex-1">Resultados a descartar</span>
                <div className="flex items-center gap-3">
                  <button
                    className="w-8 h-8 rounded-full bg-[var(--surface-secondary)] flex items-center justify-center text-lg font-bold active:opacity-60 transition-opacity"
                    onClick={() => setConfig((c) => ({ ...c, worst_results_to_discard: Math.max(0, (c.worst_results_to_discard ?? 0) - 1) }))}
                    type="button"
                  >−</button>
                  <span className="w-6 text-center text-sm font-semibold tabular-nums">{config.worst_results_to_discard ?? 0}</span>
                  <button
                    className="w-8 h-8 rounded-full bg-[var(--surface-secondary)] flex items-center justify-center text-lg font-bold active:opacity-60 transition-opacity"
                    onClick={() => setConfig((c) => ({ ...c, worst_results_to_discard: (c.worst_results_to_discard ?? 0) + 1 }))}
                    type="button"
                  >+</button>
                </div>
              </div>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            {[
              { label: 'Monto de entrada', field: 'entry_amount' as keyof SeasonConfig },
              { label: 'Monto de recompra', field: 'rebuy_amount' as keyof SeasonConfig },
              { label: 'Monto de kill (al killer)', field: 'kill_amount' as keyof SeasonConfig },
              { label: 'Max recompras por noche', field: 'max_rebuys_per_player' as keyof SeasonConfig },
              { label: 'Reserva por jugada', field: 'reserve_per_game' as keyof SeasonConfig },
            ].map(({ label, field }) => (
              <div key={field} className="flex flex-col gap-1">
                <Label htmlFor={field}>{label}</Label>
                <Input id={field} inputMode="numeric" value={String(config[field])} onChange={(e) => setNum(field, e.target.value)} />
              </div>
            ))}

            <div className="flex flex-col gap-1">
              <Label htmlFor="addon_amount">Monto de add-on</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="addon_amount"
                  inputMode="numeric"
                  className="flex-1"
                  value={String(config.addon_amount)}
                  onChange={(e) => setNum('addon_amount', e.target.value)}
                  disabled={!config.addon_enabled}
                />
                <Switch isSelected={config.addon_enabled} onChange={(v) => setConfig((c) => ({ ...c, addon_enabled: v }))}>
                  <Switch.Control><Switch.Thumb /></Switch.Control>
                  <Switch.Content><Label className="text-sm">Activar add-on</Label></Switch.Content>
                </Switch>
              </div>
            </div>

            <Separator />

            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium">Premios</p>
              <p className="text-xs text-muted leading-relaxed">
                Define cuánto recibe cada posición. El bote = entradas + recompras + add-ons − kills pagadas − reserva.
              </p>
              {(config.prize_entries ?? []).map((entry, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-sm text-muted w-6 text-center font-bold">#{entry.position}</span>
                  <button
                    type="button"
                    className={`text-xs px-2 py-1 rounded-lg border transition-colors ${entry.type === 'percentage' ? 'bg-[var(--accent)] text-white border-transparent' : 'border-border text-muted'}`}
                    onClick={() => setConfig((c) => {
                      const pe = [...(c.prize_entries ?? [])]
                      pe[i] = { ...pe[i], type: 'percentage' }
                      return { ...c, prize_entries: pe }
                    })}
                  >%</button>
                  <button
                    type="button"
                    className={`text-xs px-2 py-1 rounded-lg border transition-colors ${entry.type === 'fixed' ? 'bg-[var(--accent)] text-white border-transparent' : 'border-border text-muted'}`}
                    onClick={() => setConfig((c) => {
                      const pe = [...(c.prize_entries ?? [])]
                      pe[i] = { ...pe[i], type: 'fixed' }
                      return { ...c, prize_entries: pe }
                    })}
                  >$</button>
                  <Input
                    className="flex-1"
                    inputMode="numeric"
                    value={String(entry.value)}
                    onChange={(e) => setConfig((c) => {
                      const pe = [...(c.prize_entries ?? [])]
                      pe[i] = { ...pe[i], value: Number(e.target.value) }
                      return { ...c, prize_entries: pe }
                    })}
                  />
                  <button
                    type="button"
                    onClick={() => setConfig((c) => ({ ...c, prize_entries: (c.prize_entries ?? []).filter((_, idx) => idx !== i) }))}
                    className="active:opacity-60 transition-opacity shrink-0"
                  >
                    <TrashBin className="size-4 text-danger" />
                  </button>
                </div>
              ))}
              <div className="flex justify-end">
                <Button
                  variant="secondary"
                  onPress={() => setConfig((c) => ({
                    ...c,
                    prize_entries: [...(c.prize_entries ?? []), { position: (c.prize_entries ?? []).length + 1, type: 'percentage', value: 0 }]
                  }))}
                >
                  + Agregar posición
                </Button>
              </div>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            {/* Switch habilitar ante */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Habilitar ante por nivel</span>
              <Switch
                isSelected={anteEnabled}
                onChange={setAnteEnabled}
              >
                <Switch.Control><Switch.Thumb /></Switch.Control>
              </Switch>
            </div>

            {/* Carrusel de niveles */}
            {(() => {
              const levels = config.blind_levels
              const activeIdx = Math.min(activeBlindIdx, levels.length - 1)
              const prev = activeIdx > 0 ? levels[activeIdx - 1] : null
              const curr = levels[activeIdx]
              const next = activeIdx < levels.length - 1 ? levels[activeIdx + 1] : null

              function updateLevel(i: number, field: 'small' | 'big' | 'ante', val: string) {
                setConfig((c) => {
                  const ls = [...c.blind_levels]
                  ls[i] = { ...ls[i], [field]: Number(val) }
                  return { ...c, blind_levels: ls }
                })
              }

              function deleteLevel(i: number) {
                if (levels.length <= 1) return
                setConfig((c) => {
                  const ls = c.blind_levels.filter((_, idx) => idx !== i)
                  return { ...c, blind_levels: ls }
                })
                setActiveBlindIdx(Math.max(0, i - 1))
              }

              function addLevel() {
                const last = levels[levels.length - 1]
                setConfig((c) => ({
                  ...c,
                  blind_levels: [...c.blind_levels, { small: last.small * 2, big: last.big * 2, duration: 20 }]
                }))
                setActiveBlindIdx(levels.length)
              }

              return (
                <div className="flex flex-col gap-3">
                  <div className="flex items-stretch gap-2">
                    {/* Anterior */}
                    <div className="flex-1">
                      {prev ? (
                        <Card
                          variant="secondary"
                          className="h-full opacity-50 cursor-pointer active:opacity-30 transition-opacity"
                          onClick={() => setActiveBlindIdx(activeIdx - 1)}
                        >
                          <Card.Content className="py-3 flex flex-col items-center justify-center gap-0.5 h-full">
                            <p className="text-xs text-muted">Nivel {activeIdx}</p>
                            <p className="text-lg font-bold">{prev.small}/{prev.big}</p>
                            {anteEnabled && prev.ante ? <p className="text-xs text-muted">A:{prev.ante}</p> : null}
                          </Card.Content>
                        </Card>
                      ) : <div className="flex-1" />}
                    </div>

                    {/* Central — editable */}
                    <div className="flex-[1.6] relative">
                      <Card variant="secondary" className="border-2 border-[var(--accent)]">
                        <Card.Content className="py-4 flex flex-col items-center gap-2">
                          <div className="flex w-full items-center justify-between px-1">
                            <p className="text-xs font-medium text-muted">Nivel {activeIdx + 1}</p>
                            {levels.length > 1 && (
                              <button
                                type="button"
                                onClick={() => deleteLevel(activeIdx)}
                                className="active:opacity-60 transition-opacity"
                              >
                                <TrashBin className="size-3.5 text-danger" />
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <input
                              inputMode="numeric"
                              className="w-14 bg-[var(--surface-secondary)] text-center text-xl font-bold rounded-lg py-1 outline-none"
                              value={curr.small}
                              onChange={(e) => updateLevel(activeIdx, 'small', e.target.value)}
                            />
                            <span className="font-bold text-muted">/</span>
                            <input
                              inputMode="numeric"
                              className="w-14 bg-[var(--surface-secondary)] text-center text-xl font-bold rounded-lg py-1 outline-none"
                              value={curr.big}
                              onChange={(e) => updateLevel(activeIdx, 'big', e.target.value)}
                            />
                          </div>
                          {anteEnabled && (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted">Ante:</span>
                              <input
                                inputMode="numeric"
                                className="w-14 bg-[var(--surface-secondary)] text-center text-sm font-semibold rounded-lg py-1 outline-none"
                                value={curr.ante ?? 0}
                                onChange={(e) => updateLevel(activeIdx, 'ante', e.target.value)}
                              />
                            </div>
                          )}
                        </Card.Content>
                      </Card>
                    </div>

                    {/* Siguiente o botón + */}
                    <div className="flex-1">
                      {next ? (
                        <Card
                          variant="secondary"
                          className="h-full opacity-50 cursor-pointer active:opacity-30 transition-opacity"
                          onClick={() => setActiveBlindIdx(activeIdx + 1)}
                        >
                          <Card.Content className="py-3 flex flex-col items-center justify-center gap-0.5 h-full">
                            <p className="text-xs text-muted">Nivel {activeIdx + 2}</p>
                            <p className="text-lg font-bold">{next.small}/{next.big}</p>
                            {anteEnabled && next.ante ? <p className="text-xs text-muted">A:{next.ante}</p> : null}
                          </Card.Content>
                        </Card>
                      ) : (
                        <Card
                          variant="secondary"
                          className="h-full opacity-60 cursor-pointer active:opacity-30 transition-opacity"
                          onClick={addLevel}
                        >
                          <Card.Content className="py-3 flex flex-col items-center justify-center h-full">
                            <span className="text-2xl font-bold text-muted">+</span>
                          </Card.Content>
                        </Card>
                      )}
                    </div>
                  </div>

                  {/* Dots de navegación */}
                  <div className="flex justify-center gap-1.5">
                    {levels.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setActiveBlindIdx(i)}
                        className={`rounded-full transition-all ${i === activeIdx ? 'w-4 h-1.5 bg-[var(--accent)]' : 'w-1.5 h-1.5 bg-muted/40'}`}
                      />
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* Inputs de configuración */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="rebuy_close_level">Cierre recompras (nivel)</Label>
                <Input
                  id="rebuy_close_level"
                  inputMode="numeric"
                  value={String(config.rebuy_close_level)}
                  onChange={(e) => setNum('rebuy_close_level', e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="addon_level">Nivel de add-on</Label>
                <Input
                  id="addon_level"
                  inputMode="numeric"
                  value={String(config.addon_level)}
                  onChange={(e) => setNum('addon_level', e.target.value)}
                  disabled={!config.addon_enabled}
                />
              </div>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}
          </div>
        )}
      </div>

      {/* Botones fijos abajo */}
      <div className="px-4 pb-6 pt-3 border-t border-border bg-background flex gap-2">
        <Button variant="ghost" onPress={() => {
          if (step === 0) onCancel()
          else setStep(step - 1)
        }}>
          {step === 0 ? 'Cancelar' : 'Atrás'}
        </Button>
        <Button
          onPress={() => {
            if (step === 0) {
              if (!seasonName.trim()) { setError('Asigna un nombre.'); return }
              if (selected.size === 0) { setError('Selecciona jugadores.'); return }
              setError('')
              setStep(1)
            } else if (step < 3) {
              setStep(step + 1)
            } else {
              handleCreate()
            }
          }}
          isPending={saving}
          isDisabled={saving}
          className="flex-1"
        >
          {step === 3 ? 'Crear temporada' : 'Siguiente'}
        </Button>
      </div>
    </div>
  )
}
