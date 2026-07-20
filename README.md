# 淘宝商品分析 Agent

> 非淘宝、天猫或阿里巴巴官方项目，与上述平台不存在隶属、授权或背书关系。

一个本地优先的淘宝/天猫商品素材采集、中文 OCR 与营销分析工具包，包含：

- Chrome Manifest V3 商品页采集扩展；
- Python 链接解析与批量 OCR 脚本；
- Hermes Agent Skill；
- 商品分析、详情页文案、短视频脚本和公众号选题模板。

> 本项目不会绕过淘宝登录、验证码或访问验证，也不需要淘宝 Cookie、账号密码或 API 密钥。

## 能做什么

1. 在用户已正常打开的淘宝/天猫商品页中，采集已展示或加载的主图、SKU 图和详情图；
2. 保存 `manifest.json`，记录商品 ID、页面来源、图片分类依据和下载状态；
3. 使用 Tesseract 对本地图片执行简体中文 OCR；
4. 生成图片清单、哈希、重复图标记、OCR 汇总和报告；
5. 配合 Hermes Agent，按模板生成商品事实卡、卖点分析、原创详情页文案和短视频脚本；
6. 在配置了图像生成工具并提供自有产品资料后，辅助规划原创电商图片。

## 不包含什么

- 不包含淘宝账号登录、Cookie 导出或反爬绕过；
- 不提供淘宝数据 API；
- 不保证页面结构变化后仍能完整分类所有图片；
- 不自动授予竞品图片、品牌、Logo、人物或文案的商用权；
- 仓库本身不捆绑 AI 图片生成服务，电商出图需要用户自行配置兼容工具或本地设计流程。

## 项目结构

```text
taobao-product-agent/
├── SKILL.md
├── assets/chrome-extension/     # Chrome 采集助手
├── scripts/taobao_agent.py      # 链接解析与 OCR
├── templates/                   # 分析和营销输出模板
├── references/                  # 使用及验收文档
├── tests/                       # 非联网单元测试
├── PRIVACY.md
├── SECURITY.md
├── requirements.txt
└── LICENSE
```

## 环境要求

- Chrome 或 Chromium 浏览器；
- Python 3.10 或以上；
- Tesseract OCR；
- Tesseract 简体中文语言包 `chi_sim`；
- Hermes Agent（仅使用 Skill 工作流时需要）。

Python 依赖：

```bash
python -m venv .venv
```

Windows PowerShell：

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Linux/macOS：

```bash
source .venv/bin/activate
pip install -r requirements.txt
```

确认 OCR 环境：

```bash
tesseract --list-langs
```

输出中应包含 `chi_sim`。Tesseract 的安装方式因系统而异，请使用其官方项目或操作系统可信软件源。

## 安装 Chrome 扩展

1. 打开 `chrome://extensions/`；
2. 开启“开发者模式”；
3. 点击“加载已解压的扩展程序”；
4. 选择本仓库的 `assets/chrome-extension/`；
5. 详细步骤见 [`references/chrome-helper.md`](references/chrome-helper.md)。

采集完成后，Chrome 下载目录中会出现：

```text
TaobaoAgent/<商品ID>/
├── manifest.json
├── main/
├── sku/
└── detail/
```

## 命令行使用

### 解析商品链接

```bash
python scripts/taobao_agent.py resolve "https://example.taobao.com/..."
```

短链接或页面要求登录/验证时，脚本只报告状态，不会尝试绕过限制。此时请在浏览器中正常打开商品，再使用扩展采集。

### 执行 OCR

```bash
python scripts/taobao_agent.py ocr \
  "/path/to/ChromeDownloads/TaobaoAgent/<商品ID>" \
  --output "/path/to/analysis-output/<商品ID>"
```

输出包括：

- `source-manifest.json`
- `image-inventory.csv`
- `ocr/`
- `ocr-combined.md`
- `ocr-report.json`

## 在 Hermes Agent 中使用

将整个仓库目录复制或链接为一个 Hermes Skill：

```text
~/.hermes/skills/taobao-product-agent/
```

创建新会话后，可发送：

```text
分析这个淘宝商品：https://...
```

如果淘宝要求登录，Hermes 应引导用户在自己的 Chrome 中采集，不应索取 Cookie 或账号密码。

## 结果验收

浏览器显示“采集完成”不等于所有文件一定成功保存。分析前应：

1. 读取 `manifest.json` 的 `downloadSummary`；
2. 对照图片清单和本地文件数；
3. 用 Pillow 验证图片是否可以打开；
4. 对关键规格和营销宣称回看原图；
5. 将“页面事实”“营销宣称”“合理推断”“待核实”分开。

详细规则见 [`references/capture-and-creative-qa.md`](references/capture-and-creative-qa.md)。

## 隐私、版权与平台边界

- 仅处理你有权访问和使用的商品内容；
- 不要把采集图片、OCR 输出、订单截图或个人信息提交到公开仓库；
- 竞品素材可用于研究，但未经授权不得直接复制为自己的商品页；
- 不得通过修改本项目绕过登录、验证码、访问验证或平台限制；
- 淘宝/天猫页面和规则可能变化，使用者应自行核对适用的平台条款和法律要求。

参见 [`PRIVACY.md`](PRIVACY.md) 和 [`SECURITY.md`](SECURITY.md)。

## 本地验证

```bash
python -m unittest discover -s tests -v
python scripts/taobao_agent.py --help
node --check assets/chrome-extension/background.js
node --check assets/chrome-extension/content.js
node --check assets/chrome-extension/popup.js
```

## 许可证

代码与项目文档按 [MIT License](LICENSE) 开源。该许可证不覆盖通过本项目采集的第三方商品图片、商标、文案或其他素材。

## 贡献

欢迎提交兼容性修复、图片分类改进、OCR 优化和文档补充。提交 Issue 或示例前，请删除商品卖家的个人信息、账号信息和未经授权的完整素材。
