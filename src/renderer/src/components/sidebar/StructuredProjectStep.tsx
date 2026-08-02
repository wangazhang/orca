import React from 'react'
import { ChevronRight, Database, FolderGit2, FolderOpen, FolderPlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'
import { SandboxServiceSelector } from './SandboxServiceSelector'
import type { StructuredIterationWizard } from './structured-iteration-wizard-types'

// Left-column entry that opens a detail panel on the right. Shows a label, a
// short summary of the current selection, and a chevron that rotates when active.
function PanelEntryButton(props: {
  active: boolean
  disabled: boolean
  icon: React.ReactNode
  label: string
  summary: string
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 ${
        props.active
          ? 'border-primary bg-primary/5'
          : 'border-input bg-background hover:bg-muted/50'
      }`}
    >
      {props.icon}
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{props.label}</span>
        <span className="truncate text-[11px] text-muted-foreground">{props.summary}</span>
      </span>
      <ChevronRight
        className={`ml-auto size-4 shrink-0 text-muted-foreground transition-transform ${
          props.active ? 'rotate-90' : ''
        }`}
      />
    </button>
  )
}

function countSummary(count: number, key: string, fallback: string): string {
  return count > 0
    ? translate(key, fallback, { count })
    : translate(
        'auto.components.sidebar.NewStructuredIterationDialog.noneSelected',
        'None selected'
      )
}

export function StructuredProjectStep(props: {
  wizard: StructuredIterationWizard
}): React.ReactElement {
  const w = props.wizard
  const { busy, activePanel, setActivePanel } = w

  return (
    <div
      data-native-file-drop-target={w.projectReposDropTarget}
      className={`grid gap-4 pt-1 transition-colors ${
        activePanel ? 'sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]' : 'sm:grid-cols-1'
      } ${
        w.isProjectReposDragOver
          ? 'rounded-md ring-2 ring-primary ring-offset-4 ring-offset-background'
          : ''
      }`}
      {...w.projectReposDropHandlers}
    >
      {/* Left column: core project fields + entries to the detail panels. */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="structured-iteration-name">
            {translate(
              'auto.components.sidebar.NewStructuredIterationDialog.nameLabel',
              'Project name'
            )}
          </Label>
          <Input
            id="structured-iteration-name"
            value={w.projectName}
            autoFocus
            placeholder="Penguin-go"
            disabled={busy}
            onChange={(e) => {
              w.setProjectName(e.target.value)
              w.clearError()
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
              value={w.projectRoot}
              placeholder="~/orca/projects"
              disabled={busy}
              onChange={(e) => {
                w.setProjectRoot(e.target.value)
                w.clearError()
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={busy}
              onClick={w.handlePickProjectRoot}
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
        <div className="space-y-2">
          <PanelEntryButton
            active={activePanel === 'sandbox'}
            disabled={busy}
            icon={<Database className="size-4 shrink-0 text-muted-foreground" />}
            label={translate(
              'auto.components.sidebar.NewStructuredIterationDialog.servicesLabel',
              'Sandbox services'
            )}
            summary={countSummary(
              w.sandbox.selectedCount,
              'auto.components.sidebar.NewStructuredIterationDialog.sandboxServicesCount',
              '{{count}} selected'
            )}
            onClick={() => setActivePanel(activePanel === 'sandbox' ? null : 'sandbox')}
          />
          <PanelEntryButton
            active={activePanel === 'repos'}
            disabled={busy}
            icon={<FolderGit2 className="size-4 shrink-0 text-muted-foreground" />}
            label={translate(
              'auto.components.sidebar.NewStructuredIterationDialog.projectReposLabel',
              'Project repositories'
            )}
            summary={countSummary(
              w.projectRepoDrafts.length,
              'auto.components.sidebar.NewStructuredIterationDialog.projectReposCount',
              '{{count}} repositories added'
            )}
            onClick={() => setActivePanel(activePanel === 'repos' ? null : 'repos')}
          />
        </div>
      </div>

      {/* Right column: only shown once an entry is selected. */}
      {activePanel && (
        <div className="rounded-md border border-border/70 bg-muted/20 p-3">
          {activePanel === 'sandbox' && (
            <SandboxServiceSelector selection={w.sandbox} busy={busy} />
          )}
          {activePanel === 'repos' && (
            <div className="space-y-2">
              <Label>
                {translate(
                  'auto.components.sidebar.NewStructuredIterationDialog.projectReposLabel',
                  'Project repositories'
                )}
              </Label>
              <p className="text-[11px] text-muted-foreground">
                {translate(
                  'auto.components.sidebar.NewStructuredIterationDialog.projectReposHint',
                  'Add a local folder or a Git URL. Workspaces pick the repos they need from this list.'
                )}
              </p>
              <div className="flex gap-2">
                <Input
                  value={w.projectRepoUrl}
                  placeholder={translate(
                    'auto.components.sidebar.NewStructuredIterationDialog.repoUrlPlaceholder',
                    'https://…/repo.git'
                  )}
                  disabled={busy}
                  onChange={(e) => {
                    w.setProjectRepoUrl(e.target.value)
                    w.clearError()
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      w.handleAddProjectRepoUrl()
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || !w.projectRepoUrl.trim()}
                  onClick={w.handleAddProjectRepoUrl}
                >
                  {translate('auto.components.sidebar.NewStructuredIterationDialog.addUrl', 'Add')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={busy}
                  onClick={w.handlePickProjectRepo}
                  aria-label={translate(
                    'auto.components.sidebar.NewStructuredIterationDialog.browseRepo',
                    'Pick folder…'
                  )}
                >
                  <FolderOpen className="size-4" />
                </Button>
              </div>
              {w.projectRepoDrafts.length > 0 && (
                <ul className="space-y-1 pt-1">
                  {w.projectRepoDrafts.map((draft) => (
                    <li
                      key={draft.source}
                      className="flex items-center gap-2 rounded-md border border-border/70 bg-background px-2 py-1.5 text-xs"
                    >
                      <FolderPlus className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="break-all font-mono">{draft.label}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="ml-auto size-6 shrink-0"
                        disabled={busy}
                        onClick={() => w.removeProjectRepoDraft(draft.source)}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-center text-[11px] text-muted-foreground">
                {translate(
                  'auto.components.sidebar.NewStructuredIterationDialog.dropRepoHint',
                  '…or drop a local Git folder here'
                )}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
