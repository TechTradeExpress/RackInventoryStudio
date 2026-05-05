use crate::device_model::DeviceModel;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PlacementTargetKind {
    Device,
    DeviceModel,
}

impl std::str::FromStr for PlacementTargetKind {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "device" => Ok(Self::Device),
            "device_model" => Ok(Self::DeviceModel),
            _ => Err(format!("unknown target kind: {s}")),
        }
    }
}

/// Context-only enum: indicates which side of the rack a placement belongs to.
/// NOT stored as a field inside `Placement` — determined by which list
/// (`PlacementFile::front` or `PlacementFile::rear`) the placement appears in.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PlacementSide {
    Front,
    Rear,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Placement {
    pub id: String,
    pub code: String,
    pub target_kind: PlacementTargetKind,
    pub target_id: String,
    /// Bottom-most rack unit of this placement (rack units are numbered bottom-up, starting at 1).
    pub start_u: u32,
    /// Optional height override. Falls back to `DeviceModel::default_height_u` when absent.
    pub height_u: Option<u32>,
    pub note: Option<String>,
    pub tags: Vec<String>,
}

impl Placement {
    /// Returns the effective height in rack units.
    ///
    /// Priority: `self.height_u` (explicit override) > `model.default_height_u` (fallback).
    /// Returns `None` if neither source is available.
    pub fn effective_height_u(&self, model: Option<&DeviceModel>) -> Option<u32> {
        self.height_u
            .or_else(|| model.and_then(|m| m.default_height_u))
    }

    /// Computes the occupied U range for this placement.
    /// Returns `None` if the effective height cannot be determined.
    pub fn placement_range(&self, model: Option<&DeviceModel>) -> Option<PlacementRange> {
        self.effective_height_u(model)
            .map(|h| PlacementRange::new(self.start_u, h))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlacementFile {
    pub rack_id: String,
    pub front: Vec<Placement>,
    pub rear: Vec<Placement>,
}

/// An inclusive range of rack units occupied by a placement.
///
/// Invariant: `end_u >= start_u`. Both `start_u` and `height_u` must be >= 1
/// (enforced by validation, not by this type).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlacementRange {
    pub start_u: u32,
    pub end_u: u32,
}

impl PlacementRange {
    /// Constructs a range from a start position and height.
    ///
    /// `end_u = start_u + height_u - 1`
    ///
    /// Precondition: `height_u >= 1`. Passing `0` causes `u32` underflow (checked in debug builds).
    pub fn new(start_u: u32, height_u: u32) -> Self {
        debug_assert!(height_u >= 1, "height_u must be >= 1");
        Self {
            start_u,
            end_u: start_u + height_u - 1,
        }
    }

    /// Returns `true` if this range overlaps with `other`.
    /// Ranges [a, b] and [c, d] overlap iff `a <= d && c <= b`.
    pub fn overlaps(&self, other: &PlacementRange) -> bool {
        self.start_u <= other.end_u && other.start_u <= self.end_u
    }

    /// Returns `true` if the given U position falls within this range (inclusive).
    pub fn contains_u(&self, u: u32) -> bool {
        u >= self.start_u && u <= self.end_u
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::device_model::{DeviceModel, DeviceType};

    fn make_model(default_height_u: Option<u32>) -> DeviceModel {
        DeviceModel {
            id: "test-id".to_string(),
            code: "test-code".to_string(),
            device_type: DeviceType::Server,
            name: None,
            vendor: None,
            model: None,
            default_height_u,
            description: None,
            tags: vec![],
        }
    }

    fn make_placement(start_u: u32, height_u: Option<u32>) -> Placement {
        Placement {
            id: "p-id".to_string(),
            code: "p-code".to_string(),
            target_kind: PlacementTargetKind::Device,
            target_id: "d-id".to_string(),
            start_u,
            height_u,
            note: None,
            tags: vec![],
        }
    }

    #[test]
    fn range_end_u_formula() {
        let r = PlacementRange::new(12, 3);
        assert_eq!(r.start_u, 12);
        assert_eq!(r.end_u, 14);
    }

    #[test]
    fn range_1u_height_end_equals_start() {
        let r = PlacementRange::new(5, 1);
        assert_eq!(r.start_u, r.end_u);
        assert_eq!(r.end_u, 5);
    }

    #[test]
    fn range_multi_u_height() {
        let r = PlacementRange::new(1, 42);
        assert_eq!(r.end_u, 42);
    }

    #[test]
    fn ranges_overlap_when_intersecting() {
        let a = PlacementRange::new(10, 3); // U10-U12
        let b = PlacementRange::new(12, 2); // U12-U13
        assert!(a.overlaps(&b));
        assert!(b.overlaps(&a));
    }

    #[test]
    fn ranges_adjacent_do_not_overlap() {
        let a = PlacementRange::new(10, 3); // U10-U12
        let b = PlacementRange::new(13, 2); // U13-U14
        assert!(!a.overlaps(&b));
        assert!(!b.overlaps(&a));
    }

    #[test]
    fn ranges_identical_overlap() {
        let a = PlacementRange::new(5, 2);
        let b = PlacementRange::new(5, 2);
        assert!(a.overlaps(&b));
    }

    #[test]
    fn range_fully_contained_overlaps() {
        let outer = PlacementRange::new(5, 10); // U5-U14
        let inner = PlacementRange::new(7, 3); // U7-U9
        assert!(outer.overlaps(&inner));
        assert!(inner.overlaps(&outer));
    }

    #[test]
    fn contains_u_within_range() {
        let r = PlacementRange::new(10, 4); // U10-U13
        assert!(r.contains_u(10));
        assert!(r.contains_u(13));
        assert!(r.contains_u(11));
    }

    #[test]
    fn contains_u_outside_range() {
        let r = PlacementRange::new(10, 4); // U10-U13
        assert!(!r.contains_u(9));
        assert!(!r.contains_u(14));
    }

    #[test]
    fn effective_height_uses_placement_override() {
        let p = make_placement(1, Some(3));
        let m = make_model(Some(1));
        assert_eq!(p.effective_height_u(Some(&m)), Some(3));
    }

    #[test]
    fn effective_height_falls_back_to_model() {
        let p = make_placement(1, None);
        let m = make_model(Some(2));
        assert_eq!(p.effective_height_u(Some(&m)), Some(2));
    }

    #[test]
    fn effective_height_none_when_no_source() {
        let p = make_placement(1, None);
        assert_eq!(p.effective_height_u(None), None);
    }

    #[test]
    fn effective_height_override_when_model_has_no_default() {
        let p = make_placement(1, Some(4));
        let m = make_model(None);
        assert_eq!(p.effective_height_u(Some(&m)), Some(4));
    }

    #[test]
    fn placement_range_none_when_no_height() {
        let p = make_placement(5, None);
        assert!(p.placement_range(None).is_none());
    }

    #[test]
    fn placement_range_computed_correctly() {
        let p = make_placement(12, Some(3));
        let range = p.placement_range(None).unwrap();
        assert_eq!(range.start_u, 12);
        assert_eq!(range.end_u, 14);
    }
}
