import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

export interface SelectOption {
  value: string;
  label: string;
  /** Additional text searched but not displayed as the primary label (vendor, SKU, type…). */
  keywords?: string;
  /** Secondary line shown below the label in the dropdown. */
  meta?: string;
}

interface Props {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
  "data-testid"?: string;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "— select —",
  disabled = false,
  "aria-label": ariaLabel,
  "data-testid": dataTestId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({});

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(needle) ||
          (o.keywords ?? "").toLowerCase().includes(needle),
      )
    : options;

  function openDropdown() {
    if (disabled) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setDropStyle({
        position: "fixed",
        top: rect.bottom + 2,
        left: rect.left,
        width: Math.max(rect.width, 220),
        zIndex: 9999,
      });
    }
    setQuery("");
    setOpen(true);
  }

  function closeDropdown() {
    setOpen(false);
    setQuery("");
  }

  function selectOption(val: string) {
    onChange(val);
    closeDropdown();
    triggerRef.current?.focus();
  }

  // Focus the search input when the dropdown opens
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  // Close on click outside (both trigger and dropdown are excluded)
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (
        !triggerRef.current?.contains(t) &&
        !dropdownRef.current?.contains(t)
      ) {
        closeDropdown();
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  // Close on Escape — capture phase so it intercepts before Modal's keydown handler
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeDropdown();
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

  return (
    <div className="ss-wrap" data-testid={dataTestId}>
      <button
        ref={triggerRef}
        type="button"
        className={`ss-trigger${open ? " ss-open" : ""}`}
        onClick={open ? closeDropdown : openDropdown}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        data-testid={dataTestId ? `${dataTestId}-trigger` : undefined}
      >
        <span className={selected ? "ss-val" : "ss-placeholder"}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="ss-caret" aria-hidden="true">▾</span>
      </button>

      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            className="ss-dropdown"
            style={dropStyle}
            role="listbox"
            aria-label={ariaLabel}
          >
            <div className="ss-search">
              <input
                ref={searchRef}
                className="ss-search-input"
                type="text"
                placeholder="Search…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search options"
                data-testid={dataTestId ? `${dataTestId}-search` : undefined}
              />
            </div>
            <div className="ss-list">
              {filtered.length === 0 ? (
                <div className="ss-empty">No results</div>
              ) : (
                filtered.map((o) => (
                  <div
                    key={o.value}
                    className={`ss-option${o.value === value ? " ss-selected" : ""}`}
                    role="option"
                    aria-selected={o.value === value}
                    onMouseDown={(e) => {
                      // preventDefault keeps focus on the trigger / search input
                      e.preventDefault();
                      selectOption(o.value);
                    }}
                  >
                    <span className="ss-opt-label">{o.label}</span>
                    {o.meta && <span className="ss-opt-meta">{o.meta}</span>}
                  </div>
                ))
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
