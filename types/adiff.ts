import { OSMCHANGE_ACTION_TYPES } from '~/types/osm';
import type {
  OsmChangeActionType,
  OsmElement,
  OsmNode,
  OsmWay,
  OsmElementType
} from '~/types/osm';

export type AdiffNode = OsmNode;

export interface AdiffWayNodeRef {
  ref: number;
  lat: number;
  lon: number;
};

export interface AdiffWay extends Omit<OsmWay, 'nodes'> {
  nodes: Array<AdiffWayNodeRef>;
}

export type AdiffElement = AdiffNode | AdiffWay;
export type AdiffActionType = OsmChangeActionType;

export interface AdiffAction {
  type: AdiffActionType,
  new: AdiffElement,
  old?: AdiffElement
}

export interface AugmentedDiff {
  actions: Array<AdiffAction>,
}
