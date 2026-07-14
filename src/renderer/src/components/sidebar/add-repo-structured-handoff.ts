import { useAppStore } from '@/store'

// Hands the "Add a project" flow off to a sibling structured modal (new wizard
// or import dialog): closes the current modal first so only one is ever open.
// Self-reads the store so the caller need not thread openModal/closeModal.
export function handoffToStructuredModal(kind: 'new' | 'import'): void {
  const { closeModal, openModal } = useAppStore.getState()
  closeModal()
  openModal(kind === 'new' ? 'structured-iteration' : 'structured-import')
}
