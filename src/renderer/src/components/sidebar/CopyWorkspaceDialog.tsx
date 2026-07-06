import React from 'react'
import { Copy, Loader2 } from 'lucide-react'
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
import { useCopyWorkspace } from './useCopyWorkspace'

const CopyWorkspaceDialog = React.memo(function CopyWorkspaceDialog() {
  const { isOpen, source, name, setName, busy, error, clearError, handleCopy, handleOpenChange } =
    useCopyWorkspace()

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="size-4" />
            {translate('auto.components.sidebar.CopyWorkspaceDialog.title', 'Copy workspace')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.sidebar.CopyWorkspaceDialog.description',
              'Clone this workspace’s sandbox services and mounted repos into a new iteration.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label>
              {translate('auto.components.sidebar.CopyWorkspaceDialog.sourceLabel', 'Source')}
            </Label>
            <Input value={source} readOnly disabled className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="copy-workspace-name">
              {translate(
                'auto.components.sidebar.CopyWorkspaceDialog.nameLabel',
                'New workspace name'
              )}
            </Label>
            <Input
              id="copy-workspace-name"
              value={name}
              autoFocus
              placeholder="it2"
              disabled={busy}
              onChange={(e) => {
                setName(e.target.value)
                clearError()
              }}
            />
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <DialogFooter>
          <Button onClick={handleCopy} disabled={!name.trim() || busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />}
            {translate('auto.components.sidebar.CopyWorkspaceDialog.copy', 'Copy')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})

export default CopyWorkspaceDialog
