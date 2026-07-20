# GitHub 发布清单

## 建议的仓库信息

- 仓库名：`taobao-product-agent`
- 简介：`本地优先的淘宝/天猫商品图片采集、中文 OCR 与 Hermes 商品分析 Agent`
- 可见性：`Public`
- Topics：`taobao`、`tmall`、`chrome-extension`、`ocr`、`tesseract`、`hermes-agent`、`ecommerce`

## 使用 GitHub 网页发布

1. 登录 GitHub，点击 **New repository**。
2. 填写仓库名 `taobao-product-agent`，选择 **Public**。
3. 不要再次勾选创建 README、`.gitignore` 或 LICENSE，本目录已经包含这些文件。
4. 创建空仓库后选择 **uploading an existing file**。
5. 上传 `F:\GitHub\taobao-product-agent\` 里面的全部文件和文件夹。
6. 提交说明填写：`Initial public release`。
7. 上传完成后检查 GitHub 首页是否自动显示 `README.md`。

如果网页不方便上传完整目录，可以使用 GitHub Desktop，把此文件夹添加为本地仓库后再 Publish repository。

## 发布前最后确认

- [ ] 仓库中没有商品采集图片、OCR 输出或 `manifest.json` 实例；
- [ ] 仓库中没有 Cookie、账号密码、Token、API Key 或 `.env`；
- [ ] `README.md`、`LICENSE`、`PRIVACY.md` 和 `SECURITY.md` 均已上传；
- [ ] 仓库首页明确显示“非淘宝、天猫或阿里巴巴官方项目”；
- [ ] 发布后不要在 Issue 中接受用户的 Cookie、订单截图或个人资料。

## 可选：发布版本

第一次公开后可以在 GitHub 创建 Release：

- Tag：`v1.1.0`
- Title：`Taobao Product Agent v1.1.0`
- 说明：`首次公开版本：Chrome 商品图片采集、链接解析、中文 OCR、Hermes Skill 和营销分析模板。`
