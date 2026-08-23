'use strict';
// Public, unauthenticated brand endpoint. GET only, so CSRF is skipped
// automatically (csrf-config.js). Exposes ONLY display-safe fields.
const express = require('express');
const brand = require('../config/brand');

const router = express.Router();

router.get('/brand', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ displayName: brand.displayName, shortName: brand.shortName });
});

module.exports = router;
