// FitDesk UI foundation.
//
// The canonical primitives live in ./primitives (Button, Card, EmptyState,
// ConfirmDialog, StatusChip) — token-driven, owned by FitDesk, no external
// component generator output. WorkspaceShell is the unified sheet/drawer.
// useFocusTrap serves the few dialogs that cannot adopt WorkspaceShell wholesale.

export { WorkspaceShell } from './WorkspaceShell'
export type { WorkspaceShellProps } from './WorkspaceShell'
export { useFocusTrap } from './useFocusTrap'
export * from './primitives'
