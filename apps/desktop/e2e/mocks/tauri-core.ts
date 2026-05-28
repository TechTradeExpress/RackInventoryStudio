// Mock for @tauri-apps/api/core used in Playwright E2E tests.
// Replaces all invoke() calls with static fixture data so tests run
// against a plain Vite dev server without a Tauri runtime.

export const FIXTURE_REPO_PATH = "/tmp/ris-e2e-fixture";

const FIXTURE_LOCATION_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const FIXTURE_RACK_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const FIXTURE_DEVICE_MODEL_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const FIXTURE_RACK_OBJECT_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const FIXTURE_DEVICE_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const FIXTURE_PLACEMENT_ID = "ffffffff-ffff-ffff-ffff-ffffffffffff";
const FIXTURE_NEW_PLACEMENT_ID = "11111111-1111-1111-1111-111111111111";
export const FIXTURE_UNPLACED_DEVICE_ID = "22222222-2222-2222-2222-222222222222";
export const FIXTURE_NEW_DEVICE_ID = "33333333-3333-3333-3333-333333333333";
export const FIXTURE_NEW_MODEL_ID = "44444444-4444-4444-4444-444444444444";

const COMMANDS: Record<string, unknown> = {
  open_repository_cmd: {
    summary: {
      repo_path: FIXTURE_REPO_PATH,
      repository_code: "test-repo",
      repository_name: "Test Repository",
      locations_count: 1,
      racks_count: 1,
      device_models_count: 2,
      devices_count: 1,
      placement_files_count: 1,
      placements_count: 3,
      unplaced_devices_count: 1,
    },
    validation_summary: { errors: 0, warnings: 0, infos: 0, total: 0 },
  },
  get_repository_summary: {
    repo_path: FIXTURE_REPO_PATH,
    repository_code: "test-repo",
    repository_name: "Test Repository",
    locations_count: 1,
    racks_count: 1,
    device_models_count: 2,
    devices_count: 1,
    placement_files_count: 1,
    placements_count: 3,
    unplaced_devices_count: 0,
  },
  validate_current_repository: [
    {
      code: "VAL-SMOKE-001",
      level: "warning",
      message: "Smoke test: device has no placement",
      object_type: "device",
      object_id: FIXTURE_DEVICE_ID,
      object_code: "srv-01",
      file_path: null,
      rack_id: null,
    },
  ],
  save_current_repository: { created: 0, updated: 0, unchanged: 1, total: 1 },
  close_repository: null,
  list_locations: [
    {
      id: FIXTURE_LOCATION_ID,
      code: "server-room-a",
      name: "Server Room A",
      description: "Main server room",
      address: null,
      tags: ["production"],
      rack_count: 1,
    },
  ],
  list_racks: [
    {
      id: FIXTURE_RACK_ID,
      code: "rack-main",
      name: "Main Rack",
      location_id: FIXTURE_LOCATION_ID,
      location_code: "server-room-a",
      height_u: 42,
      row: "A",
      description: null,
      tags: [],
      front_placement_count: 2,
      rear_placement_count: 1,
      placement_count: 3,
      front_used_u: 2,
      rear_used_u: 1,
    },
  ],
  list_devices: [
    {
      id: FIXTURE_DEVICE_ID,
      code: "srv-01",
      device_type: "server",
      name: "srv-01",
      serial_number: "SRV001",
      asset_tag: null,
      external_ref: null,
      status: "installed",
      device_model_code: "srv-model",
      device_model_id: FIXTURE_DEVICE_MODEL_ID,
      is_placed: true,
      description: null,
      tags: [],
    },
    {
      id: FIXTURE_UNPLACED_DEVICE_ID,
      code: "srv-unplaced-01",
      device_type: "server",
      name: "Unplaced Server 01",
      serial_number: "UNP001",
      asset_tag: null,
      external_ref: null,
      status: "planned",
      device_model_code: "srv-model",
      device_model_id: FIXTURE_DEVICE_MODEL_ID,
      is_placed: false,
      description: null,
      tags: [],
    },
  ],
  list_device_models: [
    {
      id: FIXTURE_DEVICE_MODEL_ID,
      code: "srv-model",
      device_type: "server",
      name: "Server Model",
      vendor: "Acme",
      model_number: "SM-42",
      default_height_u: 1,
      description: null,
      tags: [],
    },
    {
      id: FIXTURE_RACK_OBJECT_ID,
      code: "blank-1u",
      device_type: "rack_object",
      name: "Blank 1U",
      vendor: null,
      model_number: null,
      default_height_u: 1,
      description: null,
      tags: [],
    },
  ],
  get_rack_detail: {
    id: FIXTURE_RACK_ID,
    code: "rack-main",
    name: "Main Rack",
    location_id: FIXTURE_LOCATION_ID,
    location_code: "server-room-a",
    height_u: 42,
    row: "A",
    front: [
      {
        id: FIXTURE_PLACEMENT_ID,
        code: "plc-srv-01",
        target_kind: "device",
        target_id: FIXTURE_DEVICE_ID,
        target_code: "srv-01",
        target_name: "srv-01",
        device_type: "server",
        start_u: 10,
        height_u: null,
        effective_height_u: 1,
        end_u: 10,
        note: null,
        tags: [],
        model_name: "Server Model",
        model_code: "srv-model",
        target_serial: "SRV001",
        target_asset_tag: null,
      },
    ],
    rear: [],
  },
  search_repository_cmd: [
    {
      kind: "location",
      id: FIXTURE_LOCATION_ID,
      code: "server-room-a",
      label: "Server Room A",
      detail: null,
      score: 0,
      navigation: {
        location_id: FIXTURE_LOCATION_ID,
        rack_id: null,
        device_id: null,
        device_model_id: null,
        placement_id: null,
      },
    },
    {
      kind: "rack",
      id: FIXTURE_RACK_ID,
      code: "rack-main",
      label: "Main Rack",
      detail: "42U @ server-room-a",
      score: 1,
      navigation: {
        location_id: null,
        rack_id: FIXTURE_RACK_ID,
        device_id: null,
        device_model_id: null,
        placement_id: null,
      },
    },
  ],
  preview_device_csv_import_cmd: {
    summary: { total_rows: 1, valid_rows: 1, error_rows: 0, warning_count: 0 },
    file_issues: [],
    rows: [
      {
        row_number: 2,
        code: "CSV-DEV-001",
        device_type: "server",
        name: "CSV Device 001",
        device_model_code: null,
        serial_number: null,
        asset_tag: null,
        status: "planned",
        action: "create",
        issues: [],
      },
    ],
  },
  import_device_csv_cmd: { created_count: 1, warning_count: 0 },
  // Git commands — RepositoryPanel loads these on mount
  get_git_status: {
    is_repository: true,
    branch: "main",
    upstream: "origin/main",
    ahead: 1,
    behind: 0,
    is_clean: true,
    staged_count: 0,
    unstaged_count: 0,
    untracked_count: 0,
    message: null,
  },
  get_git_log: [
    {
      hash: "abc1234def5678901234",
      short_hash: "abc1234",
      subject: "Initial fixture commit",
      author: "E2E Fixture",
      date: "2026-05-20",
    },
  ],
  list_git_remotes: [
    { name: "origin", url: "git@github.com:example/repo.git" },
  ],
  init_git_repository: null,
  push_git_current_branch: null,
  pull_git_ff_only: {
    repo_path: FIXTURE_REPO_PATH,
    repository_code: "test-repo",
    repository_name: "Test Repository",
    locations_count: 1,
    racks_count: 1,
    device_models_count: 2,
    devices_count: 1,
    placement_files_count: 1,
    placements_count: 3,
    unplaced_devices_count: 0,
  },
  commit_repository_changes: {
    hash: "deadbeef12345678",
    short_hash: "deadbeef",
    subject: "E2E fixture commit",
    author: "E2E Fixture",
    date: "2026-05-20",
  },
  read_csv_file: "",
  // Log settings commands — used by SettingsPanel
  get_log_settings: {
    default_log_dir: "/tmp/ris-e2e-logs",
    active_log_dir: "/tmp/ris-e2e-logs",
    custom_log_dir: null,
    restart_required: false,
  },
  open_logs_directory: null,
  set_logs_directory: {
    default_log_dir: "/tmp/ris-e2e-logs",
    active_log_dir: "/tmp/ris-e2e-logs",
    custom_log_dir: "/tmp/ris-e2e-custom-logs",
    restart_required: true,
  },
  reset_logs_directory: {
    default_log_dir: "/tmp/ris-e2e-logs",
    active_log_dir: "/tmp/ris-e2e-logs",
    custom_log_dir: null,
    restart_required: false,
  },
};

// ─── Dynamic mock state ──────────────────────────────────────────────────────
// Module-level state that is mutated by add_device_cmd, place_device, etc.
// Naturally reset on each Playwright page.goto("/") because the module re-evaluates.
// resetE2eMockState() provides defense-in-depth: called by open_repository_cmd so
// that tests which open the repo without a page reload also start from a clean baseline.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createInitialDevices(): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (COMMANDS.list_devices as any[]).map((d) => ({ ...d }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createInitialDeviceModels(): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (COMMANDS.list_device_models as any[]).map((m) => ({ ...m }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createInitialRackDetail(): { front: any[]; rear: any[]; [k: string]: any } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const base = COMMANDS.get_rack_detail as Record<string, any>;
  return {
    ...base,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    front: base.front.map((p: any) => ({ ...p })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rear: base.rear.map((p: any) => ({ ...p })),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dynamicDevices: any[] = createInitialDevices();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dynamicDeviceModels: any[] = createInitialDeviceModels();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dynamicRackDetail: { front: any[]; rear: any[]; [k: string]: any } = createInitialRackDetail();

export function resetE2eMockState(): void {
  dynamicDevices = createInitialDevices();
  dynamicDeviceModels = createInitialDeviceModels();
  dynamicRackDetail = createInitialRackDetail();
}

export function invoke<T>(command: string, args?: unknown): Promise<T> {
  switch (command) {
    case "open_repository_cmd": {
      const { path } = (args ?? {}) as { path?: unknown };
      if (typeof path !== "string" || path.trim().length === 0) {
        return Promise.reject(
          new Error(
            `[E2E mock] open_repository_cmd: 'path' must be a non-empty string, got: ${JSON.stringify(path)}`,
          ),
        );
      }
      if (path !== FIXTURE_REPO_PATH) {
        return Promise.reject(
          new Error(
            `[E2E mock] open_repository_cmd: unexpected fixture path: "${path}" (expected "${FIXTURE_REPO_PATH}")`,
          ),
        );
      }
      resetE2eMockState();
      return Promise.resolve(COMMANDS.open_repository_cmd as T);
    }

    case "search_repository_cmd": {
      const { query } = (args ?? {}) as { query?: unknown };
      if (typeof query !== "string") {
        return Promise.reject(
          new Error(
            `[E2E mock] search_repository_cmd: 'query' must be a string, got: ${JSON.stringify(query)}`,
          ),
        );
      }
      // Short queries return no results (mirrors real backend minimum-length guard).
      if (query.trim().length < 2) {
        return Promise.resolve([] as unknown as T);
      }
      // Return fixture results only for queries matching fixture data keywords.
      // All other queries return empty to allow testing the no-results state.
      const q = query.trim().toLowerCase();
      const matchesFixture = ["server", "rack", "main", "room"].some((kw) =>
        q.includes(kw),
      );
      if (!matchesFixture) {
        return Promise.resolve([] as unknown as T);
      }
      return Promise.resolve(COMMANDS.search_repository_cmd as T);
    }

    case "preview_device_csv_import_cmd": {
      const { csvContent } = (args ?? {}) as { csvContent?: unknown };
      if (typeof csvContent !== "string" || csvContent.trim().length === 0) {
        return Promise.reject(
          new Error(
            `[E2E mock] preview_device_csv_import_cmd: 'csvContent' must be a non-empty string`,
          ),
        );
      }
      return Promise.resolve(COMMANDS.preview_device_csv_import_cmd as T);
    }

    case "import_device_csv_cmd": {
      const { csvContent } = (args ?? {}) as { csvContent?: unknown };
      if (typeof csvContent !== "string" || csvContent.trim().length === 0) {
        return Promise.reject(
          new Error(
            `[E2E mock] import_device_csv_cmd: 'csvContent' must be a non-empty string`,
          ),
        );
      }
      return Promise.resolve(COMMANDS.import_device_csv_cmd as T);
    }

    case "read_csv_file": {
      // Native file picker is not tested; always return empty string.
      // Reject if path argument is provided but is not a string (likely a bug in the caller).
      const { path } = (args ?? {}) as { path?: unknown };
      if (path !== undefined && typeof path !== "string") {
        return Promise.reject(
          new Error(
            `[E2E mock] read_csv_file: 'path' must be a string if provided, got: ${JSON.stringify(path)}`,
          ),
        );
      }
      return Promise.resolve(COMMANDS.read_csv_file as T);
    }

    case "write_device_import_sample_csv":
      // Save dialog flow is mocked at the dialog level (returns null/cancelled);
      // this command should never be reached in E2E tests.
      return Promise.resolve(undefined as unknown as T);

    case "add_device_cmd": {
      const { input } = (args ?? {}) as { input?: unknown };
      const i = (input ?? {}) as Record<string, unknown>;
      if (typeof i.device_type !== "string") {
        return Promise.reject(
          new Error(`[E2E mock] add_device_cmd: invalid input args`),
        );
      }
      dynamicDevices.push({
        id: FIXTURE_NEW_DEVICE_ID,
        code: "dev-new-01",
        device_type: i.device_type,
        name: i.name ?? null,
        serial_number: i.serial_number ?? null,
        asset_tag: i.asset_tag ?? null,
        external_ref: i.external_ref ?? null,
        status: i.status ?? "planned",
        device_model_code: null,
        device_model_id: i.device_model_id ?? null,
        is_placed: false,
        description: i.description ?? null,
        tags: i.tags ?? [],
      });
      return Promise.resolve(FIXTURE_NEW_DEVICE_ID as unknown as T);
    }

    case "place_device": {
      const { input } = (args ?? {}) as { input?: unknown };
      const i = (input ?? {}) as Record<string, unknown>;
      if (
        typeof i.rack_id !== "string" ||
        typeof i.device_id !== "string" ||
        typeof i.side !== "string" ||
        typeof i.start_u !== "number"
      ) {
        return Promise.reject(
          new Error(`[E2E mock] place_device: invalid input args`),
        );
      }
      // Add the new placement to dynamic rack detail so get_rack_detail returns it
      dynamicRackDetail.front.push({
        id: FIXTURE_NEW_PLACEMENT_ID,
        code: `plc-${i.device_id?.toString().slice(0, 8)}`,
        target_kind: "device",
        target_id: i.device_id,
        target_code: dynamicDevices.find((d) => d.id === i.device_id)?.code ?? "new-device",
        target_name: dynamicDevices.find((d) => d.id === i.device_id)?.name ?? null,
        device_type: dynamicDevices.find((d) => d.id === i.device_id)?.device_type ?? "server",
        start_u: i.start_u,
        height_u: i.height_u ?? null,
        effective_height_u: i.height_u ?? 1,
        end_u: i.start_u,
        note: null,
        tags: [],
        model_name: null,
        model_code: null,
        target_serial: null,
        target_asset_tag: null,
      });
      return Promise.resolve(FIXTURE_NEW_PLACEMENT_ID as unknown as T);
    }

    case "place_rack_object": {
      const { input } = (args ?? {}) as { input?: unknown };
      const i = (input ?? {}) as Record<string, unknown>;
      if (
        typeof i.rack_id !== "string" ||
        typeof i.device_model_id !== "string" ||
        typeof i.side !== "string" ||
        typeof i.start_u !== "number"
      ) {
        return Promise.reject(
          new Error(`[E2E mock] place_rack_object: invalid input args`),
        );
      }
      const model = dynamicDeviceModels.find((m) => m.id === i.device_model_id);
      const targetSide = i.side as string;
      const newPlacement = {
        id: FIXTURE_NEW_PLACEMENT_ID,
        code: `plc-${String(i.device_model_id).slice(0, 8)}`,
        target_kind: "rack_object",
        target_id: i.device_model_id,
        target_code: model?.code ?? "rack-obj",
        target_name: model?.name ?? null,
        device_type: "rack_object",
        start_u: i.start_u,
        height_u: i.height_u ?? null,
        effective_height_u: (i.height_u as number | null) ?? model?.default_height_u ?? 1,
        end_u: i.start_u,
        note: null,
        tags: [],
        model_name: model?.name ?? null,
        model_code: model?.code ?? null,
        target_serial: null,
        target_asset_tag: null,
      };
      if (targetSide === "rear") {
        dynamicRackDetail.rear.push(newPlacement);
      } else {
        dynamicRackDetail.front.push(newPlacement);
      }
      return Promise.resolve(FIXTURE_NEW_PLACEMENT_ID as unknown as T);
    }

    case "move_placement": {
      const { input } = (args ?? {}) as { input?: unknown };
      const i = (input ?? {}) as Record<string, unknown>;
      if (typeof i.placement_id !== "string" || typeof i.new_start_u !== "number") {
        return Promise.reject(new Error(`[E2E mock] move_placement: invalid input args`));
      }
      const placementId = i.placement_id as string;
      const newStartU = i.new_start_u as number;
      const newSide = (i.new_side as string | null | undefined) ?? null;

      // Find and remove from current side
      let placement: unknown | null = null;
      const frontIdx = dynamicRackDetail.front.findIndex((p: Record<string, unknown>) => p.id === placementId);
      if (frontIdx !== -1) {
        placement = dynamicRackDetail.front.splice(frontIdx, 1)[0];
      } else {
        const rearIdx = dynamicRackDetail.rear.findIndex((p: Record<string, unknown>) => p.id === placementId);
        if (rearIdx !== -1) {
          placement = dynamicRackDetail.rear.splice(rearIdx, 1)[0];
        }
      }
      if (placement) {
        const updated = { ...(placement as Record<string, unknown>), start_u: newStartU, end_u: newStartU };
        const destSide = newSide ?? (frontIdx !== -1 ? "front" : "rear");
        if (destSide === "rear") {
          dynamicRackDetail.rear.push(updated);
        } else {
          dynamicRackDetail.front.push(updated);
        }
      }
      return Promise.resolve(undefined as unknown as T);
    }

    case "remove_placement": {
      const { input } = (args ?? {}) as { input?: unknown };
      const i = (input ?? {}) as Record<string, unknown>;
      if (typeof i.placement_id === "string") {
        const removed: Record<string, unknown> | undefined =
          dynamicRackDetail.front.find((p: Record<string, unknown>) => p.id === i.placement_id) ??
          dynamicRackDetail.rear.find((p: Record<string, unknown>) => p.id === i.placement_id);
        dynamicRackDetail.front = dynamicRackDetail.front.filter(
          (p: Record<string, unknown>) => p.id !== i.placement_id,
        );
        dynamicRackDetail.rear = dynamicRackDetail.rear.filter(
          (p: Record<string, unknown>) => p.id !== i.placement_id,
        );
        // If removed was a device placement, mark device as unplaced so palette refreshes
        if (removed?.target_kind === "device" && typeof removed?.target_id === "string") {
          const devIdx = dynamicDevices.findIndex((d) => d.id === removed.target_id);
          if (devIdx !== -1) {
            dynamicDevices[devIdx] = { ...dynamicDevices[devIdx], is_placed: false };
          }
        }
      }
      return Promise.resolve(undefined as unknown as T);
    }

    case "add_device_model_cmd": {
      const { input } = (args ?? {}) as { input?: unknown };
      const i = (input ?? {}) as Record<string, unknown>;
      if (typeof i.device_type !== "string") {
        return Promise.reject(new Error(`[E2E mock] add_device_model_cmd: invalid input args`));
      }
      const newModel = {
        id: FIXTURE_NEW_MODEL_ID,
        code: "model-new-01",
        device_type: i.device_type,
        name: i.name ?? null,
        vendor: i.vendor ?? null,
        model_number: i.model ?? null,
        default_height_u: i.default_height_u ?? 1,
        description: i.description ?? null,
        tags: i.tags ?? [],
      };
      dynamicDeviceModels.push(newModel);
      return Promise.resolve(FIXTURE_NEW_MODEL_ID as unknown as T);
    }

    case "update_device_cmd": {
      const { input } = (args ?? {}) as { input?: unknown };
      const i = (input ?? {}) as Record<string, unknown>;
      if (typeof i.id !== "string") {
        return Promise.reject(new Error(`[E2E mock] update_device_cmd: invalid input args`));
      }
      const idx = dynamicDevices.findIndex((d) => d.id === i.id);
      if (idx !== -1) {
        dynamicDevices[idx] = { ...dynamicDevices[idx], ...(i as object) };
      }
      return Promise.resolve(undefined as unknown as T);
    }

    case "update_device_model_cmd": {
      const { input } = (args ?? {}) as { input?: unknown };
      const i = (input ?? {}) as Record<string, unknown>;
      if (typeof i.id !== "string") {
        return Promise.reject(new Error(`[E2E mock] update_device_model_cmd: invalid input args`));
      }
      const idx = dynamicDeviceModels.findIndex((m) => m.id === i.id);
      if (idx !== -1) {
        dynamicDeviceModels[idx] = { ...dynamicDeviceModels[idx], ...(i as object) };
      }
      return Promise.resolve(undefined as unknown as T);
    }

    case "list_devices":
      return Promise.resolve(dynamicDevices as unknown as T);

    case "list_device_models":
      return Promise.resolve(dynamicDeviceModels as unknown as T);

    case "get_rack_detail":
      return Promise.resolve(dynamicRackDetail as unknown as T);

    default:
      if (command in COMMANDS) {
        return Promise.resolve(COMMANDS[command] as T);
      }
      return Promise.reject(new Error(`[E2E mock] Unhandled command: ${command}`));
  }
}
