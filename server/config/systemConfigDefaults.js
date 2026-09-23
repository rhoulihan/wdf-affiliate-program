// App-owned SystemConfig seed entries.
//
// These moved VERBATIM out of server/models/SystemConfig.js's
// initializeDefaults() (pre-move: the defaults array spanned :167-423 and held
// 26 `key:` entries). @crhs/web-core now owns the model and the generic keys;
// the app contributes these through SystemConfig.registerDefaults(), which
// validates `key`, `category` and `dataType` at REGISTRATION time so a typo
// surfaces on require rather than as a mongoose ValidationError at seed time.
//
// Three of the original 26 — maintenance_mode, access_gate_enabled and
// system_timezone — were byte-identical duplicates of web-core's CORE_DEFAULTS
// and are deliberately NOT repeated here: core seeds first and `$setOnInsert`
// makes the second upsert of a key a silent no-op, so a duplicate entry is dead
// weight that would mask a future core-side change to that key. The seeded key
// SET is unchanged at 26 (3 core-owned + 23 app-owned);
// tests/unit/noDuplicateModelRegistration.test.js keeps the two lists disjoint.
//
// Runtime business values belong here or in the SystemConfig collection, never
// hardcoded at a call site — read them with
// `await SystemConfig.getValue(key, default)`.

/** @type {Array<{key: string, value: *, defaultValue: *, description: string, category: string, dataType: string, isEditable?: boolean, isPublic?: boolean, validation?: Object}>} */
const APP_SYSTEM_CONFIG_DEFAULTS = [
  // Delivery — default fee for partners with no delivery fee of their own
  // (they use Laundromat Associates). Displays like any delivery fee but stays as
  // house revenue (not partner commission). See server/utils/deliveryFee.js.
  {
    key: 'default_delivery_fee',
    value: 10,
    defaultValue: 10,
    description: 'Default delivery fee (USD) for partners with no fee of their own (house Associates pickup/delivery)',
    category: 'affiliate',
    dataType: 'number',
    isEditable: true,
    validation: { min: 0, max: 1000 }
  },

  // Operator settings
  {
    key: 'max_operators_per_shift',
    value: 10,
    defaultValue: 10,
    description: 'Maximum number of operators allowed per shift',
    category: 'operator',
    dataType: 'number',
    validation: { min: 1, max: 50 }
  },
  {
    key: 'max_concurrent_orders_per_operator',
    value: 10,
    defaultValue: 10,
    description: 'Maximum number of concurrent orders an operator can handle',
    category: 'operator',
    dataType: 'number',
    validation: { min: 1, max: 20 }
  },

  // Processing settings
  {
    key: 'order_processing_timeout_minutes',
    value: 120,
    defaultValue: 120,
    description: 'Timeout for order processing in minutes',
    category: 'processing',
    dataType: 'number',
    validation: { min: 30, max: 480 }
  },
  {
    key: 'quality_check_required',
    value: true,
    defaultValue: true,
    description: 'Whether quality check is required for all orders',
    category: 'processing',
    dataType: 'boolean'
  },
  {
    key: 'auto_assign_orders',
    value: true,
    defaultValue: true,
    description: 'Automatically assign orders to available operators',
    category: 'processing',
    dataType: 'boolean'
  },

  // Notification settings
  {
    key: 'operator_assignment_notification',
    value: true,
    defaultValue: true,
    description: 'Send notification when order is assigned to operator',
    category: 'notification',
    dataType: 'boolean'
  },
  {
    key: 'processing_delay_threshold_minutes',
    value: 30,
    defaultValue: 30,
    description: 'Send alert if processing is delayed by this many minutes',
    category: 'notification',
    dataType: 'number',
    validation: { min: 15, max: 120 }
  },

  // Pricing settings
  {
    key: 'wdf_base_rate_per_pound',
    value: 1.40,
    defaultValue: 1.40,
    description: 'Base rate per pound for Wash Dry Fold service',
    category: 'payment',
    dataType: 'number',
    validation: { min: 0.50, max: 10.00 },
    isPublic: true
  },
  {
    key: 'delivery_minimum_fee',
    value: 10.00,
    defaultValue: 10.00,
    description: 'Minimum delivery fee',
    category: 'payment',
    dataType: 'number',
    validation: { min: 0.00, max: 100.00 },
    isPublic: true
  },
  {
    key: 'delivery_per_bag_fee',
    value: 2.00,
    defaultValue: 2.00,
    description: 'Delivery fee per bag',
    category: 'payment',
    dataType: 'number',
    validation: { min: 0.00, max: 50.00 },
    isPublic: true
  },

  // Affiliate onboarding (redesign spec §8)
  {
    key: 'invite_token_ttl_hours',
    value: 72,
    defaultValue: 72,
    description: 'Single-use affiliate invite link TTL in hours',
    category: 'affiliate',
    dataType: 'number',
    validation: { min: 1, max: 336 }
  },

  // Durable bags (redesign spec §8)
  {
    key: 'bag_mint_max_batch',
    value: 200,
    defaultValue: 200,
    description: 'Maximum bags per admin mint request (bounds label sheet and insertMany)',
    category: 'operations',
    dataType: 'number',
    validation: { min: 1, max: 500 }
  },
  {
    key: 'bag_token_bytes',
    value: 16,
    defaultValue: 16,
    description: 'Bag QR token entropy in bytes (16 bytes = 128 bits = 32 hex chars)',
    category: 'operations',
    dataType: 'number',
    validation: { min: 12, max: 32 }
  },
  {
    key: 'bag_label_columns',
    value: 3,
    defaultValue: 3,
    description: 'Columns on the printable bag label sheet',
    category: 'operations',
    dataType: 'number',
    validation: { min: 1, max: 6 }
  },
  {
    key: 'bag_label_qr_size_px',
    value: 300,
    defaultValue: 300,
    description: 'QR image size in pixels on bag labels',
    category: 'operations',
    dataType: 'number',
    validation: { min: 150, max: 600 }
  },

  // Store + role codes (redesign spec §8)
  {
    key: 'store_pickup_address',
    value: '825 E Rundberg Ln F1, Austin, TX 78753',
    defaultValue: '825 E Rundberg Ln F1, Austin, TX 78753',
    description: 'Store address shown in the come-to-store hold notice',
    category: 'system',
    dataType: 'string',
    isPublic: true
  },
  {
    key: 'delivery_code_max_attempts',
    value: 5,
    defaultValue: 5,
    description: 'Wrong customer-PIN / vendor-code tries before per-bag/IP lockout',
    category: 'system',
    dataType: 'number',
    validation: { min: 3, max: 10 }
  },
  {
    key: 'operator_scan_code_max_attempts',
    value: 5,
    defaultValue: 5,
    description: 'Wrong operator-code tries before lockout on the bag-URL operator path',
    category: 'operator',
    dataType: 'number',
    validation: { min: 3, max: 10 }
  },
  {
    key: 'operator_scan_code_length',
    value: 8,
    defaultValue: 8,
    description: 'Operator scan-code length (unambiguous alphanumeric)',
    category: 'operator',
    dataType: 'number',
    validation: { min: 6, max: 12 }
  },
  {
    key: 'order_reopen_window_minutes',
    value: 240,
    defaultValue: 240,
    description: 'Window after completion in which re-scanning a bag prompts to reopen vs. starting a fresh order',
    category: 'system',
    dataType: 'number',
    validation: { min: 0, max: 1440 }
  },
  {
    key: 'scan_session_ttl_minutes',
    value: 15,
    defaultValue: 15,
    description: 'Lifetime of a field scan-session token (authenticate once, batch-scan until it expires)',
    category: 'operator',
    dataType: 'number',
    validation: { min: 1, max: 120 }
  },
  {
    key: 'affiliate_delivery_code_length',
    value: 6,
    defaultValue: 6,
    description: 'Vendor (affiliate) delivery-code length',
    category: 'affiliate',
    dataType: 'number',
    validation: { min: 4, max: 10 }
  }
];

module.exports = APP_SYSTEM_CONFIG_DEFAULTS;
