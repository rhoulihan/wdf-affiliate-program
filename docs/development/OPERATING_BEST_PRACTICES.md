# WaveMAX Development Operating Best Practices

This document contains important operational knowledge and workarounds discovered during development sessions.

## PM2 and Logging

### ❌ Known Issues
1. **PM2 logs command timeout**: The command `pm2 logs wavemax --lines 50` frequently times out
   - **Issue**: Command hangs and requires user interruption
   - **Discovered**: 2025-01-06
   - **Note**: This command is problematic and will timeout - avoid using it

### ✅ Alternative Approaches
1. **For viewing recent logs**:
   ```bash
   # Option 1: Check PM2 log files directly
   tail -n 50 /root/.pm2/logs/wavemax-error.log
   tail -n 50 /root/.pm2/logs/wavemax-out.log
   
   # Option 2: Use PM2 logs without line limit
   pm2 logs wavemax --nostream
   
   # Option 3: Check specific error instance
   pm2 describe wavemax
   ```

2. **For debugging startup issues**:
   ```bash
   # Check if app is running
   pm2 status
   
   # Get detailed info about the app
   pm2 describe wavemax
   
   # Start in no-daemon mode to see real-time output
   pm2 start server.js --no-daemon
   ```

## JavaScript and CSP Best Practices

### ❌ Never Use Inline Scripts
1. **Issue**: Inline `<script>` tags are blocked by Content Security Policy (CSP) when pages are embedded in iframes
   - **Discovered**: 2025-01-06 - Revenue calculator failed in embedded context
   - **Symptoms**: JavaScript functionality works in direct access but fails when embedded

### ✅ Always Use External JavaScript Files
1. **For all client-side JavaScript**:
   ```html
   <!-- Good -->
   <script src="/assets/js/feature.js"></script>
   
   <!-- Bad -->
   <script>
     // Inline code will be blocked by CSP
   </script>
   ```

2. **Benefits**:
   - CSP compliant for iframe embedding
   - Better caching and performance
   - Easier debugging and maintenance
   - Consistent with security best practices

### Dynamic Page Loading in embed-app-v2.html
1. **Issue**: Scripts in dynamically loaded pages are stripped out
   - The embed-app-v2.html router removes script tags when loading page content
   - Scripts must be registered in the `pageScripts` mapping
   - Standard DOMContentLoaded events may not fire for dynamically loaded content
   
2. **Solution**: Add page-specific scripts to embed-app-v2.html
   ```javascript
   const pageScripts = {
       '/': ['/assets/js/revenue-calculator.js'],
       '/landing': ['/assets/js/revenue-calculator.js'],
       // ... other routes
   };
   ```

3. **Critical Script Loading Order**:
   - **Issue**: Scripts included in embedded HTML pages are NOT automatically loaded
   - **Discovered**: 2025-01-09 - SwirlSpinner class not available in affiliate registration
   - **Discovered**: 2025-06-10 - FormValidation not available in affiliate registration
   - **Symptom**: JavaScript classes/functions undefined even though script tags exist in HTML
   - **Root Cause**: The script was only included in the direct HTML file (affiliate-register-embed.html) but not in the pageScripts configuration in embed-app-v2.html, which is what loads scripts when pages are loaded dynamically in the embedded iframe
   - **Solution**: Scripts must be added to BOTH locations:
     1. In the HTML file's script tags (for direct access)
     2. In embed-app-v2.html's `pageScripts` mapping (for embedded access)
   - **Example**:
     ```javascript
     // In embed-app-v2.html
     const pageScripts = {
         '/affiliate-register': [
             '/assets/js/i18n.js',
             '/assets/js/language-switcher.js', 
             '/assets/js/modal-utils.js',
             '/assets/js/errorHandler.js',
             '/assets/js/csrf-utils.js',
             '/assets/js/swirl-spinner.js',  // Must be listed before scripts that use it
             '/assets/js/form-validation.js', // Added 2025-06-10 for field validation
             '/assets/js/affiliate-register-init.js'
         ],
     };
     ```
   - **Best Practice**: When adding new JavaScript libraries or utilities:
     1. Add script tag to the HTML file
     2. Add to pageScripts in embed-app-v2.html in correct loading order
     3. Test in both direct access AND embedded contexts
     4. Verify the script is available via console debugging (e.g., check `window.FormValidation`)

3. **Script Initialization Best Practices for Dynamic Content**:
   - **Use multiple initialization strategies**:
     ```javascript
     // 1. Check if DOM is already loaded
     if (document.readyState === 'complete' || document.readyState === 'interactive') {
         setTimeout(initFunction, 100); // Delay for rendering
     }
     
     // 2. Standard DOMContentLoaded
     document.addEventListener('DOMContentLoaded', initFunction);
     
     // 3. Periodic checking for dynamic content
     const interval = setInterval(() => {
         if (document.getElementById('target-element')) {
             initFunction();
             clearInterval(interval);
         }
     }, 500);
     ```
   
   - **Prevent duplicate initialization**:
     ```javascript
     element.setAttribute('data-initialized', 'true');
     ```
   
   - **Add comprehensive logging** for debugging initialization flow
   
4. **Key Learning**: When content is loaded dynamically via fetch() and innerHTML, scripts need special handling to ensure DOM elements exist before initialization

## Common Debugging Patterns

### Application Won't Start (502 Bad Gateway)
1. Check PM2 status: `pm2 status`
2. If status shows "errored", check logs directly: 
   - `tail -n 100 /root/.pm2/logs/wavemax-error-*.log`
   - Note: Log file numbers increase with restarts (e.g., wavemax-error-7.log)
3. **Best approach**: Start manually to see error: 
   ```bash
   pm2 stop wavemax
   node server.js
   ```
4. Common causes:
   - Syntax errors in recently modified files
   - Missing required environment variables
   - Port already in use
   - MongoDB connection issues
   - **Incorrect middleware imports** (e.g., using `verifyRole` instead of `checkRole` from rbac.js)

### CSRF Token Issues
- Multiple CSRF validation failures in logs are often from bots/scanners
- Can be safely ignored unless affecting legitimate functionality

## Testing Best Practices

### Running Tests
1. **Timeout issues**: The `npm test` command requires extended timeout
   - **Issue**: Default Bash tool timeout (2 minutes) is insufficient for full test suite
   - **Solution**: Use 20-minute timeout when running tests
   - **Command**: When running via Bash tool, specify timeout: 1200000 (20 minutes)
   - **Discovered**: 2025-01-07
2. **Memory issues**: Use `npm run test:memory` instead of `npm test` for large test suites
3. **Individual test files**: `npm test -- path/to/test.js`
4. **Watch for hanging tests**: Use `--detectOpenHandles` flag

### Automated Coverage Testing and Reporting
When the command "run coverage test" is issued, the system performs the following automated workflow:

1. **Run Full Test Suite with Coverage**:
   - Sets bash timeout to 20 minutes (1200000ms)
   - Executes: `npm run test:coverage 2>&1 | tee test-coverage-results.txt`
   - Captures all output including coverage data

2. **Parse Test Results**:
   - Extracts test statistics (passed, failed, skipped)
   - Identifies failing test suites and specific test cases
   - Captures coverage percentages for each category

3. **Update HTML Documentation**:
   - Updates `/public/coverage-analysis/test-results-summary.html` with:
     - Current test pass/fail statistics
     - Coverage percentages by category
     - List of failing tests with details
     - Timestamp of test run
   - Maintains historical data for trend analysis

4. **Benefits**:
   - Single command for complete coverage analysis
   - Automated documentation updates
   - Historical tracking of test coverage improvements
   - No manual parsing of test output required

5. **Implementation Details**:
   - **Discovered**: 2025-01-06
   - **Purpose**: Streamline the test coverage improvement workflow
   - **Output Files**:
     - `test-coverage-results.txt`: Raw test output
     - `/public/coverage-analysis/test-results-summary.html`: Updated HTML report

## ESLint Policy

Two commands, two different rules:

- `npm run lint:server` — **`server/` and `server.js` must be ZERO errors.** Guarded in-suite by
  `tests/unit/eslintServerClean.test.js`. A new server-side error fails `npm test`.
- `npm run lint:baseline` — everything else (`public/`, `tests/`, `docs/`, `scripts/`, `tools/`) is an
  **accepted baseline** recorded in `.eslint-baseline.json`, guarded by
  `tests/unit/eslintRepoBaseline.test.js`. The count **may go down, never up**.

Lowering the baseline is always welcome: re-measure with
`node scripts/ops/lint-baseline.js --write` and commit the new, lower number together with the change
that lowered it. Never raise it to make a commit pass — fix the new error instead.

## Git Workflow

### Before Major Changes
1. Always check `git status` first
2. Review uncommitted changes to determine if they should be:
   - Committed as part of current work
   - Stashed for later
   - Discarded if experimental

## Session Management

### Session Startup Requirements
1. **Always review init.prompt** which includes:
   - AI Assistant Persona and expertise areas
   - Project context and problem-solving processes
   - **Critical: Architecture & Implementation Guide (Section 10)**
   - Session startup and completion checklists
2. **Review OPERATING_BEST_PRACTICES.md** for known issues and workarounds
3. **Check git status** for uncommitted changes
4. **Review recent project logs** for in-progress tasks

### Project Logs
- Always update status in project logs when switching between tasks
- Use clear status indicators: IN PROGRESS, TESTING, COMPLETED, BLOCKED

### Backlog Management
- Add discovered issues to BACKLOG.md immediately
- Include context about when/how the issue was discovered

## System Configuration and Dynamic Values

### Best Practices
1. **Never hardcode values that might change**:
   - Pricing (WDF rates, delivery fees)
   - Business rules (commission percentages)
   - System limits (max operators, timeouts)

2. **Use SystemConfig model for dynamic values**:
   ```javascript
   // Good - fetches from database
   const wdfRate = await SystemConfig.getValue('wdf_base_rate_per_pound', 1.25);
   
   // Bad - hardcoded value
   const wdfRate = 1.25;
   ```

3. **Initialize SystemConfig on server startup**:
   ```javascript
   await SystemConfig.initializeDefaults();
   ```

### Testing with SystemConfig
1. **Initialize in test setup**:
   ```javascript
   beforeEach(async () => {
     await SystemConfig.deleteMany({});
     await SystemConfig.initializeDefaults();
   });
   ```

2. **Handle floating-point precision in tests**:
   ```javascript
   // Use toBeCloseTo for calculated values
   expect(commission).toBeCloseTo(expectedValue, 2);
   
   // Or accept the actual calculated value
   expect(totalCommission).toBe(281.30); // Instead of 281.25
   ```

### API Response Consistency
1. **Transform Mongoose documents for API responses**:
   ```javascript
   // Transform to consistent format
   res.json({
     key: config.key,
     currentValue: config.value,
     defaultValue: config.defaultValue,
     // ... other fields
   });
   ```

## Environment-Specific Notes

### Production Deployment
- Always run `pm2 restart wavemax` after code changes
- Use `pm2 restart wavemax --update-env` if environment variables changed

### Development vs Production
- Check NODE_ENV setting when debugging environment-specific issues
- Some features (like documentation) may be environment-gated

## Internationalization (i18n) Best Practices

### Critical Rule: Avoid Nested Elements with IDs inside i18n Elements
1. **Issue**: Elements with `data-i18n` attributes replace their entire content during translation
   - **Discovered**: 2025-01-07 - Affiliate names not loading on landing page
   - **Symptom**: JavaScript cannot find elements with IDs that were nested inside i18n elements
   
2. **Solution**: Keep dynamic content elements separate from translated text
   ```html
   <!-- Bad - ID will be lost -->
   <p data-i18n="greeting">Hello <span id="userName">Guest</span></p>
   
   <!-- Good - ID preserved -->
   <p>Hello <span id="userName">Guest</span></p>
   ```

3. **For detailed i18n guidelines**: See [`../guides/i18n-best-practices.md`](../guides/i18n-best-practices.md)

## Legal and Branding Guidelines

### Copyright Notices
- **Always use**: `© [YEAR] CRHS Enterprises, LLC` in all copyright labels
- **Never use**: `© WaveMAX` or other variations
- **Example**: `© 2025 CRHS Enterprises, LLC. All rights reserved.`
- This applies to:
  - Footer copyright notices
  - Email templates
  - Documentation
  - Terms of service
  - Any legal notices

### Company Information
- **Legal Entity**: CRHS Enterprises, LLC
- **DBA**: WaveMAX Laundry
- **Standard Footer Format**: `© [YEAR] CRHS Enterprises, LLC. All rights reserved.`

## Internationalization (i18n) Guidelines

### Translation Requirements
- **Always maintain translations**: When updating or adding HTML content, ensure translations are updated for:
  - English (en) - Base language
  - Spanish (es)
  - Portuguese (pt)
  - German (de)
- **Email templates**: Create language-specific versions in `/server/templates/emails/[language]/`
- **Language preference**: Stored in Affiliate and Customer models, captured during registration from browser language

### Best Practices for Translations
1. **Always translate ALL user-facing content**:
   - UI labels and buttons
   - Error messages and notifications
   - Form placeholders and help text
   - Dynamic messages (spinners, loading states)
   - Email content
   
2. **Translation workflow**:
   - When adding new text, immediately add translations for all 4 languages
   - Use translation keys that clearly describe the content (e.g., `spinner.validatingAddress`)
   - Test the interface in all languages to ensure proper display
   
3. **Dynamic content translations**:
   - For JavaScript-generated content, use i18next: `window.i18next.t('key')`
   - For content with variables, use interpolation: `t('key', { variable: value })`
   - Example: `t('spinner.connectingWith', { provider: 'Google' })`
   
4. **Quality checks**:
   - Verify text doesn't overflow UI elements in different languages
   - Ensure proper character encoding for special characters
   - Test right-to-left languages if added in the future

---

*Last Updated: 2025-01-09*