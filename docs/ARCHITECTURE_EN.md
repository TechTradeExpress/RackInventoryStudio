# Rack Inventory Studio — Application Architecture v0.1

## 1. Purpose

This document describes the proposed application architecture for the **Rack Inventory Studio** MVP.

It does not select a specific desktop technology yet. Its purpose is to define:

- application layers,
- main modules,
- responsibilities of each system part,
- dependencies between layers,
- data flows,
- extension points for future integrations and plugins.

The architecture should support an offline-first desktop application whose source of truth is a Git repository with YAML files.

---

## 2. Main architectural assumptions

Key assumptions:

```text
1. Domain core is independent from UI.
2. Domain core is independent from desktop technology.
3. YAML and Git are treated as storage/synchronization layers.
4. Validator is a separate module used by UI, CSV import, and Git publishing.
5. CSV import does not write data without validation and preview.
6. UI communicates through application use cases, not by directly editing files.
7. Future internal company integrations should be possible as plugins or external modules.
```

Most important decision:

> The application should be designed so that domain logic, validation, CSV import, repository handling, and Git handling can work independently from the chosen UI framework.

---

## 3. Application layers

Proposed division:

```text
Rack Inventory Studio
  ├── UI Layer
  ├── Application Layer
  ├── Domain Layer
  ├── Repository / Storage Layer
  ├── Validation Layer
  ├── Import / Export Layer
  ├── Git Layer
  └── Plugin Layer - after MVP
```

Dependencies should go downward:

```text
UI
  -> Application
    -> Domain
    -> Repository / Storage
    -> Validation
    -> Import / Export
    -> Git
```

The Domain Layer should not depend on UI, Git, or a specific file format.

---

## 4. Domain Layer

### 4.1. Purpose

Domain Layer contains the business model and domain logic of Rack Inventory Studio.

It should answer questions such as:

- what locations exist?
- what racks exist?
- what devices exist?
- which devices are unplaced?
- what is located in a given rack?
- what U range does a placement occupy?
- does a placement collide with another placement?
- does a device have more than one placement?
- is a model a rack object?

### 4.2. Domain models

Primary models:

```text
RepositoryMetadata
Location
Rack
DeviceModel
Device
PlacementFile
Placement
ValidationIssue
```

### 4.3. Location

Represents one room / one server room.

Domain fields:

```text
id
code
name
description
address
tags
```

### 4.4. Rack

Represents a physical rack cabinet.

Domain fields:

```text
id
code
name
location_id
height_u
row
description
tags
```

### 4.5. DeviceModel

Represents a physical device model or rack object.

Domain fields:

```text
id
code
device_type
name
vendor
model
default_height_u
description
tags
```

`device_type` is a hardcoded enum:

```text
server
network
storage
ups
appliance
rack_object
other
```

### 4.6. Device

Represents a concrete device instance.

Domain fields:

```text
id
code
device_type
name
device_model_id
serial_number
asset_tag
external_ref
status
description
tags
```

Statuses:

```text
planned
in_stock
installed
to_remove
removed
disposed
unknown
```

### 4.7. PlacementFile

Represents placements file for one rack.

Domain fields:

```text
rack_id
front_placements
rear_placements
file_path
```

### 4.8. Placement

Represents placement of a device or rack object on a specific rack side.

Domain fields:

```text
id
code
target_kind
target_id
start_u
height_u
note
tags
```

Placement side is not a field in the YAML placement object. It comes from context:

```text
placements.front[]
placements.rear[]
```

In the domain model, side can be represented as contextual value, for example `PlacementSide`, to simplify calculations and UI.

---

## 5. Domain logic

Domain Layer should contain logic independent from UI.

### 5.1. Calculating effective_height_u

Rule:

```text
effective_height_u =
  placement.height_u
  or target.default_height_u
```

For `target_kind=device`:

```text
Device -> DeviceModel -> default_height_u
```

For `target_kind=device_model`:

```text
DeviceModel -> default_height_u
```

If device has no model and placement has no `height_u`, height cannot be calculated.

### 5.2. Calculating U range

Rule:

```text
end_u = start_u + effective_height_u - 1
```

Example:

```text
start_u = 12
effective_height_u = 3
range = U12-U14
```

### 5.3. Collisions

Collisions are detected only within:

```text
same rack
same side: front or rear
overlapping U range
```

Front and rear are not compared.

### 5.4. Unplaced devices

A device is unplaced if no placement exists with:

```text
target_kind = device
target_id = device.id
```

### 5.5. Number of placements per Device

In MVP:

```text
Device can have at most one active placement.
```

This does not apply to `DeviceModel` of type `rack_object`, because rack objects can be reused many times.

---

## 6. RepositoryIndex

### 6.1. Purpose

After loading repository data, the application should build a data index.

The index speeds up:

- validation,
- search,
- UI,
- CSV import,
- reference resolution.

### 6.2. Proposed structure

```text
RepositoryIndex
  locations_by_id
  locations_by_code

  racks_by_id
  racks_by_code

  device_models_by_id
  device_models_by_code

  devices_by_id
  devices_by_code

  placements_by_id
  placements_by_code

  placements_by_device_id
  placements_by_rack_id

  placement_file_by_rack_id
```

### 6.3. Usage examples

```text
- find Device by target_id
- find Rack by rack_id
- find all placements for a rack
- check if code is unique
- find DeviceModel by device_model_code from CSV
- find unplaced devices
```

### 6.4. Notes

`RepositoryIndex` should be treated as a helper structure, not the source of truth. The source of truth remains the domain model loaded from YAML.

---

## 7. Repository / Storage Layer

### 7.1. Purpose

Storage Layer handles YAML files and repository directory structure.

It should not contain UI logic.

### 7.2. Responsibilities

```text
- open repository directory,
- check required files,
- read YAML,
- map YAML to domain models,
- map domain models to YAML,
- write modified files,
- preserve directory structure,
- detect missing files,
- handle starter empty files.
```

### 7.3. Proposed components

```text
RepositoryLoader
RepositoryWriter
YamlParser
YamlSerializer
RepositoryStructureDetector
RepositoryIndexBuilder
```

### 7.4. RepositoryLoader

Loads repository from directory.

Input:

```text
path to local directory
```

Output:

```text
RepositoryData
RepositoryIndex
list of structural errors, if any
```

### 7.5. RepositoryWriter

Writes changes to YAML.

Important rules:

```text
- write only changed files,
- YAML format should be stable,
- field order should be predictable,
- application should not rewrite the entire repository unnecessarily.
```

### 7.6. Stable YAML writing

Stable writing is important for Git diffs.

Recommendations:

```text
- keep predictable field order,
- avoid random list reordering,
- do not remove optional fields unnecessarily,
- do not rewrite files without changes,
- format tags consistently.
```

---

## 8. Validation Layer

### 8.1. Purpose

Validation Layer validates repository and CSV import.

Validator should be used by:

```text
- Validation / problems screen,
- Git publishing,
- CSV import,
- UI editing operations,
- automated tests.
```

### 8.2. Proposed structure

```text
ValidationEngine
  ├── GeneralValidators
  ├── RepositoryValidators
  ├── LocationValidators
  ├── RackValidators
  ├── DeviceModelValidators
  ├── DeviceValidators
  ├── PlacementValidators
  └── CsvValidators
```

### 8.3. ValidationIssue

Every validation issue should have structure:

```text
code
level
message
object_type
object_id
object_code
file_path
details
```

Levels:

```text
ERROR
WARNING
INFO
```

### 8.4. Validation modes

Validator should support:

```text
- validating entire repository,
- validating one rack,
- validating one placement file,
- validating form data,
- validating CSV import.
```

### 8.5. Git publishing

Git publishing is blocked if at least one issue exists with level:

```text
ERROR
```

`WARNING` does not block publishing.

---

## 9. Application Layer

### 9.1. Purpose

Application Layer contains application use cases.

UI should not directly modify models or files. UI should call Application Layer operations.

### 9.2. Example use cases

```text
OpenRepository
CreateRepository
PullLatestData
SaveRepository
PublishChanges
CreateConflictBranch

AddLocation
UpdateLocation
DeleteLocation

AddRack
UpdateRack
DeleteRack

AddDeviceModel
UpdateDeviceModel
DeleteDeviceModel

AddDevice
UpdateDevice
DeleteDevice

ImportDevicesFromCsv

PlaceDevice
PlaceRackObject
MovePlacementWithinSide
RemovePlacement
UpdatePlacement

ValidateRepository
Search
```

### 9.3. Example: AddRack

`AddRack` operation should:

```text
1. accept form data,
2. generate UUID,
3. check code format and uniqueness,
4. add rack to correct racks/<location-code>.yaml file,
5. create empty placements/<rack-code>.yaml file,
6. rebuild/refresh index,
7. return operation result.
```

### 9.4. Example: PlaceDevice

`PlaceDevice` operation should:

```text
1. accept rack_id, active_side, device_id, start_u and optional height_u,
2. check if device exists,
3. check if device has no existing placement,
4. calculate effective_height_u,
5. check U range,
6. check collisions on active side,
7. generate placement id and code,
8. add placement to correct front/rear section,
9. return operation result.
```

### 9.5. Example: RemovePlacement

`RemovePlacement` operation should:

```text
1. find placement by id,
2. remove it from placement file,
3. not delete Device or DeviceModel,
4. refresh index,
5. return operation result.
```

---

## 10. Import / Export Layer

### 10.1. Purpose

For MVP, this layer mainly covers CSV device import.

### 10.2. Components

```text
CsvReader
CsvDeviceImportValidator
CsvImportPreviewBuilder
CsvDeviceImporter
```

### 10.3. CSV import flow

```text
CSV file
  -> parse
  -> validate headers
  -> validate rows
  -> build preview
  -> user confirmation
  -> generate UUIDs
  -> create Devices
  -> save to devices/*.yaml
```

### 10.4. MVP rules

```text
- CSV imports only Devices.
- CSV does not update existing Devices.
- CSV does not import placements.
- CSV does not import DeviceModels.
- CSV uses code, not UUID.
- CSV requires device_type.
- device_model_code is optional.
```

### 10.5. Import preview

Before import, UI should show:

```text
- number of rows,
- number of valid devices,
- number of ERRORs,
- number of WARNINGs,
- preview table,
- target file for every device.
```

---

## 11. Git Layer

### 11.1. Purpose

Git Layer isolates the application from Git handling details.

UI and Domain Layer should not execute Git commands directly.

### 11.2. Responsibilities

```text
- check whether directory is a Git repository,
- read current branch,
- read remote,
- check change status,
- pull,
- commit,
- push,
- read history,
- detect conflict,
- create conflict/* branch,
- push conflict branch.
```

### 11.3. Proposed components

```text
GitService
GitStatusReader
GitHistoryReader
GitCommitService
GitSyncService
ConflictBranchService
```

### 11.4. GitStatus

Example model:

```text
branch
remote
has_local_changes
changed_files
is_clean
has_conflicts
ahead_count
behind_count
```

### 11.5. Publishing changes

Flow:

```text
1. SaveRepository
2. ValidateRepository
3. if ERROR > 0: block publishing
4. GitStatus
5. commit
6. push
7. if conflict: conflict branch
```

### 11.6. Conflict branch

In case of Git conflict, the application:

```text
1. does not resolve conflict,
2. creates conflict branch,
3. commits local changes,
4. pushes branch,
5. informs user that administrator must merge.
```

Example name:

```text
conflict/<user>/<rack-code>/<timestamp>
```

---

## 12. UI Layer

### 12.1. Purpose

UI Layer is responsible for data presentation and user interaction.

UI should not contain domain logic such as:

- calculating `effective_height_u`,
- detecting collisions,
- validating references,
- writing YAML,
- handling Git.

### 12.2. Main views

```text
StartScreen
RepositoryScreen
ValidationScreen
HistoryScreen
LocationsScreen
LocationDetailsScreen
DeviceModelsScreen
DevicesScreen
CsvImportScreen
RackViewScreen
```

### 12.3. RackViewModel

Rack view should have a separate presentation model:

```text
RackViewModel
  rack
  location
  active_side
  rack_units
  placements
  unplaced_devices
  rack_objects
  selected_placement
  validation_issues
```

### 12.4. RackUnitViewModel

Example model for rack unit:

```text
unit_number
is_occupied
placement_id
display_label
is_collision
```

### 12.5. Active side

UI shows one rack side at a time:

```text
front or rear
```

The side switch should change active placement section without modifying data.

### 12.6. Drag and drop

Drag and drop should call Application Layer operations:

```text
- PlaceDevice
- PlaceRackObject
- MovePlacementWithinSide
- RemovePlacement
```

UI should not edit placement lists directly.

---

## 13. Search

### 13.1. Purpose

Search should make it easy to quickly find devices and places.

### 13.2. MVP scope

Search by:

```text
code
name
serial_number
asset_tag
external_ref
tags
```

### 13.3. SearchService

Proposed component:

```text
SearchService
```

It uses `RepositoryIndex`.

Results can point to:

```text
Device
Rack
Placement
Location
DeviceModel
```

---

## 14. Plugin Layer — after MVP

### 14.1. Purpose

MVP does not need a full plugin system, but architecture should leave room for extensions.

### 14.2. Future extension points

```text
ImportPlugin
ExportPlugin
ValidationPlugin
ExternalLookupPlugin
ReportPlugin
```

### 14.3. Company integrations

Internal company system integrations should not be part of core.

Eventually they should work as:

```text
- private plugin,
- separate adapter,
- separate module configured outside public repository.
```

### 14.4. Example: ExternalLookupPlugin

Possible future plugin:

```text
ExternalLookupPlugin
  input: serial_number or asset_tag
  output: external_ref, name, additional metadata
```

---

## 15. Application configuration

### 15.1. Local configuration

Application may have local user configuration outside the inventory repository.

Examples:

```text
recent repositories
preferred view
window size
UI settings
local paths
```

This configuration should not be committed to data repository.

### 15.2. Repository configuration

Shared repository configuration should live in:

```text
inventory/repo.yaml
```

Examples:

```text
format
version
repository code
repository name
defaults
status_values
```

---

## 16. Testability

Architecture should support automated tests for core.

Most important test areas:

```text
- repository loading,
- YAML writing,
- RepositoryIndex building,
- validators,
- effective_height_u calculation,
- collision detection,
- CSV import,
- Application Layer operations,
- Git adapter behavior.
```

Core should be testable without starting UI.

---

## 17. Minimal technical prototype

The first prototype does not need full UI.

Most important prototype elements:

```text
1. RepositoryLoader
2. RepositoryIndexBuilder
3. ValidationEngine
4. Placement range calculator
5. Collision detector
6. CsvDeviceImportValidator
7. CsvDeviceImporter
8. RepositoryWriter
```

Only the second prototype should include:

```text
- RackViewScreen,
- drag and drop,
- unplaced devices panel,
- saving changes from UI.
```

---

## 18. MVP implementation order

Recommended order:

```text
1. Domain models
2. YAML loader
3. RepositoryIndex
4. ValidationEngine
5. YAML writer
6. CSV import preview
7. CSV import write
8. Application use cases
9. Git adapter
10. Minimal UI shell
11. Validation screen
12. Locations and rack list
13. Rack view
14. Device catalog
15. Device model catalog
16. Repository sync screen
17. History screen
```

---

## 19. Out of MVP

Out of MVP:

```text
- full plugin system,
- CMDB/API integrations,
- NetBox/Nautobot/Zabbix integrations,
- physical audit,
- placement import,
- device model import,
- PDF report export,
- domain-level change diff,
- merge request workflow,
- automatic Git conflict resolution,
- application-level permissions independent from Git.
```

---

## 20. Summary

Rack Inventory Studio v0.1 architecture should be modular and independent from a specific UI technology.

Most important principles:

```text
- Domain Layer is independent.
- UI does not edit files directly.
- Application Layer implements use cases.
- Storage Layer handles YAML.
- Validation Layer is the central safety mechanism.
- Git Layer isolates Git operations.
- CSV import is validated before writing.
- Plugin Layer is planned for the future.
```

This division allows starting with a simple MVP and later evolving the project toward plugins, integrations, and more advanced workflows.
