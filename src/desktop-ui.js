/**
 * The computers on the desk. Everything lives in src/pc/ now; this file
 * stays so older imports keep working.
 */
export { initDesktop, bootDesktop, onPcChange, pcState, pcSnapshot, pcWallpaper } from './pc/os.js';