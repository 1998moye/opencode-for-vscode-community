# 发布到 Visual Studio Marketplace

## 商店里图片为什么不显示？

依据 [Microsoft 文档](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) 与 [vscode-docs#487](https://github.com/microsoft/vscode-docs/issues/487)：

- Marketplace **不会**把 README 里的图片上传到商店服务器。
- 发布时 `vsce` 会把 README 中的**相对路径**改写成 GitHub 上的 HTTPS 地址，例如：  
  `https://github.com/1998moye/opencode-for-vscode-community/raw/HEAD/media/screenshots/01-timeline.png`
- 若 `package.json` **没有** `repository`，或 GitHub 上**还没有**对应文件，商店页图片 `src` 会是空的（裂图）。

因此：**只改 GitHub / 只装本地 VSIX，不会更新商店详情页**；必须重新 `vsce publish`。

## 发布前检查

1. `package.json` 含 `repository` → 本仓库 GitHub 地址（已配置）。
2. `media/screenshots/*.png` 已推到 `main`：`npm run push:gh`
3. README 里使用相对路径 `media/screenshots/....png`（已配置）。
4. 发布者 ID 与商店一致（例如 **Dingzhen**）。

## 命令

```powershell
cd opencode-for-vscode
# 需已登录：vsce login publisher Dingzhen
npm run publish:marketplace
```

或分步：

```powershell
npm run push:gh
npm run package
vsce publish --no-dependencies
```

发布后等待几分钟刷新 Marketplace 页面。本地 VS Code「扩展」页也会随新版本 README 更新（需从商店安装该版本或装对应 VSIX）。
