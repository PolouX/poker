'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Label, Modal, Spinner } from '@heroui/react'
import { CardSpade, Gear } from '@gravity-ui/icons'
import PinInput from '@/app/components/PinInput'
import { getActiveSeason } from '@/app/actions/seasons'
import { getActiveGame } from '@/app/actions/games'
import { getGroup, updateGroup, deleteGroup } from '@/app/actions/groups'
import StartSeasonForm from './StartSeasonForm'
import CloseSeasonPanel from './CloseSeasonPanel'
import StartGameFlow from './StartGameFlow'
import EditSeasonConfig from './EditSeasonConfig'

interface Props {
  groupId: string
}

type View = 'main' | 'start_season' | 'close_season' | 'start_game' | 'edit_season'

export default function AdminPanel({ groupId }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [season, setSeason] = useState<{ id: string; name: string; config: Record<string, unknown> } | null>(null)
  const [activeGame, setActiveGame] = useState<{ id: string; name: string } | null>(null)
  const [view, setView] = useState<View>('main')
  const [confirmClose, setConfirmClose] = useState(false)

  // Config de grupo (sin temporada)
  const [groupConfigOpen, setGroupConfigOpen] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupPin, setGroupPin] = useState('')
  const [groupPinConfirm, setGroupPinConfirm] = useState('')
  const [groupConfigError, setGroupConfigError] = useState('')
  const [savingGroup, setSavingGroup] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [currentGroupName, setCurrentGroupName] = useState('')

  async function reload() {
    setLoading(true)
    const [s, grp] = await Promise.all([getActiveSeason(groupId), getGroup(groupId)])
    setSeason(s as { id: string; name: string; config: Record<string, unknown> } | null)
    setCurrentGroupName(grp.name)
    if (s) {
      const g = await getActiveGame(s.id)
      setActiveGame(g as { id: string; name: string } | null)
    } else {
      setActiveGame(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    reload().then(() => {})
  }, [groupId])

  useEffect(() => {
    if (!loading && activeGame) {
      router.push(`/${groupId}/admin/game/${activeGame.id}`)
    }
  }, [loading, activeGame, groupId, router])

  function openGroupConfig() {
    setGroupName(currentGroupName)
    setGroupPin('')
    setGroupPinConfirm('')
    setGroupConfigError('')
    setGroupConfigOpen(true)
  }

  async function handleSaveGroup() {
    if (!groupName.trim()) return setGroupConfigError('Ingresa un nombre.')
    if (groupPin && !/^\d{4,6}$/.test(groupPin)) return setGroupConfigError('El PIN debe ser de 4 a 6 dígitos.')
    if (groupPin && groupPin !== groupPinConfirm) return setGroupConfigError('Los PINs no coinciden.')
    setSavingGroup(true)
    setGroupConfigError('')
    try {
      await updateGroup(groupId, groupName.trim(), groupPin || undefined)
      setGroupConfigOpen(false)
    } catch {
      setGroupConfigError('Error al guardar. Intenta de nuevo.')
    } finally {
      setSavingGroup(false)
    }
  }

  async function handleDeleteGroup() {
    setDeleting(true)
    try {
      await deleteGroup(groupId)
      router.push('/')
    } catch {
      setDeleting(false)
      setConfirmDeleteOpen(false)
    }
  }

  if (loading) return <div className="flex justify-center mt-16"><Spinner /></div>

  if (view === 'start_season') {
    return (
      <StartSeasonForm
        groupId={groupId}
        onDone={() => { reload(); setView('main') }}
        onCancel={() => setView('main')}
      />
    )
  }

  if (view === 'close_season' && season) {
    return (
      <CloseSeasonPanel
        season={season}
        onDone={() => { reload(); setView('main') }}
        onCancel={() => setView('main')}
      />
    )
  }

  if (view === 'edit_season' && season) {
    return (
      <EditSeasonConfig
        season={season}
        onDone={() => { reload(); setView('main') }}
        onCancel={() => setView('main')}
      />
    )
  }

  if (view === 'start_game' && season) {
    return (
      <StartGameFlow
        season={season}
        groupId={groupId}
        onDone={(gameId) => { router.push(`/${groupId}/admin/game/${gameId}`) }}
        onCancel={() => setView('main')}
      />
    )
  }

  return (
    <div className="flex flex-col px-4 pb-6 max-w-md mx-auto fixed inset-x-0 top-[44px] bottom-[64px]">
      {/* Botón configuración */}
      <div className="flex justify-end pt-3">
        {season ? (
          <Button variant="secondary" size="sm" onPress={() => setView('edit_season')} aria-label="Configuración">
            <Gear className="size-4" />
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onPress={openGroupConfig} aria-label="Configuración del grupo">
            <Gear className="size-4" />
          </Button>
        )}
      </div>

      {/* Ilustración central */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <CardSpade className="text-foreground opacity-80" style={{ width: 120, height: 120 }} />
        <div className="flex flex-col items-center gap-1">
          {season && (
            <p className="text-xl font-semibold text-white text-center">{season.name}</p>
          )}
        </div>
      </div>

      {/* Botones al fondo */}
      <div className="flex flex-col gap-3">
        {!season ? (
          <Button onPress={() => setView('start_season')} size="lg" className="w-full">
            Comenzar temporada
          </Button>
        ) : (
          <>
            <Button
                variant="danger-soft"
                onPress={() => setConfirmClose(true)}
                className="w-full"
                size="lg"
              >
                Finalizar temporada
              </Button>
            <Button onPress={() => setView('start_game')} size="lg" className="w-full">
                Comenzar jugada
              </Button>
          </>
        )}
      </div>

      <Modal.Backdrop isOpen={confirmClose} onOpenChange={setConfirmClose} variant="blur">
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>Finalizar temporada</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="text-sm text-muted">
                Esta accion cerrara la temporada permanentemente. ¿Deseas continuar?
              </p>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" onPress={() => setConfirmClose(false)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                onPress={() => {
                  setConfirmClose(false)
                  setView('close_season')
                }}
              >
                Continuar
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* Modal configuración del grupo */}
      <Modal.Backdrop isOpen={groupConfigOpen} onOpenChange={setGroupConfigOpen} variant="blur">
        <Modal.Container>
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Configuración del grupo</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor="cfg-name">Nombre del grupo</Label>
                <Input
                  id="cfg-name"
                  placeholder="Nombre"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  variant="secondary"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="cfg-pin">Nuevo PIN (dejar vacío para no cambiar)</Label>
                <PinInput id="cfg-pin" value={groupPin} onChange={setGroupPin} variant="secondary" />
              </div>
              {groupPin && (
                <div className="flex flex-col gap-1">
                  <Label htmlFor="cfg-pin-confirm">Confirmar nuevo PIN</Label>
                  <PinInput id="cfg-pin-confirm" value={groupPinConfirm} onChange={setGroupPinConfirm} variant="secondary" />
                </div>
              )}
              {groupConfigError && <p className="text-sm text-danger">{groupConfigError}</p>}
              <Button
                variant="danger-soft"
                className="w-full mt-2"
                onPress={() => { setGroupConfigOpen(false); setConfirmDeleteOpen(true) }}
              >
                Eliminar grupo
              </Button>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" onPress={() => setGroupConfigOpen(false)} isDisabled={savingGroup}>
                Cancelar
              </Button>
              <Button onPress={handleSaveGroup} isPending={savingGroup} isDisabled={savingGroup}>
                Guardar
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* Modal confirmar eliminación */}
      <Modal.Backdrop isOpen={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen} variant="blur">
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>Eliminar grupo</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="text-sm text-muted">
                Se eliminarán permanentemente el grupo y todos sus datos: temporadas, jugadas, jugadores y resultados. Esta acción no se puede deshacer.
              </p>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" onPress={() => setConfirmDeleteOpen(false)} isDisabled={deleting}>
                Cancelar
              </Button>
              <Button variant="danger" onPress={handleDeleteGroup} isPending={deleting} isDisabled={deleting}>
                Eliminar
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  )
}
