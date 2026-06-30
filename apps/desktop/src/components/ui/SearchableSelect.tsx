import { useState, useRef, useEffect, useId } from "react";
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
  const [activeIdx, setActiveIdx] = useState(-1);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const listboxId = useId();

  const selected = options.find((o) => o.value === value);

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(needle) ||
          (o.keywords ?? "").toLowerCase().includes(needle),
      )
    : options;

  const activeOption = activeIdx >= 0 && activeIdx < filtered.length ? filtered[activeIdx] : null;
  const activeOptionId = activeOption ? `${listboxId}-opt-${activeOption.value}` : undefined;

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
    // Prefer the currently selected item; fall back to first item
    const idx = options.findIndex((o) => o.value === value);
    setActiveIdx(idx >= 0 ? idx : options.length > 0 ? 0 : -1);
  }

  function closeDropdown() {
    setOpen(false);
    setQuery("");
    setActiveIdx(-1);
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

  // Scroll active option into view when it changes via keyboard
  useEffect(() => {
    if (!open || activeIdx < 0 || !listRef.current) return;
    const active = listRef.current.querySelector<HTMLElement>("[data-active='true']");
    active?.scrollIntoView?.({ block: "nearest" });
  }, [activeIdx, open]);

  function handleTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown" && !open) {
      e.preventDefault();
      openDropdown();
    }
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (filtered.length > 0) {
          setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        if (filtered.length > 0) setActiveIdx(0);
        break;
      case "End":
        e.preventDefault();
        if (filtered.length > 0) setActiveIdx(filtered.length - 1);
        break;
      case "Enter":
        e.preventDefault();
        if (activeIdx >= 0 && activeIdx < filtered.length) {
          selectOption(filtered[activeIdx].value);
        }
        break;
    }
  }

  return (
    <div className="ss-wrap" data-testid={dataTestId}>
      <button
        ref={triggerRef}
        type="button"
        className={`ss-trigger${open ? " ss-open" : ""}`}
        onClick={open ? closeDropdown : openDropdown}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
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
            id={listboxId}
            aria-label={ariaLabel}
          >
            <div className="ss-search">
              <input
                ref={searchRef}
                className="ss-search-input"
                type="text"
                placeholder="Search…"
                value={query}
                onChange={(e) => {
                  const newQuery = e.target.value;
                  const newNeedle = newQuery.trim().toLowerCase();
                  const newFiltered = newNeedle
                    ? options.filter(
                        (o) =>
                          o.label.toLowerCase().includes(newNeedle) ||
                          (o.keywords ?? "").toLowerCase().includes(newNeedle),
                      )
                    : options;
                  setQuery(newQuery);
                  setActiveIdx(newFiltered.length > 0 ? 0 : -1);
                }}
                onKeyDown={handleSearchKeyDown}
                aria-label="Search options"
                aria-controls={listboxId}
                aria-activedescendant={activeOptionId}
                data-testid={dataTestId ? `${dataTestId}-search` : undefined}
              />
            </div>
            <div className="ss-list" ref={listRef}>
              {filtered.length === 0 ? (
                <div className="ss-empty">No results</div>
              ) : (
                filtered.map((o, idx) => (
                  <div
                    key={o.value}
                    id={`${listboxId}-opt-${o.value}`}
                    className={`ss-option${o.value === value ? " ss-selected" : ""}${idx === activeIdx ? " ss-active" : ""}`}
                    role="option"
                    aria-selected={o.value === value}
                    data-active={idx === activeIdx ? "true" : undefined}
                    onMouseDown={(e) => {
                      // preventDefault keeps focus on the trigger / search input
                      e.preventDefault();
                      selectOption(o.value);
                    }}
                    onMouseEnter={() => setActiveIdx(idx)}
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
