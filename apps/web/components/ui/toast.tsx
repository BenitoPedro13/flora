import * as React from 'react';
import { toast as sonnerToast, Toaster, type ExternalToast } from 'sonner';

const defaultOptions: ExternalToast = {
  className: 'group/toast',
  position: 'bottom-center',
};

const customToast = (
  renderFunc: (t: string | number) => React.ReactElement,
  options: ExternalToast = {},
) => {
  const mergedOptions = { ...defaultOptions, ...options };
  return sonnerToast.custom(renderFunc, mergedOptions);
};

// Explicit type (not inferred) so `declaration: true` doesn't try to name
// sonner's internal, unexported `PromiseIExtendedResult` type when emitting
// this file's .d.ts (TS4023) — bug fix, recorded in SOURCES.md. `Omit`
// rather than `typeof sonnerToast &` on purpose: `sonnerToast` is a callable
// function with properties, and `{...sonnerToast}` only copies the
// properties, not the call signature — the object literal below was never
// actually callable as `toast(...)`, only as `toast.success(...)` etc., so
// the type must say that too.
const toast: Omit<typeof sonnerToast, 'custom'> & { custom: typeof customToast } = {
  ...sonnerToast,
  custom: customToast,
};

export { toast, Toaster };
