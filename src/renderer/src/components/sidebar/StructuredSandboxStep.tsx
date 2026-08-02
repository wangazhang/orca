import React from 'react'
import { translate } from '@/i18n/i18n'
import { SandboxServiceSelector } from './SandboxServiceSelector'
import type { StructuredIterationWizard } from './structured-iteration-wizard-types'

// Final wizard step: the sandbox for this workspace. Entering it scans the
// project's repos and pre-checks the middleware they appear to need, so the user
// confirms/adjusts a suggestion instead of picking from a blank list.
export function StructuredSandboxStep(props: {
  wizard: StructuredIterationWizard
}): React.ReactElement {
  const w = props.wizard
  return (
    <div className="space-y-3 pt-1">
      {w.projectMembers.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          {translate(
            'auto.components.sidebar.NewStructuredIterationDialog.sandboxNoRepos',
            'No repositories in this project yet, so nothing could be detected. You can still pick middleware manually.'
          )}
        </p>
      )}
      <SandboxServiceSelector selection={w.sandbox} busy={w.busy} />
    </div>
  )
}
