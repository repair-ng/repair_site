"use client";

import { useMemo, useRef, useState } from "react";

export type SelectOption = {
  id: string;
  name: string;
  description?: string;
};

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Search...",
}: {
  options: SelectOption[];
  value: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, query]);

  const selected = options.find((o) => o.id === value);

  return (
    <div className="relative" ref={containerRef}>
      <div
        className="flex items-center gap-2 rounded-ticket border border-line bg-paper px-4 py-3 focus-within:border-signal"
        onClick={() => setOpen(true)}
      >
        <SearchIcon />
        <input
          type="text"
          className="w-full bg-transparent text-[15px] text-ink placeholder:text-ink/40 focus:outline-none"
          placeholder={selected ? selected.name : placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      </div>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute z-20 mt-2 max-h-64 w-full overflow-auto rounded-ticket border border-line bg-white shadow-ticket">
            {filtered.length === 0 && (
              <div className="px-4 py-3 text-sm text-ink/50">
                No matches for &ldquo;{query}&rdquo;
              </div>
            )}
            {filtered.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  onChange(option.id);
                  setQuery("");
                  setOpen(false);
                }}
                className={`flex w-full flex-col items-start px-4 py-2.5 text-left text-sm hover:bg-paper ${
                  option.id === value ? "bg-paper" : ""
                }`}
              >
                <span className="text-ink">{option.name}</span>
                {option.description && (
                  <span className="text-xs text-ink/50">{option.description}</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      className="shrink-0 text-ink/40"
    >
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
