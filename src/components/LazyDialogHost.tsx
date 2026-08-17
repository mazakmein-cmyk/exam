import { ReactNode, Suspense, useEffect, useState } from "react";

type LazyDialogHostProps = {
  /** The same `open` flag the dialog inside is driven by. */
  open: boolean;
  children: ReactNode;
};

/**
 * Wrapper for a lazily-imported dialog.
 *
 * Dialogs are the bulk of what a page like the dashboard imports and the part of
 * it a given visit is least likely to use — six dialogs sat in the creator
 * library's chunk, all of them behind a click, all of them downloaded before the
 * exam list could be drawn. `lazy()` fixes that, but only if the component is
 * genuinely absent from the tree until it is wanted, which needs a mount gate.
 *
 * Two details this exists to get right:
 *
 *  - It mounts on the SAME render that `open` turns true, not one effect later,
 *    so opening a dialog is not visibly delayed by the gate itself.
 *
 *  - It latches. A naive `{open && <Dialog/>}` tears the dialog out of the tree
 *    the instant it closes, which cancels its close animation and, on a lazy
 *    component, throws away the loaded chunk's mounted state. Once opened it
 *    stays mounted and `open` alone drives it — exactly as it behaved when it was
 *    a static import.
 *
 * The Suspense fallback is `null` deliberately: a spinner where a dialog is about
 * to appear reads as a glitch, and these chunks are small.
 */
const LazyDialogHost = ({ open, children }: LazyDialogHostProps) => {
  const [everOpened, setEverOpened] = useState(open);

  useEffect(() => {
    if (open) setEverOpened(true);
  }, [open]);

  if (!open && !everOpened) return null;

  return <Suspense fallback={null}>{children}</Suspense>;
};

export default LazyDialogHost;
