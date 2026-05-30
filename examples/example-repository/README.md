# Rack Inventory Studio — Example Repository

This is a realistic demo repository for Rack Inventory Studio, suitable for
manual QA, feature exploration, and beta testing.

## Contents

| Category        | Count | Notes                                          |
|-----------------|-------|------------------------------------------------|
| Locations       | 3     | Warsaw HQ, Gdańsk Branch, Łódź DR Site        |
| Racks           | 6     | 3 HQ, 2 Gdańsk, 1 DR                          |
| Device models   | 17+   | Servers, network, storage, UPS, appliances     |
| Devices (total) | 50+   | Servers, switches, firewalls, UPS, storage … |
| Placed devices  | ~40   | Across all racks                               |
| Unplaced        | ~10   | In-stock, planned, staging pool                |

## Locations

- **Warsaw — HQ Server Room A** (`hq-server-room-a`): three racks (A01, A02, B01)
- **Gdańsk — Branch Office** (`gdansk-branch`): two racks (gdansk-01, gdansk-02)
- **Łódź — Backup / DR Site** (`backup-dr`): one rack (dr-01)

## Edge cases covered

- Device with `to_remove` status that is still placed in a rack (srv-dev-01)
- Two devices with identical display names (srv-new-01 and srv-new-02)
- Device with no serial number (srv-no-serial)
- Device with `planned` status and no placement (srv-planned-01)
- Placement using `device_model` as target (blank panels, patch panel, cable organizer)
- Sparse rack with a single item (rack-gdansk-02)
- Reserved U-range placement spanning multiple units (rack-a01 front U30–33)
- Rear-only items (UPS units in all racks)

## Structure

```
inventory/
  locations.yaml               — 3 locations
  racks/
    warsaw-serverroom-a.yaml   — 3 racks for Warsaw HQ
    gdansk-branch.yaml         — 2 racks for Gdańsk
    backup-dr.yaml             — 1 rack for Łódź DR
  device-models/
    servers.yaml               — 4 server models
    network.yaml               — 4 network models
    storage.yaml               — 2 storage models
    ups.yaml                   — 2 UPS models
    appliances.yaml            — 2 appliance models
    other.yaml                 — 1 generic model
    rack-objects.yaml          — blank panel, patch panel, cable organizer
  devices/
    servers.yaml               — 25+ server devices
    network.yaml               — 11 network devices
    storage.yaml               — 4 storage devices
    ups.yaml                   — 4 UPS devices
    appliances.yaml            — 4 appliance devices
    other.yaml                 — 1 other device
  placements/
    rack-a01.yaml              — Warsaw HQ rack A01 (42U, densely populated)
    rack-a02.yaml              — Warsaw HQ rack A02 (sparse)
    rack-hq-b01.yaml           — Warsaw HQ rack B01
    rack-gdansk-01.yaml        — Gdańsk rack 01 (42U)
    rack-gdansk-02.yaml        — Gdańsk rack 02 (24U, sparse)
    rack-dr-01.yaml            — Łódź DR rack 01
  examples/
    devices-import-example.csv — Example CSV for the device bulk-import feature
```

## Format version

Data format: v0.1 — Rack Inventory Studio 0.1.0-beta.1
