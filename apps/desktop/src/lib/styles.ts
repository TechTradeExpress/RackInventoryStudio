import type { CSSProperties } from "react";

export const common: Record<string, CSSProperties> = {
  section: {
    marginTop: "1.25rem",
    paddingTop: "0.75rem",
    borderTop: "1px solid #ddd",
  },
  h2: { margin: "0 0 0.5rem" },
  h3: { margin: "0 0 0.4rem" },
  hint: { margin: "0 0 0.4rem", color: "#666", fontSize: "0.82rem" },
  btn: {
    padding: "0.4rem 0.8rem",
    fontFamily: "monospace",
    cursor: "pointer",
    border: "1px solid #999",
    borderRadius: "3px",
    background: "#f4f4f4",
  },
  input: {
    flex: 1,
    padding: "0.4rem 0.5rem",
    fontFamily: "monospace",
    fontSize: "0.9rem",
    border: "1px solid #ccc",
    borderRadius: "3px",
  },
  table: {
    borderCollapse: "collapse" as const,
    width: "100%",
  },
  th: {
    padding: "0.2rem 0.5rem",
    textAlign: "left" as const,
    fontWeight: "bold",
    borderBottom: "1px solid #eee",
    whiteSpace: "nowrap" as const,
  },
  td: {
    padding: "0.2rem 0.5rem",
    borderBottom: "1px solid #eee",
  },
  errorBox: {
    marginTop: "0.75rem",
    padding: "0.5rem 0.75rem",
    background: "#fff0f0",
    border: "1px solid #f88",
    color: "#b00",
    borderRadius: "3px",
  },
  working: { color: "#888", fontStyle: "italic", margin: "0.5rem 0" },
  row: { display: "flex", gap: "0.5rem" },
};
