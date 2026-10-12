# AimoiA Image Studio

> 当前目录名、应用标识和部分历史交付物仍使用旧品牌。AimoiA 是目标名称；迁移规则见
> [品牌规范](../../docs/BRANDING.md)。

本地 AI 图片创作工具，使用 Tauri 2 和 Rust 构建，同一份前端同时支持桌面端和可安装 PWA。

## 主要能力

- 文生图：根据提示词、尺寸和质量参数生成图片。
- 图生图：上传原图和可选蒙版，对指定区域进行修改。
- 多供应商：读取 OpenAI 兼容接口，动态获取和排序可用模型。
- 本地历史：保存生成记录、图片路径、供应商模型和参数，支持删除记录与文件。
- 系统凭据：Windows 使用 Credential Manager，macOS 使用 Keychain。
- PWA：可在 iPhone/iPad Safari 中添加到主屏幕；浏览器版的数据安全边界不同于桌面版。

## 当前版本

当前源码和 Windows 交付版本为 `1.0.3`。

| 平台 | 当前状态 |
| --- | --- |
| Windows NSIS | 1.0.3 安装版和便携版已生成 |
| Windows MSI | 最近记录为 1.0.2 |
| macOS | 最近 DMG 为 1.0.0 临时签名构建 |
| iPhone/iPad PWA | 已包含部署工作流，正式发布状态取决于远端 Pages |

## 技术结构

```text
public/           桌面端和 PWA 共用前端
src-tauri/src/    Rust/Tauri 后端、供应商调用、凭据与存储
.github/workflows macOS 构建和 PWA 部署
```

历史构建和平台交付文件已移至 `D:\AimoiA-Artifacts\apps\krill-image-studio\dist`。

## 开发与构建

```powershell
npm install
npm run dev
npm run build -- --bundles nsis
```

安装包通常输出到 `src-tauri/target/release/bundle/nsis/`。

## PWA

1. 将 `public` 部署到 GitHub Pages。
2. 用 Safari 打开站点。
3. 选择“分享”->“添加到主屏幕”。

网页版 API Key 和历史记录只保存在当前浏览器；供应商接口必须允许浏览器跨域访问。

## 发布与签名

- 测试版 macOS 构建可临时签名，首次启动可能需要在“隐私与安全性”中确认。
- 正式 macOS 分发必须使用 Apple Developer ID 并完成 notarization。
- 不要把证书、密码、API Key 或签名密钥提交到仓库。

## 当前 Git 状态

本产品的提交历史已经通过 Git subtree 导入 AimoiA 根仓库，应用目录不再依赖嵌套
`.git`。后续提交统一在项目根目录执行。具体规则见
[仓库规范](../../docs/REPOSITORY.md)。
