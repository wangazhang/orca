import { Boxes, FolderInput, Plus } from 'lucide-react'
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

type AddRepoStructuredStepProps = {
  onNew: () => void
  onImport: () => void
}

type StructuredActionProps = {
  icon: typeof Boxes
  title: string
  description: string
  onClick: () => void
  className?: string
  autoFocus?: boolean
}

function StructuredAction({
  icon: Icon,
  title,
  description,
  onClick,
  className,
  autoFocus
}: StructuredActionProps): React.JSX.Element {
  return (
    <button
      type="button"
      autoFocus={autoFocus}
      onClick={onClick}
      className={cn(
        'flex min-h-[3.25rem] w-full items-center gap-3 border border-transparent px-3 py-2.5 text-left transition-colors',
        'hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50',
        className
      )}
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-5">{title}</span>
        <span className="block text-xs leading-4 text-muted-foreground">{description}</span>
      </span>
    </button>
  )
}

// Second step for the structured kind: create a new one or import an existing
// on-disk project root. Both hand off to their own dialogs (closing this one),
// mirroring how the repository kind delegates to clone/create steps.
export function AddRepoStructuredStep({
  onNew,
  onImport
}: AddRepoStructuredStepProps): React.JSX.Element {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Boxes className="size-4" />
          {translate('auto.components.sidebar.AddRepoStructuredStep.title', 'Structured project')}
        </DialogTitle>
        <DialogDescription>
          {translate(
            'auto.components.sidebar.AddRepoStructuredStep.description',
            'A project root with docs, an isolated sandbox, and multiple repos.'
          )}
        </DialogDescription>
      </DialogHeader>

      <div className="overflow-hidden rounded-md border border-input bg-background">
        <StructuredAction
          icon={Plus}
          autoFocus
          title={translate(
            'auto.components.sidebar.AddRepoStructuredStep.newTitle',
            'New structured project'
          )}
          description={translate(
            'auto.components.sidebar.AddRepoStructuredStep.newDescription',
            'Scaffold a fresh project root and its first workspace'
          )}
          onClick={onNew}
          className="rounded-t-md"
        />
        <StructuredAction
          icon={FolderInput}
          title={translate(
            'auto.components.sidebar.AddRepoStructuredStep.importTitle',
            'Import structured project'
          )}
          description={translate(
            'auto.components.sidebar.AddRepoStructuredStep.importDescription',
            'Register an existing project folder (with project.json)'
          )}
          onClick={onImport}
          className="rounded-b-md border-t border-border/70"
        />
      </div>
    </>
  )
}
