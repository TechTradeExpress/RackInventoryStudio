# Rack Inventory Studio — User Workflows v0.1

## 1. Purpose

This document describes the main user workflows for the **Rack Inventory Studio** MVP.

It does not describe implementation details. It focuses on:

- what the user does,
- what the application shows,
- what data is created or modified,
- what validations are performed,
- what happens in the Git repository.

---

## 2. User roles

The MVP does not implement its own permission system. Permissions come from access to the Git repository.

The following functional roles are defined for documentation purposes.

### 2.1. Operator

A person updating inventory data.

Typical actions:

- opens repository,
- pulls current data,
- adds devices,
- imports devices from CSV,
- places devices in racks,
- removes placements,
- saves locally,
- publishes changes.

### 2.2. Repository administrator

A person responsible for repository consistency and conflict resolution.

Typical actions:

- reviews change history,
- fixes validation errors,
- merges conflict branches,
- maintains repository structure,
- manages device models and rack objects.

### 2.3. Read-only user

A person using the application as a rack state viewer.

Typical actions:

- browses locations,
- browses racks,
- checks where a device is located,
- searches by `code`, `name`, serial number, or asset tag.

The MVP does not need to technically distinguish these roles. They are descriptive roles.

---

## 3. Workflow: first application launch

### Goal

The user starts the application and selects the work mode.

### Steps

1. User starts the application.
2. Application shows the start screen.
3. User selects one option:
   - `Open existing repository`,
   - `Create new repository`.

### Application behavior

The application should remember the last used repository.

If a repository was previously opened, the application may show:

```text
Open last repository
```

---

## 4. Workflow: open existing repository

### Goal

The user opens a local clone of a Git repository with inventory data.

### Steps

1. User selects `Open existing repository`.
2. User selects a local directory.
3. Application checks whether the directory is a Git repository.
4. Application checks for the structure:

```text
inventory/repo.yaml
inventory/locations.yaml
inventory/racks/
inventory/device-models/
inventory/devices/
inventory/placements/
```

5. Application loads YAML data.
6. Application runs validation.
7. If there are no blocking errors, application opens the main view.
8. If there are errors, application opens `Validation / problems`.

### Effects

Repository becomes active in the application.

### Errors

If the directory is not a valid repository, the application shows:

```text
The selected directory does not contain a valid Rack Inventory Studio repository.
```

---

## 5. Workflow: create new repository

### Goal

The user creates a new empty data repository.

### Steps

1. User selects `Create new repository`.
2. User selects target directory.
3. User enters basic information:
   - `repository code`,
   - `repository name`.
4. Application creates directory structure.
5. Application creates starter files:

```text
inventory/repo.yaml
inventory/locations.yaml
inventory/racks/
inventory/device-models/
inventory/devices/
inventory/placements/
```

6. Application creates base model files:

```text
device-models/servers.yaml
device-models/network.yaml
device-models/storage.yaml
device-models/ups.yaml
device-models/appliances.yaml
device-models/rack-objects.yaml
device-models/other.yaml
```

7. Application creates base device files:

```text
devices/servers.yaml
devices/network.yaml
devices/storage.yaml
devices/ups.yaml
devices/appliances.yaml
devices/other.yaml
```

8. Application may create default rack objects:
   - `blank-panel-1u`,
   - `cable-organizer-1u`,
   - `reserved-space`,
   - `unknown-object`.

### Effects

A valid empty data repository is created.

---

## 6. Workflow: pull latest data

### Goal

The user updates the local repository copy.

### Steps

1. User opens `Repository / synchronization`.
2. User selects `Pull latest data`.
3. Application performs an operation equivalent to `git pull`.
4. After pulling data, application reloads YAML.
5. Application runs validation.
6. Application shows result.

### Effects

Local data matches the current remote repository state.

### Conflicts

If a Git conflict occurs, the application does not resolve it automatically.

Application shows:

```text
Could not pull changes because of a conflict. Save local changes to a separate branch or contact the repository administrator.
```

---

## 7. Workflow: add location

### Goal

The user adds a new location, understood as one room / one server room.

### Steps

1. User opens `Locations`.
2. User selects `Add location`.
3. User fills form:
   - `code`,
   - `name`,
   - `description`,
   - `address`,
   - `tags`.
4. Application generates UUID.
5. Application checks `code` uniqueness.
6. Application adds entry to `locations.yaml`.
7. Application saves local changes.

### Effects

A new location is created.

### Validations

Blocking errors:

- missing `code`,
- missing `name`,
- invalid `code` format,
- `code` already exists.

---

## 8. Workflow: add rack

### Goal

The user adds a rack to selected location.

### Steps

1. User opens location.
2. User selects `Add rack`.
3. User fills form:
   - `code`,
   - `name`,
   - `height_u`,
   - `row`,
   - `description`,
   - `tags`.
4. Application generates rack UUID.
5. Application adds rack to file:

```text
inventory/racks/<location-code>.yaml
```

6. Application creates empty placement file:

```text
inventory/placements/<rack-code>.yaml
```

7. Placement file has structure:

```yaml
rack_id: <rack_uuid>

placements:
  front: []
  rear: []
```

### Effects

Rack and empty placement file are created.

### Validations

Blocking errors:

- missing `code`,
- missing `name`,
- missing `height_u`,
- `height_u` is not a positive integer,
- `code` already exists.

---

## 9. Workflow: add device model

### Goal

The user adds a physical device model or rack object.

### Steps

1. User opens `Device model catalog`.
2. User selects category:
   - `server`,
   - `network`,
   - `storage`,
   - `ups`,
   - `appliance`,
   - `rack_object`,
   - `other`.
3. User selects `Add model`.
4. User fills form:
   - `code`,
   - `name`,
   - `vendor`,
   - `model`,
   - `default_height_u`,
   - `description`,
   - `tags`.
5. Application generates UUID.
6. Application saves model to appropriate file in `device-models/`.

### Effects

A new `DeviceModel` is created.

### Important rule

If `device_type = rack_object`, the model can later be used directly in placements.

If `device_type` is different, placement requires a concrete `Device`.

---

## 10. Workflow: add device instance

### Goal

The user adds a concrete device instance.

### Steps

1. User opens `Device instance catalog`.
2. User selects `Add device`.
3. User fills form:
   - `code`,
   - `device_type`,
   - `name`,
   - `device_model`,
   - `serial_number`,
   - `asset_tag`,
   - `external_ref`,
   - `status`,
   - `description`,
   - `tags`.
4. Application generates UUID.
5. Application validates data.
6. Application saves device to appropriate file in `devices/`.

### Effects

A new `Device` is created.

### Validations

Blocking errors:

- missing `code`,
- missing `status`,
- missing `name`, `serial_number`, and `asset_tag` at the same time,
- `code` already exists,
- `serial_number` already exists,
- `asset_tag` already exists,
- `device_model` points to `rack_object`.

---

## 11. Workflow: import devices from CSV

### Goal

The user imports a list of new devices from a prepared CSV file.

### Steps

1. User opens `Device instance catalog`.
2. User selects `CSV import`.
3. User selects CSV file.
4. Application reads headers.
5. Application validates all rows.
6. Application shows summary:
   - number of rows,
   - number of valid devices,
   - number of errors,
   - number of warnings.
7. If there are `ERROR` messages, import is blocked.
8. If there are no errors, user confirms import.
9. Application generates UUIDs for new devices.
10. Application saves devices to appropriate files.

### CSV format

```csv
code,device_type,name,device_model_code,serial_number,asset_tag,external_ref,status,tags
srv-new-01,server,srv-new-01,dell-r650,NEWSRV001,INV-05001,SRV-NEW-01,in_stock,new
```

### Important decision

CSV import in MVP:

- only adds new devices,
- does not update existing devices,
- does not import placements,
- does not import device models.

---

## 12. Workflow: open rack view

### Goal

The user views and edits item placement in a rack.

### Steps

1. User opens `Locations`.
2. User selects location.
3. User selects rack.
4. Application opens `Rack view`.

### Rack view contains

- rack name,
- Front / Rear switch,
- currently selected side,
- U view from top to bottom,
- unplaced devices panel,
- rack objects panel,
- selected placement details panel.

### View rule

Application shows only one side at a time:

```text
front or rear
```

It does not show front and rear simultaneously.

---

## 13. Workflow: place device in rack

### Goal

The user assigns an unplaced device to a specific U on the active rack side.

### Steps

1. User opens rack view.
2. User selects `Front` or `Rear`.
3. User finds device in `Unplaced devices` panel.
4. User drags device to specific U.
5. Application calculates `effective_height_u`.
6. Application checks collisions on active side.
7. Application creates placement in proper section:

```yaml
placements:
  front:
    - ...
```

or:

```yaml
placements:
  rear:
    - ...
```

### Effects

Device is no longer unplaced.

### If device has no model

If device has no `device_model_id`, application requires explicit `height_u` for placement.

---

## 14. Workflow: add rack object to rack

### Goal

The user adds a descriptive item occupying rack space, for example blank panel, organizer, or reservation.

### Steps

1. User opens rack view.
2. User selects `Front` or `Rear`.
3. User selects object from `Rack objects` panel.
4. User drags it to specific U.
5. Application creates placement with:

```yaml
target_kind: device_model
```

6. `target_id` points to `DeviceModel` of type `rack_object`.

### Effects

Descriptive item appears in rack.

### Important rule

Rack object can be reused many times across many racks and placements.

---

## 15. Workflow: move placement within the same side

### Goal

The user moves an item to another U within the same rack side.

### Steps

1. User opens rack view.
2. User selects side where placement exists.
3. User drags placement to another U.
4. Application updates `start_u`.
5. Application keeps the same `id` and `code`.
6. Application checks collisions and U range.

### Effects

Placement changes position within the same `front` or `rear` section.

### MVP limitation

Moving placement between `front` and `rear` is not supported.

---

## 16. Workflow: move item between front and rear

### MVP decision

There is no separate operation for moving between sides.

If user wants to move item from front to rear:

1. remove placement from front,
2. switch view to rear,
3. place item again.

### Rationale

The other side may already have occupied space. Removing and placing again is simpler and more explicit.

---

## 17. Workflow: remove device from rack

### Goal

The user removes physical placement of a device but does not delete the device from inventory.

### Steps

1. User selects device placement in rack view.
2. User selects `Remove placement` or drags item to `Unplaced devices` panel.
3. Application removes placement from rack file.
4. Device remains in device catalog.

### Effects

Device returns to unplaced devices list.

### Important rule

Application does not automatically change device status.

---

## 18. Workflow: remove rack object from rack

### Goal

The user removes a descriptive object from rack.

### Steps

1. User selects rack object placement.
2. User selects `Remove placement`.
3. Application removes placement.

### Effects

Rack object disappears from rack view.

`DeviceModel` of type `rack_object` is not deleted.

---

## 19. Workflow: edit placement

### Goal

The user updates placement properties.

### Editable fields

```text
start_u
height_u
note
tags
```

### Non-editable fields

```text
id
target_kind
target_id
```

Changing target should be done by removing placement and creating a new one.

### Limitation

Placement side is not editable. There is no `side` field.

---

## 20. Workflow: repository validation

### Goal

The user checks data consistency.

### Steps

1. User opens `Validation / problems`.
2. Application runs validation.
3. Application shows results grouped by level:
   - `ERROR`,
   - `WARNING`,
   - `INFO`.
4. User can navigate from issue to specific object if the application can locate it.

### Effect of errors

If at least one `ERROR` exists:

```text
publishing to Git is blocked
```

---

## 21. Workflow: save locally

### Goal

The user saves changes to local YAML files without publishing to Git.

### Steps

1. User makes changes.
2. User selects `Save locally`.
3. Application writes modified YAML files.
4. Application marks repository as having local changes.

### Effects

Changes are saved on disk but are not yet a Git commit.

---

## 22. Workflow: publish changes to Git

### Goal

The user publishes changes to shared repository.

### Steps

1. User opens `Repository / synchronization`.
2. User selects `Publish changes`.
3. Application runs validation.
4. If there are `ERROR` messages, publishing is blocked.
5. If there are no errors, user enters change description.
6. Application creates commit.
7. Application pushes changes.

### Effects

Changes are pushed to shared Git repository.

---

## 23. Workflow: Git conflict during publishing

### Goal

Safe application behavior when local changes conflict with remote repository changes.

### Steps

1. User selects `Publish changes`.
2. Application tries to synchronize/push changes.
3. Conflict occurs.
4. Application does not try to resolve conflict.
5. Application creates conflict branch.
6. Application commits local changes to that branch.
7. Application pushes branch.
8. User is informed that administrator must perform merge.

### Branch naming format

Example:

```text
conflict/<user>/<timestamp>
```

or more domain-specific:

```text
conflict/<user>/<rack-code>/<timestamp>
```

### Effects

User changes are not lost, but they are not automatically merged into main branch.

---

## 24. Workflow: change history

### Goal

The user reviews repository history.

### MVP data shown

- commit hash,
- author,
- date,
- commit message,
- list of changed files.

MVP does not require domain diff such as:

```text
srv-db-01 moved from U12 to U14
```

This can be a future feature.

---

## 25. Workflow: deleting objects

### Delete location

Allowed only if location has no racks.

### Delete rack

Allowed only if rack has no placements.

### Delete device model

Allowed only if:

- no Device uses it,
- no Placement of type `device_model` uses it.

### Delete device

Allowed only if device has no placement.

### Delete placement

Allowed.

If placement points to device, device becomes unplaced.

---

## 26. Workflow: search

MVP should support searching by:

- `code`,
- `name`,
- `serial_number`,
- `asset_tag`,
- `external_ref`,
- `tags`.

Search results should allow navigation to:

- device,
- rack,
- placement,
- location.

---

## 27. Future workflows

After MVP, additional workflows may be described for:

- physical audit,
- internal system integration,
- device model import,
- placement import,
- merge request workflow,
- domain-level change comparison,
- PDF/CSV report export.
