import { useState } from "react";
import {
  openRepository,
  closeRepository,
  selectRepositoryFolder,
  getRepositorySummary,
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
import { CsvImportPanel } from "./features/csvImport/CsvImportPanel";
import { common } from "./lib/styles";
import type { ValidationNavigationTarget } from "./features/validation/navigation";

type Tab =
  | "repository"
  | "validation"
  | "locations"
  | "racks"
  | "devices"
  | "device_models"
  | "csv_import";

export function App() {
  const [repoPath, setRepoPath] = useState("");
  const [summary, setSummary] = useState<RepositorySummaryDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("repository");
  const [selectedRack, setSelectedRack] = useState<RackSummaryDto | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [repositoryMutationToken, setRepositoryMutationToken] = useState(0);

  // Navigation highlights set from validation drill-down
  const [highlightedLocationId, setHighlightedLocationId] = useState<string | null>(null);
  const [highlightedDeviceId, setHighlightedDeviceId] = useState<string | null>(null);
  const [highlightedDeviceModelId, setHighlightedDeviceModelId] = useState<string | null>(null);
  const [pendingRackNavTarget, setPendingRackNavTarget] = useState<{
    rackId: string;
    placementId?: string;
  } | null>(null);

  const isOpen = summary !== null;

  function handleRepositoryMutated() {
    setHasUnsavedChanges(true);
    setRepositoryMutationToken((t) => t + 1);
    getRepositorySummary()
      .then(setSummary)
      .catch(() => {});
  }

  function handleNavigateFromValidation(target: ValidationNavigationTarget) {
    setHighlightedLocationId(null);
    setHighlightedDeviceId(null);
    setHighlightedDeviceModelId(null);
    setPendingRackNavTarget(null);

    switch (target.tab) {
      case "locations":
        setActiveTab("locations");
        setHighlightedLocationId(target.locationId ?? null);
        break;
      case "racks":
        setActiveTab("racks");
        if (target.rackId) {
          setPendingRackNavTarget({
            rackId: target.rackId,
            placementId: target.placementId,
          });
        }
        break;
      case "devices":
        setActiveTab("devices");
        setHighlightedDeviceId(target.deviceId ?? null);
        break;
      case "device_models":
        setActiveTab("device_models");
        setHighlightedDeviceModelId(target.deviceModelId ?? null);
        break;
    }
  }

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
      setHighlightedLocationId(null);
      setHighlightedDeviceId(null);
      setHighlightedDeviceModelId(null);
      setPendingRackNavTarget(null);
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
      setHighlightedLocationId(null);
      setHighlightedDeviceId(null);
      setHighlightedDeviceModelId(null);
      setPendingRackNavTarget(null);
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
    { id: "csv_import", label: "CSV Import", disabled: !isOpen },
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
          hasUnsavedChanges={hasUnsavedChanges}
          onPullSuccess={(s) => setSummary(s)}
          onPullRunning={(v) => setWorking(v)}
        />
      )}

      {activeTab === "validation" && isOpen && (
        <ValidationPanel
          working={working}
          setWorking={setWorking}
          setError={setError}
          onSaveSuccess={() => setHasUnsavedChanges(false)}
          onNavigate={handleNavigateFromValidation}
        />
      )}

      {activeTab === "locations" && isOpen && (
        <LocationsPanel
          repoPath={summary.repo_path}
          highlightedLocationId={highlightedLocationId}
          onRepositoryMutated={handleRepositoryMutated}
        />
      )}

      {activeTab === "racks" && isOpen && (
        <RacksPanel
          repoPath={summary.repo_path}
          selectedRackId={selectedRack?.id ?? null}
          onSelectRack={setSelectedRack}
          mutationToken={repositoryMutationToken}
          pendingRackNavTarget={pendingRackNavTarget}
          onRackNavTargetConsumed={() => setPendingRackNavTarget(null)}
          onRepositoryMutated={handleRepositoryMutated}
        />
      )}

      {activeTab === "devices" && isOpen && (
        <DevicesPanel
          repoPath={summary.repo_path}
          mutationToken={repositoryMutationToken}
          highlightedDeviceId={highlightedDeviceId}
          onRepositoryMutated={handleRepositoryMutated}
        />
      )}

      {activeTab === "device_models" && isOpen && (
        <DeviceModelsPanel
          repoPath={summary.repo_path}
          mutationToken={repositoryMutationToken}
          highlightedDeviceModelId={highlightedDeviceModelId}
          onRepositoryMutated={handleRepositoryMutated}
        />
      )}

      {activeTab === "csv_import" && isOpen && (
        <CsvImportPanel
          onRepositoryMutated={handleRepositoryMutated}
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
