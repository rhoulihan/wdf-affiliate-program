// B8 move proof. server/config/systemConfigDefaults.js holds the app-owned
// SystemConfig seed entries that used to live inside
// server/models/SystemConfig.js's initializeDefaults(). Nothing may be dropped,
// renamed or mis-typed in the move, and every entry has to be one web-core's
// registerDefaults() actually accepts — it validates `category` and `dataType`
// against the schema enums at REGISTRATION time.
const appDefaults = require('../../server/config/systemConfigDefaults');
const SystemConfig = require('../../server/models/SystemConfig');
const { SystemConfig: coreSystemConfig } = require('@crhs/web-core');

// Derived in Task 41 Step 1 from the pre-move file: the defaults array spanned
// server/models/SystemConfig.js:167-423 and held 26 `key:` entries, of which 3
// (maintenance_mode, access_gate_enabled, system_timezone) were byte-identical
// duplicates of web-core's CORE_DEFAULTS and are therefore core-owned, not
// moved. 26 - 3 = 23 app-owned entries; the seeded key SET is unchanged at 26.
const APP_OWNED = 23;
const CORE_OWNED = 3;

describe('server/config/systemConfigDefaults', () => {
  it('exports the derived number of app-owned entries', () => {
    expect(Array.isArray(appDefaults)).toBe(true);
    expect(appDefaults).toHaveLength(APP_OWNED);
  });

  it('has no duplicate keys', () => {
    const keys = appDefaults.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every entry carries a non-empty string key, a category and a dataType', () => {
    for (const c of appDefaults) {
      expect(typeof c.key).toBe('string');
      expect(c.key.trim()).not.toBe('');
      expect(typeof c.category).toBe('string');
      expect(typeof c.dataType).toBe('string');
    }
  });

  // Not a hand-copied literal: the enums are read off the live schema, so this
  // stays honest if web-core ever widens or narrows them.
  it('every category and dataType is a value web-core\'s schema accepts', () => {
    const categories = coreSystemConfig.schema.path('category').enumValues;
    const dataTypes = coreSystemConfig.schema.path('dataType').enumValues;
    for (const c of appDefaults) {
      expect({ key: c.key, category: c.category }).toEqual({ key: c.key, category: expect.stringMatching(new RegExp(`^(${categories.join('|')})$`)) });
      expect(dataTypes).toContain(c.dataType);
    }
  });

  // Branding guard, scoped to a file that did not exist when the repo-wide
  // baseline was written. Step 1 measured `brand leaks = 0` in the source block;
  // this keeps it that way.
  it('no description or value leaks the bare franchisor mark', () => {
    // Assembled at runtime so this file does not itself trip
    // tests/unit/branding-guard.test.js.
    const mark = new RegExp(['Wave', 'MAX'].join(''), 'i');
    for (const c of appDefaults) {
      expect({ key: c.key, leak: mark.test(JSON.stringify(c)) })
        .toEqual({ key: c.key, leak: false });
    }
  });

  it('the values web-core accepts for registration are exactly these entries', () => {
    const registered = coreSystemConfig.getRegisteredDefaults();
    const appKeys = appDefaults.map((c) => c.key);
    const coreKeys = coreSystemConfig.CORE_DEFAULTS.map((c) => c.key);
    expect(registered.map((c) => c.key)).toEqual([...coreKeys, ...appKeys]);
  });
});

describe('initializeDefaults() seeds core + app entries', () => {
  it('seeds exactly core_count + app_count documents', async () => {
    await SystemConfig.deleteMany({});
    await SystemConfig.initializeDefaults();
    expect(await SystemConfig.countDocuments({})).toBe(CORE_OWNED + APP_OWNED);
  });

  it('getValue() returns the seeded value for every app-owned key', async () => {
    await SystemConfig.initializeDefaults();
    for (const c of appDefaults) {
      // eslint-disable-next-line no-await-in-loop
      const v = await SystemConfig.getValue(c.key, '__MISSING__');
      expect({ key: c.key, value: v }).toEqual({ key: c.key, value: c.value });
    }
  });

  it('getValue() still resolves the three keys web-core now owns', async () => {
    await SystemConfig.initializeDefaults();
    for (const c of coreSystemConfig.CORE_DEFAULTS) {
      // eslint-disable-next-line no-await-in-loop
      const v = await SystemConfig.getValue(c.key, '__MISSING__');
      expect({ key: c.key, value: v }).toEqual({ key: c.key, value: c.value });
    }
  });
});
