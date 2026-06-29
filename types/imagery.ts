// Each ring is an array of [lon, lat] pairs. The first and last elements must
// be equal (closed):
type LinearRing = [number, number][];

type ImagerySourceType = 'tms' | 'wmts' | 'xyz';

interface ImagerySourceAttribution {
  required: boolean;
  text: string;
  url: string;
}

interface ImagerySourceExtent {
  max_zoom: number;
  polygon: LinearRing[];
}

export interface ImagerySource {
  attribution: ImagerySourceAttribution;
  description: string;
  extent: ImagerySourceExtent;
  icon: string;
  id: string;
  name: string;
  type: ImagerySourceType;
  url: string;
}

export interface ImagerySettings {
  workspace_id: number;
  definition: ImagerySource[] | null;
  modifiedAt: string;
  modifiedBy: string;
  modifiedByName: string;
}
