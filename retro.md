# Retrospectiva — Analisis de Funcionalidad vs Base de Datos

**Fecha:** 2026-07-24  
**Estado:** Analisis completo del proyecto Poker Liga

---

## Resumen Ejecutivo

El proyecto tiene toda la logica de UI y server actions construida. Sin embargo, **depende completamente de que exista el esquema correcto en Supabase**. A continuacion se detalla que funciona, que no puede funcionar, y que problemas potenciales existen.

---

## 1. TABLAS REQUERIDAS EN SUPABASE

El codigo asume las siguientes tablas con estas columnas exactas. **Si alguna no existe o tiene columnas diferentes, esa seccion NO funcionara.**

### `groups`
| Columna | Tipo esperado | Uso |
|---------|--------------|-----|
| `id` | uuid (PK) | Identificador del grupo |
| `name` | text | Nombre del grupo |
| `pin_hash` | text | Hash bcrypt del PIN |
| `created_at` | timestamptz | Ordenamiento |

### `players`
| Columna | Tipo esperado | Uso |
|---------|--------------|-----|
| `id` | uuid (PK) | Identificador del jugador |
| `group_id` | uuid (FK -> groups) | Relacion al grupo |
| `name` | text | Nombre del jugador |

### `seasons`
| Columna | Tipo esperado | Uso |
|---------|--------------|-----|
| `id` | uuid (PK) | Identificador de temporada |
| `group_id` | uuid (FK -> groups) | Relacion al grupo |
| `name` | text | Nombre de la temporada |
| `config` | jsonb | Configuracion completa (SeasonConfig) |
| `status` | text | 'open' o 'closed' |
| `closed_at` | timestamptz | Fecha de cierre |
| `image_url` | text (nullable) | Foto de la temporada (history page) |
| `created_at` | timestamptz | Ordenamiento |

### `season_players`
| Columna | Tipo esperado | Uso |
|---------|--------------|-----|
| `id` | uuid (PK) | Identificador |
| `season_id` | uuid (FK -> seasons) | Relacion a temporada |
| `player_id` | uuid (FK -> players) | Relacion a jugador |

### `games`
| Columna | Tipo esperado | Uso |
|---------|--------------|-----|
| `id` | uuid (PK) | Identificador del juego |
| `season_id` | uuid (FK -> seasons) | Relacion a temporada |
| `name` | text | Nombre de la jugada |
| `status` | text | 'active' o 'finished' |
| `current_blind_level` | integer | Nivel actual de ciegas |
| `finished_at` | timestamptz (nullable) | Fecha de finalizacion |
| `created_at` | timestamptz | Ordenamiento + calculo de tiempo |

### `game_attendees`
| Columna | Tipo esperado | Uso |
|---------|--------------|-----|
| `id` | uuid (PK) | Identificador |
| `game_id` | uuid (FK -> games) | Relacion al juego |
| `player_id` | uuid (FK -> players, nullable) | Jugador oficial (null para invitados) |
| `is_guest` | boolean | Si es invitado |
| `guest_name` | text (nullable) | Nombre del invitado |

### `game_events`
| Columna | Tipo esperado | Uso |
|---------|--------------|-----|
| `id` | uuid (PK) | Identificador |
| `game_id` | uuid (FK -> games) | Relacion al juego |
| `type` | text | 'elimination', 'rebuy', 'addon', 'position' |
| `player_id` | uuid (FK -> players, nullable) | Jugador involucrado |
| `eliminated_by_player_id` | uuid (FK -> players, nullable) | Quien elimino |
| `position` | integer (nullable) | Posicion final |
| `guest_name` | text (nullable) | Nombre si es invitado |
| `eliminated_by_guest_name` | text (nullable) | Nombre del killer si es invitado |
| `created_at` | timestamptz | Cronologia |

**FK aliases requeridos:** El codigo usa foreign key hints especificos:
- `game_events_player_id_fkey` para `player_id`
- `game_events_eliminated_by_player_id_fkey` para `eliminated_by_player_id`

### `game_results`
| Columna | Tipo esperado | Uso |
|---------|--------------|-----|
| `id` | uuid (PK) | Identificador |
| `game_id` | uuid (FK -> games) | Relacion al juego |
| `player_id` | uuid (FK -> players, nullable) | Jugador |
| `is_guest` | boolean | Si es invitado |
| `guest_name` | text (nullable) | Nombre del invitado |
| `position` | integer | Posicion final |
| `points_position` | numeric | Puntos por posicion |
| `points_kills` | numeric | Puntos por kills |
| `points_attendance` | numeric | Puntos por asistencia |
| `points_rebuy` | numeric | Puntos por recompra |
| `points_addon` | numeric | Puntos por add-on |
| `total_points` | numeric | Total de puntos |
| `kills_count` | integer | Numero de kills |
| `rebuys_count` | integer | Numero de recompras |
| `prize_amount` | numeric | Premio monetario |

### `season_final_prizes`
| Columna | Tipo esperado | Uso |
|---------|--------------|-----|
| `id` | uuid (PK) | Identificador |
| `season_id` | uuid (FK -> seasons) | Relacion a temporada |
| `player_id` | uuid (FK -> players) | Jugador |
| `position` | integer | Posicion final |
| `prize_amount` | numeric | Premio final |

---

## 2. PROBLEMAS CRITICOS DETECTADOS

### 2.1 No hay archivo `.env` / `.env.local` con las credenciales de Supabase
- `lib/supabase.ts` lee `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Sin estas variables, **NADA funciona** — la app crasheara al intentar cualquier operacion
- **Accion:** Verificar que exista `.env.local` con las credenciales correctas

### 2.2 No hay migraciones SQL en el repositorio
- No existe carpeta `supabase/migrations/` ni ningun archivo `.sql`
- No hay garantia de que las tablas existan en Supabase
- **Si las tablas no existen, todo el CRUD falla silenciosamente o con error**
- **Accion:** Crear migraciones o verificar que el esquema ya existe en el proyecto de Supabase

### 2.3 No hay Row Level Security (RLS) configurado
- El cliente Supabase usa la `anon key` directamente desde el frontend (`'use client'` components)
- Sin RLS, **cualquier usuario puede leer/escribir/borrar datos de todos los grupos**
- Varios componentes (`[group_id]/page.tsx`, `history/page.tsx`, `game/[game_id]/page.tsx`) acceden directamente a `supabase` desde el cliente
- **Accion:** Implementar RLS policies o migrar todas las queries del cliente a server actions

### 2.4 Mezcla de Server Actions y queries directas al cliente
- `app/actions/*.ts` son server actions (`'use server'`) — correctas
- Pero los componentes `'use client'` tambien importan `supabase` directamente y hacen queries:
  - `app/[group_id]/page.tsx` — PlayerProfilePanel, SeasonPage (queries directas)
  - `app/[group_id]/history/page.tsx` — toda la pagina de records (queries directas)
  - `app/[group_id]/admin/components/CloseSeasonPanel.tsx` — queries directas
  - `app/[group_id]/admin/game/[game_id]/page.tsx` — queries directas
- **Problema:** Expone la logica de BD al cliente y no se beneficia de la cache del servidor
- **Accion:** Migrar todas las queries a server actions para consistencia y seguridad

---

## 3. PROBLEMAS DE LOGICA / BUGS

### 3.1 `finishGame` recibe `seasonId` vacio
- En `admin/game/[game_id]/page.tsx:469`: `await finishGame(game_id, '', results)`
- El segundo parametro `seasonId` se pasa como string vacio `''`
- En `games.ts:124`, `finishGame` recibe `seasonId` pero no lo usa — no hay impacto funcional actual, pero es un parametro muerto

### 3.2 Mock data hardcodeado (DILAN_PLAYER_ID)
- `app/[group_id]/page.tsx:284-299`: Hay un UUID hardcodeado `66138a2d-373a-4d2e-9a18-c6f291a44f1a` con datos mock para un jugador llamado "DIlan"
- Si este UUID existe en la BD, mostrara datos falsos en vez de los reales
- **Accion:** Eliminar este mock antes de produccion

### 3.3 `calcPot` solo cuenta entradas de jugadores oficiales, no invitados
- `admin/game/[game_id]/page.tsx:101`: `attendees.filter((a) => !a.is_guest).length * entryAmount`
- Los invitados tambien pagan entrada segun POKER.md, pero no se cuentan en el bote
- **Resultado:** El bote calculado es menor al real cuando hay invitados
- **Accion:** Incluir invitados en el calculo de entradas del bote

### 3.4 Eliminacion en cascada manual sin transacciones
- `groups.ts:59-84`: `deleteGroup` elimina datos de 7 tablas secuencialmente sin transaccion
- Si falla a mitad de camino, quedan datos huerfanos
- **Accion:** Configurar `ON DELETE CASCADE` en las FK de Supabase, o usar una funcion RPC con transaccion

### 3.5 `getPlayerRebuys` cuenta rebuys Y addons juntos contra el limite
- `admin/game/[game_id]/page.tsx:265-267`: `events.filter((e) => (e.type === 'rebuy' || e.type === 'addon') && e.player_id === playerId)`
- Esto significa que un addon consume un "slot" de recompra, lo cual puede no ser la intencion
- **Accion:** Separar el conteo de rebuys y addons si se supone que tienen limites independientes

### 3.6 No hay timer automatico para las ciegas
- Las ciegas se avanzan manualmente con clicks
- `POKER.md` menciona `duration` en cada nivel, pero **no hay temporizador que auto-avance**
- Solo se muestra el elapsed total, no un countdown por nivel
- **Accion:** Implementar countdown por nivel con auto-avance o notificacion

### 3.7 No se pueden eliminar jugadores de un grupo
- Solo se pueden agregar (`addPlayer`) y renombrar (`updatePlayerName`)
- No existe funcion para eliminar un jugador
- Si se agrega un jugador por error, no hay forma de quitarlo
- **Accion:** Agregar funcion `deletePlayer` con validacion de que no participe en temporadas activas

---

## 4. FUNCIONALIDAD FALTANTE VS POKER.md

### 4.1 Imagen de temporada
- `history/page.tsx` renderiza `season.image_url` si existe
- Pero **no hay UI para subir/asignar una imagen** a la temporada
- La columna `image_url` necesita existir en la tabla `seasons`
- **Accion:** Agregar upload de imagen al crear/editar temporada, o al cerrarla

### 4.2 Configuracion del grupo cuando hay temporada activa
- AdminPanel solo muestra el boton de config del grupo cuando **NO** hay temporada activa
- Si hay temporada, muestra config de temporada pero no del grupo
- **Accion:** Agregar acceso a config del grupo en ambos estados

### 4.3 No hay validacion para evitar doble temporada abierta
- `createSeason` no verifica si ya existe una temporada abierta
- El UI lo oculta si hay temporada activa, pero no hay proteccion en el backend
- **Accion:** Agregar check en `createSeason` para rechazar si ya existe una temporada open

### 4.4 No se puede reanudar una jugada interrumpida desde la lista
- Si la app se cierra durante una jugada activa, el `AdminPanel` redirige automaticamente al game
- Pero si el redirect falla o el usuario navega manualmente, no hay forma de encontrar la jugada activa
- **Accion:** Mostrar indicator claro de jugada activa en la pantalla de temporada

### 4.5 No hay "Registrar posicion" para jugadores intermedios
- La funcion `registerFinalPosition` solo se usa para el ganador (posicion 1)
- Las posiciones intermedias se deducen del orden de eliminaciones
- Esto es correcto logicamente, pero no se registran eventos de posicion para los eliminados
- Menos info en el narrador para posiciones intermedias

---

## 5. PROBLEMAS DE UI/UX

### 5.1 Colores hardcodeados para dark mode
- Muchos componentes usan `text-white` directamente en vez de `text-foreground`
- Si se implementa light mode, estos textos seran invisibles sobre fondo blanco
- Archivos afectados: `[group_id]/page.tsx`, `history/page.tsx`, `admin/components/*`

### 5.2 Performance: N+1 queries
- `[group_id]/page.tsx:669-685`: Loop con query individual por cada game para obtener ganador
- `history/page.tsx:914-924`: Mismo patron en el drawer de temporada
- `PlayerProfilePanel`: Loop por cada jugador de la temporada para calcular titulos
- **Accion:** Consolidar en batch queries o vistas SQL

### 5.3 No hay manejo de errores en queries del cliente
- Las queries directas a Supabase en componentes `'use client'` no manejan errores
- Si Supabase esta caido o las credenciales son invalidas, la app se queda en loading infinito
- **Accion:** Agregar try/catch y estados de error en todos los `useEffect` con queries

### 5.4 El player redirect page no hace nada util
- `[group_id]/player/[player_id]/page.tsx` redirige a la pagina del grupo
- No pasa el `player_id` asi que no abre automaticamente el perfil del jugador
- **Accion:** Pasar query param para abrir el modal del jugador, o eliminar esta ruta

---

## 6. SEGURIDAD

### 6.1 PIN verificado solo en el frontend
- `verifyPin` es un server action, pero la verificacion solo bloquea la UI
- No hay sesion ni token — una vez validado el PIN, no se revalida en operaciones posteriores
- Cualquier request directo a los server actions del admin (createSeason, createGame, deleteGroup) funciona sin PIN
- **Accion:** Implementar verificacion de PIN en cada server action administrativa, o usar sesiones

### 6.2 No hay rate limiting en verificacion de PIN
- Se puede intentar bruteforcear el PIN sin limite
- Con PINs de 4-6 digitos, esto es factible (10,000 a 1,000,000 combinaciones)
- **Accion:** Agregar rate limiting o lockout temporal

### 6.3 Supabase client expuesto
- La `anon key` esta en variables publicas (`NEXT_PUBLIC_*`)
- Sin RLS, esto da acceso completo a todas las tablas
- **Accion critica:** Configurar RLS en todas las tablas

---

## 7. RESUMEN DE PRIORIDADES

### Critico (la app no funciona sin esto)
1. Verificar que las tablas existan en Supabase con el esquema correcto
2. Verificar que `.env.local` tenga las credenciales de Supabase
3. Verificar que las FK y sus alias (`game_events_player_id_fkey`, etc.) existan

### Alto (bugs que afectan funcionalidad core)
4. Fix `calcPot` para incluir invitados en las entradas
5. Eliminar mock data de DILAN_PLAYER_ID
6. Implementar RLS en Supabase

### Medio (funcionalidad incompleta)
7. Timer automatico de ciegas con countdown
8. Upload de imagen de temporada
9. Migrar queries del cliente a server actions
10. Validacion backend de doble temporada

### Bajo (mejoras de calidad)
11. Reemplazar `text-white` con `text-foreground` para soporte de light mode
12. Optimizar N+1 queries
13. Agregar manejo de errores en queries del cliente
14. Separar conteo de rebuys vs addons
15. Agregar funcion para eliminar jugadores

---

## 8. LISTA DE VERIFICACION PARA PUESTA EN MARCHA

- [ ] `.env.local` con `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] Todas las 9 tablas creadas en Supabase con el esquema exacto
- [ ] Foreign keys con los alias correctos en `game_events`
- [ ] RLS policies configuradas (al menos en `groups`, `players`, `game_results`)
- [ ] Mock data de Dilan eliminado
- [ ] `calcPot` corregido para incluir invitados
- [ ] `npm run build` ejecutado sin errores
- [ ] Test manual: crear grupo -> crear temporada -> iniciar jugada -> eliminar jugadores -> finalizar
