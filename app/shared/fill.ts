interface Box {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Where a button's hover fill starts (the pointer, kept inside the button) and the side of the square, centred
 * there, that covers the whole button: twice the longest straight distance from that point to an edge.
 */
export function fillFrom(box: Box, clientX: number, clientY: number): { x: number; y: number; size: number } {
  const x = Math.min(box.width, Math.max(0, clientX - box.left))
  const y = Math.min(box.height, Math.max(0, clientY - box.top))
  const reach = Math.max(x, box.width - x, y, box.height - y)
  return { x: Math.round(x), y: Math.round(y), size: Math.ceil(reach * 2) + 2 }
}

/** On the way in the fill grows from the entry point; on the way out it shrinks back towards the exit. */
export function initButtonFill(): void {
  const place = (event: PointerEvent) => {
    const button = (event.target as Element | null)?.closest?.<HTMLElement>('.button')
    if (!button) return
    // Moving between the button's own children isn't crossing its edge.
    const other = event.relatedTarget as Node | null
    if (other && button.contains(other)) return
    if (event.pointerType === 'touch') return
    const { x, y, size } = fillFrom(button.getBoundingClientRect(), event.clientX, event.clientY)
    button.style.setProperty('--fill-x', `${x}px`)
    button.style.setProperty('--fill-y', `${y}px`)
    button.style.setProperty('--fill-size', `${size}px`)
  }
  document.addEventListener('pointerover', place)
  document.addEventListener('pointerout', place)
}
