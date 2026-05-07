/**
 * 插件设置面板
 * 支持多公众号账户管理 + 排版参数 + 主题选择
 */
import { App, PluginSettingTab, Setting, Modal, Notice } from "obsidian";
import { getFontFamilyOptions, getThemeNames } from "./themes";
import type { FontFamilyPreset } from "./themes";
import type WechatFormatPlugin from "./main";

const WECHAT_EDITOR_VIEW_TYPE = "wechat-editor-view";

/**
 * 通知所有打开的公众号编辑器面板重新渲染
 * 用 any 调用以避免与 editor-view 形成循环依赖
 */
function refreshOpenEditorViews(plugin: WechatFormatPlugin): void {
    const leaves = plugin.app.workspace.getLeavesOfType(WECHAT_EDITOR_VIEW_TYPE);
    for (const leaf of leaves) {
        const view = leaf.view as { renderFromActiveFile?: () => Promise<void> };
        if (view && typeof view.renderFromActiveFile === "function") {
            void view.renderFromActiveFile();
        }
    }
}
import type { WechatMPAccount } from "./wechat-publisher";
import {
    DEFAULT_WECHAT_PROXY_KEY,
    DEFAULT_WECHAT_PROXY_URL,
    applyDefaultProxyToAccount,
} from "./wechat-publisher";
import { XOAuth2TokenSet, startOAuth2Flow, isTokenExpiringSoon } from "./x-oauth";

export interface WechatFormatSettings {
    theme: string;
    fontFamily: FontFamilyPreset;
    customCss: string;
    imageHandling: "base64" | "skip";
    codeTheme: string;
    // 多公众号账户
    wechatAccounts: WechatMPAccount[];
    defaultAccountId: string;
    // X / Twitter API
    xClientId: string;
    xClientSecret: string;
    xTokens: XOAuth2TokenSet | null;
    xThreadMode: "auto" | "always" | "never";
    xMaxTweetLength: number;
}

export const DEFAULT_SETTINGS: WechatFormatSettings = {
    theme: "tech-blue",
    fontFamily: "pingfang",
    customCss: "",
    imageHandling: "base64",
    codeTheme: "atom-one-dark",
    wechatAccounts: [],
    defaultAccountId: "",
    // X defaults
    xClientId: "",
    xClientSecret: "",
    xTokens: null,
    xThreadMode: "auto",
    xMaxTweetLength: 280,
};

// ─────────────────────────────────────────────
// 账户编辑 Modal
// ─────────────────────────────────────────────

class AccountEditModal extends Modal {
    account: WechatMPAccount;
    onSave: (account: WechatMPAccount) => void;
    isNew: boolean;

    constructor(app: App, account: WechatMPAccount, isNew: boolean, onSave: (account: WechatMPAccount) => void) {
        super(app);
        this.account = applyDefaultProxyToAccount({ ...account });
        this.isNew = isNew;
        this.onSave = onSave;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h3", { text: this.isNew ? "添加公众号账户" : "编辑公众号账户" });

        new Setting(contentEl)
            .setName("账户名称")
            .setDesc('用于区分不同公众号，如"老王的号"')
            .addText((text) => {
                text.setPlaceholder("我的公众号")
                    .setValue(this.account.name)
                    .onChange((value) => { this.account.name = value; });
            });

        new Setting(contentEl)
            .setName("AppID")
            .setDesc("在公众号后台「设置与开发 → 基本配置」中获取")
            .addText((text) => {
                text.setPlaceholder("wx1234567890abcdef")
                    .setValue(this.account.appId)
                    .onChange((value) => { this.account.appId = value.trim(); });
            });

        new Setting(contentEl)
            .setName("AppSecret")
            .setDesc("请妥善保管，不要泄露给他人")
            .addText((text) => {
                text.inputEl.type = "password";
                text.setPlaceholder("••••••••••••")
                    .setValue(this.account.appSecret)
                    .onChange((value) => { this.account.appSecret = value.trim(); });
            });

        new Setting(contentEl)
            .setName("Proxy URL")
            .setDesc("默认固定出口代理，用于解决微信 API IP 白名单限制")
            .addText((text) => {
                text.setPlaceholder(DEFAULT_WECHAT_PROXY_URL)
                    .setValue(this.account.proxyUrl || DEFAULT_WECHAT_PROXY_URL)
                    .onChange((value) => {
                        this.account.proxyUrl = value.trim() || DEFAULT_WECHAT_PROXY_URL;
                    });
            });

        new Setting(contentEl)
            .setName("Proxy Key")
            .setDesc("代理鉴权密钥；如代理服务要求鉴权，请在这里配置")
            .addText((text) => {
                text.inputEl.type = "password";
                text.setPlaceholder("可选")
                    .setValue(this.account.proxyKey || DEFAULT_WECHAT_PROXY_KEY)
                    .onChange((value) => {
                        this.account.proxyKey = value.trim() || DEFAULT_WECHAT_PROXY_KEY;
                    });
            });

        new Setting(contentEl)
            .addButton((btn) => {
                btn.setButtonText("保存")
                    .setCta()
                    .onClick(() => {
                        if (!this.account.name || !this.account.appId || !this.account.appSecret) {
                            new Notice("❌ 请填写所有字段");
                            return;
                        }
                        this.onSave(applyDefaultProxyToAccount(this.account));
                        this.close();
                    });
            })
            .addButton((btn) => {
                btn.setButtonText("取消")
                    .onClick(() => this.close());
            });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

// ─────────────────────────────────────────────
// 账户选择 Modal（发布时多账户选择）
// ─────────────────────────────────────────────

export class AccountSelectModal extends Modal {
    accounts: WechatMPAccount[];
    onSelect: (account: WechatMPAccount) => void;

    constructor(app: App, accounts: WechatMPAccount[], onSelect: (account: WechatMPAccount) => void) {
        super(app);
        this.accounts = accounts;
        this.onSelect = onSelect;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h3", { text: "选择公众号账户" });

        for (const account of this.accounts) {
            new Setting(contentEl)
                .setName(account.name)
                .setDesc(`AppID: ...${account.appId.slice(-4)}`)
                .addButton((btn) => {
                    btn.setButtonText("选择")
                        .setCta()
                        .onClick(() => {
                            this.onSelect(account);
                            this.close();
                        });
                });
        }
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

// ─────────────────────────────────────────────
// 设置面板
// ─────────────────────────────────────────────

export class WechatFormatSettingTab extends PluginSettingTab {
    plugin: WechatFormatPlugin;

    constructor(app: App, plugin: WechatFormatPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // ── 文章排版 ──
        containerEl.createEl("h2", { text: "📝 文章排版" });

        // 主题选择
        const themes = getThemeNames();
        new Setting(containerEl)
            .setName("文章主题")
            .setDesc("选择公众号文章的样式主题（10 款可选）")
            .addDropdown((dropdown) => {
                for (const t of themes) {
                    dropdown.addOption(t.value, t.label);
                }
                dropdown.setValue(this.plugin.settings.theme);
                dropdown.onChange(async (value) => {
                    this.plugin.settings.theme = value;
                    await this.plugin.saveSettings();
                    refreshOpenEditorViews(this.plugin);
                });
            });

        const fontFamilies = getFontFamilyOptions();
        new Setting(containerEl)
            .setName("正文字体")
            .setDesc("选择文章默认字体，默认使用苹方")
            .addDropdown((dropdown) => {
                for (const font of fontFamilies) {
                    dropdown.addOption(font.value, font.label);
                }
                dropdown.setValue(this.plugin.settings.fontFamily);
                dropdown.onChange(async (value) => {
                    this.plugin.settings.fontFamily = value as FontFamilyPreset;
                    await this.plugin.saveSettings();
                    refreshOpenEditorViews(this.plugin);
                });
            });

        // 图片处理方式
        new Setting(containerEl)
            .setName("图片处理")
            .setDesc("本地图片如何处理")
            .addDropdown((dropdown) => {
                dropdown.addOption("base64", "转为 Base64 内联（推荐）");
                dropdown.addOption("skip", "跳过本地图片");
                dropdown.setValue(this.plugin.settings.imageHandling);
                dropdown.onChange(async (value) => {
                    this.plugin.settings.imageHandling = value as "base64" | "skip";
                    await this.plugin.saveSettings();
                });
            });

        // 自定义CSS
        new Setting(containerEl)
            .setName("自定义 CSS")
            .setDesc("额外的 CSS 样式，追加到文章内容中")
            .addTextArea((text) => {
                text.inputEl.style.width = "100%";
                text.inputEl.style.height = "100px";
                text.inputEl.style.fontFamily = "monospace";
                text.inputEl.style.fontSize = "13px";
                text.setPlaceholder("例如：\nh2 { color: red; }")
                    .setValue(this.plugin.settings.customCss)
                    .onChange(async (value) => {
                        this.plugin.settings.customCss = value;
                        await this.plugin.saveSettings();
                    });
            });

        // ── 微信公众号账户 ──
        containerEl.createEl("h2", { text: "🔑 微信公众号账户" });

        const accountDesc = containerEl.createEl("p", {
            text: "配置公众号的 AppID/AppSecret，用于一键发布草稿。默认通过固定代理访问微信 API，请在公众号后台将代理服务器 IP 14.103.38.108 加入白名单。",
        });
        accountDesc.style.cssText = "font-size: 13px; color: #888; margin-bottom: 12px;";

        // 账户列表
        const accountList = containerEl.createDiv({ cls: "wechat-account-list" });
        this.renderAccountList(accountList);

        // 添加按钮
        new Setting(containerEl)
            .addButton((btn) => {
                btn.setButtonText("+ 添加公众号账户")
                    .setCta()
                    .onClick(() => {
                        const newAccount: WechatMPAccount = {
                            id: this.generateId(),
                            name: "",
                            appId: "",
                            appSecret: "",
                            proxyUrl: DEFAULT_WECHAT_PROXY_URL,
                            proxyKey: DEFAULT_WECHAT_PROXY_KEY,
                        };
                        new AccountEditModal(this.app, newAccount, true, async (account) => {
                            this.plugin.settings.wechatAccounts.push(applyDefaultProxyToAccount(account));
                            if (this.plugin.settings.wechatAccounts.length === 1) {
                                this.plugin.settings.defaultAccountId = account.id;
                            }
                            await this.plugin.saveSettings();
                            this.renderAccountList(accountList);
                        }).open();
                    });
            });

        // ── X / Twitter API ──
        containerEl.createEl("h2", { text: "𝕏 X / Twitter API" });

        const xDesc = containerEl.createEl("p", {
            text: "配置 X API OAuth 2.0 授权，用于直接从 Obsidian 发布帖子到 X。",
        });
        xDesc.style.cssText = "font-size: 13px; color: #888; margin-bottom: 12px;";

        // Client ID
        new Setting(containerEl)
            .setName("Client ID")
            .setDesc("在 console.x.com 创建 App 后获取的 OAuth 2.0 Client ID")
            .addText((text) => {
                text.setPlaceholder("例如: M1M5R3BMVy13Q...")
                    .setValue(this.plugin.settings.xClientId)
                    .onChange(async (value) => {
                        this.plugin.settings.xClientId = value.trim();
                        await this.plugin.saveSettings();
                    });
                text.inputEl.style.width = "280px";
            });

        // Client Secret
        new Setting(containerEl)
            .setName("Client Secret")
            .setDesc("OAuth 2.0 Client Secret（Web App 类型需要）")
            .addText((text) => {
                text.inputEl.type = "password";
                text.setPlaceholder("n_06wlswAg...")
                    .setValue(this.plugin.settings.xClientSecret)
                    .onChange(async (value) => {
                        this.plugin.settings.xClientSecret = value.trim();
                        await this.plugin.saveSettings();
                    });
                text.inputEl.style.width = "280px";
            });

        // 授权状态 & 按钮
        const tokens = this.plugin.settings.xTokens;
        const isConnected = tokens && tokens.accessToken;
        const isExpiring = tokens ? isTokenExpiringSoon(tokens) : false;

        const statusText = isConnected
            ? (isExpiring ? "⚠️ Token 即将过期" : "✅ 已连接")
            : "❌ 未授权";

        new Setting(containerEl)
            .setName("授权状态")
            .setDesc(statusText)
            .addButton((btn) => {
                if (isConnected) {
                    btn.setButtonText("断开连接")
                        .setWarning()
                        .onClick(async () => {
                            this.plugin.settings.xTokens = null;
                            await this.plugin.saveSettings();
                            this.display();
                            new Notice("已断开 X 授权");
                        });
                } else {
                    btn.setButtonText("🔑 授权登录")
                        .setCta()
                        .onClick(async () => {
                            const clientId = this.plugin.settings.xClientId;
                            if (!clientId) {
                                new Notice("❌ 请先填写 Client ID");
                                return;
                            }
                            try {
                                new Notice("⏳ 正在打开授权页面...");
                                const tokenSet = await startOAuth2Flow(clientId, this.plugin.settings.xClientSecret || undefined);
                                this.plugin.settings.xTokens = tokenSet;
                                await this.plugin.saveSettings();
                                this.display();
                                new Notice("✅ X 授权成功！");
                            } catch (err) {
                                new Notice(`❌ 授权失败: ${err}`);
                            }
                        });
                }
            });

        // Thread 模式
        new Setting(containerEl)
            .setName("Thread 模式")
            .setDesc("超长文本如何处理")
            .addDropdown((dropdown) => {
                dropdown.addOption("auto", "自动（超过字数限制时拆分）");
                dropdown.addOption("always", "始终拆分为 Thread");
                dropdown.addOption("never", "不拆分（截断）");
                dropdown.setValue(this.plugin.settings.xThreadMode);
                dropdown.onChange(async (value) => {
                    this.plugin.settings.xThreadMode = value as "auto" | "always" | "never";
                    await this.plugin.saveSettings();
                });
            });

        // 单条字数限制
        new Setting(containerEl)
            .setName("单条推文字数")
            .setDesc("单条推文最大字符数（普通 280，X Premium 可达 25000）")
            .addText((text) => {
                text.setPlaceholder("280")
                    .setValue(String(this.plugin.settings.xMaxTweetLength))
                    .onChange(async (value) => {
                        const num = parseInt(value, 10);
                        if (!isNaN(num) && num > 0) {
                            this.plugin.settings.xMaxTweetLength = num;
                            await this.plugin.saveSettings();
                        }
                    });
                text.inputEl.style.width = "80px";
            });
    }

    private renderAccountList(container: HTMLElement): void {
        container.empty();
        const accounts = this.plugin.settings.wechatAccounts;

        if (accounts.length === 0) {
            const empty = container.createEl("p", { text: "暂无配置的公众号账户" });
            empty.style.cssText = "color: #bbb; text-align: center; padding: 16px 0;";
            return;
        }

        for (const account of accounts) {
            const isDefault = account.id === this.plugin.settings.defaultAccountId;
            new Setting(container)
                .setName(`${isDefault ? "⭐ " : ""}${account.name}`)
                .setDesc(`AppID: ...${account.appId.slice(-4)}`)
                .addButton((btn) => {
                    btn.setButtonText("编辑")
                        .onClick(() => {
                            new AccountEditModal(this.app, account, false, async (updated) => {
                                const idx = this.plugin.settings.wechatAccounts.findIndex((a) => a.id === updated.id);
                                if (idx >= 0) {
                                    this.plugin.settings.wechatAccounts[idx] = applyDefaultProxyToAccount(updated);
                                    await this.plugin.saveSettings();
                                    this.renderAccountList(container);
                                }
                            }).open();
                        });
                })
                .addButton((btn) => {
                    btn.setButtonText(isDefault ? "默认 ✓" : "设为默认")
                        .onClick(async () => {
                            this.plugin.settings.defaultAccountId = account.id;
                            await this.plugin.saveSettings();
                            this.renderAccountList(container);
                        });
                })
                .addButton((btn) => {
                    btn.setButtonText("删除")
                        .setWarning()
                        .onClick(async () => {
                            this.plugin.settings.wechatAccounts =
                                this.plugin.settings.wechatAccounts.filter((a) => a.id !== account.id);
                            if (this.plugin.settings.defaultAccountId === account.id) {
                                this.plugin.settings.defaultAccountId =
                                    this.plugin.settings.wechatAccounts[0]?.id || "";
                            }
                            await this.plugin.saveSettings();
                            this.renderAccountList(container);
                        });
                });
        }
    }

    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }
}
