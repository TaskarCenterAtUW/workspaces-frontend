import {
  BlobReader,
  BlobWriter,
  TextReader,
  TextWriter,
  ZipReader,
  ZipWriter
} from '@zip.js/zip.js';

const EMPTY_DATASET_TEMPLATE = new Map([
  datasetEntry(
    'agency.txt',
    ['agency_id', 'agency_name', 'agency_url', 'agency_timezone'],
    ['1', 'Example', 'https://example.com/', 'Etc/UTC']
  ),
  datasetEntry(
    'calendar.txt',
    [
      'service_id',
      'start_date',
      'end_date',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday'
    ],
    [
      1,
      formatGtfsDate(new Date(new Date().getFullYear(), 0, 1)),
      formatGtfsDate(new Date(new Date().getFullYear(), 11, 31)),
      1, // monday
      1, // tuesday
      1, // wednesday
      1, // thursday
      1, // friday
      1, // saturday
      1 // sunday
    ]
  ),
  datasetEntry(
    'routes.txt',
    [
      'route_id',
      'agency_id',
      'route_short_name',
      'route_long_name',
      'route_desc',
      'route_type',
      'route_url',
      'route_color',
      'route_text_color',
      'network_id'
    ],
    []
  ),
  datasetEntry(
    'stop_times.txt',
    [
      'trip_id',
      'arrival_time',
      'departure_time',
      'stop_id',
      'stop_sequence',
      'pickup_type',
      'drop_off_type'
    ],
    []
  ),
  datasetEntry(
    'stops.txt',
    [
      'stop_id',
      'stop_name',
      'stop_lat',
      'stop_lon',
      'location_type'
    ],
    []
  ),
  datasetEntry(
    'trips.txt'
    [
      'route_id',
      'service_id',
      'trip_id'
    ],
    []
  )
]);

function datasetEntry(filename: string, fields: Array, values: Array) {
  let csv = fields.join(',') + '\n';

  if (values?.length > 0) {
    csv += values.join(',') + '\n';
  }

  return [filename, csv];
}

export function createEmptyGtfsDataset() {
  return new Map(EMPTY_DATASET_TEMPLATE);
}

export function formatGtfsDate(date: Date): string {
  return date.getFullYear()
    + (date.getMonth() + 1).toString().padStart(2, '0')
    + date.getDate().toString().padStart(2, '0')
}

export async function createGtfsArchive(files: Map): Blob {
  const blobWriter = new BlobWriter('application/zip');
  const zipWriter = new ZipWriter(blobWriter);
  const filePromises = []

  for (const [filename, csv] of files.entries()) {
    filePromises.push(zipWriter.add(filename, new TextReader(csv)));
  }

  await Promise.all(filePromises);
  zipWriter.close();

  return await blobWriter.getData();
}
