// CSRF enforcement for the portal. web-core supplies the double-submit-cookie
// primitive (secret chain, __Host-x-csrf cookie, accepted header list); the
// route policy is ours and lives in ./csrfTables.js, so adding a route no
// longer needs a @crhs/web-core release (spec §7.2.8 / D20, PR B4c).
//
// The returned object is a superset of the previous re-export shape, so
// server.js:20's `const { conditionalCsrf, csrfTokenEndpoint } = require(...)`
// and its mounts at server.js:665 / :668 are unchanged.
const { createCsrf } = require('@crhs/web-core').csrf;

module.exports = createCsrf({ tables: require('./csrfTables') });
