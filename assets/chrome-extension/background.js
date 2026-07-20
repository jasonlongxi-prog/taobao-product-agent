function safeSegment(value, fallback = 'unknown') {
  const clean = String(value || '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, '_').replace(/^\.+|\.+$/g, '').slice(0, 120);
  return clean || fallback;
}

function extensionOf(rawUrl) {
  try {
    const path = new URL(rawUrl).pathname.toLowerCase();
    const matches = [...path.matchAll(/\.(jpe?g|png|webp|bmp)(?=($|[_./]))/g)];
    if (matches.length) return `.${matches[matches.length - 1][1].replace('jpeg', 'jpg')}`;
  } catch (_) {}
  return '.jpg';
}

function download(options) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(options, id => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(id);
    });
  });
}

async function downloadCollection(payload) {
  const itemId = safeSegment(payload.itemId, `unknown-${Date.now()}`);
  const base = `TaobaoAgent/${itemId}`;
  const sequence = { main: 0, sku: 0, detail: 0 };
  const completed = [];
  const failed = [];

  for (const image of payload.images) {
    const category = ['main', 'sku', 'detail'].includes(image.category) ? image.category : 'detail';
    sequence[category] += 1;
    const filename = `${base}/${category}/${String(sequence[category]).padStart(3, '0')}${extensionOf(image.url)}`;
    image.localFile = `${category}/${filename.split('/').pop()}`;
    try {
      const downloadId = await download({ url: image.url, filename, conflictAction: 'overwrite', saveAs: false });
      image.downloadStatus = 'started';
      image.downloadId = downloadId;
      completed.push(filename);
    } catch (error) {
      image.downloadStatus = 'failed';
      image.downloadError = error.message;
      failed.push({ url: image.url, filename, error: error.message });
    }
  }

  payload.downloadSummary = {
    requested: payload.images.length,
    started: completed.length,
    failed: failed.length,
    failedItems: failed
  };
  const manifest = JSON.stringify(payload, null, 2);
  const manifestUrl = `data:application/json;charset=utf-8,${encodeURIComponent(manifest)}`;
  await download({ url: manifestUrl, filename: `${base}/manifest.json`, conflictAction: 'overwrite', saveAs: false });
  return { ok: true, base, started: completed.length, failed: failed.length };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action !== 'downloadCollection') return false;
  downloadCollection(message.payload)
    .then(sendResponse)
    .catch(error => sendResponse({ ok: false, error: error.message }));
  return true;
});
