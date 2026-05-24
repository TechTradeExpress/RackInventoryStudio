import { PageHeader } from "../../components/ui/PageHeader";
import { Panel } from "../../components/ui/Panel";
import pkg from "../../../package.json";

export function SettingsPanel() {
  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Application configuration and diagnostics."
      />
      <div className="page-content stack-4">
        <Panel title="Application">
          <p style={{ fontSize: 12, color: "var(--tx-3)", margin: 0 }}>
            Application preferences will appear here in a future beta. No configurable options are available yet.
          </p>
        </Panel>

        <Panel title="Diagnostics and logs">
          <div style={{ fontSize: 12, color: "var(--tx-2)", lineHeight: 1.7 }}>
            <p style={{ margin: "0 0 8px" }}>
              Diagnostic logs are written to the local device only. No telemetry, no external upload.
            </p>
            <p style={{ margin: "0 0 4px", fontWeight: 600 }}>Log location on Windows:</p>
            <p style={{ margin: "0 0 8px" }}>
              <span className="code">%APPDATA%\com.techtradeexpress.rackinventorystudio\logs\</span>
            </p>
            <p style={{ margin: "0 0 4px", fontWeight: 600 }}>Log location on Linux:</p>
            <p style={{ margin: "0 0 8px" }}>
              <span className="code">~/.local/share/com.techtradeexpress.rackinventorystudio/logs/</span>
            </p>
            <p style={{ margin: 0, color: "var(--tx-3)" }}>
              See <span className="code">.ai/local-diagnostics-logging.md</span> in the repository for full details on what is and is not logged.
            </p>
          </div>
        </Panel>

        <Panel title="About">
          <div className="kv" style={{ fontSize: 12 }}>
            <div className="kv-row">
              <dt>Application</dt>
              <dd>Rack Inventory Studio</dd>
            </div>
            <div className="kv-row">
              <dt>Version</dt>
              <dd className="mono">{pkg.version}</dd>
            </div>
            <div className="kv-row">
              <dt>Build type</dt>
              <dd>Beta (unsigned)</dd>
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}
