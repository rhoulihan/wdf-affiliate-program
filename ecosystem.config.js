module.exports = {
  apps: [{
    // live process keeps its 'wavemax' name via PM2_APP_NAME until re-created (Phase 4 ops)
    name: process.env.PM2_APP_NAME || 'laundromat',
    script: 'server.js',
    instances: 'max',
    exec_mode: 'cluster',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
