const ExerciseMaster = require('../models/exercise-master.model');

const WGER_IDS = {
  'โกเบล็ตสควอต': 203, 'เดดลิฟต์': 184, 'วิดพื้น': 1551, 'เบนช์เพรส': 73,
  'ซีทเต็ดเคเบิลโรว์': 1117, 'ไทรเซปพุชดาวน์': 1185,
  'เลกเพรสแมชชีน': 371, 'เลกเอ็กซ์เทนชันแมชชีน': 369, 'เลกเคิร์ลแมชชีน': 366,
  'เชสต์เพรสแมชชีน': 129, 'เพกเดกแมชชีน': 135, 'โชลเดอร์เพรสแมชชีน': 543,
  'สมิธแมชชีนสควอต': 1747, 'แอสซิสเต็ดพูลอัป': 1929,
  'เคเบิลฟลาย': 1689, 'คาล์ฟเพรสแมชชีน': 146,
};

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`wger returned ${response.status}`);
  return response.json();
}

async function syncWgerMedia() {
  const licenseData = await fetchJson('https://wger.de/api/v2/license/?limit=100');
  const licenses = new Map((licenseData.results || []).map((item) => [item.id, item]));
  const entries = await Promise.all(Object.entries(WGER_IDS).map(async ([name, id]) => {
    const info = await fetchJson(`https://wger.de/api/v2/exerciseinfo/${id}/`);
    const image = info.images?.find((item) => item.is_main) || info.images?.[0];
    const video = info.videos?.find((item) => item.is_main) || info.videos?.[0];
    const mediaLicenseId = image?.license || video?.license || info.license?.id;
    const license = licenses.get(mediaLicenseId) || info.license || {};
    const attribution = image?.license_author || video?.license_author || info.license_author || '';
    return { name, media: {
      image_url: image?.thumbnails?.medium || image?.image || '',
      video_url: video?.video || '', source: 'wger',
      source_url: `https://wger.de/api/v2/exerciseinfo/${id}/`,
      license: license.short_name || license.full_name || '', license_url: license.url || '',
      attribution: attribution ? `wger contributor: ${attribution}` : 'wger community',
    } };
  }));
  for (const { name, media } of entries) {
    const usefulMedia = Object.fromEntries(Object.entries(media).filter(([, value]) => value));
    await ExerciseMaster.updateOne({ name, language: 'th' }, { $set: { media: usefulMedia } });
  }
  console.log(` Synced wger media for ${entries.length} exercises`);
}

module.exports = { syncWgerMedia };
