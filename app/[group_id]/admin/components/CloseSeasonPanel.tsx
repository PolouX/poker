'use client'

import { useEffect, useState } from 'react'
import { Button, Card, Input, Spinner, Table } from '@heroui/react'
import { supabase } from '@/lib/supabase'
import { effectiveDiscard } from '@/lib/scoring'
import { closeSeason } from '@/app/actions/seasons'

interface Props {
  season: { id: string; name: string; config: Record<string, unknown> }
  onDone: () => void
  onCancel: () => void
}

interface PlayerPrize {
  player_id: string
  name: string
  position: number
  prize_amount: number
}

export default function CloseSeasonPanel({ season, onDone, onCancel }: Props) {
  const [prizes, setPrizes] = useState<PlayerPrize[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const discardCfg = (season.config as { worst_results_to_discard?: number } | null)?.worst_results_to_discard ?? 0

      const { data: games } = await supabase
        .from('games')
        .select('id')
        .eq('season_id', season.id)
        .eq('status', 'finished')

      const gameIds = (games ?? []).map((g) => g.id)
      const totalFinishedGames = gameIds.length
      if (totalFinishedGames === 0) { setLoading(false); return }
      // Solo se descarta cuando hay mas jugadas que descartes
      const discard = effectiveDiscard(discardCfg, totalFinishedGames)

      const { data: results } = await supabase
        .from('game_results')
        .select('player_id, total_points, players(id, name)')
        .in('game_id', gameIds)
        .eq('is_guest', false)

      // Obtener jugadores de la temporada para saber ausencias
      const { data: seasonPlayers } = await supabase
        .from('season_players').select('player_id, players(name)').eq('season_id', season.id)
      const seasonPlayerIds = new Set((seasonPlayers ?? []).map((sp) => sp.player_id))

      // Recopilar puntos por jugada para cada jugador
      const scoresByPlayer: Record<string, { name: string; scores: number[] }> = {}
      for (const r of results ?? []) {
        if (!r.player_id) continue
        const name = (r.players as unknown as { name: string } | null)?.name ?? ''
        if (!scoresByPlayer[r.player_id]) scoresByPlayer[r.player_id] = { name, scores: [] }
        scoresByPlayer[r.player_id].scores.push(Number(r.total_points))
      }

      // Asegurar que todos los jugadores de la temporada aparezcan
      for (const sp of seasonPlayers ?? []) {
        if (!scoresByPlayer[sp.player_id]) {
          const name = (sp.players as unknown as { name: string } | null)?.name ?? ''
          scoresByPlayer[sp.player_id] = { name, scores: [] }
        }
      }

      // Aplicar descarte
      const totals: Array<{ pid: string; name: string; total: number }> = []
      for (const [pid, data] of Object.entries(scoresByPlayer)) {
        const attended = data.scores.length
        let total: number
        if (discard > 0) {
          const absences = Math.max(0, totalFinishedGames - attended)
          const allScores = [...data.scores, ...Array(absences).fill(0)]
          allScores.sort((a, b) => a - b)
          total = allScores.slice(Math.min(discard, allScores.length)).reduce((s, v) => s + v, 0)
        } else {
          total = data.scores.reduce((s, v) => s + v, 0)
        }
        totals.push({ pid, name: data.name, total })
      }

      const sorted = totals
        .sort((a, b) => b.total - a.total)
        .map((d, i) => ({ player_id: d.pid, name: d.name, position: i + 1, prize_amount: 0 }))

      setPrizes(sorted)
      setLoading(false)
    }
    load()
  }, [season.id, season.config])

  async function handleClose() {
    setSaving(true)
    setError('')
    try {
      if (prizes.some((p) => p.prize_amount > 0)) {
        await supabase.from('season_final_prizes').insert(
          prizes
            .filter((p) => p.prize_amount > 0)
            .map((p) => ({
              season_id: season.id,
              player_id: p.player_id,
              position: p.position,
              prize_amount: p.prize_amount,
            }))
        )
      }
      await closeSeason(season.id)
      onDone()
    } catch {
      setError('Error al cerrar la temporada.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center mt-16">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="p-4 max-w-md mx-auto">
      <div className="mt-4 mb-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Finalizar temporada</h1>
        <p className="text-sm text-muted mt-1">Edita los premios antes de confirmar. Deja 0 para no asignar.</p>
      </div>

      <Card className="mb-6 overflow-hidden p-0">
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="Clasificacion final">
              <Table.Header>
                <Table.Column isRowHeader className="w-8">#</Table.Column>
                <Table.Column>Jugador</Table.Column>
                <Table.Column className="w-32">Premio ($)</Table.Column>
              </Table.Header>
              <Table.Body>
                {prizes.map((p) => (
                  <Table.Row key={p.player_id}>
                    <Table.Cell className="text-muted font-mono text-sm">{p.position}</Table.Cell>
                    <Table.Cell className="font-medium text-sm">{p.name}</Table.Cell>
                    <Table.Cell>
                      <Input
                        type="number"
                        value={String(p.prize_amount)}
                        onChange={(e) => setPrizes((prev) =>
                          prev.map((pr) => pr.player_id === p.player_id
                            ? { ...pr, prize_amount: Number(e.target.value) }
                            : pr
                          )
                        )}
                        aria-label={`Premio para ${p.name}`}
                      />
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      </Card>

      {error && <p className="text-sm text-danger mb-4">{error}</p>}

      <div className="flex gap-2">
        <Button variant="ghost" onPress={onCancel}>Cancelar</Button>
        <Button
          variant="danger"
          onPress={handleClose}
          isPending={saving}
          isDisabled={saving}
          className="flex-1"
        >
          Confirmar y cerrar temporada
        </Button>
      </div>
    </div>
  )
}
