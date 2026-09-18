// Use only the disposable preview API and frontend at localhost:3100.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const fs = require('node:fs/promises');

(async () => {
  await fs.mkdir('.cache/browser', { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('http://127.0.0.1:3100/booking-admin/login');
    await page.getByLabel('อีเมล', { exact: true }).fill('preview@example.test');
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill('Preview-only-593!');
    await page.getByRole('button', { name: 'เข้าสู่ระบบ →', exact: true }).click();
    await page.waitForURL('**/booking-admin/events');
    await page.getByRole('link', { name: '+ สร้าง Event', exact: true }).click();
    await page.getByLabel('ชื่องาน', { exact: true }).fill('Rich article browser test');
    await page.getByLabel('URL ของงาน (ตัวอักษรอังกฤษ ตัวเลข และ -)').fill(`article-${Date.now()}`);
    const content = page.getByRole('textbox', { name: 'รายละเอียดงานแบบบทความ' });
    await content.fill('บทความใหม่');
    await content.press('Control+a');
    await page.getByRole('button', { name: 'ตัวหนา', exact: true }).click();
    await page.getByRole('button', { name: 'ลิงก์', exact: true }).click();
    await page.getByRole('textbox', { name: 'URL ของลิงก์' }).fill('https://example.com/article');
    await page.getByRole('button', { name: 'บันทึกลิงก์', exact: true }).click();
    assert.equal(await content.locator('a').textContent(), 'บทความใหม่');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await content.locator('p').first().click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'เพิ่มตาราง', exact: true }).click();
    assert.equal(await content.locator('a').first().textContent(), 'บทความใหม่');
    await content.locator('th p').first().click();
    await page.keyboard.insertText('Header');
    await page.getByRole('button', { name: 'เพิ่มแถว', exact: true }).click();
    assert.equal(await content.locator('tr').count(), 4);
    await content.press('Control+End');
    await content.press('ArrowDown');
    const png = await sharp({ create: { width: 600, height: 300, channels: 3, background: '#b8d9c8' } }).png().toBuffer();
    await page.getByLabel('อัปโหลดรูปบทความ', { exact: true }).setInputFiles({ name: 'garden.png', mimeType: 'image/png', buffer: png });
    await content.locator('img').waitFor();
    await content.locator('img').click();
    await page.getByRole('button', { name: 'ตั้งค่ารูปภาพ', exact: true }).click();
    await page.getByRole('textbox', { name: 'คำบรรยายใต้รูป', exact: true }).fill('สวนยามเย็น');
    await page.getByRole('textbox', { name: 'ข้อความอธิบายรูป', exact: true }).fill('ภาพสวน');
    await page.getByRole('spinbutton', { name: 'ความกว้างรูป' }).fill('320');
    await page.getByRole('button', { name: 'บันทึกรูปภาพ', exact: true }).click();
    await page.getByRole('button', { name: 'ดูตัวอย่าง', exact: true }).click();
    await page.getByRole('dialog').getByText('สวนยามเย็น', { exact: true }).waitFor();
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'บันทึก Event', exact: true }).click();
    await page.waitForURL(url => /\/events\/[a-f\d]{24}$/.test(url.pathname));
    await page.reload();
    await content.locator('figcaption').waitFor();
    assert.equal(await content.locator('figcaption').textContent(), 'สวนยามเย็น');
    assert.equal(await content.locator('img').getAttribute('width'), '320');
    assert.equal(await content.locator('img').getAttribute('alt'), 'ภาพสวน');
    const imageResponse = await page.request.get(new URL(await content.locator('img').getAttribute('src'), page.url()).href);
    assert.equal(imageResponse.status(), 200, await imageResponse.text());
    assert.ok(await content.locator('img').evaluate(img => img.complete && img.naturalWidth > 0), 'image bytes load in browser');
    assert.equal(await content.locator('tr').count(), 4);
    assert.equal(await content.locator('a').first().getAttribute('href'), 'https://example.com/article');
    assert.ok(await content.locator('strong').count());
    // Real file payloads through both editor handlers, without using external storage.
    for (const kind of ['paste', 'drop']) {
      await content.evaluate((element, { kind, base64 }) => {
        const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        const transfer = new DataTransfer();
        transfer.items.add(new File([bytes], `${kind}.png`, { type: 'image/png' }));
        const rect = element.getBoundingClientRect();
        element.dispatchEvent(kind === 'paste'
          ? new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true })
          : new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true, clientX: rect.left + 20, clientY: rect.top + 20 }));
      }, { kind, base64: png.toString('base64') });
      await page.getByRole('button', { name: 'บันทึก Event', exact: true }).waitFor();
      await page.waitForFunction(expected => document.querySelectorAll('[aria-label="รายละเอียดงานแบบบทความ"] img').length === expected, kind === 'paste' ? 2 : 3);
    }
    await page.getByRole('button', { name: 'บันทึก Event', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'บันทึกข้อมูลแล้ว' }).waitFor();
    await page.reload();
    await content.locator('img').nth(2).waitFor();
    assert.equal(await content.locator('img').count(), 3);
    await content.scrollIntoViewIfNeeded();
    await page.screenshot({ path: '.cache/browser/article-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '.cache/browser/article-mobile.png', fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile overflow');
    assert.deepEqual(errors, []);
    console.log('Editor browser passed: formatting/link, table manipulation, upload/paste/drop, caption/resize, preview, persisted reload, mobile.');
  } catch (error) {
    await page.screenshot({ path: '.cache/browser/article-failure.png', fullPage: true });
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
