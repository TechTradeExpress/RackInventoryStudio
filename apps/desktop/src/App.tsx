import { useState } from "react";
import {
  openRepository,
  closeRepository,
  selectRepositoryFolder,
  type OpenRepositoryResultDto,
  type RepositorySummaryDto,
  type RackSummaryDto,
} from "./api/tauriClient";
import { TabBar } from "./components/TabBar";
import { RepositoryPanel } from "./features/repository/RepositoryPanel";
import { ValidationPanel } from "./features/validation/ValidationPanel";
import { LocationsPanel } from "./features/locations/LocationsPanel";
import { RacksPanel } from "./features/racks/RacksPanel";
import { DevicesPanel } from "./features/devices/DevicesPanel";
import { DeviceModelsPanel } from "./features/deviceModels/DeviceModelsPanel";
import { common } from "./lib/styles";

type Tab =
  | "repository"
  | "validation"
  | "locations"
  | "racks"
  | "devices"
  | "device_models";

export function App() {
  const [repoPath, setRepoPath] = useState("");
  const [summary, setSummary] = useState<RepositorySummaryDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("repository");
  const [selectedRack, setSelectedRack] = useState<RackSummaryDto | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const isOpen = summary !== null;

  async function handleOpen() {
    if (!repoPath.trim()) return;
    setWorking(true);
    setError(null);
    try {
      const result: OpenRepositoryResultDto = await openRepository(
        repoPath.trim(),
      );
      setSummary(result.summary);
      setSelectedRack(null);
      setHasUnsavedChanges(false);
      setActiveTab("repository");
    } catch (e) {
      setError(String(e));
    } finally {
      setWorking(false);
    }
  }

  async function handleBrowse() {
    try {
      const path = await selectRepositoryFolder();
      if (path !== null) setRepoPath(path);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleClose() {
    if (
      hasUnsavedChanges &&
      !confirm(
        "You have unsaved in-memory changes. Close anyway? Changes not saved to disk will be lost.",
      )
    ) {
      return;
    }
    setWorking(true);
    setError(null);
    try {
      await closeRepository();
      setSummary(null);
      setSelectedRack(null);
      setHasUnsavedChanges(false);
      setActiveTab("repository");
    } catch (e) {
      setError(String(e));
    } finally {
      setWorking(false);
    }
  }

  const tabs = [
    { id: "repository", label: "Repository" },
    { id: "validation", label: "Validation", disabled: !isOpen },
    { id: "locations", label: "Locations", disabled: !isOpen },
    { id: "racks", label: "Racks", disabled: !isOpen },
    { id: "devices", label: "Devices", disabled: !isOpen },
    { id: "device_models", label: "Device Models", disabled: !isOpen },
  ];

  return (
    <main style={styles.main}>
      <h1 style={{ margin: "0 0 1rem" }}>Rack Inventory Studio</h1>

      {working && <p style={common.working}>Working…</p>}

      {error && (
        <div style={common.errorBox}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {hasUnsavedChanges && (
        <div style={styles.unsavedBanner}>
          Unsaved changes in memory — use <strong>Save</strong> in the
          Validation tab to write changes to disk.
        </div>
      )}

      <TabBar
        tabs={tabs}
        active={activeTab}
        onChange={(id) => setActiveTab(id as Tab)}
      />

      {activeTab === "repository" && (
        <RepositoryPanel
          repoPath={repoPath}
          onRepoPathChange={setRepoPath}
          onOpen={handleOpen}
          onBrowse={handleBrowse}
          onClose={handleClose}
          working={working}
          summary={summary}
        />
      )}

      {activeTab === "validation" && isOpen && (
        <ValidationPanel
          working={working}
          setWorking={setWorking}
          setError={setError}
          onSaveSuccess={() => setHasUnsavedChanges(false)}
        />
      )}

      {activeTab === "locations" && isOpen && (
        <LocationsPanel
          repoPath={summary.repo_path}
          onRepositoryMutated={() => setHasUnsavedChanges(true)}
        />
      )}

      {activeTab === "racks" && isOpen && (
        <RacksPanel
          repoPath={summary.repo_path}
          selectedRackId={selectedRack?.id ?? null}
          onSelectRack={setSelectedRack}
          onRepositoryMutated={() => setHasUnsavedChanges(true)}
        />
      )}

      {activeTab === "devices" && isOpen && (
        <DevicesPanel
          repoPath={summary.repo_path}
          onRepositoryMutated={() => setHasUnsavedChanges(true)}
        />
      )}

      {activeTab === "device_models" && isOpen && (
        <DeviceModelsPanel
          repoPath={summary.repo_path}
          onRepositoryMutated={() => setHasUnsavedChanges(true)}
        />
      )}
    </main>
  );
}

const styles = {
  main: {
    fontFamily: "monospace",
    padding: "1.25rem",
    maxWidth: "960px",
    margin: "0 auto",
  },
  unsavedBanner: {
    marginBottom: "0.6rem",
    padding: "0.35rem 0.75rem",
    background: "#fff8e1",
    border: "1px solid #f5c800",
    borderRadius: 3,
    fontSize: "0.82rem",
    color: "#7a5800",
  },
};
