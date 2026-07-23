// Ambient declarations for editor/map libraries injected as runtime globals
// (loaded via <script> at runtime rather than imported), so they have no types.
export {};

declare global {
  // Leaflet, loaded as a global `L` (no @types/leaflet installed).
  const L: any;

  interface Window {
    // The iD / Pathways editor namespace, attached by the iD script on load.
    iD: any;

    // Transiently stashed by the auth middleware to redirect back after sign-in.
    rememberRoute?: any;
  }
}
