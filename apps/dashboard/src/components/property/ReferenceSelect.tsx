import { forwardRef, useMemo } from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { Check, ChevronDown } from 'lucide-react';
import { PROPERTY_COUNTRIES, PROPERTY_CURRENCIES, PROPERTY_TIMEZONES } from '@telivityhaip/shared';

export type ReferenceOption = { value: string; label: string };
const countries = new Intl.DisplayNames(['en'], { type: 'region' });
const currencies = new Intl.DisplayNames(['en'], { type: 'currency' });
export const countryOptions = PROPERTY_COUNTRIES.map(value => ({ value, label: `${countries.of(value)} — ${value}` })).sort((a,b) => a.label.localeCompare(b.label));
export const currencyOptions = PROPERTY_CURRENCIES.map(value => ({ value, label: `${currencies.of(value)} — ${value}` })).sort((a,b) => a.label.localeCompare(b.label));
export const timezoneOptions = PROPERTY_TIMEZONES.map(value => ({ value, label: value.replaceAll('_', ' ') }));

// Reuse HAIP's Base UI primitive for keyboard navigation, focus return and a portalled list.
export const ReferenceSelect = forwardRef<HTMLButtonElement, {
  id?: string; value: string; onChange: (value: string) => void; onBlur?: () => void;
  options: ReferenceOption[]; disabled?: boolean; required?: boolean; className?: string;
  'aria-describedby'?: string; 'aria-invalid'?: boolean; 'aria-label'?: string;
}>(({ value, onChange, options, disabled, required, className, onBlur, ...attrs }, ref) => {
  // Existing legacy IANA aliases remain visible; the API validates them on save.
  const items = useMemo(() => value && !options.some(item => item.value === value)
    ? [{value, label: value}, ...options] : options, [options, value]);
  return <Combobox.Root items={items} value={items.find(item => item.value === value) ?? null}
    onValueChange={item => onChange(item?.value ?? '')} disabled={disabled} required={required}>
    <Combobox.Trigger {...attrs} ref={ref} onBlur={onBlur}
      className={`${className ?? ''} flex items-center justify-between gap-3 text-left`}>
      <span className="min-w-0 break-words"><Combobox.Value placeholder="Select an option" /></span>
      <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0" />
    </Combobox.Trigger>
    <Combobox.Portal><Combobox.Positioner sideOffset={6} className="z-[100] w-[var(--anchor-width)] max-w-[calc(100vw-24px)]">
      <Combobox.Popup className="overflow-hidden rounded-lg border border-gray-300 bg-white text-telivity-navy">
        <div className="p-2"><Combobox.Input aria-label="Search options" placeholder="Type to search…"
          className="min-h-[44px] w-full rounded-md border border-gray-300 bg-white px-3 text-base focus:outline-none focus:ring-2 focus:ring-telivity-teal/40" /></div>
        <Combobox.Empty className="px-3 py-4 text-sm text-telivity-slate empty:p-0">No matches. Try a name or code.</Combobox.Empty>
        <Combobox.List className="max-h-[min(280px,var(--available-height))] overflow-y-auto overscroll-contain p-1">
          {(item: ReferenceOption) => <Combobox.Item key={item.value} value={item}
            className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none data-[highlighted]:bg-telivity-light-grey">
            <span className="w-4 shrink-0"><Combobox.ItemIndicator><Check aria-hidden="true" className="h-4 w-4" /></Combobox.ItemIndicator></span>
            <span className="min-w-0 break-words">{item.label}</span>
          </Combobox.Item>}
        </Combobox.List>
      </Combobox.Popup>
    </Combobox.Positioner></Combobox.Portal>
  </Combobox.Root>;
});
ReferenceSelect.displayName = 'ReferenceSelect';
