/**
 * Descarte de peores resultados.
 *
 * El descarte solo se activa cuando hay MAS jugadas que resultados a descartar:
 * con 3 a descartar, empieza a aplicar en la 4a jugada. Antes de eso descartar
 * dejaria a todos en cero (o casi) y la tabla no reflejaria como va la temporada.
 */
export function effectiveDiscard(discard: number, totalGames: number): number {
  if (discard <= 0) return 0
  return totalGames > discard ? discard : 0
}
