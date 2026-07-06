import React from 'react'
import { Check, FolderPlus, Loader2, SlidersHorizontal, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { STRUCTURED_SERVICE_KINDS } from '../../../../shared/structured-project-schema'
import { translate } from '@/i18n/i18n'
import { useWorkspaceSettings } from './useWorkspaceSettings'

const WorkspaceSettingsDialog = React.memo(function WorkspaceSettingsDialog() {
  const {
    isOpen,
    workspace,
    loading,
    loadError,
    services,
    toggleService,
    repos,
    removeRepo,
    handleAddRepo,
    adding,
    busy,
    error,
    handleSave,
    handleOpenChange
  } = useWorkspaceSettings()

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="size-4" />
            {translate(
              'auto.components.sidebar.WorkspaceSettingsDialog.title',
              'Workspace settings'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.sidebar.WorkspaceSettingsDialog.description',
              'Adjust the sandbox services and mounted repos for {{value0}}.',
              { value0: workspace }
            )}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : loadError ? (
          <p className="text-xs text-destructive">{loadError}</p>
        ) : (
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label>
                {translate(
                  'auto.components.sidebar.WorkspaceSettingsDialog.servicesLabel',
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

            <div className="space-y-1.5">
              <Label>
                {translate(
                  'auto.components.sidebar.WorkspaceSettingsDialog.reposLabel',
                  'Mounted repositories'
                )}
              </Label>
              {repos.length > 0 ? (
                <ul className="space-y-1">
                  {repos.map((repo) => (
                    <li
                      key={repo.key}
                      className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/35 px-3 py-2 text-xs"
                    >
                      <span className="break-all font-mono">{repo.repoId}</span>
                      {repo.branch && (
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                          {repo.branch}
                        </span>
                      )}
                      {repo.isNew && (
                        <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          {translate(
                            'auto.components.sidebar.WorkspaceSettingsDialog.repoNewBadge',
                            'new'
                          )}
                        </span>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="ml-auto shrink-0"
                        disabled={busy}
                        aria-label={translate(
                          'auto.components.sidebar.WorkspaceSettingsDialog.removeRepo',
                          'Remove {{value0}}',
                          { value0: repo.repoId }
                        )}
                        onClick={() => removeRepo(repo.key)}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {translate(
                    'auto.components.sidebar.WorkspaceSettingsDialog.reposEmpty',
                    'No repositories mounted yet.'
                  )}
                </p>
              )}
              <Button
                variant="outline"
                onClick={handleAddRepo}
                disabled={busy || adding}
                className="w-full"
              >
                {adding ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FolderPlus className="size-4" />
                )}
                {translate(
                  'auto.components.sidebar.WorkspaceSettingsDialog.addRepo',
                  'Add a local Git folder…'
                )}
              </Button>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        <DialogFooter>
          <Button onClick={handleSave} disabled={loading || busy || !!loadError}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {translate('auto.components.sidebar.WorkspaceSettingsDialog.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})

export default WorkspaceSettingsDialog
