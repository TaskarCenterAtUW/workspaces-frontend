import { reactive } from 'vue'
import { TdeiAuthStore, TdeiClient, TdeiUserClient } from '~/services/tdei'
import { OsmApiClient } from '~/services/osm'
import { PathwaysEditorManager } from '~/services/pathways'
import { RapidManager } from '~/services/rapid'
import { WorkspacesClient } from '~/services/workspaces'

const tdeiApiUrl = import.meta.env.VITE_TDEI_API_URL
const tdeiUserApiUrl = import.meta.env.VITE_TDEI_USER_API_URL
const apiUrl = import.meta.env.VITE_API_URL
const osmWebUrl = import.meta.env.VITE_OSM_URL
const osmApiUrl = osmWebUrl + 'api/0.6/'
const rapidUrl = import.meta.env.VITE_RAPID_URL
const pathwaysUrl = import.meta.env.VITE_PATHWAYS_EDITOR_URL

export const tdeiAuth = reactive(new TdeiAuthStore())
export const tdeiClient = new TdeiClient(tdeiApiUrl, tdeiAuth)
export const tdeiUserClient = new TdeiUserClient(tdeiUserApiUrl, tdeiClient)
tdeiClient.restartAutoAuthRefresh()

export const osmClient = new OsmApiClient(osmWebUrl, osmApiUrl, tdeiClient)
export const workspacesClient = new WorkspacesClient(apiUrl, tdeiClient, osmClient)

export const rapidManager = new RapidManager(rapidUrl, osmWebUrl, tdeiAuth)
export const pathwaysManager = new PathwaysEditorManager(pathwaysUrl, osmWebUrl, tdeiAuth)
