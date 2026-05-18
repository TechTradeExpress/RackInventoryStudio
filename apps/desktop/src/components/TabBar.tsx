import type { CSSProperties } from "react";

export interface TabDef {
  id: string;
  label: string;
  disabled?: boolean;
}

interface TabBarProps {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
}

export function TabBar({ tabs, active, onChange }: TabBarProps) {
  return (
    <div style={styles.bar}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          disabled={tab.disabled}
          onClick={() => onChange(tab.id)}
          style={{
            ...styles.tab,
            ...(active === tab.id ? styles.activeTab : {}),
            ...(tab.disabled ? styles.disabledTab : {}),
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  bar: {
    display: "flex",
    gap: "0",
    borderBottom: "2px solid #ccc",
    marginBottom: "1rem",
  },
  tab: {
    padding: "0.4rem 1rem",
    fontFamily: "monospace",
    fontSize: "0.9rem",
    border: "1px solid #ccc",
    borderBottom: "none",
    background: "#f4f4f4",
    cursor: "pointer",
    borderRadius: "3px 3px 0 0",
    marginRight: "2px",
  },
  activeTab: {
    background: "#fff",
    borderBottom: "2px solid #fff",
    fontWeight: "bold",
    marginBottom: "-2px",
  },
  disabledTab: {
    color: "#aaa",
    cursor: "default",
  },
};
