import { Boxes, FolderGit2 } from 'lucide-react'
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

type AddRepoKindStepProps = {
  repoCount: number
  onSelectNormal: () => void
  onSelectStructured: () => void
}

type KindCardProps = {
  icon: typeof Boxes
  title: string
  description: string
  onClick: () => void
  autoFocus?: boolean
}

function KindCard({
  icon: Icon,
  title,
  description,
  onClick,
  autoFocus
}: KindCardProps): React.JSX.Element {
  return (
    <button
      type="button"
      autoFocus={autoFocus}
      onClick={onClick}
      className={cn(
        'flex flex-1 flex-col items-start gap-2 rounded-lg border border-input bg-background p-4 text-left transition-colors',
        'hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50'
      )}
    >
      <span className="grid size-9 place-items-center rounded-md bg-muted text-foreground">
        <Icon className="size-5" />
      </span>
      <span className="text-sm font-medium leading-5">{title}</span>
      <span className="text-xs leading-4 text-muted-foreground">{description}</span>
    </button>
  )
}

// The first step of "Add a project": choose the project KIND before its source.
// The prior flat list mixed transport sources (browse/clone/SSH/create) with the
// structured project type, so the two fundamentally different kinds read as
// peers. Splitting them here makes the choice explicit; each card routes to that
// kind's own entry methods.
export function AddRepoKindStep({
  repoCount,
  onSelectNormal,
  onSelectStructured
}: AddRepoKindStepProps): React.JSX.Element {
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {translate('auto.components.sidebar.AddRepoKindStep.title', 'Add a project')}
        </DialogTitle>
        {repoCount === 0 ? (
          <DialogDescription>
            {translate(
              'auto.components.sidebar.AddRepoKindStep.description',
              'Which kind of project do you want to add?'
            )}
          </DialogDescription>
        ) : null}
      </DialogHeader>

      <div className="flex gap-3 pt-2">
        <KindCard
          icon={FolderGit2}
          autoFocus
          title={translate(
            'auto.components.sidebar.AddRepoKindStep.normalTitle',
            'Repository project'
          )}
          description={translate(
            'auto.components.sidebar.AddRepoKindStep.normalDescription',
            'Open, clone, or create a single Git repo or folder'
          )}
          onClick={onSelectNormal}
        />
        <KindCard
          icon={Boxes}
          title={translate(
            'auto.components.sidebar.AddRepoKindStep.structuredTitle',
            'Structured project'
          )}
          description={translate(
            'auto.components.sidebar.AddRepoKindStep.structuredDescription',
            'Multiple repos with docs and an isolated sandbox'
          )}
          onClick={onSelectStructured}
        />
      </div>
    </>
  )
}
