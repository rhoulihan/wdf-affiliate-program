// System Configuration Routes for Laundromat Affiliate Program

const express = require('express');
const router = express.Router();
const SystemConfig = require('../models/SystemConfig');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { checkRole, checkAdminPermission } = require('../middleware/rbac');

// Get all public configurations (no authentication required)
router.get('/public', async (req, res) => {
  try {
    const configs = await SystemConfig.getPublicConfigs();
    const formattedConfigs = configs.map(config => ({
      key: config.key,
      currentValue: config.value,
      defaultValue: config.defaultValue,
      description: config.description,
      category: config.category,
      isPublic: config.isPublic
    }));
    res.json(formattedConfigs);
  } catch (error) {
    logger.error('Error fetching public configs:', error);
    res.status(500).json({ error: 'Failed to fetch public configurations' });
  }
});

// Get specific public configuration by key (no authentication required)
router.get('/public/:key', async (req, res) => {
  try {
    const config = await SystemConfig.findOne({
      key: req.params.key,
      isPublic: true
    });

    if (!config) {
      return res.status(404).json({ error: 'Configuration not found' });
    }

    res.json({
      key: config.key,
      currentValue: config.value,
      defaultValue: config.defaultValue,
      description: config.description,
      category: config.category,
      isPublic: config.isPublic
    });
  } catch (error) {
    logger.error('Error fetching config:', error);
    res.status(500).json({ error: 'Failed to fetch configuration' });
  }
});

// Admin routes below this point require authentication
router.use(authenticate);
router.use(checkRole(['administrator']));

// Get all configurations (admin only)
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    let configs;

    if (category) {
      configs = await SystemConfig.getByCategory(category);
    } else {
      configs = await SystemConfig.find().sort('category key');
    }

    res.json(configs);
  } catch (error) {
    logger.error('Error fetching configs:', error);
    res.status(500).json({ error: 'Failed to fetch configurations' });
  }
});

// Update configuration value (admin only with system_config permission)
router.put('/:key', checkAdminPermission('system_config'), async (req, res) => {
  try {
    const { value } = req.body;
    const adminId = req.user.id;

    const config = await SystemConfig.setValue(req.params.key, value, adminId);
    res.json({
      success: true,
      config: {
        key: config.key,
        value: config.value,
        updatedBy: config.updatedBy,
        updatedAt: config.updatedAt
      }
    });
  } catch (error) {
    logger.error('Error updating config:', error);
    res.status(400).json({ error: error.message });
  }
});

// Initialize default configurations (admin only)
router.post('/initialize', async (req, res) => {
  try {
    await SystemConfig.initializeDefaults();
    res.json({ message: 'Default configurations initialized' });
  } catch (error) {
    logger.error('Error initializing configs:', error);
    res.status(500).json({ error: 'Failed to initialize configurations' });
  }
});

module.exports = router;