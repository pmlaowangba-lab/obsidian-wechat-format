/**
 * Obsidian WeChat Format Plugin v2
 * 富文本编辑器 + 多公众号 + 一键草稿
 */
import { Plugin, Notice, addIcon } from "obsidian";
import { convertMarkdown, preprocessObsidian } from "./converter";
import { processImagesInHtml } from "./image-handler";
import { generatePreviewHtml } from "./html-generator";
import { getTheme, applyFontFamily } from "./themes";
import { publishMarkdownToXApi } from "./x-publisher";
import { applyDefaultProxyToAccount, publishToDraft, WechatMPAccount } from "./wechat-publisher";
import {
    WechatFormatSettings,
    DEFAULT_SETTINGS,
    WechatFormatSettingTab,
    AccountSelectModal,
} from "./settings";
import { WechatEditorView, WECHAT_EDITOR_VIEW_TYPE } from "./editor-view";

export default class WechatFormatPlugin extends Plugin {
    settings: WechatFormatSettings = DEFAULT_SETTINGS;

    async onload() {
        await this.loadSettings();

        // ── 自定义图标 ──
        addIcon(
            "wechat-format-x",
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
              <rect x="8" y="8" width="84" height="84" rx="18" fill="none" stroke="currentColor" stroke-width="8"/>
              <path d="M30 30 L70 70 M70 30 L30 70" stroke="currentColor" stroke-width="10" stroke-linecap="round"/>
            </svg>`
        );

        addIcon(
            "wechat-format-wechat",
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
              <path d="M50 10C28 10 10 25 10 44c0 10 5 19 14 25l-3 12 13-7c5 2 10 3 16 3 1 0 3 0 4 0-2-3-3-7-3-11 0-17 16-31 36-31 2 0 3 0 5 0C88 18 71 10 50 10z" fill="currentColor" opacity="0.7"/>
              <path d="M90 56c0-15-14-27-32-27s-32 12-32 27 14 27 32 27c4 0 8-1 11-2l10 5-2-9c8-5 13-13 13-21z" fill="currentColor"/>
              <circle cx="48" cy="56" r="4" fill="white"/>
              <circle cx="68" cy="56" r="4" fill="white"/>
            </svg>`
        );

        // ── 注册编辑器 View ──
        this.registerView(
            WECHAT_EDITOR_VIEW_TYPE,
            (leaf) => new WechatEditorView(leaf, this)
        );

        // ── 命令：打开公众号编辑器 ──
        this.addCommand({
            id: "open-wechat-editor",
            name: "打开公众号编辑器",
            callback: async () => {
                await this.activateEditorView();
            },
        });

        // ── 命令：复制到公众号 ──
        this.addCommand({
            id: "copy-to-wechat",
            name: "复制到公众号 (生成预览HTML)",
            hotkeys: [{ modifiers: ["Mod", "Shift"], key: "w" }],
            callback: async () => {
                await this.exportToWechat();
            },
        });

        // ── 命令：发布到微信草稿箱 ──
        this.addCommand({
            id: "publish-to-wechat-draft",
            name: "发布到微信草稿箱",
            hotkeys: [{ modifiers: ["Mod", "Shift"], key: "d" }],
            callback: async () => {
                await this.publishToWechatDraft();
            },
        });

        // ── 命令：复制到 X ──
        this.addCommand({
            id: "copy-to-x",
            name: "复制到X（复制文章文本）",
            callback: async () => {
                await this.exportToX();
            },
        });

        // ── 命令：发布到 X（API）──
        this.addCommand({
            id: "publish-to-x-api",
            name: "发布到X（API，含图片）",
            hotkeys: [{ modifiers: ["Mod", "Shift"], key: "x" }],
            callback: async () => {
                await this.exportToXApi();
            },
        });

        // ── 注册设置面板 ──
        this.addSettingTab(new WechatFormatSettingTab(this.app, this));

        // ── 侧边栏图标（仅保留编辑器入口）──
        this.addRibbonIcon("wechat-format-wechat", "打开公众号编辑器", async () => {
            await this.activateEditorView();
        });

        console.log("[WeChat Format] Plugin v2 loaded");
    }

    onunload() {
        console.log("[WeChat Format] Plugin unloaded");
    }

    // ─────────────────────────────────────────
    // 编辑器面板
    // ─────────────────────────────────────────

    async activateEditorView(): Promise<void> {
        const existing = this.app.workspace.getLeavesOfType(WECHAT_EDITOR_VIEW_TYPE);
        if (existing.length > 0) {
            this.app.workspace.revealLeaf(existing[0]);
            return;
        }

        const leaf = this.app.workspace.getRightLeaf(false);
        if (leaf) {
            await leaf.setViewState({
                type: WECHAT_EDITOR_VIEW_TYPE,
                active: true,
            });
            this.app.workspace.revealLeaf(leaf);
        }
    }

    // ─────────────────────────────────────────
    // 发布到微信草稿箱
    // ─────────────────────────────────────────

    async publishToWechatDraft(): Promise<void> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== "md") {
            new Notice("❌ 请先打开一个 Markdown 文件");
            return;
        }

        const accounts = this.settings.wechatAccounts || [];
        if (accounts.length === 0) {
            new Notice("❌ 请先在设置中配置微信公众号账户");
            return;
        }

        const doPublish = async (account: WechatMPAccount) => {
            account = applyDefaultProxyToAccount(account);
            new Notice(`⏳ 正在发布到「${account.name}」草稿箱...`);

            let markdown = "";
            let html = "";

            try {
                markdown = await this.app.vault.read(activeFile);
                const theme = applyFontFamily(getTheme(this.settings.theme), this.settings.fontFamily);
                html = await convertMarkdown(markdown, theme);

                // 注意：不在这里做 processImagesInHtml (base64 转换)
                // publishToDraft 内部会自动处理所有图片（本地/base64/远程 → 微信 CDN）

                // 解析 frontmatter
                const { wechatMeta } = preprocessObsidian(markdown);

                const result = await publishToDraft(
                    this.app,
                    account,
                    html,
                    activeFile.path,
                    {
                        title: activeFile.basename,
                        author: wechatMeta.author,
                        digest: wechatMeta.digest,
                    }
                );

                new Notice(
                    `✅ 草稿发布成功！\n📄 ${result.title}\n🖼️ ${result.imageCount} 张图片`,
                    8000
                );

                if (result.warnings.length > 0) {
                    console.warn("[WeChat Format] Publish warnings:", result.warnings);
                    new Notice(`⚠️ 有 ${result.warnings.length} 项警告（详见控制台）`, 6000);
                }
            } catch (error) {
                console.error("[WeChat Format] Publish to WeChat error:", error);
                const errText = String(error);
                if (/40164|invalid ip|IP 白名单|当前公网 IP/i.test(errText)) {
                    try {
                        const { clipboard, shell } = require("electron");
                        clipboard.write({ html, text: markdown });
                        await shell.openExternal("https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&isNew=1&type=10&lang=zh_CN");
                        new Notice(`⚠️ 微信 API 被 IP 白名单拦截。当前账号: ${account.name || account.appId}；Proxy: ${account.proxyUrl || "未配置"}；错误: ${errText}`, 20000);
                        return;
                    } catch (fallbackError) {
                        console.error("[WeChat Format] IP whitelist fallback failed:", fallbackError);
                    }
                }
                new Notice(`❌ 发布失败: ${error}`);
            }
        };

        // 如果只有一个账户或有默认账户，直接发布
        if (accounts.length === 1) {
            await doPublish(accounts[0]);
        } else {
            const defaultAccount = accounts.find((a) => a.id === this.settings.defaultAccountId);
            if (defaultAccount) {
                await doPublish(defaultAccount);
            } else {
                // 弹出选择框
                new AccountSelectModal(this.app, accounts, async (selected) => {
                    await doPublish(selected);
                }).open();
            }
        }
    }

    // ─────────────────────────────────────────
    // 导出到公众号（预览 HTML）
    // ─────────────────────────────────────────

    async exportToWechat() {
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
            const markdown = await this.app.vault.read(activeFile);
            const theme = applyFontFamily(getTheme(this.settings.theme), this.settings.fontFamily);
            let articleHtml = await convertMarkdown(markdown, theme);

            if (this.settings.imageHandling === "base64") {
                articleHtml = await processImagesInHtml(
                    this.app,
                    articleHtml,
                    activeFile.path
                );
            }

            const title = activeFile.basename;
            const fullHtml = generatePreviewHtml(articleHtml, title);

            // 保存到临时目录
            const previewDir = ".wechat-preview";
            const safeTitle = title.replace(/[\\/:*?"<>|]/g, "_").trim() || "preview";
            const previewPath = `${previewDir}/${safeTitle}.html`;

            if (!(await this.app.vault.adapter.exists(previewDir))) {
                await this.app.vault.adapter.mkdir(previewDir);
            }
            await this.app.vault.adapter.write(previewPath, fullHtml);

            // 打开预览 + 写入剪贴板
            const basePath = (this.app.vault.adapter as { basePath?: string }).basePath;
            if (!basePath) {
                throw new Error("当前存储适配器不支持本地预览");
            }
            const isWindowsPath = /^[A-Za-z]:[\\\/]/.test(basePath);
            const fsSeparator = isWindowsPath ? "\\" : "/";
            const absolutePath = `${basePath.replace(/[\\\/]+$/, "")}${fsSeparator}${previewPath.replace(/[\\\/]+/g, fsSeparator)}`;
            const normalizedPath = absolutePath.replace(/\\/g, "/");
            const fileUrl = /^[A-Za-z]:\//.test(normalizedPath)
                ? `file:///${encodeURI(normalizedPath)}`
                : `file://${encodeURI(normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`)}`;

            const { shell, clipboard } = require("electron") as {
                shell: {
                    openPath: (path: string) => Promise<string>;
                    openExternal: (url: string) => Promise<void>;
                };
                clipboard: {
                    write: (data: { html?: string; text?: string }) => void;
                };
            };

            let previewOpened = false;
            const openPathError = await shell.openPath(absolutePath);
            if (!openPathError) {
                previewOpened = true;
            } else {
                try {
                    await shell.openExternal(fileUrl);
                    previewOpened = true;
                } catch (e) {
                    console.error("[WeChat Format] openExternal failed:", e);
                }
            }

            let copiedToClipboard = false;
            try {
                clipboard.write({ html: articleHtml, text: markdown });
                copiedToClipboard = true;
            } catch (e) {
                console.error("[WeChat Format] clipboard write failed:", e);
            }

            if (previewOpened && copiedToClipboard) {
                new Notice("✅ 已打开预览页，并已复制到剪贴板", 6000);
            } else if (previewOpened) {
                new Notice("✅ 预览页面已生成并在浏览器中打开", 6000);
            } else if (copiedToClipboard) {
                new Notice(`⚠️ 未能打开浏览器，已复制到剪贴板`, 9000);
            } else {
                throw new Error("预览页打开失败，且写入剪贴板失败");
            }
        } catch (error) {
            console.error("[WeChat Format] Export error:", error);
            new Notice(`❌ 导出失败: ${error}`);
        }
    }

    async exportToX() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== "md") {
            new Notice("❌ 请先打开一个 Markdown 文件");
            return;
        }

        new Notice("⏳ 正在复制 X 文章文本...");

        try {
            const markdown = await this.app.vault.read(activeFile);
            const { content, footnotes } = preprocessObsidian(markdown);

            let xText = content
                .replace(/<!--CALLOUT_START:(\w+):(.+?)-->/g, (_m, type, title) => `[${String(type).toUpperCase()}] ${title}\n`)
                .replace(/<!--CALLOUT_END-->/g, "")
                .replace(/[ \t]+\n/g, "\n")
                .trim();

            if (footnotes.length > 0) {
                const footnoteLines = footnotes
                    .map((fn) => `[${fn.index}] ${fn.text}: ${fn.url}`)
                    .join("\n");
                xText += `\n\n参考链接\n${footnoteLines}`;
            }

            const { clipboard, shell } = require("electron") as {
                clipboard: {
                    writeText?: (text: string) => void;
                    write: (data: { text?: string }) => void;
                };
                shell: { openExternal: (url: string) => Promise<void> };
            };

            if (clipboard.writeText) {
                clipboard.writeText(xText);
            } else {
                clipboard.write({ text: xText });
            }

            let browserOpened = false;
            const urls = ["https://x.com/compose/post", "https://x.com/home"];
            for (const url of urls) {
                try {
                    await shell.openExternal(url);
                    browserOpened = true;
                    break;
                } catch { /* continue */ }
            }

            new Notice(
                browserOpened
                    ? `✅ 已复制到剪贴板并打开 X（${xText.length} 字符）`
                    : `✅ 已复制到剪贴板（${xText.length} 字符）`,
                6000
            );
        } catch (error) {
            console.error("[WeChat Format] Export to X error:", error);
            new Notice(`❌ 复制到 X 失败: ${error}`);
        }
    }

    async exportToXApi() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== "md") {
            new Notice("❌ 请先打开一个 Markdown 文件");
            return;
        }

        new Notice("⏳ 正在通过 API 发布到 X...");

        try {
            const markdown = await this.app.vault.read(activeFile);
            const pluginDir = this.manifest.dir || "obsidian-wechat-format";
            const result = await publishMarkdownToXApi(
                this.app,
                markdown,
                activeFile.path,
                pluginDir,
                {
                    settingsTokens: this.settings.xTokens,
                    clientId: this.settings.xClientId,
                    clientSecret: this.settings.xClientSecret,
                    threadMode: this.settings.xThreadMode,
                    maxTweetLength: this.settings.xMaxTweetLength,
                    onTokenRefreshed: async (newTokens) => {
                        this.settings.xTokens = newTokens;
                        await this.saveSettings();
                    },
                }
            );

            const { shell } = require("electron") as {
                shell: { openExternal: (url: string) => Promise<void> };
            };
            try {
                await shell.openExternal(result.url);
            } catch { /* ignore */ }

            const mediaText = result.mediaCount > 0 ? `，图片 ${result.mediaCount} 张` : "";
            const threadText = result.threadIds ? `（Thread ${result.threadIds.length} 条）` : "";
            new Notice(`✅ X 发布成功${threadText}${mediaText}，字数 ${result.textLength}`, 7000);

            if (result.warnings.length > 0) {
                console.warn("[WeChat Format] X publish warnings:", result.warnings);
                new Notice(`⚠️ 有 ${result.warnings.length} 项警告（详见控制台）`, 7000);
            }
        } catch (error) {
            console.error("[WeChat Format] Export to X API error:", error);
            new Notice(`❌ 发布到 X 失败: ${error}`);
        }
    }

    async loadSettings() {
        this.settings = this.withDefaultAccountProxies(Object.assign({}, DEFAULT_SETTINGS, await this.loadData()));
        await this.saveData(this.settings);
    }

    async saveSettings() {
        this.settings = this.withDefaultAccountProxies(this.settings);
        await this.saveData(this.settings);
    }

    private withDefaultAccountProxies(settings: WechatFormatSettings): WechatFormatSettings {
        return {
            ...settings,
            wechatAccounts: (settings.wechatAccounts || []).map((account) =>
                applyDefaultProxyToAccount(account)
            ),
        };
    }
}
