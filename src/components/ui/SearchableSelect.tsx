import React, { useEffect, useId, useMemo, useState, useDeferredValue } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface SearchableSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  maxResults?: number;
}

/**
 * Controlled, keyboard-searchable replacement for long native select lists.
 * The text box is search-only: it never writes a free-text value into an ID.
 */
export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value, onChange, options, placeholder = "Ketik untuk mencari...", disabled = false,
  className = "", maxResults = 80,
}) => {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const deferredQuery = useDeferredValue(query);
  const isStale = deferredQuery !== query;
  const selected = options.find((option) => option.value === value);
  const selectedLabel = selected?.label || "";

  // Programmatic selection (e.g., Edit existing entry) must update the label.
  useEffect(() => { if (!open) setQuery(selectedLabel); }, [selectedLabel, open]);

  const results = useMemo(() => {
    const normalized = deferredQuery.trim().toLocaleLowerCase("id-ID");
    const matching = options.filter((option) => !option.disabled && (
      !normalized || option.label.toLocaleLowerCase("id-ID").includes(normalized)
    ));
    return matching.slice(0, maxResults);
  }, [options, deferredQuery, maxResults]);

  const choose = (option: SearchableSelectOption) => {
    onChange(option.value);
    setQuery(option.label);
    setOpen(false);
  };

  return <div className={`relative min-w-0 ${className}`} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setOpen(false);
      setQuery(selectedLabel);
    }
  }}>
    <div className="relative flex items-center">
      <input
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={placeholder}
        disabled={disabled}
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        className="input w-full min-w-0 pl-3 pr-9 disabled:bg-slate-100 disabled:text-slate-500"
        onFocus={(event) => { setOpen(true); setActiveIndex(0); event.currentTarget.select(); }}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); setActiveIndex(0); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") { setOpen(false); setQuery(selectedLabel); return; }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((previous) => Math.max(0, Math.min(results.length - 1,
              previous + (event.key === "ArrowDown" ? 1 : -1))));
          }
          if (event.key === "Enter" && open && !isStale && results.length) {
            event.preventDefault();
            choose(results[Math.min(activeIndex, results.length - 1)]);
          }
        }}
      />
      <button type="button" disabled={disabled} aria-label="Tampilkan semua pilihan" onClick={() => {
        // The arrow always behaves like a native dropdown: show all choices.
        // The text area remains editable to filter the list.
        setQuery(""); setActiveIndex(0); setOpen(true);
      }} className="absolute right-2 rounded-md p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-40">
        <ChevronDown className="h-4 w-4" />
      </button>
    </div>
    {open && !disabled && <div id={listId} role="listbox" className="absolute z-[110] mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
      {isStale ? <div className="px-3 py-3 text-xs text-slate-500" role="status">Memperbarui pilihan...</div> : results.length ? results.map((option, index) => <button
        type="button" role="option" aria-selected={option.value === value}
        key={option.value} onMouseDown={(event) => event.preventDefault()}
        onClick={() => choose(option)}
        className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-xs ${index === activeIndex ? "bg-blue-50 text-blue-900" : "text-slate-700 hover:bg-slate-50"}`}
      >
        <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${value === option.value ? "text-blue-600" : "opacity-0"}`} />
        <span className="break-words">{option.label}</span>
      </button>) : <div className="px-3 py-3 text-xs text-slate-500">Tidak ada pilihan yang cocok.</div>}
      {!isStale && options.length > maxResults && !query.trim() && <div className="border-t px-3 py-2 text-xs text-slate-400">Ketik beberapa huruf untuk mempersempit pilihan.</div>}
    </div>}
  </div>;
};
