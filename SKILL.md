---
name: taobao-product-agent
description: 输入淘宝或天猫商品链接，配合本地 Chrome 采集助手下载主图、SKU 图和详情图，执行中文 OCR，并分析卖点、痛点、页面结构和营销策略；可生成原创详情页文案、短视频脚本和公众号选题简报。
---

# 淘宝商品分析 Agent

## 目标

把淘宝/天猫商品链接转化为可核验的本地素材包和原创营销输出。采集应在用户已经正常打开商品的 Chrome 页面中完成；不得索取、保存或导出淘宝账号密码与 Cookie。

## 文件

- 链接解析与 OCR：`{skill_dir}/scripts/taobao_agent.py`
- Chrome 扩展：`{skill_dir}/assets/chrome-extension/`
- 采集说明：`{skill_dir}/references/chrome-helper.md`
- 验收清单：`{skill_dir}/references/capture-and-creative-qa.md`
- 输出模板：`{skill_dir}/templates/`

## 核心边界

1. 不绕过淘宝登录、验证码、访问验证或反爬措施；
2. 不要求用户发送 Cookie、密码或验证码；
3. OCR 模糊、页面未展示或规格未选中的信息必须标记为“待核实”；
4. 竞品图片仅用于分析参考，不能直接复制品牌、Logo、水印、人物肖像和完整文案；
5. 参数、认证、兼容性、保修、销量和效果承诺必须来自已采集证据或用户自有资料；
6. 只处理当前商品页，不读取订单、地址、聊天或推荐页中的私人信息。

## 工作流

### 1. 解析链接

```bash
python "{skill_dir}/scripts/taobao_agent.py" resolve "<淘宝或天猫链接>"
```

读取 `item_id`、`target_url`、`associated_keyword` 和 `access_status`。分享链接里的关键词不能冒充正式商品标题。

### 2. 浏览器采集

若服务端无法读取商品详情，不要反复请求登录页。引导用户：

1. 在已登录的 Chrome 中打开商品详情页；
2. 点击“淘宝商品分析助手”→“采集当前商品”；
3. 从 Chrome 当前下载目录找到 `TaobaoAgent/<商品ID>/manifest.json`。

下载目录必须从用户提供的路径或 Chrome 设置中确认，不能写死为某个盘符或用户名。

### 3. OCR 与素材校验

```bash
python "{skill_dir}/scripts/taobao_agent.py" ocr \
  "<Chrome下载目录>/TaobaoAgent/<商品ID>" \
  --output "<用户选择的输出目录>/<商品ID>"
```

读取并检查：

- `source-manifest.json`
- `image-inventory.csv`
- `ocr/`
- `ocr-combined.md`
- `ocr-report.json`

关键规格必须回看原图。图片分类是启发式结果，不得承诺百分之百无漏图或误分类。

### 4. 生成商品分析

使用 `templates/analysis.md`，至少包含：

1. 商品事实卡；
2. 证据 → 卖点 → 用户收益；
3. 页面明确痛点与合理推断；
4. 详情页信息顺序；
5. 营销策略；
6. 可借鉴的抽象结构；
7. 风险和待核实项；
8. 制作自有页面仍缺少的资料。

重要结论尽量标注来源图片文件名，区分“页面事实”“营销宣称”“推断”和“建议”。

### 5. 生成原创草稿

默认可生成：

- `product-detail-copy.md`：原创详情页文案；
- `short-video-script.md`：15 秒、30 秒和 60 秒脚本；
- `wechat-article-brief.md`：公众号选题简报。

不得复制竞品完整文案或虚构效果、认证和销量。

### 6. 电商图片

只有在用户提供自有产品照片、真实参数、品牌素材和服务政策后，才能制作正式商品图。参考图只用于版式和信息节奏分析。

图像工具可用时，优先生成无文字或留白背景，再用可靠中文字体本地叠字。输出后检查：

- 中文错字或缺字方框；
- 旧品牌、Logo和水印残留；
- 产品遮挡、变形和背景接缝；
- 未经证实的价格、费率、授权或效果承诺。

## 完成标准

只有满足以下条件才报告完成：

- 链接状态已解析；
- 浏览器采集清单真实存在；
- 图片数量与清单基本一致；
- OCR 真实执行并输出报告；
- 分析区分事实、推断与待核实；
- 用户要求的草稿或图片已真实生成并可读取。

若登录限制导致尚未采集，状态应标为 `NEEDS_BROWSER_CAPTURE`，不能声称已经查看商品详情图。
