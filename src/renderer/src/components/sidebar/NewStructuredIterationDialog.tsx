import React from 'react'
import { Boxes, Check, FolderOpen, FolderPlus, Loader2, X } from 'lucide-react'
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
import { Checkbox } from '@/components/ui/checkbox'
import { STRUCTURED_SERVICE_KINDS } from '../../../../shared/structured-project-schema'
import { translate } from '@/i18n/i18n'
import { useStructuredIterationWizard } from './useStructuredIterationWizard'

const NewStructuredIterationDialog = React.memo(function NewStructuredIterationDialog() {
  const {
    isOpen,
    step,
    projectName,
    setProjectName,
    projectRoot,
    setProjectRoot,
    handlePickProjectRoot,
    services,
    toggleService,
    workspaceName,
    setWorkspaceName,
    workspaceIsFirst,
    mountedRepos,
    busy,
    error,
    clearError,
    createdProject,
    handleCreateProject,
    handleCreateWorkspace,
    handleSkipWorkspace,
    handleAddRepo,
    handleRemovePendingRepo,
    reposDropTarget,
    reposDropHandlers,
    isReposDragOver,
    runMaterializeAndClose,
    handleOpenChange
  } = useStructuredIterationWizard()

  const title =
    step === 'project'
      ? translate(
          'auto.components.sidebar.NewStructuredIterationDialog.projectTitle',
          'New structured iteration'
        )
      : step === 'workspace'
        ? workspaceIsFirst
          ? translate(
              'auto.components.sidebar.NewStructuredIterationDialog.workspaceTitle',
              'Create the first workspace'
            )
          : translate(
              'auto.components.sidebar.NewStructuredIterationDialog.workspaceTitleMore',
              'Create a workspace'
            )
        : translate(
            'auto.components.sidebar.NewStructuredIterationDialog.reposTitle',
            'Add repositories'
          )

  const description =
    step === 'project'
      ? translate(
          'auto.components.sidebar.NewStructuredIterationDialog.projectDescription',
          'An on-disk project root with docs, an isolated sandbox, and multiple repos.'
        )
      : step === 'workspace'
        ? workspaceIsFirst
          ? translate(
              'auto.components.sidebar.NewStructuredIterationDialog.workspaceDescription',
              'A workspace is one iteration: its own sandbox ports and repo worktrees.'
            )
          : translate(
              'auto.components.sidebar.NewStructuredIterationDialog.workspaceDescriptionMore',
              'Add another iteration: its own sandbox ports and repo worktrees.'
            )
        : translate(
            'auto.components.sidebar.NewStructuredIterationDialog.reposDescription',
            'Mount local Git repositories as worktrees on the workspace branch.'
          )

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Boxes className="size-4" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {step === 'project' && (
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="structured-iteration-name">
                {translate(
                  'auto.components.sidebar.NewStructuredIterationDialog.nameLabel',
                  'Project name'
                )}
              </Label>
              <Input
                id="structured-iteration-name"
                value={projectName}
                autoFocus
                placeholder="Penguin-go"
                disabled={busy}
                onChange={(e) => {
                  setProjectName(e.target.value)
                  clearError()
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="structured-iteration-location">
                {translate(
                  'auto.components.sidebar.NewStructuredIterationDialog.locationLabel',
                  'Location'
                )}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="structured-iteration-location"
                  value={projectRoot}
                  placeholder="~/orca/projects"
                  disabled={busy}
                  onChange={(e) => {
                    setProjectRoot(e.target.value)
                    clearError()
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={busy}
                  onClick={handlePickProjectRoot}
                  aria-label={translate(
                    'auto.components.sidebar.NewStructuredIterationDialog.browse',
                    'Browse…'
                  )}
                >
                  <FolderOpen className="size-4" />
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {translate(
                  'auto.components.sidebar.NewStructuredIterationDialog.locationHint',
                  'Leave empty to use the default (~/orca/projects).'
                )}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>
                {translate(
                  'auto.components.sidebar.NewStructuredIterationDialog.servicesLabel',
                  'Sandbox services'
                )}
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {STRUCTURED_SERVICE_KINDS.map((kind) => (
                  <label
                    key={kind}
                    className="flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <Checkbox
                      checked={services.has(kind)}
                      disabled={busy}
                      onCheckedChange={() => toggleService(kind)}
                    />
                    <span className="font-mono">{kind}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 'workspace' && (
          <div className="space-y-1.5 pt-1">
            <Label htmlFor="structured-workspace-name">
              {translate(
                'auto.components.sidebar.NewStructuredIterationDialog.workspaceNameLabel',
                'Workspace name'
              )}
            </Label>
            <Input
              id="structured-workspace-name"
              value={workspaceName}
              autoFocus
              placeholder="it1"
              disabled={busy}
              onChange={(e) => {
                setWorkspaceName(e.target.value)
                clearError()
              }}
            />
          </div>
        )}

        {step === 'repos' && (
          <div
            data-native-file-drop-target={reposDropTarget}
            className={`space-y-3 rounded-md pt-1 transition-colors ${
              isReposDragOver ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''
            }`}
            {...reposDropHandlers}
          >
            {mountedRepos.length > 0 ? (
              <ul className="space-y-1">
                {mountedRepos.map((repo) => (
                  <li
                    key={repo.key}
                    className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/35 px-3 py-2 text-xs"
                  >
                    {repo.isPending ? (
                      <FolderPlus className="size-3.5 text-muted-foreground" />
                    ) : (
                      <Check className="size-3.5 text-primary" />
                    )}
                    <span className="break-all font-mono">{repo.repoId}</span>
                    {repo.branch && (
                      <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                        {repo.branch}
                      </span>
                    )}
                    {repo.isNew && (
                      <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        {translate(
                          'auto.components.sidebar.NewStructuredIterationDialog.repoNewBadge',
                          'new'
                        )}
                      </span>
                    )}
                    {repo.isPending && repo.source && (
                      <>
                        <span
                          className={`shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400 ${
                            repo.branch ? '' : 'ml-auto'
                          }`}
                        >
                          {translate(
                            'auto.components.sidebar.NewStructuredIterationDialog.repoPendingBadge',
                            'pending'
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemovePendingRepo(repo.source as string)}
                          disabled={busy}
                          aria-label={translate(
                            'auto.components.sidebar.NewStructuredIterationDialog.removePendingRepo',
                            'Remove'
                          )}
                          className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-50"
                        >
                          <X className="size-3.5" />
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                {translate(
                  'auto.components.sidebar.NewStructuredIterationDialog.reposEmpty',
                  'No repositories mounted yet.'
                )}
              </p>
            )}
            <Button variant="outline" onClick={handleAddRepo} disabled={busy} className="w-full">
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FolderPlus className="size-4" />
              )}
              {translate(
                'auto.components.sidebar.NewStructuredIterationDialog.pickRepo',
                'Choose a local Git folder…'
              )}
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              {translate(
                'auto.components.sidebar.NewStructuredIterationDialog.dropRepoHint',
                '…or drop a local Git folder here'
              )}
            </p>
          </div>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        <DialogFooter>
          {step === 'project' && (
            <>
              <Button
                variant="ghost"
                onClick={() => handleCreateProject('finish')}
                disabled={!projectName.trim() || busy}
              >
                {translate(
                  'auto.components.sidebar.NewStructuredIterationDialog.createProjectOnly',
                  'Create project only'
                )}
              </Button>
              <Button
                onClick={() => handleCreateProject('workspace')}
                disabled={!projectName.trim() || busy}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Boxes className="size-4" />}
                {translate(
                  'auto.components.sidebar.NewStructuredIterationDialog.createAndAddWorkspace',
                  'Create & add workspace'
                )}
              </Button>
            </>
          )}
          {step === 'workspace' && (
            <>
              <Button variant="ghost" onClick={handleSkipWorkspace} disabled={busy}>
                {translate(
                  'auto.components.sidebar.NewStructuredIterationDialog.skipWorkspace',
                  'Skip'
                )}
              </Button>
              <Button onClick={handleCreateWorkspace} disabled={!workspaceName.trim() || busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Boxes className="size-4" />}
                {translate(
                  'auto.components.sidebar.NewStructuredIterationDialog.createWorkspace',
                  'Create workspace'
                )}
              </Button>
            </>
          )}
          {step === 'repos' && (
            <Button onClick={() => runMaterializeAndClose(createdProject)} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {translate('auto.components.sidebar.NewStructuredIterationDialog.finish', 'Done')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})

export default NewStructuredIterationDialog
