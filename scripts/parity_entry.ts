/**
 * Bundle entry for scripts/parity_check.mjs — exposes the TS feature engine,
 * the JS models (both symbols + the NAS100 H4 variant), the symbol configs,
 * and predict() as a single ES module.
 */
export { buildFeatures, FEATURE_NAMES } from "../src/engine/features";
export { predict } from "../src/engine/predict";
export { GOLD_CONFIG, NAS100_CONFIG, NAS100_H4_CONFIG, XAUUSD_H4_CONFIG, getSymbolConfig } from "../src/engine/symbols";
export { score as scoreHvol } from "../src/engine/modelHvol.js";
export { score as scoreRange } from "../src/engine/modelRange.js";
export { score as scoreHvolNas100 } from "../src/engine/modelHvolNas100.js";
export { score as scoreRangeNas100 } from "../src/engine/modelRangeNas100.js";
export { score as scoreHvolNas100H4 } from "../src/engine/modelHvolNas100H4.js";
export { score as scoreRangeNas100H4 } from "../src/engine/modelRangeNas100H4.js";
export { score as scoreHvolGoldH4 } from "../src/engine/modelHvolGoldH4.js";
export { score as scoreRangeGoldH4 } from "../src/engine/modelRangeGoldH4.js";
