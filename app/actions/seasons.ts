'use server'

import { supabase } from '@/lib/supabase'

export interface SeasonConfig {
  points_per_kill: number
  points_per_attendance: number
  points_per_rebuy: number
  points_per_addon: number
  points_position_scale: number[]
  points_position_increment: number
  points_count_guests: boolean
  worst_results_to_discard: number
  entry_amount: number
  rebuy_amount: number
  addon_enabled: boolean
  addon_amount: number
  kill_amount: number
  max_rebuys_per_player: number
  prize_type: 'percentage' | 'fixed'
  prize_structure: number[]
  prize_entries: Array<{ position: number; type: 'percentage' | 'fixed'; value: number }>
  reserve_per_game: number
  blind_levels: Array<{ small: number; big: number; duration: number; ante?: number }>
  rebuy_close_level: number
  addon_level: number
  ante_start_level: number
  ante_amount: number
}

export async function getActiveSeason(groupId: string) {
  const { data } = await supabase
    .from('seasons')
    .select('id, name, config, status')
    .eq('group_id', groupId)
    .eq('status', 'open')
    .single()
  return data
}

export async function updateSeasonConfig(seasonId: string, config: SeasonConfig) {
  const { error } = await supabase
    .from('seasons')
    .update({ config })
    .eq('id', seasonId)
  if (error) throw new Error(error.message)
}

export async function createSeason(groupId: string, name: string, playerIds: string[], config: SeasonConfig) {
  const { data: season, error } = await supabase
    .from('seasons')
    .insert({ group_id: groupId, name, config, status: 'open' })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  if (playerIds.length > 0) {
    await supabase.from('season_players').insert(
      playerIds.map((pid) => ({ season_id: season.id, player_id: pid }))
    )
  }

  return season
}

export async function closeSeason(seasonId: string) {
  const { error } = await supabase
    .from('seasons')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('id', seasonId)

  if (error) throw new Error(error.message)
}

export async function getSeasonPlayers(seasonId: string) {
  const { data } = await supabase
    .from('season_players')
    .select('player_id, players(id, name)')
    .eq('season_id', seasonId)
  return data ?? []
}

export async function getGroupPlayers(groupId: string) {
  const { data } = await supabase
    .from('players')
    .select('id, name')
    .eq('group_id', groupId)
    .order('name')
  return data ?? []
}

export async function updatePlayerName(playerId: string, name: string) {
  const { error } = await supabase
    .from('players')
    .update({ name })
    .eq('id', playerId)
  if (error) throw new Error(error.message)
}

export async function addPlayer(groupId: string, name: string) {
  const { data, error } = await supabase
    .from('players')
    .insert({ group_id: groupId, name })
    .select('id, name')
    .single()
  if (error) throw new Error(error.message)
  return data
}
