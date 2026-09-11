/**
 * Combat Normalizer — converts raw WCL payloads into the internal combat
 * model. This is the **only** place that knows about raw WCL field names;
 * when the WCL API changes, only this package needs to change.
 */
export * from './normalize.js';
