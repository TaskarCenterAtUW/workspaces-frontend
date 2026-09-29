import type {
  OsmChangeActionType,
  OsmNode,
  OsmRelation,
  OsmTags,
  OsmWay,
} from '~/types/osm';

export type AdiffNode = OsmNode;

export interface AdiffWayNodeRef {
  ref: number;
  lat: number;
  lon: number;
};

export interface AdiffWay extends Omit<OsmWay, 'nodes'> {
  nodes: AdiffWayNodeRef[];
}

export type AdiffRelationMember
  = | {
    type: 'node';
    ref: number;
    role: string;
    lat?: number;
    lon?: number;
    tags?: OsmTags;
  }
  | {
    type: 'way';
    ref: number;
    role: string;
    nodes?: AdiffWayNodeRef[];
    tags?: OsmTags;
  }
  | {
    type: 'relation';
    ref: number;
    role: string;
    members?: AdiffRelationMember[];
    tags?: OsmTags;
  };

export interface AdiffRelation extends Omit<OsmRelation, 'members'> {
  members: AdiffRelationMember[];
}

export type AdiffElement = AdiffNode | AdiffWay | AdiffRelation;
export type AdiffActionType = OsmChangeActionType;

export interface AdiffAction {
  type: AdiffActionType;
  new: AdiffElement;
  old?: AdiffElement;
}

export interface AugmentedDiff {
  actions: AdiffAction[];
}
