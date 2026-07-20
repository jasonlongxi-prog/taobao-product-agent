(() => {
  if (globalThis.__TAOBAO_PRODUCT_COLLECTOR__) return;
  globalThis.__TAOBAO_PRODUCT_COLLECTOR__ = true;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const IMAGE_HOST = /(^|\.)(alicdn\.com|tbcdn\.cn)$/i;
  const SKIP_WORDS = /(avatar|icon|logo|sprite|emoji|qrcode|qr-code|favicon|loading|placeholder|tfs\/TB1)/i;
  const PLATFORM_NOISE = /(营业执照|身份验证|举报中心|打黄扫非|绿色发展|无障碍|价格说明|国家企业信用|平台规则)/i;

  function normalizeUrl(raw) {
    if (!raw || typeof raw !== 'string') return null;
    let value = raw.trim().replace(/^['"]|['"]$/g, '').replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
    if (value.startsWith('//')) value = `https:${value}`;
    if (value.startsWith('/')) {
      try { value = new URL(value, location.href).href; } catch (_) { return null; }
    }
    try {
      const url = new URL(value);
      if (!/^https?:$/.test(url.protocol) || !IMAGE_HOST.test(url.hostname)) return null;
      if (SKIP_WORDS.test(url.pathname)) return null;
      return url.href;
    } catch (_) { return null; }
  }

  function bestFromSrcset(value) {
    if (!value) return null;
    const entries = value.split(',').map(part => {
      const bits = part.trim().split(/\s+/);
      const width = parseInt((bits[1] || '').replace(/\D/g, ''), 10) || 0;
      return { url: bits[0], width };
    }).sort((a, b) => b.width - a.width);
    return entries[0]?.url || null;
  }

  function contextOf(element) {
    const chunks = [];
    let node = element;
    for (let level = 0; node && level < 6; level += 1, node = node.parentElement) {
      chunks.push(node.id || '', typeof node.className === 'string' ? node.className : '');
    }
    return chunks.join(' ').toLowerCase();
  }

  function classify(context, pageY, width, height, nearbyText = '') {
    const text = `${context} ${nearbyText}`.toLowerCase();
    if (/(sku|prop|spec|规格|颜色|套餐|款式|variation)/i.test(text)) return { category: 'sku', reason: 'SKU/规格容器' };
    if (/(main|gallery|carousel|swiper|slider|preview|轮播|主图)/i.test(text)) {
      return { category: 'main', reason: '主图/轮播容器' };
    }
    if (/(detail|desc|description|module|content|详情|宝贝描述|product-info)/i.test(text) || pageY > Math.max(1500, innerHeight * 1.8)) {
      return { category: 'detail', reason: '详情区域或页面下部' };
    }
    if (pageY < innerHeight * 1.5 || (width >= 500 && height >= 500)) {
      return { category: 'main', reason: '首屏大图' };
    }
    return { category: 'detail', reason: '未明确分类，归入详情' };
  }

  async function autoScroll() {
    const originalY = scrollY;
    let stable = 0;
    let previousHeight = 0;
    let steps = 0;
    window.scrollTo({ top: 0, behavior: 'instant' });
    await sleep(500);
    while (steps < 60 && stable < 4) {
      const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      const next = Math.min(height, scrollY + Math.max(600, Math.round(innerHeight * 0.82)));
      window.scrollTo({ top: next, behavior: 'instant' });
      await sleep(450);
      const newHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      if (newHeight === previousHeight && scrollY + innerHeight >= newHeight - 80) stable += 1;
      else stable = 0;
      previousHeight = newHeight;
      steps += 1;
    }
    await sleep(1200);
    window.scrollTo({ top: originalY, behavior: 'instant' });
    return steps;
  }

  function extractItemId(pageHtml) {
    const params = new URLSearchParams(location.search);
    for (const key of ['id', 'itemId', 'item_id']) {
      const value = params.get(key);
      if (/^\d{8,}$/.test(value || '')) return value;
    }
    const patterns = [
      /(?:itemId|item_id)["']?\s*[:=]\s*["']?(\d{8,})/i,
      /[?&]id=(\d{8,})/i,
      /item\/(\d{8,})/i
    ];
    for (const pattern of patterns) {
      const match = pageHtml.match(pattern);
      if (match) return match[1];
    }
    return `unknown-${Date.now()}`;
  }

  function titleOf() {
    const selectors = [
      'meta[property="og:title"]', 'meta[name="twitter:title"]',
      'h1', '[class*="ItemTitle--"]', '[class*="ItemTitle_"]',
      '[data-testid*="title"]'
    ];
    const reject = /^(用户评价|评价|商品详情|宝贝详情|店铺|客服|推荐)([·\s]|$)/;
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const value = (element?.content || element?.textContent || '').trim().replace(/\s+/g, ' ');
      if (value.length > 3 && !reject.test(value)) return value.slice(0, 300);
    }
    const documentValue = document.title.replace(/[-_]?淘宝网.*$/i, '').replace(/[-_]?天猫.*$/i, '').trim();
    return documentValue && !reject.test(documentValue) ? documentValue.slice(0, 300) : '标题待OCR确认';
  }

  function addCandidate(store, candidate) {
    const url = normalizeUrl(candidate.url);
    if (!url) return;
    const current = store.get(url);
    const priority = { sku: 3, main: 2, detail: 1 };
    if (!current || priority[candidate.category] > priority[current.category]) {
      store.set(url, { ...candidate, url });
    }
  }

  function collectDomImages(store) {
    const elements = [...document.querySelectorAll('img,source,[data-src],[data-lazyload],[data-ks-lazyload]')];
    for (const element of elements) {
      const rect = element.getBoundingClientRect();
      const width = element.naturalWidth || rect.width || 0;
      const height = element.naturalHeight || rect.height || 0;
      const values = [
        element.currentSrc, element.src,
        element.getAttribute('data-src'), element.getAttribute('data-original'),
        element.getAttribute('data-lazyload'), element.getAttribute('data-ks-lazyload'),
        bestFromSrcset(element.srcset || element.getAttribute('data-srcset'))
      ];
      const context = contextOf(element);
      const nearbyText = (element.alt || element.title || '').slice(0, 200);
      if (width > 0 && height > 0 && (width < 180 || height < 180)) continue;
      if (PLATFORM_NOISE.test(`${context} ${nearbyText}`)) continue;
      const result = classify(context, rect.top + scrollY, width, height, nearbyText);
      for (const value of values) {
        addCandidate(store, {
          url: value, category: result.category, reason: result.reason,
          width: Math.round(width), height: Math.round(height),
          pageY: Math.round(rect.top + scrollY), alt: nearbyText
        });
      }
    }

    for (const element of document.querySelectorAll('[style*="background"]')) {
      const value = getComputedStyle(element).backgroundImage;
      const match = value.match(/url\(["']?(.+?)["']?\)/i);
      if (!match) continue;
      const rect = element.getBoundingClientRect();
      const context = contextOf(element);
      if ((rect.width > 0 && rect.height > 0 && (rect.width < 180 || rect.height < 180)) || PLATFORM_NOISE.test(context)) continue;
      const result = classify(context, rect.top + scrollY, rect.width, rect.height);
      addCandidate(store, {
        url: match[1], category: result.category, reason: `${result.reason}（背景图）`,
        width: Math.round(rect.width), height: Math.round(rect.height),
        pageY: Math.round(rect.top + scrollY), alt: ''
      });
    }
  }

  function collectEmbeddedUrls(store, pageHtml) {
    const normalized = pageHtml.slice(0, 12_000_000).replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
    const regex = /https?:\/\/[^"'\s<>\\]+?\.(?:jpe?g|png|webp)(?:_[^"'\s<>\\]*)?(?:\?[^"'\s<>\\]*)?/gi;
    let match;
    let count = 0;
    while ((match = regex.exec(normalized)) && count < 500) {
      const start = Math.max(0, match.index - 250);
      const end = Math.min(normalized.length, match.index + match[0].length + 250);
      const nearby = normalized.slice(start, end);
      if (PLATFORM_NOISE.test(nearby)) continue;
      if (!/(sku|prop|spec|gallery|carousel|itempic|item_img|auction|detail|desc|description|module)/i.test(nearby)) continue;
      const result = classify(nearby, 99999, 0, 0, nearby);
      addCandidate(store, {
        url: match[0], category: result.category,
        reason: `${result.reason}（页面内嵌数据）`, width: 0, height: 0, pageY: -1, alt: ''
      });
      count += 1;
    }
  }

  async function collectProduct() {
    const steps = await autoScroll();
    const html = document.documentElement.outerHTML;
    const store = new Map();
    collectDomImages(store);
    collectEmbeddedUrls(store, html);
    const images = [...store.values()]
      .filter(item => !SKIP_WORDS.test(item.url))
      .sort((a, b) => {
        const order = { main: 0, sku: 1, detail: 2 };
        return order[a.category] - order[b.category] || a.pageY - b.pageY;
      })
      .slice(0, 350);
    const counts = images.reduce((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + 1;
      return acc;
    }, {});
    const payload = {
      schemaVersion: 1,
      sourceUrl: location.href,
      canonicalUrl: document.querySelector('link[rel="canonical"]')?.href || null,
      itemId: extractItemId(html),
      title: titleOf(),
      collectedAt: new Date().toISOString(),
      collectorVersion: '1.1.0',
      autoScrollSteps: steps,
      counts,
      images
    };
    if (!images.length) throw new Error('当前页面没有识别到商品图片，请确认商品详情已正常显示');
    const downloadResult = await chrome.runtime.sendMessage({ action: 'downloadCollection', payload });
    if (!downloadResult?.ok) throw new Error(downloadResult?.error || '下载任务创建失败');
    return { ok: true, total: images.length, counts, itemId: payload.itemId, downloads: downloadResult };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.action !== 'collectTaobaoProduct') return false;
    collectProduct().then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  });
})();
