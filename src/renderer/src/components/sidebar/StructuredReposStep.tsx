import React from 'react'
import { Check, FolderPlus, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { translate } from '@/i18n/i18n'
import type { StructuredIterationWizard } from './structured-iteration-wizard-types'

export function StructuredReposStep(props: {
  wizard: StructuredIterationWizard
}): React.ReactElement {
  const w = props.wizard
  const busy = w.busy

  return (
    <div
      data-native-file-drop-target={w.reposDropTarget}
      className={`space-y-3 rounded-md pt-1 transition-colors ${
        w.isReposDragOver ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''
      }`}
      {...w.reposDropHandlers}
    >
      {w.projectMembers.length > 0 && (
        <div className="space-y-2 rounded-md border border-border/70 bg-muted/25 p-3">
          <p className="text-xs font-medium">
            {translate(
              'auto.components.sidebar.NewStructuredIterationDialog.selectFromProjectTitle',
              'Select from project repositories'
            )}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {translate(
              'auto.components.sidebar.NewStructuredIterationDialog.selectFromProjectHint',
              'Check the repositories this workspace needs. They mount when you finish.'
            )}
          </p>
          <ul className="space-y-1">
            {w.projectMembers.map((member) => (
              <li key={member.repoId}>
                <label
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
                    member.mounted
                      ? 'cursor-default opacity-60'
                      : 'cursor-pointer hover:bg-muted/50'
                  }`}
                >
                  <Checkbox
                    checked={member.mounted || member.selected}
                    disabled={member.mounted || busy}
                    onCheckedChange={() => w.toggleMemberSelected(member.repoId)}
                  />
                  <span className="break-all font-mono">{member.repoId}</span>
                  {member.mounted && (
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                      {translate(
                        'auto.components.sidebar.NewStructuredIterationDialog.repoMountedBadge',
                        'mounted'
                      )}
                    </span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
      {w.mountedRepos.length > 0 ? (
        <ul className="space-y-1">
          {w.mountedRepos.map((repo) => (
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
                    onClick={() => w.handleRemovePendingRepo(repo.source as string)}
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
      <Button variant="outline" onClick={w.handleAddRepo} disabled={busy} className="w-full">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <FolderPlus className="size-4" />}
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
  )
}
