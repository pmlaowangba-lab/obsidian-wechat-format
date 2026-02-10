/**
 * Obsidian WeChat Format Plugin
 * 将 Markdown 文档生成公众号格式的 HTML 预览页并一键复制
 */
import { Plugin, Notice, TFile } from "obsidian";
import { convertMarkdown } from "./converter";
import { processImagesInHtml } from "./image-handler";
import { generatePreviewHtml } from "./html-generator";
import { getTheme } from "./themes";
import {
    WechatFormatSettings,
    DEFAULT_SETTINGS,
    WechatFormatSettingTab,
} from "./settings";

export default class WechatFormatPlugin extends Plugin {
    settings: WechatFormatSettings = DEFAULT_SETTINGS;

    async onload() {
        await this.loadSettings();

        // 注册命令：复制到公众号
        this.addCommand({
            id: "copy-to-wechat",
            name: "复制到公众号 (生成预览HTML)",
            hotkeys: [{ modifiers: ["Mod", "Shift"], key: "w" }],
            callback: async () => {
                await this.exportToWechat();
            },
        });

        // 注册设置面板
        this.addSettingTab(new WechatFormatSettingTab(this.app, this));

        // 添加侧边栏图标
        this.addRibbonIcon("clipboard-copy", "复制到公众号", async () => {
            await this.exportToWechat();
        });

        console.log("[WeChat Format] Plugin loaded");
    }

    onunload() {
        console.log("[WeChat Format] Plugin unloaded");
    }

    /**
     * 主导出流程
     */
    async exportToWechat() {
        // 获取当前活动文件
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice("❌ 请先打开一个 Markdown 文件");
            return;
        }

        if (activeFile.extension !== "md") {
            new Notice("❌ 当前文件不是 Markdown 文件");
            return;
        }

        new Notice("⏳ 正在生成公众号格式...");

        try {
            // 1. 读取文件内容
            const markdown = await this.app.vault.read(activeFile);

            // 2. 获取主题
            const theme = getTheme(this.settings.theme);

            // 3. 转换 Markdown → HTML
            let articleHtml = await convertMarkdown(markdown, theme);

            // 4. 处理图片（本地图片 → base64）
            if (this.settings.imageHandling === "base64") {
                articleHtml = await processImagesInHtml(
                    this.app,
                    articleHtml,
                    activeFile.path
                );
            }

            // 5. 获取文件名作为标题
            const title = activeFile.basename;

            // 6. 生成完整 HTML 预览页面
            const fullHtml = generatePreviewHtml(articleHtml, title);

            // 7. 保存到临时目录
            const previewDir = ".wechat-preview";
            const previewPath = `${previewDir}/${title}.html`;

            // 确保目录存在
            if (
                !(await this.app.vault.adapter.exists(previewDir))
            ) {
                await this.app.vault.adapter.mkdir(previewDir);
            }

            // 写入 HTML 文件
            await this.app.vault.adapter.write(previewPath, fullHtml);

            // 8. 获取绝对路径并在浏览器中打开
            const basePath = (this.app.vault.adapter as any).basePath;
            const absolutePath = `${basePath}/${previewPath}`;
            const fileUrl = `file://${absolutePath}`;

            // 使用 Electron shell 打开浏览器
            const { shell } = require("electron");
            shell.openExternal(fileUrl);

            new Notice(`✅ 预览页面已生成并在浏览器中打开！\n点击页面中的"一键复制"按钮后粘贴到公众号`, 5000);
        } catch (error) {
            console.error("[WeChat Format] Export error:", error);
            new Notice(`❌ 导出失败: ${error}`);
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}
