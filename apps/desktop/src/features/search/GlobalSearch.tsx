import { type CSSProperties, useEffect, useRef, useState } from "react";
import { searchRepository, type SearchResultDto } from "../../api/tauriClient";
import { IcSearch } from "../../components/ui/Icon";

const KIND_LABEL: Record<SearchResultDto["kind"], string> = {
  location: "Location",
  rack: "Rack",
  device: "Device",
  device_model: "Model",
  placement: "Placement",
};

export interface SearchNavigationEvent {
  tab: "locations" | "racks" | "devices" | "device_models";
  locationId?: string;
  rackId?: string;
  placementId?: string;
  deviceId?: string;
  deviceModelId?: string;
}

interface Props {
  onNavigate: (event: SearchNavigationEvent) => void;
  /** Increment this token whenever repository data mutates to trigger a re-search. */
  refreshKey?: number;
  /** When true, the container fills its parent width instead of fixed 320px. */
  fullWidth?: boolean;
}

export function GlobalSearch({ onNavigate, refreshKey, fullWidth }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultDto[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonically increasing counter guards against stale async results.
  const seqRef = useRef(0);
  // Always-current query value readable inside effects without adding query to deps.
  const queryRef = useRef(query);
  queryRef.current = query;

  // Re-run search when query changes (debounced).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setOpen(false);
      setError(null);
      return;
    }
    const seq = ++seqRef.current;
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await searchRepository(trimmed);
        if (seq !== seqRef.current) return;
        setResults(res);
        setOpen(true);
        setActiveIndex(-1);
      } catch (e) {
        if (seq !== seqRef.current) return;
        setResults([]);
        setError(String(e));
        setOpen(true);
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Re-run immediately (no debounce) when repository data mutates.
  // Does not clear query; does not show stale results while the request is in flight.
  useEffect(() => {
    if (refreshKey === undefined) return;
    const trimmed = queryRef.current.trim();
    if (trimmed.length < 2) return;
    const seq = ++seqRef.current;
    setLoading(true);
    searchRepository(trimmed)
      .then((res) => {
        if (seq !== seqRef.current) return;
        setResults(res);
        setActiveIndex(-1);
        setError(null);
      })
      .catch((e) => {
        if (seq !== seqRef.current) return;
        setError(String(e));
      })
      .finally(() => {
        if (seq === seqRef.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]); // intentionally excludes query — we read it via queryRef

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(result: SearchResultDto) {
    setQuery("");
    setOpen(false);
    setResults([]);
    setError(null);
    const nav = result.navigation;
    switch (result.kind) {
      case "location":
        onNavigate({ tab: "locations", locationId: nav.location_id ?? undefined });
        break;
      case "rack":
        onNavigate({ tab: "racks", rackId: nav.rack_id ?? undefined });
        break;
      case "device":
        onNavigate({ tab: "devices", deviceId: nav.device_id ?? undefined });
        break;
      case "device_model":
        onNavigate({ tab: "device_models", deviceModelId: nav.device_model_id ?? undefined });
        break;
      case "placement":
        onNavigate({
          tab: "racks",
          rackId: nav.rack_id ?? undefined,
          placementId: nav.placement_id ?? undefined,
        });
        break;
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(results[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const dropdownBase: CSSProperties = {
    position: "absolute",
    top: "calc(100% + 2px)",
    left: 0,
    right: 0,
    background: "var(--bg-surface)",
    border: "1px solid var(--bd-2)",
    borderRadius: "var(--r-2)",
    zIndex: 1000,
    padding: "4px 0",
  };

  return (
    <div ref={containerRef} style={{ position: "relative", width: fullWidth ? "100%" : 320 }}>
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--tx-3)", pointerEvents: "none", display: "flex", alignItems: "center" }}>
          {loading ? <span style={{ fontSize: 11 }}>…</span> : <IcSearch size={12} />}
        </span>
        <input
          ref={inputRef}
          type="text"
          className="ri-input"
          style={{ width: "100%", paddingLeft: 26, paddingRight: query ? 26 : undefined, fontSize: "var(--fs-12)" }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0 || error) setOpen(true);
          }}
          placeholder="Search… (min 2 chars)"
          data-testid="global-search-input"
          aria-label="Global search"
          aria-expanded={open}
          aria-haspopup="listbox"
          role="combobox"
          aria-autocomplete="list"
        />
        {query && (
          <button
            type="button"
            style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", cursor: "pointer", color: "var(--tx-3)", padding: "0 2px", fontSize: 14, lineHeight: 1 }}
            onClick={() => {
              setQuery("");
              setResults([]);
              setOpen(false);
              setError(null);
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {open && error && (
        <div style={{ ...dropdownBase, background: "var(--st-err-bg)", border: "1px solid var(--st-err-bd)", padding: "8px 10px", fontSize: "var(--fs-12)", color: "var(--st-err-tx)" }}>
          {error}
        </div>
      )}

      {open && !error && results.length > 0 && (
        <ul style={{ ...dropdownBase, listStyle: "none", margin: 0, boxShadow: "var(--sh-2)", maxHeight: 320, overflowY: "auto" }} role="listbox">
          {results.map((r, idx) => (
            <li
              key={`${r.kind}-${r.id}`}
              style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "5px 10px", cursor: "pointer", fontSize: "var(--fs-12)", background: idx === activeIndex ? "var(--ac-soft-bg)" : undefined }}
              role="option"
              aria-selected={idx === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(r);
              }}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              <span style={{ fontSize: 10, color: "var(--ac-text)", background: "var(--ac-soft-bg)", border: "1px solid var(--ac-soft-bd)", borderRadius: "var(--r-1)", padding: "0 4px", flexShrink: 0, fontWeight: 600, letterSpacing: "0.02em" }}>
                {KIND_LABEL[r.kind]}
              </span>
              <span style={{ fontWeight: 600, color: "var(--tx-1)", fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{r.label}</span>
              {r.detail && <span style={{ color: "var(--tx-3)", fontSize: 11, flexShrink: 0 }}>{r.detail}</span>}
            </li>
          ))}
        </ul>
      )}

      {open && !error && query.trim().length >= 2 && !loading && results.length === 0 && (
        <div style={{ ...dropdownBase, padding: "8px 10px", fontSize: "var(--fs-12)", color: "var(--tx-3)" }}>
          No results
        </div>
      )}
    </div>
  );
}
