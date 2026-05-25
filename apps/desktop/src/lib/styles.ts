import type { CSSProperties } from "react";

export const common: Record<string, CSSProperties> = {
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
  errorBox: {
    marginTop: "0.75rem",
    padding: "0.5rem 0.75rem",
    background: "#fff0f0",
    border: "1px solid #f88",
    color: "#b00",
    borderRadius: "3px",
  },
  row: { display: "flex", gap: "0.5rem" },
};
