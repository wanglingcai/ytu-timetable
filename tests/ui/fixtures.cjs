const base = require('@playwright/test');

// Existing feature tests start after onboarding; onboarding.spec tests the actual first-run flow.
const test = base.test.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('ytu-onboarding-v1'))
        localStorage.setItem('ytu-onboarding-v1', JSON.stringify({ initialized: true, welcomeSeen: true, realGuideDone: true }));
    });
    await use(page);
  }
});
module.exports = { test, expect: base.expect };
