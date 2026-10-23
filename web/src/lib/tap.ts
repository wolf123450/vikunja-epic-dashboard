/**
 * Decide whether a click on a bucket segment should navigate.
 * Mouse and keyboard activations navigate immediately. On touch, the first tap
 * only shows the tooltip; a second tap on the same segment navigates.
 */
export function shouldNavigateOnClick(pointerType: string, activeId: string | null, segmentId: string): boolean {
  if (pointerType !== 'touch') return true;
  return activeId === segmentId;
}
