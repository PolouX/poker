# POKER.md — Contexto Global del Proyecto

## Descripcion General

Aplicacion web mobile-first para gestionar ligas de poker entre amigos. Permite manejar grupos independientes, temporadas, jugadas nocturnas, estadisticas por jugador y records historicos.

---

## Grupos

- Al entrar a la app, el usuario selecciona su grupo o crea uno nuevo.
- Al crear un grupo nuevo se debe asignar un PIN numerico que servira para acceder a la seccion de administrador.
- Cada grupo es completamente independiente. No existe vista global ni super-admin.
- No hay sistema de autenticacion por usuario. El acceso admin se controla unicamente por el PIN del grupo.

---

## Seccion 1 — Temporada y Estadisticas

### Tabla de Temporada Actual

Muestra la clasificacion general de la temporada activa con los siguientes datos por jugador:

- Posicion en la tabla
- Total de puntos acumulados
- Handicap (promedio de puntos por noche asistida)
- Numero de jugadas asistidas

Debajo de la tabla de clasificacion se muestra una lista de todas las jugadas de esa temporada. Cada fila muestra:

- Nombre de la jugada (asignado por el admin al crearla)
- Ganador de esa noche

Al tocar una jugada de la lista se muestra el detalle de esa noche:

- Tabla de posiciones de esa noche
- Historial cronologico de salidas
- Registro de recompras realizadas
- Metricas de: asistentes, invitados y faltantes

### Perfil de Jugador

Al tocar un jugador se muestra su perfil con:

- Total de puntos acumulados en la temporada
- Handicap (promedio de puntos por noche jugada)
- Distribucion de puntos: cuantos vienen de posicion vs kills
- Porcentaje de asistencia sobre el total de jugadas de la temporada
- Hijo: el jugador al que mas veces ha eliminado
- Papa: el jugador que mas veces lo ha eliminado
- Titulo botana: asignado automaticamente segun sus estadisticas (ver lista de titulos abajo)

### Titulos Botana (lista fija, asignados automaticamente)

| Titulo | Condicion |
|---|---|
| El que no se pierde una | Buen porcentaje de asistencia de la temporada |
| El asesino | Buena relacion puntos de kill a posicion comparada con los demas |
| El culon | Pocos puntos de kills comparados con los de pos comparado con el ratio de los demas |
| El comebacks | Muchas recompras realizadas |
| El afortunado | Buen promedio de posicion final por noche |


> Nota: Los titulos puedes ser repetidos entre jugadores no es uno para cada quien, la metrica a evaluar siempre es comparados con los demas jugadores

---

## Seccion 2 — Records e Historia

### Records Historicos

Muestra los mejores registros de todas las temporadas:

- Mas puntos en una sola noche
- Mas puntos en una temporada completa
- Mas kills en una sola noche
- Menos puntos en una temporada (el farol historico)
- Mejor handicap de una temporada
- Peor handicap de una temporada

### Salon de la Fama

- Muestra el top 3 de cada temporada finalizada.
- Cada temporada tiene un boton para ir a su tabla de posiciones completa.

---

## Seccion 3 — Administrador

El acceso a esta seccion requiere ingresar el PIN del grupo. Sin PIN correcto no se puede acceder.

---

### 3.1 Gestion de Temporadas

**Iniciar temporada:**
- Solo disponible si no hay ninguna temporada abierta actualmente.
- Al iniciar se configuran los parametros de la temporada (ver seccion 3.2).

**Finalizar temporada:**
- Solo disponible si hay una temporada abierta.
- Al finalizar, el sistema propone la distribucion automatica de premios finales basada en la tabla de posiciones. El admin puede editar la distribucion antes de confirmar.
- Una vez confirmada, la temporada queda cerrada y pasa al historial.

---

### 3.2 Configuracion de la Temporada

Al iniciar una temporada se configuran los siguientes parametros:

**Participantes:**
- Lista de jugadores que pertenecen a esta temporada. Solo estos pueden acumular puntos.

**Estructura de puntos:**
- Puntos por posicion: dinamicos segun el numero de jugadores en cada noche (el admin define la escala proporcional al iniciar la temporada).
- Puntos por kill
- Puntos por asistencia
- Puntos por recompra (positivo o negativo, configurable)
- Puntos por add-on (positivo o negativo, configurable)

**Montos economicos:**
- Monto de entrada
- Monto de recompra
- Activar o desactivar add-on
- Monto de add-on
- Limite maximo de recompras por jugador por noche
- Monto de kill (dinero que recibe el jugador que elimina a otro)

**Premios por posicion:**
- El admin elige si el premio es porcentaje del pozo o monto fijo por posicion.
- Monto o porcentaje de reserva por jugada destinado al premio final de la temporada.

**Estructura de ciegas:**
- Lista de niveles con: monto ciega chica, monto ciega grande, duracion del nivel en minutos.
- Nivel a partir del cual se cierran las recompras.
- Nivel en el que se activa el add-on.
- Configuracion de ante: desde que nivel aplica y monto por nivel.

---

### 3.3 Iniciar una Jugada (Noche de Poker)

Las jugadas se crean bajo demanda desde cada temporada abierta. El flujo es lineal y obligatorio en este orden:

---

#### Paso 0 — Nombre de la Jugada

Antes de iniciar el flujo, el admin debe asignar un nombre a la jugada (ej. "Viernes 6 Jun", "La revancha", etc.). Este nombre es el que aparece en el historial de jugadas de la temporada.

---

#### Paso 1 — Registro de Asistencia

1. Se muestra la lista de participantes de la temporada con un check por cada uno.
2. El admin marca quienes asistieron esa noche.
3. Existe un boton separado para agregar invitados (jugadores que no pertenecen a la temporada, solo participan esa noche y no acumulan puntos de temporada).
4. Antes de pasar al Paso 2, el sistema muestra el total de dinero de entradas (asistentes + invitados) para que el admin valide que el monto cuadra con el efectivo en mano.
5. Solo se puede avanzar al Paso 2 despues de confirmar ese monto.

---

#### Paso 2 — Desarrollo de la Jugada

**Pantalla principal de la jugada:**

- Indicador del nivel de ciega actual (ciega chica / ciega grande / ante si aplica).
- Boton para avanzar al siguiente nivel de ciega.
- Boton para registrar una salida.
- Boton para registrar una recompra voluntaria (de un jugador que aun sigue en juego).
- Boton para ver el historial de la jugada.

**Registrar salida:**
- Se selecciona el jugador que sale.
- Se selecciona quien lo elimino (para registrar el kill).
- Si el jugador tiene recompras disponibles (no ha alcanzado el limite y aun es posible por el nivel de ciega), se muestra la opcion de recompra inmediata.
- Si no tiene recompras disponibles, se muestra el monto que debe recibir ese jugador eliminado (segun configuracion de premios por posicion).
- El admin decide en el momento si el jugador se recompra o no. No hay limite de tiempo.

**Historial de jugada:**
- Lista cronologica de: salidas, kills, recompras y cambios de nivel de ciega.

**Fin de la jugada:**
- La jugada finaliza automaticamente cuando se registra la salida del penultimo jugador (queda un ganador).
- Al finalizar se calculan y registran automaticamente: puntos por posicion, kills, asistencia, recompras y add-ons de cada jugador.
- Se muestra el resumen final de la noche.

---

## Reglas de Negocio Importantes

- Los invitados participan en la jugada pero no acumulan puntos de temporada ni aparecen en la tabla de clasificacion.
- Un jugador solo puede recomprar si: (1) no ha alcanzado el limite de recompras de la temporada y (2) el nivel de ciega actual aun permite recompras.
- No se puede iniciar una jugada si no hay una temporada abierta.
- No se puede tener mas de una temporada abierta al mismo tiempo por grupo.
- El PIN del grupo se configura al crear el grupo y puede cambiarse desde la seccion de administrador.

---

## Pendientes por Definir

- Formula exacta de escala proporcional de puntos por posicion (como se distribuyen los puntos dinamicamente segun N jugadores).
- Condiciones exactas y valores numericos de cada titulo botana.
- Si existe pantalla de configuracion del grupo (cambio de PIN, nombre del grupo, etc.) fuera del flujo de temporada.
