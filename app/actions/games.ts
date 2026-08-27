'use server'

import { supabase } from '@/lib/supabase'

export async function createGame(seasonId: string, name: string) {
  const { data, error } = await supabase
    .from('games')
    .insert({ season_id: seasonId, name, status: 'active', current_blind_level: 0 })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function getActiveGame(seasonId: string) {
  const { data } = await supabase
    .from('games')
    .select('id, name, status, current_blind_level')
    .eq('season_id', seasonId)
    .eq('status', 'active')
    .single()
  return data
}

export async function saveAttendees(
  gameId: string,
  playerIds: string[],
  guests: string[]
) {
  const rows = [
    ...playerIds.map((pid) => ({ game_id: gameId, player_id: pid, is_guest: false })),
    ...guests.map((name) => ({ game_id: gameId, player_id: null, is_guest: true, guest_name: name })),
  ]
  const { error } = await supabase.from('game_attendees').insert(rows)
  if (error) throw new Error(error.message)
}

export async function advanceBlindLevel(gameId: string, newLevel: number) {
  const { error } = await supabase
    .from('games')
    .update({ current_blind_level: newLevel })
    .eq('id', gameId)
  if (error) throw new Error(error.message)

}

export async function registerRebuy(gameId: string, playerId: string | null, isGuest: boolean, guestName?: string | null) {
  await supabase.from('game_events').insert({
    game_id: gameId,
    type: 'rebuy',
    player_id: isGuest ? null : playerId,
    guest_name: isGuest ? (guestName ?? null) : null,
  })
}

export async function registerAddon(gameId: string, playerId: string | null) {
  await supabase.from('game_events').insert({
    game_id: gameId,
    type: 'addon',
    player_id: playerId,
  })
}

export async function registerElimination(
  gameId: string,
  playerId: string | null,
  eliminatedById: string | null,
  position: number,
  doRebuy: boolean,
  guestName?: string | null,
  eliminatedByGuestName?: string | null
) {
  await supabase.from('game_events').insert({
    game_id: gameId,
    type: 'elimination',
    player_id: playerId,
    eliminated_by_player_id: eliminatedById,
    position,
    guest_name: guestName ?? null,
    eliminated_by_guest_name: eliminatedByGuestName ?? null,
  })

  if (doRebuy) {
    await supabase.from('game_events').insert({
      game_id: gameId,
      type: 'rebuy',
      player_id: playerId,
      guest_name: guestName ?? null,
    })
  }
}

export async function registerFinalPosition(
  gameId: string,
  playerId: string | null,
  position: number
) {
  await supabase.from('game_events').insert({
    game_id: gameId,
    type: 'position',
    player_id: playerId,
    position,
  })
}

export async function getGameState(gameId: string) {
  const [{ data: events }, { data: attendees }, { data: game }] = await Promise.all([
    supabase
      .from('game_events')
      .select('id, type, player_id, eliminated_by_player_id, position, created_at, guest_name, eliminated_by_guest_name')
      .eq('game_id', gameId)
      .order('created_at', { ascending: true }),
    supabase
      .from('game_attendees')
      .select('player_id, is_guest, guest_name')
      .eq('game_id', gameId),
    supabase
      .from('games')
      .select('id, name, status, current_blind_level, season_id, created_at')
      .eq('id', gameId)
      .single(),
  ])
  return { events: events ?? [], attendees: attendees ?? [], game }
}

export async function finishGame(
  gameId: string,
  seasonId: string,
  results: Array<{
    player_id: string | null
    is_guest: boolean
    guest_name: string | null
    position: number
    points_position: number
    points_kills: number
    points_attendance: number
    points_rebuy: number
    points_addon: number
    total_points: number
    kills_count: number
    rebuys_count: number
    prize_amount: number
  }>
) {
  await supabase.from('game_results').insert(
    results.map((r) => ({ game_id: gameId, ...r }))
  )

  await supabase
    .from('games')
    .update({ status: 'finished', finished_at: new Date().toISOString() })
    .eq('id', gameId)
}
