'use server'

import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'

export async function getGroups() {
  const { data, error } = await supabase
    .from('groups')
    .select('id, name, created_at')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data
}

export async function getGroup(groupId: string) {
  const { data, error } = await supabase
    .from('groups')
    .select('id, name')
    .eq('id', groupId)
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function createGroup(name: string, pin: string) {
  const pin_hash = await bcrypt.hash(pin, 10)
  const { data, error } = await supabase
    .from('groups')
    .insert({ name, pin_hash })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function verifyPin(groupId: string, pin: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('groups')
    .select('pin_hash')
    .eq('id', groupId)
    .single()

  if (error || !data) return false
  return bcrypt.compare(pin, data.pin_hash)
}

export async function updateGroup(groupId: string, name: string, pin?: string) {
  const update: Record<string, string> = { name }
  if (pin) {
    update.pin_hash = await bcrypt.hash(pin, 10)
  }
  const { error } = await supabase.from('groups').update(update).eq('id', groupId)
  if (error) throw new Error(error.message)
}

export async function deleteGroup(groupId: string) {
  // Obtener todas las seasons del grupo
  const { data: seasons } = await supabase.from('seasons').select('id').eq('group_id', groupId)
  const seasonIds = (seasons ?? []).map((s) => s.id)

  if (seasonIds.length > 0) {
    // Obtener todos los games de esas seasons
    const { data: games } = await supabase.from('games').select('id').in('season_id', seasonIds)
    const gameIds = (games ?? []).map((g) => g.id)

    if (gameIds.length > 0) {
      await supabase.from('game_events').delete().in('game_id', gameIds)
      await supabase.from('game_attendees').delete().in('game_id', gameIds)
      await supabase.from('game_results').delete().in('game_id', gameIds)
      await supabase.from('games').delete().in('id', gameIds)
    }

    await supabase.from('season_players').delete().in('season_id', seasonIds)
    await supabase.from('season_final_prizes').delete().in('season_id', seasonIds)
    await supabase.from('seasons').delete().in('id', seasonIds)
  }

  await supabase.from('players').delete().eq('group_id', groupId)
  const { error } = await supabase.from('groups').delete().eq('id', groupId)
  if (error) throw new Error(error.message)
}
