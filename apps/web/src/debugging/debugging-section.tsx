import { AdminSettingsToggle } from '../admin-settings/admin-settings-toggle'
import { useShowCardIds } from './show-card-ids-preference'

export function DebuggingSection() {
  const [showCardIds, setShowCardIds] = useShowCardIds()

  return (
    <section data-testid="debugging-section" className="mt-8">
      <h2 className="mb-2 text-sm font-semibold text-neutral-900">Debugging</h2>
      <AdminSettingsToggle
        label="Show card ids"
        description="Adds a Copy card id button to cards in review and in card details. Saved on this device only."
        value={showCardIds}
        onChange={setShowCardIds}
      />
    </section>
  )
}
