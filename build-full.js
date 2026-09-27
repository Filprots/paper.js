#!/usr/bin/env node
/*
 * Builds dist/paper-full.js the way `gulp build:full` does (gulp/tasks/build.js), without gulp:
 * gulp 3 does not run on Node >= 12. Same steps, same libraries, same options:
 *   prepro     src/paper.js, with src/constants.js evaluated first and __options = src/options.js
 *              + the git date and branch (gulp/utils/options.js) + { paperScript: true }
 *   uncomment  { mergeEmptyLines: true }
 *   whitespace { spacesToTabs: 4, removeTrailing: true }  (gulp-whitespace, inlined below)
 *
 * IRRIS: the planner (irrippr) ships this file as ppr/_ppr.js, copied there by hand.
 *   node build-full.js   (after `node .yarn/releases/yarn-3.2.4.cjs install` with YARN_ENABLE_SCRIPTS=false)
 */

var fs = require('fs'),
    path = require('path'),
    Prepro = require('prepro'),
    uncomment = require('uncomment');

process.chdir(__dirname);
var options = require('./gulp/utils/options.js');

var prepro = new Prepro();
prepro.evaluate('src/constants.js');
prepro.setup(function() {
    return {
        __options: Object.assign({}, options, { paperScript: true })
    };
});

var out = prepro.process(path.resolve('src/paper.js'));
out = uncomment(out, { mergeEmptyLines: true });
// gulp-whitespace { spacesToTabs: 4, removeTrailing: true }
out = out.replace(/^((?: {4})+)/gm, function(all, spaces) {
    return new Array(spaces.length / 4 + 1).join('\t');
});
out = out.replace(/[ \t]+$/gm, '');

fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/paper-full.js', out);
console.log('dist/paper-full.js: Paper.js v' + options.version + ' (' + options.date + '), ' + out.length + ' bytes');
