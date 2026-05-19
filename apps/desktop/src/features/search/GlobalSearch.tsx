import { useEffect, useRef, useState } from "react";
import { searchRepository, type SearchResultDto } from "../../api/tauriClient";

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
}

export function GlobalSearch({ onNavigate, refreshKey }: Props) {
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

  return (
    <div ref={containerRef} style={styles.container}>
      <div style={styles.inputWrapper}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0 || error) setOpen(true);
          }}
          placeholder="Search… (min 2 chars)"
          style={styles.input}
          aria-label="Global search"
          aria-expanded={open}
          aria-haspopup="listbox"
          role="combobox"
          aria-autocomplete="list"
        />
        {loading && <span style={styles.spinner}>…</span>}
        {query && (
          <button
            type="button"
            style={styles.clearBtn}
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
        <div style={styles.errorBox}>{error}</div>
      )}

      {open && !error && results.length > 0 && (
        <ul style={styles.dropdown} role="listbox">
          {results.map((r, idx) => (
            <li
              key={`${r.kind}-${r.id}`}
              style={{
                ...styles.item,
                ...(idx === activeIndex ? styles.itemActive : {}),
              }}
              role="option"
              aria-selected={idx === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(r);
              }}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              <span style={styles.kindBadge}>{KIND_LABEL[r.kind]}</span>
              <span style={styles.itemCode}>{r.code}</span>
              {r.label !== r.code && <span style={styles.itemLabel}>{r.label}</span>}
              {r.detail && <span style={styles.itemDetail}>{r.detail}</span>}
            </li>
          ))}
        </ul>
      )}

      {open && !error && query.trim().length >= 2 && !loading && results.length === 0 && (
        <div style={styles.noResults}>No results</div>
      )}
    </div>
  );
}

const styles = {
  container: {
    position: "relative" as const,
    display: "inline-block",
    width: "320px",
  },
  inputWrapper: {
    display: "flex",
    alignItems: "center",
    border: "1px solid #ccc",
    borderRadius: "4px",
    background: "#fff",
    overflow: "hidden",
  },
  input: {
    flex: 1,
    border: "none",
    outline: "none",
    padding: "0.3rem 0.5rem",
    fontFamily: "monospace",
    fontSize: "0.85rem",
    background: "transparent",
  },
  spinner: {
    padding: "0 0.4rem",
    color: "#999",
    fontSize: "0.85rem",
  },
  clearBtn: {
    border: "none",
    background: "transparent",
    cursor: "pointer",
    color: "#999",
    padding: "0 0.4rem",
    fontSize: "1rem",
    lineHeight: 1,
  },
  dropdown: {
    position: "absolute" as const,
    top: "calc(100% + 2px)",
    left: 0,
    right: 0,
    background: "#fff",
    border: "1px solid #ccc",
    borderRadius: "4px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
    zIndex: 1000,
    listStyle: "none",
    margin: 0,
    padding: "0.2rem 0",
    maxHeight: "320px",
    overflowY: "auto" as const,
  },
  item: {
    display: "flex",
    alignItems: "baseline",
    gap: "0.4rem",
    padding: "0.3rem 0.6rem",
    cursor: "pointer",
    fontSize: "0.82rem",
  },
  itemActive: {
    background: "#e8f0fe",
  },
  kindBadge: {
    fontSize: "0.7rem",
    color: "#fff",
    background: "#607d8b",
    borderRadius: "3px",
    padding: "0 0.3rem",
    flexShrink: 0,
  },
  itemCode: {
    fontFamily: "monospace",
    fontWeight: 600,
    color: "#222",
  },
  itemLabel: {
    color: "#555",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    flex: 1,
  },
  itemDetail: {
    color: "#888",
    fontSize: "0.75rem",
    flexShrink: 0,
  },
  errorBox: {
    position: "absolute" as const,
    top: "calc(100% + 2px)",
    left: 0,
    right: 0,
    background: "#fff0f0",
    border: "1px solid #f88",
    borderRadius: "4px",
    padding: "0.4rem 0.6rem",
    fontSize: "0.82rem",
    color: "#b00",
    zIndex: 1000,
  },
  noResults: {
    position: "absolute" as const,
    top: "calc(100% + 2px)",
    left: 0,
    right: 0,
    background: "#fff",
    border: "1px solid #ccc",
    borderRadius: "4px",
    padding: "0.4rem 0.6rem",
    fontSize: "0.82rem",
    color: "#888",
    zIndex: 1000,
  },
};
