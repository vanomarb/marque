/** Each About this site link (to Terms, for no JavaScript) becomes a button that opens the dialog. */
export function initConceptDialog(): void {
  const dialog = document.querySelector<HTMLDialogElement>('#concept-dialog')
  if (!dialog) return
  let opener: HTMLElement | null = null

  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-concept]')) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = link.className
    button.setAttribute('data-concept', '')
    button.setAttribute('aria-haspopup', 'dialog')
    button.append(...link.childNodes)
    link.replaceWith(button)
  }

  document.addEventListener('click', (event) => {
    const trigger = (event.target as Element | null)?.closest<HTMLElement>('[data-concept]')
    if (!trigger || dialog.open) return
    event.preventDefault()
    opener = trigger
    dialog.showModal()
  })

  dialog.querySelector('[data-concept-close]')?.addEventListener('click', () => dialog.close())

  // The content sits in an inner wrapper, so a click on the dialog element itself is on the backdrop.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close()
  })

  dialog.addEventListener('close', () => {
    opener?.focus()
    opener = null
  })
}
