'use strict';
// Scoped replacement for the Next ESLint plugin's glob.sync API.
const { glob, globSync } = require('tinyglobby');
function options(o = {}) { return { ...o, expandDirectories: false, onlyFiles: o.onlyFiles ?? true }; }
const fg = (patterns, o) => glob(patterns, options(o));
fg.sync = (patterns, o) => globSync(patterns, options(o));
module.exports = fg;
