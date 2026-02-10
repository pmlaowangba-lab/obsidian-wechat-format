/**
 * 插件设置面板
 */
import { App, PluginSettingTab, Setting } from "obsidian";
import { getThemeNames } from "./themes";
import type WechatFormatPlugin from "./main";

export interface WechatFormatSettings {
    theme: string;
    customCss: string;
    imageHandling: "base64" | "skip";
    codeTheme: string;
}

export const DEFAULT_SETTINGS: WechatFormatSettings = {
    theme: "default",
    customCss: "",
    imageHandling: "base64",
    codeTheme: "atom-one-dark",
};

export class WechatFormatSettingTab extends PluginSettingTab {
    plugin: WechatFormatPlugin;

    constructor(app: App, plugin: WechatFormatPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl("h2", { text: "WeChat Format 设置" });

        // 主题选择
        const themes = getThemeNames();
        new Setting(containerEl)
            .setName("文章主题")
            .setDesc("选择公众号文章的样式主题")
            .addDropdown((dropdown) => {
                for (const t of themes) {
                    dropdown.addOption(t.value, t.label);
                }
                dropdown.setValue(this.plugin.settings.theme);
                dropdown.onChange(async (value) => {
                    this.plugin.settings.theme = value;
                    await this.plugin.saveSettings();
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
            .setDesc(
                "额外的 CSS 样式，会被追加到文章内容中。格式：选择器 { 属性: 值; }"
            )
            .addTextArea((text) => {
                text.inputEl.style.width = "100%";
                text.inputEl.style.height = "120px";
                text.inputEl.style.fontFamily = "monospace";
                text.inputEl.style.fontSize = "13px";
                text
                    .setPlaceholder("例如：\nh2 { color: red; }\np { font-size: 15px; }")
                    .setValue(this.plugin.settings.customCss)
                    .onChange(async (value) => {
                        this.plugin.settings.customCss = value;
                        await this.plugin.saveSettings();
                    });
            });
    }
}
