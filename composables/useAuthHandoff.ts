import { osmClient, tdeiClient } from '~/services/index';

export function useAuthHandoff() {
  async function activate(refreshToken: string) {
    // TDEI validates the refresh-token signature and account during exchange.
    // The decoded incoming `sub` is used only to decide whether confirmation
    // is required; token claims are not independently trusted here.
    await tdeiClient.authenticateWithRefreshToken(refreshToken);
    await osmClient.provisionUser();
  }

  return { activate };
}
