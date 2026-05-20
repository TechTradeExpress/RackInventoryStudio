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
      unplaced_devices_count: 0,
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
    is_repository: false,
    branch: null,
    upstream: null,
    ahead: null,
    behind: null,
    is_clean: true,
    staged_count: 0,
    unstaged_count: 0,
    untracked_count: 0,
    message: null,
  },
  get_git_log: [],
  list_git_remotes: [],
  read_csv_file: "",
};

export function invoke<T>(command: string, _args?: unknown): Promise<T> {
  if (command in COMMANDS) {
    return Promise.resolve(COMMANDS[command] as T);
  }
  return Promise.reject(new Error(`[E2E mock] Unhandled command: ${command}`));
}
