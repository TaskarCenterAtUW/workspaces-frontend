import { reactive } from 'vue';
import { TdeiClient, TdeiAuthStore } from '~/services/tdei';
import { WorkspacesClient } from '~/services/workspaces';

// TODO: use config when switching to React:
const tdeiGatewayUrl = 'https://tdei-gateway-stage.azurewebsites.net/api/v1/';
const apiUrl = 'http://localhost:8000/';

export const tdeiAuth = reactive(new TdeiAuthStore());
export const tdeiClient = new TdeiClient(tdeiGatewayUrl, tdeiAuth);
tdeiClient.restartAutoAuthRefresh();

export const workspacesClient = new WorkspacesClient(apiUrl, tdeiClient);
