import React from 'react'
import { Boxes, Check, FolderOpen, Loader2 } from 'lucide-react'
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
import { useStructuredImport } from './useStructuredImport'

const StructuredImportDialog = React.memo(function StructuredImportDialog() {
  const { isOpen, rootPath, busy, error, handlePickRoot, handleImport, handleOpenChange } =
    useStructuredImport()

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Boxes className="size-4" />
            {translate(
              'auto.components.sidebar.StructuredImportDialog.title',
              'Import structured project'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.sidebar.StructuredImportDialog.description',
              'Choose an existing project folder (one that contains a project.json).'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5 pt-1">
          <Label htmlFor="structured-import-root">
            {translate(
              'auto.components.sidebar.StructuredImportDialog.rootLabel',
              'Project folder'
            )}
          </Label>
          <div className="flex gap-2">
            <Input
              id="structured-import-root"
              value={rootPath}
              readOnly
              placeholder={translate(
                'auto.components.sidebar.StructuredImportDialog.rootPlaceholder',
                'Choose a folder…'
              )}
              disabled={busy}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={busy}
              onClick={handlePickRoot}
              aria-label={translate(
                'auto.components.sidebar.StructuredImportDialog.browse',
                'Browse…'
              )}
            >
              <FolderOpen className="size-4" />
            </Button>
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <DialogFooter>
          <Button onClick={handleImport} disabled={!rootPath.trim() || busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {translate('auto.components.sidebar.StructuredImportDialog.import', 'Import')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})

export default StructuredImportDialog
