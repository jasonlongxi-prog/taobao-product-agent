const button = document.getElementById('collect');
const statusBox = document.getElementById('status');

function setStatus(text) { statusBox.textContent = text; }

async function sendCollect(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { action: 'collectTaobaoProduct' });
  } catch (error) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    return await chrome.tabs.sendMessage(tabId, { action: 'collectTaobaoProduct' });
  }
}

button.addEventListener('click', async () => {
  button.disabled = true;
  setStatus('正在自动滚动并采集图片，请不要关闭商品页……');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/^https:\/\/([^/]+\.)?(taobao|tmall)\.com\//i.test(tab.url || '')) {
      throw new Error('请先打开淘宝或天猫商品详情页');
    }
    const result = await sendCollect(tab.id);
    if (!result || !result.ok) throw new Error(result?.error || '页面采集失败');
    setStatus(`采集完成：${result.total} 张\n主图 ${result.counts.main || 0}｜SKU ${result.counts.sku || 0}｜详情 ${result.counts.detail || 0}\n正在保存到下载目录……`);
  } catch (error) {
    setStatus(`未完成：${error.message}`);
  } finally {
    button.disabled = false;
  }
});
