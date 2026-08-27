'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, Input, Label, Modal, Spinner } from '@heroui/react'

import { getGroups, createGroup } from './actions/groups'
import PinInput from './components/PinInput'

type Group = { id: string; name: string; created_at: string }

export default function HomePage() {
  const router = useRouter()
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    getGroups().then(setGroups).finally(() => setLoading(false))
    document.documentElement.classList.add('dark')
  }, [])

  function openModal() {
    setGroupName('')
    setPin('')
    setPinConfirm('')
    setError('')
    setModalOpen(true)
  }

  async function handleCreate() {
    if (!groupName.trim()) return setError('Ingresa un nombre para el grupo.')
    if (!/^\d{4,6}$/.test(pin)) return setError('El PIN debe ser de 4 a 6 digitos numericos.')
    if (pin !== pinConfirm) return setError('Los PINs no coinciden.')
    setCreating(true)
    setError('')
    try {
      const data = await createGroup(groupName.trim(), pin)
      setModalOpen(false)
      router.push(`/${data.id}`)
    } catch {
      setError('Error al crear el grupo. Intenta de nuevo.')
    } finally {
      setCreating(false)
    }
  }

  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <main className="flex flex-col min-h-screen">
      {loading ? (
        <div className="flex justify-center mt-12">
          <Spinner />
        </div>
      ) : (
        <>
          {/* Barra de búsqueda */}
          {groups.length > 0 && (
            <div className="px-3 pt-4">
              <Input
                placeholder="Buscar grupo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full"
              />
            </div>
          )}

          {/* Lista de grupos */}
          <div className="flex flex-col gap-2 px-3 pt-3 flex-1">
            {filteredGroups.length === 0 && groups.length === 0 && (
              <Card variant="transparent" className="text-center py-10">
                <Card.Content>
                  <p className="text-sm text-muted">No hay grupos aun. Crea el primero.</p>
                </Card.Content>
              </Card>
            )}
            {filteredGroups.length === 0 && groups.length > 0 && (
              <Card variant="transparent" className="text-center py-10">
                <Card.Content>
                  <p className="text-sm text-muted">No se encontraron grupos.</p>
                </Card.Content>
              </Card>
            )}
            {filteredGroups.map((g) => (
              <Card
                key={g.id}
                className="cursor-pointer active:opacity-70 transition-opacity"
                onClick={() => router.push(`/${g.id}`)}
              >
                <Card.Content className="py-3 flex items-center justify-center">
                  <p className="font-semibold text-base text-center">{g.name}</p>
                </Card.Content>
              </Card>
            ))}
          </div>

          {/* Botón crear nuevo grupo */}
          <div className="px-3 py-6">
            <Button className="w-full" onPress={openModal}>
              Crear nuevo grupo
            </Button>
          </div>
        </>
      )}

      <Modal.Backdrop isOpen={modalOpen} onOpenChange={setModalOpen} variant="blur">
        <Modal.Container>
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Nuevo grupo</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor="group-name">Nombre del grupo</Label>
                <Input
                  id="group-name"
                  placeholder="Ej. Los Carnales"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  variant="secondary"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="group-pin">PIN (4 a 6 digitos)</Label>
                <PinInput id="group-pin" value={pin} onChange={setPin} variant="secondary" />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="group-pin-confirm">Confirmar PIN</Label>
                <PinInput id="group-pin-confirm" value={pinConfirm} onChange={setPinConfirm} variant="secondary" />
              </div>
              {error && <p className="text-sm text-danger">{error}</p>}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" onPress={() => setModalOpen(false)} isDisabled={creating}>
                Cancelar
              </Button>
              <Button onPress={handleCreate} isPending={creating} isDisabled={creating}>
                Crear grupo
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </main>
  )
}
