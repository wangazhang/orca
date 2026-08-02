import React from 'react'
import { ArrowLeft, Boxes, Check, ChevronRight, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'
import { useStructuredIterationWizard } from './useStructuredIterationWizard'
import { StructuredProjectStep } from './StructuredProjectStep'
import { StructuredReposStep } from './StructuredReposStep'
import { StructuredSandboxStep } from './StructuredSandboxStep'

const T = 'auto.components.sidebar.NewStructuredIterationDialog'

function stepTitle(step: string, workspaceIsFirst: boolean): string {
  if (step === 'project') {
    return translate(`${T}.projectTitle`, 'New structured iteration')
  }
  if (step === 'workspace') {
    return workspaceIsFirst
      ? translate(`${T}.workspaceTitle`, 'Create the first workspace')
      : translate(`${T}.workspaceTitleMore`, 'Create a workspace')
  }
  if (step === 'sandbox') {
    return translate(`${T}.sandboxTitle`, 'Sandbox middleware')
  }
  return translate(`${T}.reposTitle`, 'Add repositories')
}

function stepDescription(step: string, workspaceIsFirst: boolean): string {
  if (step === 'project') {
    return translate(
      `${T}.projectDescription`,
      'An on-disk project root with docs, an isolated sandbox, and multiple repos.'
    )
  }
  if (step === 'workspace') {
    return workspaceIsFirst
      ? translate(
          `${T}.workspaceDescription`,
          'A workspace is one iteration: its own sandbox ports and repo worktrees.'
        )
      : translate(
          `${T}.workspaceDescriptionMore`,
          'Add another iteration: its own sandbox ports and repo worktrees.'
        )
  }
  if (step === 'sandbox') {
    return translate(
      `${T}.sandboxDescription`,
      'Detected from your repositories. Check what this workspace should run.'
    )
  }
  return translate(
    `${T}.reposDescription`,
    'Mount local Git repositories as worktrees on the workspace branch.'
  )
}

const NewStructuredIterationDialog = React.memo(function NewStructuredIterationDialog() {
  const wizard = useStructuredIterationWizard()
  const { isOpen, step, busy, error, activePanel, workspaceIsFirst, canGoBack } = wizard

  const wide = (step === 'project' && activePanel) || step === 'sandbox'

  return (
    <Dialog open={isOpen} onOpenChange={wizard.handleOpenChange}>
      <DialogContent className={wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Boxes className="size-4" />
            {stepTitle(step, workspaceIsFirst)}
          </DialogTitle>
          <DialogDescription>{stepDescription(step, workspaceIsFirst)}</DialogDescription>
        </DialogHeader>

        {step === 'project' && <StructuredProjectStep wizard={wizard} />}

        {step === 'workspace' && (
          <div className="space-y-1.5 pt-1">
            <Label htmlFor="structured-workspace-name">
              {translate(`${T}.workspaceNameLabel`, 'Workspace name')}
            </Label>
            <Input
              id="structured-workspace-name"
              value={wizard.workspaceName}
              autoFocus
              placeholder="V1"
              disabled={busy}
              onChange={(e) => {
                wizard.setWorkspaceName(e.target.value)
                wizard.clearError()
              }}
            />
          </div>
        )}

        {step === 'repos' && <StructuredReposStep wizard={wizard} />}
        {step === 'sandbox' && <StructuredSandboxStep wizard={wizard} />}

        {error && <p className="text-xs text-destructive">{error}</p>}

        <DialogFooter>
          {canGoBack && (
            <Button variant="ghost" onClick={wizard.handleBack} disabled={busy} className="mr-auto">
              <ArrowLeft className="size-4" />
              {translate(`${T}.back`, 'Back')}
            </Button>
          )}
          {step === 'project' && (
            <>
              <Button
                variant="ghost"
                onClick={() => wizard.handleCreateProject('finish')}
                disabled={!wizard.projectName.trim() || busy}
              >
                {translate(`${T}.createProjectOnly`, 'Create project only')}
              </Button>
              <Button
                onClick={() => wizard.handleCreateProject('workspace')}
                disabled={!wizard.projectName.trim() || busy}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Boxes className="size-4" />}
                {translate(`${T}.createAndAddWorkspace`, 'Create & add workspace')}
              </Button>
            </>
          )}
          {step === 'workspace' && (
            <>
              <Button variant="ghost" onClick={wizard.handleSkipWorkspace} disabled={busy}>
                {translate(`${T}.skipWorkspace`, 'Skip')}
              </Button>
              <Button
                onClick={wizard.handleCreateWorkspace}
                disabled={!wizard.workspaceName.trim() || busy}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Boxes className="size-4" />}
                {translate(`${T}.createWorkspace`, 'Create workspace')}
              </Button>
            </>
          )}
          {step === 'repos' && (
            <Button onClick={wizard.handleReposContinue} disabled={busy}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ChevronRight className="size-4" />
              )}
              {translate(`${T}.continueToSandbox`, 'Next: sandbox')}
            </Button>
          )}
          {step === 'sandbox' && (
            <Button onClick={wizard.handleFinish} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {translate(`${T}.finish`, 'Done')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})

export default NewStructuredIterationDialog
