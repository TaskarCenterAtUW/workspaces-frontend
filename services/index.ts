import { reactive } from 'vue';
import { TdeiAuthStore, TdeiClient, TdeiUserClient } from '~/services/tdei';
import {
  AugmentedDiffCache,
  AugmentedDiffDb,
  OsmChangeCache,
  OsmChangeDb,
  ChangesetManager,
} from '~/services/changesets';
import { OsmApiClient } from '~/services/osm';
import { PathwaysEditorManager } from '~/services/pathways';
import { ReviewManager } from '~/services/review';
import { RapidManager } from '~/services/rapid';
import { WorkspacesClient } from '~/services/workspaces';

const tdeiApiUrl = import.meta.env.VITE_TDEI_API_URL;
const tdeiUserApiUrl = import.meta.env.VITE_TDEI_USER_API_URL;
const apiUrl = import.meta.env.VITE_API_URL;
const newApiUrl = import.meta.env.VITE_NEW_API_URL;
const osmWebUrl = import.meta.env.VITE_OSM_URL;
const osmApiUrl = osmWebUrl + 'api/0.6/';
const rapidUrl = import.meta.env.VITE_RAPID_URL;
const pathwaysUrl = import.meta.env.VITE_PATHWAYS_EDITOR_URL;

export const tdeiAuth = reactive(new TdeiAuthStore());
export const tdeiClient = new TdeiClient(tdeiApiUrl, tdeiAuth);
export const tdeiUserClient = new TdeiUserClient(tdeiUserApiUrl, tdeiClient);
tdeiClient.restartAutoAuthRefresh();

export const osmClient = new OsmApiClient(osmWebUrl, osmApiUrl, tdeiClient);
export const workspacesClient = new WorkspacesClient(apiUrl, newApiUrl, tdeiClient, osmClient);

const oscCacheTtl = 1000 * 60 * 60 * 24 * 45; // 45 days
const adiffCacheTtl = oscCacheTtl;
const oscKeypath = ['workspaceId', 'changesetId'];
const adiffKeypath = oscKeypath;

const oscCacheDb = new OsmChangeDb('osc-cache', oscCacheTtl, oscKeypath);
const adiffCacheDb = new AugmentedDiffDb('adiff-cache', adiffCacheTtl, adiffKeypath);

export const changesetManager = new ChangesetManager(
  osmClient,
  new OsmChangeCache(oscCacheDb),
  new AugmentedDiffCache(adiffCacheDb));
export const reviewManager = new ReviewManager(
  changesetManager,
  osmClient,
  tdeiClient,
  workspacesClient,
);

export const rapidManager = new RapidManager(rapidUrl, osmWebUrl, tdeiAuth);
export const pathwaysManager = new PathwaysEditorManager(pathwaysUrl, osmWebUrl, tdeiAuth);
