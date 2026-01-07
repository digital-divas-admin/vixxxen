// ===========================================
// MAIN.JS - Module Load Order Reference
// ===========================================
//
// This file documents the load order for JS modules.
// Scripts are loaded via <script> tags in index.html in this order:
//
// 1. External dependencies (loaded in <head>):
//    - Supabase client
//    - Socket.io
//    - Cropper.js
//    - Chart.js
//
// 2. Application modules (loaded before </body>):
//    - js/config.js        (Core config, must be first)
//    - js/zoom-controls.js (Standalone zoom functionality)
//    - js/content-mode.js  (NSFW/safe mode toggle)
//    - js/reporting.js     (Content reporting system)
//    - [inline script]     (Remaining application code)
//
// As more modules are extracted, they will be added here.
// The inline script in index.html will shrink over time.
