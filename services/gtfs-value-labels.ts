// Readable labels for the coded (numeric) values of GTFS stops.txt and
// pathways.txt columns, from the GTFS reference. Rapid shows tag values raw,
// so the pathways editor labels these next to the value (see
// services/rapid3-tag-labels.ts). The field option labels in
// rapid3-pathways-schema.json use the same wording (checked by a unit test).

export const GTFS_VALUE_LABELS: Record<string, Record<string, string>> = {
  location_type: {
    0: 'Stop / Platform',
    1: 'Station',
    2: 'Entrance / Exit',
    3: 'Generic Node',
    4: 'Boarding Area'
  },
  pathway_mode: {
    1: 'Walkway',
    2: 'Stairs',
    3: 'Moving Sidewalk',
    4: 'Escalator',
    5: 'Elevator',
    6: 'Fare Gate',
    7: 'Exit Gate'
  },
  is_bidirectional: {
    0: 'Unidirectional (from -> to only)',
    1: 'Bidirectional'
  },
  wheelchair_boarding: {
    0: 'No information',
    1: 'Wheelchair accessible',
    2: 'Not wheelchair accessible'
  },
  stop_access: {
    0: 'Only through the station',
    1: 'Directly from the street'
  }
};

/** The label for a coded GTFS tag value, or undefined if it isn't one. */
export function gtfsValueLabel(key: string, value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return GTFS_VALUE_LABELS[key.trim()]?.[value.trim()];
}
