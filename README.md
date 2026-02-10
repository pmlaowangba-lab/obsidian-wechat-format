# Obsidian WeChat Format

Obsidian 插件：一键将 Markdown 文档转为微信公众号格式。

![Obsidian WeChat Format](https://github.com/pmlaowangba-lab/obsidian-wechat-format/raw/main/images/preview.png)

## 功能特点

- **一键预览**：在 Obsidian 中直接生成公众号风格的预览页面。
- **一键复制**：支持"一键复制"按钮，保留所有格式和样式。
- **图片处理**：
  - 自动将本地图片转换为 base64，完美解决粘贴到公众号图片丢失问题。
  - 支持 `![[WikiLink]]` 格式图片。
  - 修复了图片被误识别为链接的问题。
- **样式内联**：所有 CSS 样式（标题、列表、代码块、引用等）均内联到 HTML 标签中，确保粘贴兼容性。
- **多主题支持**：内置 "默认蓝"、"简约黑白"、"暗色科技" 三款主题。
- **Obsidian 兼容**：
  - 支持 Callouts (Admonitions) 转换为带样式的文本块。
  - 自动将外部链接转换为脚注（公众号不支持外链）。

## 安装

### 方式一：从 Community Plugins 安装 (待上架)
1. 打开 Obsidian 设置 -> Third-party plugins -> 关闭 Safe mode。
2. 点击 Browse，搜索 `WeChat Format`。
3. 点击 Install -> Enable。

### 方式二：手动安装
1. 将 `main.js`, `manifest.json`, `styles.css` 放入 `.obsidian/plugins/obsidian-wechat-format/` 文件夹。
2. 重启 Obsidian 或重新加载插件。

## 使用方法

1. 打开任意 Markdown 文档。
2. **方法一**：点击左侧边栏的 **剪贴板图标** 📋。
3. **方法二**：`Cmd/Ctrl + P` 打开命令面板，搜索 `WeChat Format: Copy to WeChat`。
4. 在弹出的浏览器预览也面中，点击 **一键复制到公众号**。
5. 去微信公众号后台编辑器，`Cmd/Ctrl + V` 粘贴。

## 开发

```bash
npm install
npm run dev  # 监听修改
npm run build # 构建生产版本
```

## License

MIT
