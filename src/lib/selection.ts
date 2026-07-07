// Shared shift-select range logic for every selectable list (Action Items,
// Blockers, RAID log). One implementation so the "select everything between the
// anchor and the clicked row" behavior can't drift per list.
//
// THE CONTRACT (this is where the historical bug lived): `orderedIds` MUST be the
// ids in the exact order the rows are RENDERED on screen — the tree-flattened,
// sort_order- and expand-aware order — NOT the underlying unsorted data array.
// When a caller passed the data order instead of the visible order, shift-select
// grabbed a wrong set after drag-reordering. Each caller derives `orderedIds`
// from the same list it maps over to render.

/**
 * Ids to add to the selection for a shift+click, inclusive of both endpoints.
 * Returns the contiguous slice of `orderedIds` between `anchorId` (the last
 * single-clicked row) and `clickedId` (the shift-clicked row), in either
 * direction. Returns `[]` if either id isn't in `orderedIds`.
 */
export function shiftSelectRange(
  orderedIds: string[],
  anchorId: string,
  clickedId: string,
): string[] {
  const from = orderedIds.indexOf(anchorId);
  const to = orderedIds.indexOf(clickedId);
  if (from === -1 || to === -1) return [];
  const [start, end] = from < to ? [from, to] : [to, from];
  return orderedIds.slice(start, end + 1);
}
