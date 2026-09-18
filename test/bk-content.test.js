const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cleanContent } = require('../src/routes/bk-catalog.routes');

test('article formatting, tables and private image captions survive sanitization', () => {
  const html = '<h2 style="text-align: center">Title</h2><p><span style="color: #aabbcc; background-color: rgb(255, 240, 120)"><u><s>Text</s></u></span></p><table><tbody><tr><th colspan="2" rowspan="1"><p>Header</p></th></tr><tr><td><p>Cell</p></td><td><p>Other</p></td></tr></tbody></table><figure class="bk-article-image"><img src="/bk-api/files/0123456789abcdef01234567" alt="Garden" width="320"><figcaption>Caption</figcaption></figure><hr>';
  const result = cleanContent(html);
  for (const fragment of ['text-align:center', 'color:#aabbcc', 'background-color:rgb(255, 240, 120)', '<s>Text</s>', '<table>', 'colspan="2"', 'width="320"', '<figcaption>Caption</figcaption>']) assert.ok(result.includes(fragment), fragment);
  assert.equal(cleanContent(result), result, 'save/reload should be stable');
});

test('article sanitization removes scripts, unsafe URLs, styles and invalid image sizes', () => {
  const result = cleanContent('<script>alert(1)</script><p onclick="evil()" style="position:fixed;background-image:url(https://evil.test)">Text</p><a href="javascript:evil()">Bad</a><img src="https://evil.test/pixel"><figure><img src="/bk-api/files/0123456789abcdef01234567" width="99999" onerror="evil()"><figcaption><iframe src="https://evil.test"></iframe>Safe</figcaption></figure><table><tr><td colspan="999999" rowspan="-1">Cell</td></tr></table>');
  assert.doesNotMatch(result, /script|onclick|onerror|position|background-image|evil|iframe|99999|rowspan/);
  assert.match(result, /<figcaption>Safe<\/figcaption>/);
  assert.match(result, /rel="noopener noreferrer"/);
});

test('legacy article HTML and bare private images remain supported', () => {
  const result = cleanContent('<h3>Old title</h3><p><b>Bold</b> <i>Italic</i></p><ul><li>Item</li></ul><img src="/bk-api/files/0123456789abcdef01234567" alt="Old">');
  assert.match(result, /<b>Bold<\/b>/);
  assert.match(result, /alt="Old"/);
});
