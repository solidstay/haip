import { useEffect } from 'react';
// Several editors can share a page; confirm once for each navigation event.
const prompted = new WeakSet<Event>();
function confirmLeave(event: Event, warning: string) {
  if (prompted.has(event)) return;
  prompted.add(event);
  if (!window.confirm(warning)) { event.preventDefault(); event.stopPropagation(); }
}
/** Protect edits during document navigation and the shell's property selector. */
export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warning = 'Leave without saving your changes?';
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const click = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest('a');
      if (anchor && !anchor.getAttribute('href')?.startsWith('#')) confirmLeave(event, warning);
    };
    const propertyChange = (event: Event) => {
      confirmLeave(event, warning);
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', click, true);
    window.addEventListener('haip:before-property-change', propertyChange);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', click, true);
      window.removeEventListener('haip:before-property-change', propertyChange);
    };
  }, [dirty]);
}
