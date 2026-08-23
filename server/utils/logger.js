const winston = require('winston');
const path = require('path');

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

// Define log directory
const logDir = process.env.LOG_DIR || path.join(__dirname, '../../logs');

// File-rotation bounds. Winston's built-in File transport rotates in place
// once `maxsize` bytes are reached (combined.log -> combined1.log -> ...),
// keeping at most `maxFiles` generations and pruning the rest, so logs can
// never grow without limit. `tailable: true` keeps the newest data in the
// base filename. Overridable via env; defaults cap each stream at
// maxFiles * maxsize (20 MB * 14 ≈ 280 MB).
const LOG_MAX_SIZE = (parseInt(process.env.LOG_MAX_SIZE_MB, 10) || 20) * 1024 * 1024;
const LOG_MAX_FILES = parseInt(process.env.LOG_MAX_FILES, 10) || 14;
const rotation = { maxsize: LOG_MAX_SIZE, maxFiles: LOG_MAX_FILES, tailable: true };

// Create logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'crhs-portal' },
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      ...rotation
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      ...rotation
    })
  ]
});

// Add console transport for non-production environments
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

module.exports = logger;