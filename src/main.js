import { createMap } from './map.js';

const map = createMap('map');

// Exposed only for local debugging in the browser console.
if (import.meta.env.DEV) window.__map = map;
