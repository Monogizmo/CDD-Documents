/** pdf.js optionally imports node "canvas"; the browser build does not need it */
module.exports = { webpack: (config) => { config.resolve.alias.canvas = false; return config } }
