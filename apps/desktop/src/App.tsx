import { useState } from "react";
import {
  openRepository,
  closeRepository,
  selectRepositoryFolder,
  type OpenRepositoryResultDto,
  type RepositorySummaryDto,
} from "./api/tauriClient";
import { TabBar } from "./components/TabBar";
import { RepositoryPanel } from "./features/repository/RepositoryPanel";
import { ValidationPanel } from "./features/validation/ValidationPanel";
import { LocationsPanel } from "./features/locations/LocationsPanel";
import { RacksPanel } from "./features/racks/RacksPanel";
import { common } from "./lib/styles";

type Tab = "repository" | "validation" | "locations" | "racks";

export function App() {
  const [repoPath, setRepoPath] = useState("");
  const [summary, setSummary] = useState<RepositorySummaryDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("repository");

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
    setWorking(true);
    setError(null);
    try {
      await closeRepository();
      setSummary(null);
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
        />
      )}

      {activeTab === "locations" && isOpen && (
        <LocationsPanel repoPath={summary.repo_path} />
      )}

      {activeTab === "racks" && isOpen && (
        <RacksPanel repoPath={summary.repo_path} />
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
};
