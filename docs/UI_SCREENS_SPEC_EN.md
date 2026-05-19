
# Rack Inventory Studio — MVP Screen Design v0.1

## 1. Purpose

This document describes the MVP screen design for **Rack Inventory Studio**. It is not a visual mockup or technology specification yet. It describes main screens, their purpose, basic layout, actions, UI states, and navigation.

## 2. General application structure

The application should use a simple tool-oriented layout:

```text
┌─────────────────────────────────────────────┐
│ Top bar: repo name, status, Git actions      │
├───────────────┬─────────────────────────────┤
│ Left nav      │ Main screen content           │
└───────────────┴─────────────────────────────┘
```

MVP priorities: readability, fast navigation, safe save, validation, rack view with form-based placement operations, and easy search. Drag and drop is a post-MVP UX enhancement.

## 3. Main navigation

Left navigation:

```text
Repository
Validation / problems
Change history

Locations
Device models
Devices
CSV import
```

Rack view is not a main menu item. The user reaches it through `Locations → selected location → selected rack`.

## 4. Persistent top bar

The top bar should be visible on most screens.

```text
Rack Inventory Studio
Repository: example-rack-inventory
Branch: main
Status: 3 local changes
Validation: 0 errors / 4 warnings

[ Pull data ] [ Save locally ] [ Publish changes ]
```

If repository has `ERROR` validation issues, the `Publish changes` button is disabled or shows: `Publishing blocked — 3 validation errors`.

## 5. Start screen

### Purpose

The first screen after launching the application.

### Layout

```text
Rack Inventory Studio

[ Open last repository ]
[ Open existing repository ]
[ Create new repository ]

Recent repositories:
- example-rack-inventory
- production-rack-inventory
```

### Actions

| Action | Effect |
|---|---|
| Open last repository | Loads last used directory |
| Open existing repository | Opens directory picker |
| Create new repository | Starts new repository wizard |

Invalid directory error: `The selected directory does not contain a valid Rack Inventory Studio repository.`

## 6. Screen: Repository / synchronization

### Purpose

Main technical state screen for the repository.

### Layout

```text
Repository / synchronization

Repository:
  Name: example-rack-inventory
  Local path: C:/...
  Branch: main
  Remote: origin
  Last sync: 2026-05-03 12:30

Status:
  Local changes: yes
  Changed files: 4
  Validation errors: 0
  Warnings: 3

[ Pull latest data ]
[ Save locally ]
[ Publish changes ]
[ Go to validation ]
[ Show change history ]

Changed files:
- inventory/placements/rack-a01.yaml
- inventory/devices/servers.yaml
```

### Actions

| Action | Effect |
|---|---|
| Pull latest data | Performs pull |
| Save locally | Writes YAML |
| Publish changes | Validation, commit, push |
| Go to validation | Opens problems screen |
| Show change history | Opens Git history |

With `ERROR` validation issues: `Publish changes — unavailable. Reason: repository contains blocking validation errors.`

On Git conflict, the app proposes a conflict branch, for example `conflict/jplucinski/rack-a01/2026-05-03-1230`.

## 7. Screen: Validation / problems

### Purpose

Display validator errors, warnings, and informational messages.

### Layout

```text
Validation / problems

Summary:
  ERROR: 2
  WARNING: 5
  INFO: 1

Filters:
[ All ] [ ERROR ] [ WARNING ] [ INFO ]

ERROR
[VAL-PLC-012] Placement exceeds rack height
Rack: rack-a01
File: inventory/placements/rack-a01.yaml
Object: plc-storage-01
[ Go to rack ] [ Show file ]

WARNING
[VAL-DEV-014] Device installed without placement
Device: srv-app-03
[ Go to device ]
```

### Actions

| Action | Effect |
|---|---|
| Go to rack | Opens rack view |
| Go to device | Opens device details |
| Show file | Shows file or path |
| Run validation again | Refreshes results |

Clicking a problem should take the user to a place where it can be fixed. Example: placement collision opens rack view.

## 8. Screen: Change history

### Purpose

Simple Git history view.

### Layout

```text
Change history

Filters:
[ Author ] [ Date from-to ] [ Search message ]

2026-05-03 12:30
Author: Jan P.
Commit: a1b2c3d
Message: Updated rack A01 placements
Changed files:
- inventory/placements/rack-a01.yaml
[ Show details ]
```

MVP only needs commit hash, author, date, message, and changed files. Domain-level diff is outside MVP.

## 9. Screen: Locations

### Purpose

List of locations, where one location means one server room / room.

### Layout

```text
Locations

[ Add location ]

Search: [____________]

Table:
Code                  Name                     Racks  Tags
warsaw-serverroom-a   Warsaw - Server Room A   2      production, warsaw
krakow-serverroom-a   Krakow - Server Room A   1      dr, krakow
```

### Actions

| Action | Effect |
|---|---|
| Add location | Opens Location creation form |
| Click location | Opens location view |
| Edit | Edits Location |
| Delete | Only possible if there are no racks |

## 10. Screen: Location view

### Purpose

Manage racks in a specific location.

### Layout

```text
Location: Warsaw - Server Room A
Code: warsaw-serverroom-a
Address: Warsaw, Example Street 1
Tags: production, warsaw

[ Edit location ]
[ Add rack ]

Racks:
Code       Name       Row   Height   Front items   Rear items   Warnings
rack-a01   Rack A01   A     42U      5             3            1
rack-a02   Rack A02   A     42U      0             0            1
```

### Actions

| Action | Effect |
|---|---|
| Add rack | Opens Rack creation form |
| Click rack | Opens rack view |
| Edit rack | Edits rack |
| Delete rack | Only if there are no placements |

Useful columns: front/rear placement count, warning count, and whether placement file exists.

## 11. Screen: Device model catalog

### Purpose

Manage physical models and rack objects.

### Layout

```text
Device model catalog

Categories:
[ server ] [ network ] [ storage ] [ ups ] [ appliance ] [ rack_object ] [ other ]

Active category: network

[ Add model ]

Search: [____________]

Table:
Code           Name                  Vendor     Model             Height   Tags
cisco-c9300    Cisco Catalyst 9300   Cisco      Catalyst 9300     1U       switch
fortigate-100f Fortinet 100F         Fortinet   FortiGate 100F    1U       firewall, edge
```

### Model form

```text
code *
name *
device_type *
vendor
model
default_height_u *
description
tags
```

For `rack_object`, UI should explain that the model will be available in the Rack objects panel and can be used without creating a Device.

## 12. Screen: Device instance catalog

### Purpose

List concrete device instances.

### Layout

```text
Devices

[ Add device ]
[ Import CSV ]

Filters:
Type: [ all ]
Status: [ all ]
Placement: [ all / placed / unplaced ]
Tag: [ ... ]

Search:
[ code / name / SN / asset tag / external_ref ]

Table:
Code          Name        Type     Model       SN          Asset tag   Status      Placement
srv-db-01     srv-db-01   server   dell-r650   ABC123456   INV-00451   installed   rack-a01 front U12
srv-app-01    srv-app-01  server   hpe-dl380   XYZ987654   INV-00452   in_stock    —
```

### Actions

| Action | Effect |
|---|---|
| Add device | Opens Device form |
| Import CSV | Opens import |
| Edit | Edits Device |
| Delete | Only if no placement |
| Click placement | Opens rack view on selected rack and side |

The `unplaced` filter is operationally important.

## 13. Screen: Device details

Can be a separate screen or side panel.

```text
Device: srv-db-01

code: srv-db-01
name: srv-db-01
type: server
model: Dell PowerEdge R650
serial_number: ABC123456
asset_tag: INV-00451
external_ref: SRV-DB-01
status: installed
tags: database

Placement:
Rack: Rack A01
Side: front
Start U: 12
Height: 1U

[ Edit ]
[ Go to rack ]
[ Delete device ]
```

If device has no placement: `Placement: none`.

## 14. Screen: CSV import

### Purpose

Import new devices.

### Layout

```text
CSV import

Format:
code,device_type,name,device_model_code,serial_number,asset_tag,external_ref,status,tags

[ Select CSV file ]

After file selection:
File: devices-import.csv
Rows: 120

Validation result:
ERROR: 2
WARNING: 4
Valid devices: 114

[ Import ]  — available only if ERROR = 0

Preview table:
Row  Code        Type    Model code   SN       Asset tag   Status     Result
1    srv-new-01  server  dell-r650    ...      ...         in_stock   OK
2    srv-new-02  server  unknown      ...      ...         in_stock   ERROR: model not found
```

Import does not update existing devices. If `code` already exists, it is an `ERROR`.

## 15. Key screen: Rack view

### Purpose

View and edit placements in a specific rack.

### Main decision

The view shows **one rack side at a time**: `Front` or `Rear`.

### General layout

```text
Rack A01 — Warsaw - Server Room A

[ Front ] [ Rear ]
Active side: Front

┌────────────────────┬────────────────────┬─────────────────────────┐
│ Rack view           │ Unplaced devices   │ Details / Rack objects  │
│                     │                    │                         │
│ U42  sw-core-01     │ srv-app-02         │ Selected element        │
│ U41  empty          │ srv-new-01         │ or                      │
│ U40  sw-core-01     │ srv-new-02         │ rack objects list       │
│ ...                 │                    │                         │
│ U12  srv-db-01      │                    │                         │
│ U11  empty          │                    │                         │
│ ...                 │                    │                         │
│ U01  ups-a01-01     │                    │                         │
└────────────────────┴────────────────────┴─────────────────────────┘
```

### Rack header

```text
Rack A01
Location: Warsaw - Server Room A
Height: 42U
Row: A
Active side: Front
Validation: 0 errors / 1 warning

[ Edit rack ] [ Validate rack ] [ Go to placement file ]
```

### Side switch

```text
[ Front: 5 items ] [ Rear: 3 items ]
```

Clicking `Rear` reloads view to `placements.rear`.

### U view

On screen, U42 is at the top and U1 is at the bottom. Logically, `start_u` is always counted from the bottom.

Example 2U device:

```text
U14  srv-app-01
U13  srv-app-01
```

Placement has:

```yaml
start_u: 13
height_u: 2
```

### Element visualization

Every item should show at least:

```text
code
name or model
height_u
status / type
```

Device example:

```text
srv-db-01
Dell R650
SN: ABC123456
```

Rack object example:

```text
reserved-space
Reserved space
4U
```

### Unplaced devices panel

Shows devices without placement.

Filters:

```text
Search
device_type
status
tags
```

List item:

```text
srv-new-01
server / Dell R650
SN: NEWSRV001
Asset: INV-05001
```

Actions: drag to U, open details.

### Rack objects panel

Can be in the right panel or as a tab.

```text
Rack objects

blank-panel-1u
cable-organizer-1u
reserved-space
unknown-object
```

Action: drag to U.

### Placement details panel

After clicking an item in rack:

```text
Placement: plc-srv-db-01

Target:
  device: srv-db-01

Position:
  side: front
  start_u: 12
  effective_height_u: 1
  range: U12

Override:
  height_u: —

Note:
  ...

Tags:
  ...

[ Edit ]
[ Remove placement ]
[ Open device ]
```

For rack object:

```text
Target:
  device_model: reserved-space
  type: rack_object
```

### Rack view actions — MVP (form-based)

| Action | Effect |
|---|---|
| Add placement (form) | Creates device or rack object placement via form |
| Move placement (form) | Changes rack, side, start U, height via inspector form; supports same-rack, cross-side, and cross-rack |
| Remove placement | Removes placement via confirmation button |
| Switch Front/Rear | Changes active side |

### Rack view actions — post-MVP (drag and drop)

Drag and drop is the target UX but is deferred to post-MVP. When implemented:

| Action | Effect |
|---|---|
| Drag device to U | Creates placement |
| Drag rack object to U | Creates `target_kind=device_model` placement |
| Drag placement to another U | Changes `start_u` |
| Drag device from rack to unplaced panel | Removes placement |

### Not included in MVP

```text
drag and drop (post-MVP UX enhancement)
showing front and rear simultaneously
device depth modeling
vertical PDUs
half-width devices
```

## 16. Modals and forms

### Add location

```text
Add location

code *
name *
address
description
tags

[ Cancel ] [ Add ]
```

### Add rack

```text
Add rack

location: Warsaw - Server Room A

code *
name *
height_u *
row
description
tags

[ Cancel ] [ Add ]
```

After adding rack, application creates empty placement file.

### Add device model

```text
Add device model

device_type *
code *
name *
vendor
model
default_height_u *
description
tags

[ Cancel ] [ Add ]
```

For `rack_object`, label may say `Add rack object`.

### Add device

```text
Add device

device_type *
device_model
code *
name
serial_number
asset_tag
external_ref
status *
description
tags

[ Cancel ] [ Add ]
```

Inline rule: `Provide at least one of: name, serial_number, asset_tag.`

### Add placement manually

Form-based placement is the MVP workflow. Drag and drop is a post-MVP UX enhancement.

```text
Add placement

Rack: Rack A01
Side: Front

target_kind *
target *
start_u *
height_u
note
tags

[ Cancel ] [ Add ]
```

### Edit placement

```text
Edit placement

code
target: srv-db-01
side: front  readonly

start_u *
height_u
note
tags

[ Cancel ] [ Save ]
```

Non-editable: `id`, `target_kind`, `target_id`, `side`.

## 17. Empty states

### No locations

```text
No locations have been added yet.

[ Add first location ]
```

### Location without racks

```text
This location has no racks yet.

[ Add first rack ]
```

### Rack without placements

```text
This rack side is empty.

Use the Add Placement form to place a device or rack object.
```

### No devices

```text
No devices have been added yet.

[ Add device ]
[ Import CSV ]
```

### No unplaced devices

```text
No unplaced devices.
```

## 18. UI error states

### Placement collision

```text
Cannot place item.
Range U12-U13 collides with srv-db-01.
```

### Placement outside rack

```text
Cannot place item.
Range U41-U44 exceeds rack height 42U.
```

### Device without model and without height_u

```text
Cannot place device.
Device has no model, so you must provide height_u.
```

### Publishing blocked by errors

```text
Cannot publish changes.
Repository contains 3 blocking errors.
```

## 19. MVP screen priority

Recommended implementation/design order:

```text
1. Open repository
2. Validation / problems
3. Locations
4. Location view
5. Rack view
6. Device catalog
7. CSV import
8. Device model catalog
9. Repository / synchronization
10. Change history
```

Most important product screen: `Rack view`.

Most important technical screen: `Validation / problems`.

## 20. MVP design decision

MVP UI should be tool-like and table-oriented, not decorative.

Priorities:

```text
readability
simple navigation
easy validation
safe save
rack view with form-based placement operations
fast search
drag and drop (post-MVP UX enhancement)
```
