# Beta Demo Repository — Manual QA Guide

This document describes the example repository bundled at
`examples/example-repository/` and lists the manual QA scenarios it
supports.

---

## Overview

The example repository is a realistic, multi-site inventory intended for
exploratory QA during the beta phase. Open it via **Open Repository** in the
app to begin.

| Dimension       | Value |
|-----------------|-------|
| Locations       | 3     |
| Racks           | 6     |
| Device models   | 17+   |
| Devices (total) | 50+   |
| Placed devices  | ~40   |
| Unplaced/staged | ~10   |

### Sites

| Code               | Name                          | Racks                  |
|--------------------|-------------------------------|------------------------|
| `hq-server-room-a` | Warsaw — HQ Server Room A     | rack-a01, rack-a02, rack-hq-b01 |
| `gdansk-branch`    | Gdańsk — Branch Office        | rack-gdansk-01, rack-gdansk-02  |
| `backup-dr`        | Łódź — Backup / DR Site       | rack-dr-01                      |

---

## QA Scenarios

### 1. Open and browse

1. Launch the app → **Open Repository** → select `examples/example-repository/`.
2. Verify the sidebar shows 3 locations, each with the correct rack count.
3. Navigate to **Warsaw → rack-a01**. Confirm the rack diagram renders a dense
   42U rack with items on both front and rear sides.
4. Navigate to **Gdańsk → rack-gdansk-02**. Confirm the diagram shows a sparse
   24U rack (only one item at U1 front).

### 2. Rack diagram — dense rack

Open **rack-a01** (42U, Warsaw HQ). Expected front slots:

| U      | Device                                | Notes                  |
|--------|---------------------------------------|------------------------|
| 1–2    | App Server 02 (HPE DL380)             |                        |
| 3–4    | App Server 03 (HPE DL380)             |                        |
| 5      | Web Server 01 (Dell R650)             |                        |
| 6      | Web Server 02 (Dell R650)             |                        |
| 7      | Database Server 02 (Dell R650)        |                        |
| 8      | Edge Router 01 (Cisco ASR 1001-X)     |                        |
| 9      | Access Switch 01 (Cisco C9300)        |                        |
| 10     | Access Switch 02 (Cisco C9300)        |                        |
| 12     | Database Server 01 (Dell R650)        | existing               |
| 14–15  | App Server 01 (HPE DL380)             | existing               |
| 16–17  | Dev Server 01 (Dell R750)             | `to_remove` status     |
| 18–19  | Blank panels                          | rack object filler     |
| 20–21  | Monitoring Server (Dell R750)         |                        |
| 22–23  | Backup Server (HPE DL380)             |                        |
| 24     | NAS 01 (Synology RS1221+)             |                        |
| 25–26  | Storage Array 01 (Dell ME5024)        |                        |
| 27     | KVM Switch A01                        |                        |
| 28     | PDU B01                               |                        |
| 29     | Edge Firewall 02 (FortiGate 100F)     | HA pair                |
| 30–33  | Reserved — future storage expansion   | rack object, 4U        |
| 40     | Core Switch 01 (Cisco C9300)          | existing               |

Rear: UPS A01 (U1–2), cable organizer (U20), Edge Firewall 01 (U38), KVM B01 (U39).

### 3. Edge cases to verify

#### 3a. `to_remove` device in rack
- `srv-dev-01` (Dev Server 01) is placed at rack-a01 U16–17 with status
  `to_remove`. Verify the app renders it and does not silently drop it.

#### 3b. Duplicate display names
- `srv-new-01` and `srv-new-02` both have `name = "Production Server"`.
  Verify search and device list handle this gracefully (no crash, no merge).

#### 3c. Device with no serial number
- `srv-no-serial` has an asset tag (`INV-90003`) but no serial number.
  Verify the device appears in the list without validation errors.

#### 3d. `planned` device with no placement
- `srv-planned-01` has status `planned` and is not placed in any rack.
  Verify it appears in the unplaced-devices view.

#### 3e. Rack object as placement target
- Blank panels in rack-a01 (U18–19) and rack-a02 (U3), the patch panel in
  rack-hq-b01 (U1–2), and the cable organizer in rack-a01 rear (U20) all use
  `target_kind: device_model`. Verify the rack diagram renders them without
  resolving them as concrete devices.

#### 3f. Sparse rack
- `rack-gdansk-02` (24U) has a single item at U1. Verify the diagram shows
  the correct empty space.

#### 3g. Device without a model
- `unknown-device-01` in `devices/other.yaml` has no `device_model_id`.
  Verify it appears as an unplaced device without crashing.

### 4. Unplaced-devices view

Open the unplaced devices panel. Confirm it includes:
- `srv-new-01`, `srv-new-02` (in_stock)
- `srv-planned-01` (planned)
- `srv-no-serial` (in_stock)
- `srv-unplaced-01` (in_stock)
- `sw-new-01` (in_stock)
- `unknown-device-01` (unknown, no model)

### 5. Search

Search for `gdansk`. Confirm results include the Gdańsk location, both Gdańsk
racks, and all devices with `gdansk` in code or name.

Search for `to_remove`. Should return `srv-dev-01`.

### 6. Validation

Trigger **Validate** on the repository. The expected result is zero errors.
Warnings (if any) must not prevent saving.

### 7. CSV import (example file)

Open **Import Devices** and upload
`inventory/examples/devices-import-example.csv`. The preview should show four
rows: two servers, one network device, and one `other` device (no model).
Confirm that importing does not duplicate existing codes.

### 8. Dirty-guard / save

Make a minor change (e.g., add a tag to any device), then attempt to close or
navigate away. Confirm the dirty-guard prompt appears. Save and verify the YAML
file is updated.

### 9. Multi-site navigation

Confirm that switching between Warsaw HQ and the Gdańsk site racks (and back)
does not lose state or cause navigation errors.

---

## Counts reference

After opening the repository you can verify counts via the UI:

| List                | Expected count |
|---------------------|----------------|
| Locations           | 3              |
| Racks               | 6              |
| Device models       | ≥ 17           |
| All devices         | ≥ 50           |
| Unplaced devices    | ≥ 8            |
