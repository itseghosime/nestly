/**
 * Automated Playwright browser verification script for Nestly release UI completion.
 *
 * Verifies responsive behavior, accessibility, dialog management, and keyboard interaction:
 * 1. Mobile Nia Assistant: open, body scroll lock, multi-character typing exact value & focus stability,
 *    Tab/Shift+Tab focus containment, Escape dismissal, opener focus restoration.
 * 2. Responsive Viewport Transitions: Desktop -> Mobile -> Desktop while Nia remains open,
 *    verifying dynamic scroll-lock transitions and stable focus without resets.
 * 3. Mobile Search Filter Drawer (/browse at 390px): open, scroll lock, filter chip interaction
 *    (verifying drawer visibility, active focus retention, and continued scroll lock), Escape dismissal, opener focus restoration.
 * 4. Wide-Screen Viewports Layout Audit (1280px, 1440px, 1920px): verifies absence of horizontal page scroll.
 *
 * Security & Data Isolation:
 * - Restricted strictly to loopback/localhost.
 * - Intercepts all network traffic, providing synthetic responses for application endpoints
 *   (/api/nia/conversations, /api/nia/conversations/acknowledgements, /api/nia/conversations/messages, /api/properties, /api/neighborhoods).
 * - Blocks any external requests and any unmocked internal application calls (including unexpected mutations)
 *   to ensure zero calls affect linked or production data.
 * - Zero screenshots or recordings.
 *
 * Usage:
 *   node scripts/test-ui-release-browser.mjs [baseUrl]
 *   Default baseUrl: http://localhost:3000
 */

import { chromium } from 'playwright';
import {
  SYNTHETIC_CONVERSATION_SNAPSHOT, SYNTHETIC_ACKNOWLEDGEMENT_RESPONSE,
  SYNTHETIC_MESSAGE_RESPONSE, SYNTHETIC_PROPERTIES_RESPONSE, SYNTHETIC_NEIGHBORHOODS_RESPONSE,
} from './ui-release-fixtures.mjs';

const rawUrl = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000';
const parsedUrl = new URL(rawUrl);

// Requirement 2: Restrict strictly to loopback / localhost
if (!['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password
  || !['localhost', '127.0.0.1', '[::1]'].includes(parsedUrl.hostname)) {
  console.error(`[SECURITY ERROR] Target URL must be a loopback address (localhost / 127.0.0.1 / ::1). Received: ${parsedUrl.hostname}`);
  process.exit(1);
}

const BASE_URL = parsedUrl.origin;

// Fixtures are shared with contract regressions; no live data is required.

/**
 * Configure context route interceptor to provide synthetic data and block external/unmocked calls.
 */
async function setupContextRouting(context) {
  await context.route('**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());

    // 1. Block external network traffic completely
    if (url.origin !== BASE_URL) {
      console.warn(`[SECURITY] Blocked external request: ${req.method()} ${req.url()}`);
      return route.abort('blockedbyclient');
    }

    // 2. Synthetic Mocks for Application Endpoints
    if (url.pathname === '/api/nia/conversations/acknowledgements' && req.method() === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SYNTHETIC_ACKNOWLEDGEMENT_RESPONSE),
      });
    }

    if (url.pathname === '/api/nia/conversations/messages' && req.method() === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SYNTHETIC_MESSAGE_RESPONSE),
      });
    }

    if (url.pathname === '/api/nia/conversations' && req.method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SYNTHETIC_CONVERSATION_SNAPSHOT),
      });
    }

    if (url.pathname === '/api/properties' && req.method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SYNTHETIC_PROPERTIES_RESPONSE),
      });
    }

    if (url.pathname === '/api/neighborhoods' && req.method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SYNTHETIC_NEIGHBORHOODS_RESPONSE),
      });
    }

    // 3. Block unexpected internal API requests (especially mutations) to protect linked state
    if (url.pathname.startsWith('/api/')) {
      console.warn(`[SECURITY] Blocked unmocked internal API call: ${req.method()} ${url.pathname}`);
      return route.abort('blockedbyclient');
    }

    // Allow standard Next.js static assets and document routes
    return route.continue();
  });
}

async function runBrowserChecks() {
  console.log(`Starting Nestly UI release browser verification against loopback: ${BASE_URL}`);
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
  });
  let passedCount = 0;
  let totalCount = 0;

  function assert(condition, description) {
    totalCount++;
    if (condition) {
      console.log(`  ✓ [PASS] ${description}`);
      passedCount++;
    } else {
      console.error(`  ✗ [FAIL] ${description}`);
      throw new Error(`Assertion failed: ${description}`);
    }
  }

  try {
    // -------------------------------------------------------------
    // Scenario 1: Mobile Nia Assistant Lifecycle & Focus (390px Viewport)
    // -------------------------------------------------------------
    console.log('\nScenario 1: Mobile Nia Assistant Lifecycle & Focus (390x844)');
    const mobileCtx = await browser.newContext({ serviceWorkers: 'block',
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await setupContextRouting(mobileCtx);
    const mobilePage = await mobileCtx.newPage();

    await mobilePage.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    // Verify initial body overflow is unlocked
    const initialOverflow = await mobilePage.evaluate(() => document.body.style.overflow);
    assert(initialOverflow === '' || initialOverflow === 'visible', 'Body scroll is unlocked before opening Nia');

    // Click the floating launcher button to open Nia
    const launcher = mobilePage.getByRole('button', { name: /Open Nia Property Assistant/i });
    await launcher.waitFor({ state: 'visible', timeout: 5000 });
    await launcher.click();

    const niaDialog = mobilePage.locator('[role="dialog"][aria-label="Nia Property Assistant"]');
    await niaDialog.waitFor({ state: 'visible', timeout: 5000 });

    await mobilePage.getByText('Synthetic local conversation ready.', { exact: true }).waitFor({ state: 'visible' });

    // Verify body scroll lock is acquired on mobile
    const lockedOverflow = await mobilePage.evaluate(() => document.body.style.overflow);
    assert(lockedOverflow === 'hidden', 'Body scroll is locked (overflow: hidden) when Nia opens on mobile');

    // Focus input and type multiple characters
    const chatInput = mobilePage.locator('input[placeholder*="Ask Nia"]');
    await chatInput.waitFor({ state: 'visible', timeout: 5000 });
    await chatInput.focus();
    const typedText = 'Looking for 2 bed in Ikoyi';
    await chatInput.pressSequentially(typedText);

    // Requirement 4: Assert complete typed value and focused element
    const actualInputValue = await chatInput.inputValue();
    assert(actualInputValue === typedText, `Complete typed Nia input value confirmed: "${actualInputValue}"`);

    const isInputActiveElement = await chatInput.evaluate((el) => document.activeElement === el);
    assert(isInputActiveElement, 'Active element is verified to be the chat input');

    // Test Tab / Shift+Tab keyboard containment within dialog
    await mobilePage.keyboard.press('Tab');
    const isFocusWithinDialog = await mobilePage.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"][aria-label="Nia Property Assistant"]');
      return dialog ? dialog.contains(document.activeElement) : false;
    });
    assert(isFocusWithinDialog, 'Forward Tab keeps keyboard focus contained within active Nia dialog');

    await mobilePage.keyboard.press('Shift+Tab');
    const isFocusStillWithin = await mobilePage.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"][aria-label="Nia Property Assistant"]');
      return dialog ? dialog.contains(document.activeElement) : false;
    });
    assert(isFocusStillWithin, 'Backward Shift+Tab keeps keyboard focus contained within active Nia dialog');

    // Test Escape key dismissal
    await mobilePage.keyboard.press('Escape');
    await niaDialog.waitFor({ state: 'hidden', timeout: 5000 });

    // Verify body scroll is unlocked upon close
    const restoredOverflow = await mobilePage.evaluate(() => document.body.style.overflow);
    assert(restoredOverflow === '' || restoredOverflow === 'visible', 'Body scroll lock is released when Nia closes');

    // Verify focus restoration to launcher button (scheduled via requestAnimationFrame)
    await mobilePage.waitForFunction(
      () => document.activeElement?.getAttribute('aria-label') === 'Open Nia Property Assistant',
      null,
      { timeout: 3000 }
    );
    const isLauncherFocused = await launcher.evaluate((el) => document.activeElement === el);
    assert(isLauncherFocused, 'Keyboard focus is restored to launcher button after Escape dismissal');

    await mobileCtx.close();

    // -------------------------------------------------------------
    // Scenario 2: Responsive Viewport Transitions (Desktop -> Mobile -> Desktop)
    // -------------------------------------------------------------
    console.log('\nScenario 2: Responsive Viewport Transitions (Desktop -> Mobile -> Desktop) While Nia Is Open');
    const responsiveCtx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 800 } });
    await setupContextRouting(responsiveCtx);
    const responsivePage = await responsiveCtx.newPage();
    await responsivePage.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    // Open Nia on desktop
    const desktopLauncher = responsivePage.getByRole('button', { name: /Open Nia Property Assistant/i });
    await desktopLauncher.waitFor({ state: 'visible', timeout: 5000 });
    await desktopLauncher.click();

    const responsiveDialog = responsivePage.locator('[role="dialog"][aria-label="Nia Property Assistant"]');
    await responsiveDialog.waitFor({ state: 'visible', timeout: 5000 });

    await responsivePage.getByText('Synthetic local conversation ready.', { exact: true }).waitFor({ state: 'visible' });

    // On desktop, lockScroll is false -> body overflow is NOT locked
    const desktopOverflowInitial = await responsivePage.evaluate(() => document.body.style.overflow);
    assert(desktopOverflowInitial === '' || desktopOverflowInitial === 'visible', 'Desktop initial (1280px): body scroll is unlocked while Nia is open');

    // Type text into input
    const responsiveInput = responsivePage.locator('input[placeholder*="Ask Nia"]');
    await responsiveInput.waitFor({ state: 'visible', timeout: 5000 });
    await responsiveInput.focus();
    const responsiveQuery = 'Checking rent in Victoria Island';
    await responsiveInput.pressSequentially(responsiveQuery);

    const desktopVal = await responsiveInput.inputValue();
    assert(desktopVal === responsiveQuery, 'Typed input value confirmed on desktop');

    // Transition Desktop -> Mobile (390px) while Nia remains open
    await responsivePage.setViewportSize({ width: 390, height: 844 });
    await responsivePage.waitForTimeout(100);

    // Confirm scroll-lock transitions to locked
    const transitionedMobileOverflow = await responsivePage.evaluate(() => document.body.style.overflow);
    assert(transitionedMobileOverflow === 'hidden', 'Scroll lock acquired (overflow: hidden) when resizing to mobile (390px) while Nia remains open');

    // Confirm stable focus and preserved value
    const mobileVal = await responsiveInput.inputValue();
    assert(mobileVal === responsiveQuery, 'Typed input value remains intact across desktop -> mobile resize');

    const focusInsideOnMobile = await responsivePage.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"][aria-label="Nia Property Assistant"]');
      return dialog ? dialog.contains(document.activeElement) : false;
    });
    assert(focusInsideOnMobile, 'Keyboard focus remains stably inside Nia dialog without being stolen during mobile resize');

    // Transition Mobile -> Desktop (1280px) while Nia remains open
    await responsivePage.setViewportSize({ width: 1280, height: 800 });
    await responsivePage.waitForTimeout(100);

    // Confirm scroll-lock releases
    const transitionedDesktopOverflow = await responsivePage.evaluate(() => document.body.style.overflow);
    assert(transitionedDesktopOverflow === '' || transitionedDesktopOverflow === 'visible', 'Scroll lock released (overflow: "") when resizing back to desktop (1280px) while Nia remains open');

    // Confirm stable focus and preserved value
    const finalDesktopVal = await responsiveInput.inputValue();
    assert(finalDesktopVal === responsiveQuery, 'Typed input value remains intact across mobile -> desktop resize');

    await responsivePage.keyboard.press('Escape');
    await responsiveDialog.waitFor({ state: 'hidden', timeout: 5000 });
    await responsiveCtx.close();

    // -------------------------------------------------------------
    // Scenario 3: Mobile Search Filter Drawer Lifecycle (/browse at 390px)
    // -------------------------------------------------------------
    console.log('\nScenario 3: Mobile Search Filter Drawer Lifecycle (/browse at 390px)');
    const browseCtx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
    await setupContextRouting(browseCtx);
    const browsePage = await browseCtx.newPage();
    await browsePage.goto(`${BASE_URL}/browse`, { waitUntil: 'domcontentloaded' });

    // Open filter drawer
    const filterButton = browsePage.getByRole('button', { name: 'Filters', exact: true });
    await filterButton.waitFor({ state: 'visible', timeout: 5000 });
    await filterButton.click();

    const filterDialog = browsePage.locator('[role="dialog"][aria-label="Filter Homes"]');
    await filterDialog.waitFor({ state: 'visible', timeout: 5000 });

    const filterLocked = await browsePage.evaluate(() => document.body.style.overflow);
    assert(filterLocked === 'hidden', 'Filter drawer locks body scroll (overflow: hidden) on open');

    // Requirement 3: Required assertions on filter chip interaction
    const apartmentChip = browsePage.getByRole('button', { name: 'Apartment', exact: true });
    await apartmentChip.waitFor({ state: 'visible', timeout: 5000 });
    await apartmentChip.click();

    // Verify drawer remains open after chip click
    const isDrawerVisibleAfterClick = await filterDialog.isVisible();
    assert(isDrawerVisibleAfterClick, 'Filter drawer remains visible after filter chip click');

    // Verify focus stays on the intended control
    const isChipFocused = await apartmentChip.evaluate((el) => document.activeElement === el);
    assert(isChipFocused, 'Focus remains on apartment filter chip after selection without resetting');

    // Verify body scrolling remains locked
    const lockedAfterChip = await browsePage.evaluate(() => document.body.style.overflow);
    assert(lockedAfterChip === 'hidden', 'Body scroll remains locked after filter chip interaction');

    // Close filter drawer via Escape
    await browsePage.keyboard.press('Escape');
    await filterDialog.waitFor({ state: 'hidden', timeout: 5000 });

    const filterRestored = await browsePage.evaluate(() => document.body.style.overflow);
    assert(filterRestored === '' || filterRestored === 'visible', 'Filter drawer restores body scroll on Escape dismissal');

    // Verify opener focus restoration
    await browsePage.waitForFunction(
      (btn) => document.activeElement === btn,
      await filterButton.elementHandle(),
      { timeout: 3000 }
    );
    const isOpenerFocused = await filterButton.evaluate((el) => document.activeElement === el);
    assert(isOpenerFocused, 'Opener filters button receives focus after drawer dismiss');

    await browseCtx.close();

    // -------------------------------------------------------------
    // Scenario 4: Wide-Screen Viewports Layout Audit (1280px, 1440px, 1920px)
    // -------------------------------------------------------------
    console.log('\nScenario 4: Wide-Screen Container Layouts & Horizontal Scroll Audit');
    const wideWidths = [1280, 1440, 1920];
    const testRoutes = ['/', '/browse', '/how-it-works'];

    for (const width of wideWidths) {
      const desktopCtx = await browser.newContext({ serviceWorkers: 'block', viewport: { width, height: 900 } });
      await setupContextRouting(desktopCtx);
      const desktopPage = await desktopCtx.newPage();

      for (const route of testRoutes) {
        await desktopPage.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });

        const hasHorizontalScroll = await desktopPage.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });

        assert(!hasHorizontalScroll, `No horizontal scrollbar on ${route} at ${width}px viewport`);
      }
      await desktopCtx.close();
    }

    console.log(`\n========================================`);
    console.log(`All ${passedCount}/${totalCount} browser checks PASSED successfully!`);
    console.log(`========================================\n`);
  } finally {
    await browser.close();
  }
}

runBrowserChecks().catch((err) => {
  console.error('Browser check failed:', err);
  process.exit(1);
});

