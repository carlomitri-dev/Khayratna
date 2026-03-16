import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

const Kbd = ({ children }) => (
  <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 text-[11px] font-mono font-semibold bg-muted border border-border rounded text-muted-foreground">
    {children}
  </kbd>
);

const ShortcutRow = ({ keys, description }) => (
  <div className="flex items-center justify-between py-1.5">
    <span className="text-sm text-muted-foreground">{description}</span>
    <div className="flex items-center gap-1 ml-4 flex-shrink-0">
      {keys.map((k, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="text-muted-foreground/50 text-xs mx-0.5">+</span>}
          <Kbd>{k}</Kbd>
        </React.Fragment>
      ))}
    </div>
  </div>
);

const ShortcutsHelpDialog = ({ open, onOpenChange }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-md" data-testid="shortcuts-help-dialog">
      <DialogHeader>
        <DialogTitle className="text-lg">Keyboard Shortcuts</DialogTitle>
      </DialogHeader>

      <div className="space-y-4 mt-2">
        <div>
          <h3 className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Global</h3>
          <div className="space-y-0.5">
            <ShortcutRow keys={['?']} description="Show this help" />
            <ShortcutRow keys={['/']} description="Focus search" />
            <ShortcutRow keys={['Esc']} description="Close dialog / clear search" />
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Actions</h3>
          <div className="space-y-0.5">
            <ShortcutRow keys={['Ctrl', 'N']} description="New record / Add" />
            <ShortcutRow keys={['Ctrl', 'S']} description="Save current form" />
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Navigation (G then ...)</h3>
          <div className="space-y-0.5">
            <ShortcutRow keys={['G', 'D']} description="Go to Dashboard" />
            <ShortcutRow keys={['G', 'V']} description="Go to Voucher Entry" />
            <ShortcutRow keys={['G', 'A']} description="Go to Chart of Accounts" />
            <ShortcutRow keys={['G', 'C']} description="Go to Customers" />
            <ShortcutRow keys={['G', 'S']} description="Go to Suppliers" />
            <ShortcutRow keys={['G', 'N']} description="Go to Cr/Db Notes" />
            <ShortcutRow keys={['G', 'I']} description="Go to Inventory" />
            <ShortcutRow keys={['G', 'P']} description="Go to POS Terminal" />
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
);

export default ShortcutsHelpDialog;
