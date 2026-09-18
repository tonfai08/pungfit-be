// Local disposable preview only; no production data.
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
    await page.getByRole('link', { name: '+ สร้าง Event', exact: true }).click();
    await page.getByLabel('ชื่องาน', { exact: true }).fill('Capacity Workshop');
    await page.getByLabel('URL ของงาน (ตัวอักษรอังกฤษ ตัวเลข และ -)').fill('capacity-' + Date.now());
    await page.getByRole('radio', { name: 'จำกัดจำนวนผู้ร่วมงาน (ไม่ใช้โต๊ะ)', exact: true }).check();
    await page.getByRole('spinbutton', { name: 'จำนวนผู้ร่วมงานสูงสุด', exact: true }).fill('10');
    await page.getByRole('spinbutton', { name: 'จำนวนที่นั่งสูงสุดต่อการจอง', exact: true }).fill('4');
    await page.getByRole('radio', { name: 'จองฟรี ไม่ต้องชำระเงิน', exact: true }).check();
    await page.getByRole('button', { name: 'บันทึก Event', exact: true }).click();
    await page.waitForURL((url) => /\/events\/[a-f\d]{24}$/.test(url.pathname));
    await page.reload();
    await page.getByRole('tab', { name: 'การลงทะเบียน', exact: true }).click();
    await page.getByText('10 / 10', { exact: true }).waitFor();
    assert.equal(await page.getByRole('tab', { name: 'ผังโต๊ะและราคา' }).count(), 0);
    assert.equal(await page.getByRole('group', { name: 'ผังเลือกโต๊ะ' }).count(), 0);
    await page.getByRole('button', { name: '+ สร้างการจอง', exact: true }).click();
    await page.getByLabel('ชื่อผู้ติดต่อ', { exact: true }).fill('Capacity Guest');
    await page.getByLabel('เบอร์โทร', { exact: true }).fill('0812345678');
    await page.getByRole('spinbutton', { name: 'จำนวนที่นั่ง', exact: true }).fill('4');
    await page.getByRole('button', { name: 'ลงทะเบียนและกันที่นั่ง', exact: true }).click();
    await page.getByText('Capacity Guest', { exact: true }).waitFor();
    await page.getByText('6 / 10', { exact: true }).waitFor();
    await fs.mkdir('.cache/browser', { recursive: true });
    await page.screenshot({ path: '.cache/browser/capacity.png', fullPage: true });
    await page.getByRole('button', { name: 'จัดการ →', exact: true }).click();
    await page.getByRole('heading', { name: 'Capacity Guest', exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'จัดโต๊ะ', exact: true }).count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile overflow');
    assert.deepEqual(errors, []);
    console.log('PASS: create capacity event, persist limits, no table UI, book 4 seats, remaining 6/10, details and mobile');
  } catch (e) {
    await page.screenshot({ path: '.cache/browser/capacity-failure.png', fullPage: true }); throw e;
  } finally { await browser.close(); }
})();
