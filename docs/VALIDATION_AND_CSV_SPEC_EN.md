# Rack Inventory Studio — Validation and CSV Import Specification v0.1

## 1. Purpose

This document defines repository validation rules and the CSV import format for **Rack Inventory Studio** data format `v0.1`.

## 2. Validation levels

The validation system uses three message levels:

```text
ERROR
WARNING
INFO
```

### ERROR

Blocking validation issue.

Effects:

- changes cannot be published to Git,
- CSV import cannot be executed,
- user must fix the issue.

### WARNING

Non-blocking warning.

Effects:

- data can be saved locally,
- changes can be published to Git,
- user should see the warning.

### INFO

Informational message.

## 3. Validation code format

Every validation rule has a stable code:

```text
VAL-<AREA>-<NUMBER>
```

Examples:

```text
VAL-GEN-001
VAL-REPO-001
VAL-LOC-001
VAL-RACK-001
VAL-MODEL-001
VAL-DEV-001
VAL-PLC-001
VAL-CSV-001
```

## 4. General validators

| Code | Level | Rule |
|---|---|---|
| VAL-GEN-001 | ERROR | Every primary object must have `id`. |
| VAL-GEN-002 | ERROR | `id` must be a valid UUID. |
| VAL-GEN-003 | ERROR | Every primary object must have `code`. |
| VAL-GEN-004 | ERROR | `code` must not be empty. |
| VAL-GEN-005 | ERROR | `code` must match regex `^[a-z0-9][a-z0-9._-]*$`. |
| VAL-GEN-006 | ERROR | `id` must be globally unique. |
| VAL-GEN-007 | ERROR | `code` must be unique within object type. |
| VAL-GEN-008 | ERROR | `tags`, if present, must be a list of strings. |

Primary objects:

- Location,
- Rack,
- DeviceModel,
- Device,
- Placement.

## 5. Repository validators

| Code | Level | Rule |
|---|---|---|
| VAL-REPO-001 | ERROR | `inventory/repo.yaml` must exist. |
| VAL-REPO-002 | ERROR | `repo.yaml` must have `format: rack-inventory-studio`. |
| VAL-REPO-003 | ERROR | Supported format version is `version: 0.1`. |
| VAL-REPO-004 | ERROR | Required directories and files must exist. |

Required paths:

```text
inventory/locations.yaml
inventory/racks/
inventory/device-models/
inventory/devices/
inventory/placements/
```

## 6. Location validators

| Code | Level | Rule |
|---|---|---|
| VAL-LOC-001 | ERROR | `inventory/locations.yaml` must exist. |
| VAL-LOC-002 | ERROR | File must have root `locations`. |
| VAL-LOC-003 | ERROR | Location requires `id`, `code`, `name`. |
| VAL-LOC-004 | ERROR | `name` must not be empty. |
| VAL-LOC-005 | INFO | Location without racks is allowed. |

## 7. Rack validators

| Code | Level | Rule |
|---|---|---|
| VAL-RACK-001 | ERROR | Rack file must have `location_id`. |
| VAL-RACK-002 | ERROR | `location_id` must reference an existing location. |
| VAL-RACK-003 | ERROR | File must have root `racks`. |
| VAL-RACK-004 | ERROR | Rack requires `id`, `code`, `name`, `height_u`. |
| VAL-RACK-005 | ERROR | `height_u` must be a positive integer. |
| VAL-RACK-006 | WARNING | Rack without placement file causes a warning. |
| VAL-RACK-007 | WARNING | Rack without placements causes a warning. |

## 8. Device model validators

| Code | Level | Rule |
|---|---|---|
| VAL-MODEL-001 | ERROR | Model file must have `device_type`. |
| VAL-MODEL-002 | ERROR | `device_type` must be from allowed enum. |
| VAL-MODEL-003 | ERROR | File must have root `models`. |
| VAL-MODEL-004 | ERROR | DeviceModel requires `id`, `code`, `name`, `default_height_u`. |
| VAL-MODEL-005 | ERROR | `default_height_u` must be a positive integer. |
| VAL-MODEL-006 | INFO | `rack_object` model can be used without Device. |
| VAL-MODEL-007 | ERROR | Regular DeviceModel cannot be a direct placement target. |

Allowed model `device_type` values:

```text
server
network
storage
ups
appliance
rack_object
other
```

## 9. Device validators

| Code | Level | Rule |
|---|---|---|
| VAL-DEV-001 | ERROR | Devices file must have `device_type`. |
| VAL-DEV-002 | ERROR | `device_type` must be allowed for devices. |
| VAL-DEV-003 | ERROR | File must have root `devices`. |
| VAL-DEV-004 | ERROR | Device requires `id`, `code`, `status`. |
| VAL-DEV-005 | ERROR | Device requires at least one of: `name`, `serial_number`, `asset_tag`. |
| VAL-DEV-006 | ERROR | `status` must be valid. |
| VAL-DEV-007 | ERROR | `device_model_id`, if provided, must exist. |
| VAL-DEV-008 | ERROR | Device type must match DeviceModel type. |
| VAL-DEV-009 | ERROR | Device cannot point to `rack_object` model. |
| VAL-DEV-010 | ERROR | `serial_number`, if provided, must be unique. |
| VAL-DEV-011 | ERROR | `asset_tag`, if provided, must be unique. |
| VAL-DEV-012 | WARNING | Device without model causes a warning. |
| VAL-DEV-013 | WARNING | Device without placement causes a warning. |
| VAL-DEV-014 | WARNING | Device `installed` without placement causes a warning. |

Allowed `device_type` values for devices:

```text
server
network
storage
ups
appliance
other
```

Disallowed:

```text
rack_object
```

Allowed statuses:

```text
planned
in_stock
installed
to_remove
removed
disposed
unknown
```

## 10. Placement validators

| Code | Level | Rule |
|---|---|---|
| VAL-PLC-001 | ERROR | Placement file must have `rack_id`. |
| VAL-PLC-002 | ERROR | `rack_id` must exist. |
| VAL-PLC-003 | ERROR | File must have root `placements`. |
| VAL-PLC-004 | ERROR | Sections `front` and `rear` must exist. |
| VAL-PLC-005 | ERROR | Placement requires `id`, `code`, `target_kind`, `target_id`, `start_u`. |
| VAL-PLC-006 | ERROR | `target_kind` must be `device` or `device_model`. |
| VAL-PLC-007 | ERROR | `target_id` must exist. |
| VAL-PLC-008 | ERROR | `target_kind=device_model` is allowed only for `rack_object`. |
| VAL-PLC-009 | ERROR | `start_u` must be a positive integer. |
| VAL-PLC-010 | ERROR | `height_u`, if provided, must be a positive integer. |
| VAL-PLC-011 | ERROR | `effective_height_u` must be calculable. |
| VAL-PLC-012 | ERROR | Placement must fit within rack height. |
| VAL-PLC-013 | ERROR | Collision on the same rack side is an error. |
| VAL-PLC-014 | ERROR | Device can have at most one placement. |
| VAL-PLC-015 | WARNING | `height_u` different from default causes a warning. |

Required placement structure:

```yaml
placements:
  front: []
  rear: []
```

Collisions are checked separately for `front` and `rear`. Front is not compared with rear.

## 11. Calculating `effective_height_u`

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

If a device has no `device_model_id` and placement has no `height_u`, this is an error.

## 12. CSV device import format

MVP imports only new `Device` objects.

It does not import:

- locations,
- racks,
- device models,
- placements.

CSV import does not update existing devices.

Encoding:

```text
UTF-8
```

Delimiter:

```text
,
```

Headers:

```csv
code,device_type,name,device_model_code,serial_number,asset_tag,external_ref,status,tags
```

## 13. CSV columns

Required:

```text
code
device_type
status
```

Additionally, at least one of the following must be filled:

```text
name
serial_number
asset_tag
```

Optional:

```text
device_model_code
external_ref
tags
```

Allowed `device_type` values in CSV:

```text
server
network
storage
ups
appliance
other
```

Disallowed:

```text
rack_object
```

Tags are separated with semicolons:

```csv
access;switch
```

## 14. CSV example

```csv
code,device_type,name,device_model_code,serial_number,asset_tag,external_ref,status,tags
srv-new-01,server,srv-new-01,dell-r650,NEWSRV001,INV-05001,SRV-NEW-01,in_stock,new
srv-new-02,server,srv-new-02,hpe-dl380-gen10,NEWSRV002,INV-05002,SRV-NEW-02,in_stock,new
sw-access-01,network,sw-access-01,cisco-c9300,NEWSW001,INV-06001,SW-ACCESS-01,in_stock,access;switch
unknown-device-01,other,,,UNKNOWN001,INV-99999,,unknown,unidentified
```

## 15. CSV validators

| Code | Level | Rule |
|---|---|---|
| VAL-CSV-001 | ERROR | File must have required headers. |
| VAL-CSV-002 | WARNING | Unknown columns are ignored with warning. |
| VAL-CSV-003 | ERROR | `code` is required. |
| VAL-CSV-004 | ERROR | `code` must have valid format. |
| VAL-CSV-005 | ERROR | Duplicate `code` in CSV. |
| VAL-CSV-006 | ERROR | `code` already exists in repository. |
| VAL-CSV-007 | ERROR | At least one of `name`, `serial_number`, `asset_tag` is required. |
| VAL-CSV-008 | ERROR | `status` is required. |
| VAL-CSV-009 | ERROR | `status` must be valid. |
| VAL-CSV-010 | ERROR | `device_type` is required. |
| VAL-CSV-011 | ERROR | `device_type` must be valid. |
| VAL-CSV-012 | ERROR | `device_model_code`, if provided, must exist. |
| VAL-CSV-013 | ERROR | `device_model_code` cannot point to `rack_object`. |
| VAL-CSV-014 | ERROR | `device_type` must match `device_model_code`. |
| VAL-CSV-015 | ERROR | Duplicate `serial_number` in CSV. |
| VAL-CSV-016 | ERROR | `serial_number` already exists in repository. |
| VAL-CSV-017 | ERROR | Duplicate `asset_tag` in CSV. |
| VAL-CSV-018 | ERROR | `asset_tag` already exists in repository. |
| VAL-CSV-019 | WARNING | Invalid tag format causes a warning. |

## 16. CSV import process

1. User selects a CSV file.
2. Application reads headers.
3. Application validates all rows.
4. Application shows summary:
   - number of rows,
   - number of valid devices,
   - number of errors,
   - number of warnings.
5. If any `ERROR` exists, import is blocked.
6. If there are no `ERROR` messages, user confirms import.
7. Application generates UUIDs for new devices.
8. Application saves devices to appropriate files under `inventory/devices/`.

## 17. Where imported devices are saved

If `device_model_code` is provided:

- application finds DeviceModel,
- checks `device_type` compatibility,
- saves device to file matching `device_type`.

If `device_model_code` is not provided:

- application uses `device_type` from CSV,
- saves device to appropriate file.

Example:

```csv
srv-new-01,server,srv-new-01,dell-r650,NEWSRV001,INV-05001,SRV-NEW-01,in_stock,new
```

will be saved to:

```text
inventory/devices/servers.yaml
```
