const express = require('express');
const router = express.Router();

/**
 * Expose the browser-restricted Google Maps API key to any page that
 * embeds a map/locations widget. The key is HTTP-referer locked (e.g.
 * to rundberglaundry.com), so it is safe to surface from the server;
 * static pages fetch it from this endpoint at runtime rather than
 * hardcoding it.
 */
router.get('/maps-config', (req, res) => {
  res.json({
    apiKey: process.env.GOOGLE_PLACES_API_KEY || '',
    placeId: process.env.LOCATION_PLACE_ID || ''
  });
});

module.exports = router;
