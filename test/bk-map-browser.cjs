// Disposable preview only: scripts/bk-preview.js and frontend on port 3100.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto('http://127.0.0.1:3100/booking-admin/login');
    await page.getByLabel('อีเมล', { exact: true }).fill('preview@example.test');
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill('Preview-only-593!');
    await page.getByRole('button', { name: 'เข้าสู่ระบบ →' }).click();
    await page.waitForURL('**/booking-admin/events');
    const customer = await page.evaluate(async () => {
      const auth = await fetch('/bk-api/auth/me').then((r) => r.json());
      const response = await fetch('/bk-api/customers', { method: 'POST', headers: {
        'Content-Type': 'application/json', 'X-Bk-Csrf': auth.csrf,
      }, body: JSON.stringify({ display_name: 'Map Guest', phone: '0812345678', x_account: '@mapguest' }) });
      if (!response.ok) throw Error('Customer fixture failed');
      return response.json();
    });
    await page.getByRole('link', { name: /Garden Sessions/ }).click();
    await page.getByRole('radio', { name: 'จองฟรี ไม่ต้องชำระเงิน', exact: true }).check();
    await page.getByRole('button', { name: 'บันทึก Event', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'บันทึกข้อมูลแล้ว' }).waitFor();
    await page.getByRole('tab', { name: 'ผังโต๊ะและราคา' }).click();
    await page.getByRole('button', { name: 'table: B01', exact: true }).click();
    await page.getByRole('button', { name: 'สีม่วง', exact: true }).click();
    await page.getByRole('button', { name: 'บันทึกผัง *', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'บันทึกผังแล้ว' }).waitFor();
    await page.getByRole('tab', { name: 'การจอง / จัดโต๊ะ' }).click();
    const map = page.getByRole('group', { name: 'ผังเลือกโต๊ะ', exact: true });
    assert.equal(await map.getByRole('button', { name: 'B01', exact: true }).locator('rect').evaluate((el) => el.style.fill), 'rgb(230, 218, 245)');
    // Clicking a chair resolves to its owning table.
    await map.locator('g.chair').first().click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('combobox', { name: 'เลือกผู้จอง' }).fill('Map Guest');
    await page.locator('.ant-select-item-option-content').filter({ hasText: customer._id }).click();
    await page.getByRole('button', { name: 'บันทึกผู้จอง', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    const occupied = map.locator('g.table').filter({ hasText: 'ยืนยันแล้ว' }).first();
    await occupied.waitFor();
    assert.equal(await occupied.locator('rect').evaluate((el) => el.style.fill), 'rgb(255, 184, 184)');
    await occupied.hover();
    await page.getByRole('tooltip').getByText('X: @mapguest', { exact: true }).waitFor();
    await fs.mkdir('.cache/browser', { recursive: true });
    await page.screenshot({ path: '.cache/browser/map-booking.png', fullPage: true });
    await occupied.click();
    await page.getByRole('dialog').getByText('UID: ' + customer._id, { exact: true }).waitFor();
    await page.screenshot({ path: '.cache/browser/map-popup.png', fullPage: true });
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile overflow');
    await page.screenshot({ path: '.cache/browser/map-mobile.png', fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS: free event, saved pastel, chair selection, customer modal, occupied color, private tooltip, mobile width');
  } catch (e) {
    await page.screenshot({ path: '.cache/browser/map-failure.png', fullPage: true });
    throw e;
  } finally { await browser.close(); }
})();
