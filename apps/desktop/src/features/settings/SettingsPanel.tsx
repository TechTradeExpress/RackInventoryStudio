import { useEffect, useState } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { Panel } from "../../components/ui/Panel";
import { Banner } from "../../components/ui/Banner";
import pkg from "../../../package.json";
import {
  getLogSettings,
  openLogsDirectory,
  setLogsDirectory,
  resetLogsDirectory,
  selectDirectory,
  type LogSettingsDto,
} from "../../api/tauriClient";

export function SettingsPanel() {
  const [logSettings, setLogSettings] = useState<LogSettingsDto | null>(null);
  const [logError, setLogError] = useState<string | null>(null);
  const [logSuccess, setLogSuccess] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    getLogSettings()
      .then(setLogSettings)
      .catch((e: unknown) => {
        setLogError(String(e));
      });
  }, []);

  async function handleOpenLogsFolder() {
    setLogError(null);
    setLogSuccess(null);
    setIsWorking(true);
    try {
      await openLogsDirectory();
    } catch (e: unknown) {
      setLogError(String(e));
    } finally {
      setIsWorking(false);
    }
  }

  async function handleChooseLogsFolder() {
    setLogError(null);
    setLogSuccess(null);
    const chosen = await selectDirectory();
    if (chosen === null) return; // user cancelled — silent
    setIsWorking(true);
    try {
      const updated = await setLogsDirectory(chosen);
      setLogSettings(updated);
      setLogSuccess(
        "Custom log directory saved. Changes will apply after restarting the app.",
      );
    } catch (e: unknown) {
      setLogError(String(e));
    } finally {
      setIsWorking(false);
    }
  }

  async function handleResetLogsDirectory() {
    setLogError(null);
    setLogSuccess(null);
    setIsWorking(true);
    try {
      const updated = await resetLogsDirectory();
      setLogSettings(updated);
      setLogSuccess(
        updated.restart_required
          ? "Log directory reset to default. Changes will apply after restarting the app."
          : "Log directory reset to default.",
      );
    } catch (e: unknown) {
      setLogError(String(e));
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Application configuration and diagnostics."
      />
      <div className="page-content stack-4">
        <Panel title="Application">
          <p style={{ fontSize: 12, color: "var(--tx-3)", margin: 0 }}>
            Application preferences will appear here in a future beta. No
            configurable options are available yet.
          </p>
        </Panel>

        <Panel title="Diagnostics and logs">
          <div style={{ fontSize: 12, color: "var(--tx-2)", lineHeight: 1.7 }}>
            <p style={{ margin: "0 0 8px" }}>
              Diagnostic logs are written to the local device only. No
              telemetry, no external upload.
            </p>

            {logSettings ? (
              <div className="stack-2" style={{ marginBottom: 12 }}>
                <div>
                  <span style={{ fontWeight: 600 }}>
                    Default logs location:
                  </span>{" "}
                  <span className="code">{logSettings.default_log_dir}</span>
                </div>
                <div>
                  <span style={{ fontWeight: 600 }}>Active logs location:</span>{" "}
                  <span
                    className="code"
                    style={
                      logSettings.custom_log_dir
                        ? { fontWeight: 700 }
                        : undefined
                    }
                  >
                    {logSettings.active_log_dir}
                  </span>
                </div>
                {logSettings.custom_log_dir && (
                  <div>
                    <span style={{ fontWeight: 600 }}>Custom directory:</span>{" "}
                    <span className="code">{logSettings.custom_log_dir}</span>
                    {logSettings.restart_required && (
                      <span
                        style={{ marginLeft: 8, color: "var(--tx-3)" }}
                      >
                        Changes will apply after restart.
                      </span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ marginBottom: 12, color: "var(--tx-3)" }}>
                <p style={{ margin: "0 0 4px", fontWeight: 600 }}>
                  Log location on Windows:
                </p>
                <p style={{ margin: "0 0 8px" }}>
                  <span className="code">
                    %ProgramData%\TechTradeExpress\RackInventoryStudio\logs
                  </span>
                </p>
                <p style={{ margin: "0 0 4px", fontWeight: 600 }}>
                  Log location on Linux:
                </p>
                <p style={{ margin: "0 0 8px" }}>
                  <span className="code">
                    ~/.local/share/com.techtradeexpress.rackinventorystudio/logs/
                  </span>
                </p>
              </div>
            )}

            {logError && (
              <div style={{ marginBottom: 8 }}>
                <Banner tone="err" onDismiss={() => setLogError(null)}>
                  {logError}
                </Banner>
              </div>
            )}
            {logSuccess && (
              <div style={{ marginBottom: 8 }}>
                <Banner tone="ok" onDismiss={() => setLogSuccess(null)}>
                  {logSuccess}
                </Banner>
              </div>
            )}

            <div className="row-4" style={{ flexWrap: "wrap", gap: 8 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleOpenLogsFolder}
                disabled={isWorking}
              >
                Open logs folder
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleChooseLogsFolder}
                disabled={isWorking}
              >
                Choose logs folder…
              </button>
              {logSettings?.custom_log_dir && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={handleResetLogsDirectory}
                  disabled={isWorking}
                >
                  Reset to default
                </button>
              )}
            </div>

            <p style={{ margin: "12px 0 0", color: "var(--tx-3)" }}>
              See{" "}
              <span className="code">.ai/local-diagnostics-logging.md</span> in
              the repository for full details on what is and is not logged.
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
