/**
 * The group a Calendar Item belongs to (10 §9.3): a Program group through its enrollment, or a
 * gathering it is linked to. Used by the occurrence room, Calendar tiles and completion sharing.
 */
export function itemGroupId(item: { gatheringId: string | null; enrollment?: { groupId: string | null } | null }): string | null {
  return item.enrollment?.groupId ?? item.gatheringId ?? null
}
