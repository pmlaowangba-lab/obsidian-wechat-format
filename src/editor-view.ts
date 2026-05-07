/**
 * 公众号富文本编辑器面板
 * 在 Obsidian 工作区侧边提供所见即所得的编辑体验
 */
import { ItemView, WorkspaceLeaf, Notice, TFile, MarkdownView, debounce } from "obsidian";
import { convertMarkdown, preprocessObsidian } from "./converter";
import { processImagesInHtml } from "./image-handler";
import { getTheme, getThemeNames, getFontFamilyOptions, applyOverrides, applyFontFamily, WechatTheme, ThemeOverrides } from "./themes";
import type { FontFamilyPreset } from "./themes";
import { htmlToMarkdown } from "./html-to-md";
import type WechatFormatPlugin from "./main";

export const WECHAT_EDITOR_VIEW_TYPE = "wechat-editor-view";

export class WechatEditorView extends ItemView {
    plugin: WechatFormatPlugin;
    private contentEl_: HTMLDivElement | null = null;
    private toolbarEl: HTMLDivElement | null = null;
    private editorEl: HTMLDivElement | null = null;
    private imageToolbar: HTMLDivElement | null = null;
    private activeImage: HTMLImageElement | null = null;

    // 魔法刷子状态
    private formatBrushActive = false;
    private formatBrushStyle: string | null = null;
    private formatBrushTag: string | null = null;

    // 当前状态
    private currentThemeName: string = "tech-blue";
    private overrides: ThemeOverrides = {};

    // 双向同步状态
    private isSelfUpdate = false;            // 防循环锁
    private isDirty = false;                 // 编辑器内容脏标记
    private cachedFrontmatter = "";          // 缓存 frontmatter
    private currentFilePath: string | null = null; // 当前渲染的文件路径

    // debounce 函数
    private debouncedSyncToFile = debounce(
        () => this.syncEditorToFile(),
        1000,
        true
    );
    private debouncedRenderFromFile = debounce(
        () => this.renderFromActiveFile(),
        300,
        true
    );

    constructor(leaf: WorkspaceLeaf, plugin: WechatFormatPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.currentThemeName = plugin.settings.theme || "tech-blue";
    }

    getViewType(): string {
        return WECHAT_EDITOR_VIEW_TYPE;
    }

    getDisplayText(): string {
        return "公众号编辑器";
    }

    getIcon(): string {
        return "file-text";
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.style.cssText = "display: flex; flex-direction: column; height: 100%; overflow: hidden;";

        // ── 工具栏 ──
        this.toolbarEl = container.createDiv({ cls: "wechat-editor-toolbar" });
        this.buildToolbar(this.toolbarEl);

        // ── 编辑器容器 ──
        const editorWrapper = container.createDiv({ cls: "wechat-editor-wrapper" });
        editorWrapper.style.cssText = "flex: 1; overflow-y: auto; padding: 16px; background: #f5f5f5;";

        const editorFrame = editorWrapper.createDiv({ cls: "wechat-editor-frame" });
        editorFrame.style.cssText = "max-width: 780px; margin: 0 auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); overflow: hidden;";

        this.editorEl = editorFrame.createDiv({ cls: "wechat-editor-content" });
        this.editorEl.contentEditable = "true";
        this.editorEl.style.cssText = "padding: 24px 0; min-height: 400px; outline: none; line-height: 1.8;";

        // 图片浮动工具条
        this.imageToolbar = container.createDiv({ cls: "wechat-image-toolbar" });
        this.buildImageToolbar(this.imageToolbar);
        this.imageToolbar.style.display = "none";

        // 事件绑定
        this.setupEditorEvents();

        // 注入样式
        this.injectStyles(container);

        // 初始渲染
        await this.renderFromActiveFile();

        // 监听 leaf 切换 → 切换渲染文件
        this.registerEvent(
            this.app.workspace.on("active-leaf-change", async () => {
                await this.renderFromActiveFile();
            })
        );

        // 监听 vault 文件修改 → 同步到编辑器（MD→Editor）
        this.registerEvent(
            this.app.vault.on("modify", (file) => {
                // 只响应当前渲染的文件
                if (file.path !== this.currentFilePath) return;
                // 如果是自己触发的写入，跳过
                if (this.isSelfUpdate) {
                    console.log("[WeChat Editor] vault modify skipped (self-update)");
                    return;
                }
                console.log("[WeChat Editor] vault modify detected, re-rendering:", file.path);
                this.debouncedRenderFromFile();
            })
        );
    }

    async onClose(): Promise<void> {
        // cleanup
    }

    // ─────────────────────────────────────────
    // 工具栏构建
    // ─────────────────────────────────────────

    private buildToolbar(toolbar: HTMLDivElement): void {
        toolbar.className = "wechat-editor-toolbar";

        // ══════════ 行 1: 格式化工具 ══════════
        const row1 = toolbar.createDiv({ cls: "wet-row" });

        // 撤销 / 重做
        this.tbtn(row1, "↩", "撤销 (Ctrl+Z)", () => document.execCommand("undo"));
        this.tbtn(row1, "↪", "重做 (Ctrl+Y)", () => document.execCommand("redo"));
        this.sep(row1);

        // 清除格式
        this.tbtn(row1, "⌫", "清除格式", () => document.execCommand("removeFormat"));
        this.sep(row1);

        // 字号下拉
        const sizeSelect = document.createElement("select");
        sizeSelect.className = "wet-select";
        sizeSelect.title = "字号";
        for (const s of [12, 13, 14, 15, 16, 17, 18, 20, 22, 24]) {
            const opt = document.createElement("option");
            opt.value = String(s);
            opt.textContent = `${s}`;
            if (s === 15) opt.selected = true;
            sizeSelect.appendChild(opt);
        }
        sizeSelect.addEventListener("change", () => {
            this.applyToSelection((el) => { el.style.fontSize = `${sizeSelect.value}px`; });
        });
        row1.appendChild(sizeSelect);
        this.sep(row1);

        // B I U S
        this.tbtn(row1, "B", "加粗", () => document.execCommand("bold"), "wet-btn-bold");
        this.tbtn(row1, "I", "斜体", () => document.execCommand("italic"), "wet-btn-italic");
        this.tbtn(row1, "U", "下划线", () => document.execCommand("underline"), "wet-btn-underline");
        this.tbtn(row1, "S", "删除线", () => document.execCommand("strikeThrough"), "wet-btn-strike");
        this.sep(row1);

        // 文字颜色
        const colorWrap = row1.createDiv({ cls: "wet-color-wrap" });
        const colorBtn = document.createElement("button");
        colorBtn.className = "wet-btn wet-color-btn";
        colorBtn.innerHTML = "A";
        colorBtn.title = "文字颜色";
        const colorBar = document.createElement("span");
        colorBar.className = "wet-color-bar";
        colorBar.style.background = "#e84393";
        colorBtn.appendChild(colorBar);
        const colorInput = document.createElement("input");
        colorInput.type = "color";
        colorInput.value = "#e84393";
        colorInput.className = "wet-color-input";
        colorInput.addEventListener("input", () => {
            document.execCommand("foreColor", false, colorInput.value);
            colorBar.style.background = colorInput.value;
        });
        colorWrap.appendChild(colorBtn);
        colorWrap.appendChild(colorInput);

        // 高亮颜色
        const hlWrap = row1.createDiv({ cls: "wet-color-wrap" });
        const hlBtn = document.createElement("button");
        hlBtn.className = "wet-btn wet-hl-btn";
        hlBtn.innerHTML = "ab";
        hlBtn.title = "高亮背景";
        const hlInput = document.createElement("input");
        hlInput.type = "color";
        hlInput.value = "#fdcb6e";
        hlInput.className = "wet-color-input";
        hlInput.addEventListener("input", () => {
            document.execCommand("hiliteColor", false, hlInput.value);
            hlBtn.style.background = hlInput.value;
        });
        hlWrap.appendChild(hlBtn);
        hlWrap.appendChild(hlInput);
        this.sep(row1);

        // 对齐
        this.tbtn(row1, "☰", "左对齐", () => document.execCommand("justifyLeft"));
        this.tbtn(row1, "≡", "居中", () => document.execCommand("justifyCenter"));
        this.tbtn(row1, "☰", "右对齐", () => document.execCommand("justifyRight"));
        this.tbtn(row1, "☰", "两端对齐", () => document.execCommand("justifyFull"));
        this.sep(row1);

        // 行距下拉
        const lhSelect = document.createElement("select");
        lhSelect.className = "wet-select";
        lhSelect.title = "行间距";
        for (const lh of [1.4, 1.6, 1.8, 2.0, 2.2, 2.5]) {
            const opt = document.createElement("option");
            opt.value = String(lh);
            opt.textContent = `${lh}`;
            if (lh === 1.8) opt.selected = true;
            lhSelect.appendChild(opt);
        }
        lhSelect.addEventListener("change", () => {
            if (this.editorEl) this.editorEl.style.lineHeight = lhSelect.value;
        });
        row1.appendChild(lhSelect);

        // 边距下拉
        const mSelect = document.createElement("select");
        mSelect.className = "wet-select";
        mSelect.title = "两侧边距";
        for (const m of [0, 4, 8, 12, 16, 24, 32]) {
            const opt = document.createElement("option");
            opt.value = String(m);
            opt.textContent = `±${m}`;
            if (m === 0) opt.selected = true;
            mSelect.appendChild(opt);
        }
        mSelect.addEventListener("change", () => {
            if (this.editorEl) {
                const bodySection = this.editorEl.querySelector(':scope > section') as HTMLElement;
                if (bodySection) {
                    bodySection.style.paddingLeft = `${28 + parseInt(mSelect.value)}px`;
                    bodySection.style.paddingRight = `${28 + parseInt(mSelect.value)}px`;
                }
            }
        });
        row1.appendChild(mSelect);
        this.sep(row1);

        // 缩进
        this.tbtn(row1, "⇥", "增加缩进", () => document.execCommand("indent"));
        this.tbtn(row1, "⇤", "减少缩进", () => document.execCommand("outdent"));
        this.sep(row1);

        // 列表
        this.tbtn(row1, "•", "无序列表", () => document.execCommand("insertUnorderedList"));
        this.tbtn(row1, "1.", "有序列表", () => document.execCommand("insertOrderedList"));
        this.sep(row1);

        // 插入元素
        this.tbtn(row1, "▦", "插入表格", () => {
            const table = `<table style="width:100%;border-collapse:collapse;margin:16px 0;"><thead><tr><th style="border:1px solid #ddd;padding:8px;background:#f5f5f5;">标题1</th><th style="border:1px solid #ddd;padding:8px;background:#f5f5f5;">标题2</th><th style="border:1px solid #ddd;padding:8px;background:#f5f5f5;">标题3</th></tr></thead><tbody><tr><td style="border:1px solid #ddd;padding:8px;">内容</td><td style="border:1px solid #ddd;padding:8px;">内容</td><td style="border:1px solid #ddd;padding:8px;">内容</td></tr></tbody></table><p><br></p>`;
            document.execCommand("insertHTML", false, table);
        });
        this.tbtn(row1, "❝", "引用", () => {
            const quote = `<blockquote style="border-left:4px solid #1a73e8;padding:12px 16px;background:#f8f9fa;margin:16px 0;color:#555;"><p>引用文字</p></blockquote><p><br></p>`;
            document.execCommand("insertHTML", false, quote);
        });
        this.tbtn(row1, "—", "分割线", () => document.execCommand("insertHorizontalRule"));
        this.tbtn(row1, "</>", "代码块", () => {
            const code = `<pre style="background:#282c34;color:#abb2bf;padding:16px;border-radius:8px;font-size:13px;overflow-x:auto;margin:16px 0;"><code>// code here</code></pre><p><br></p>`;
            document.execCommand("insertHTML", false, code);
        });

        // ══════════ 行 2: 操作栏 ══════════
        const row2 = toolbar.createDiv({ cls: "wet-action-row" });

        // 格式刷
        const brushBtn = this.tbtn(row2, "🖌", "格式刷", () => this.toggleFormatBrush(brushBtn));
        this.sep(row2);

        // 主题选择
        const themeSelect = document.createElement("select");
        themeSelect.className = "wet-select wet-select-wide";
        themeSelect.title = "切换主题";
        for (const t of getThemeNames()) {
            const opt = document.createElement("option");
            opt.value = t.value;
            opt.textContent = t.label;
            if (t.value === this.currentThemeName) opt.selected = true;
            themeSelect.appendChild(opt);
        }
        themeSelect.addEventListener("change", async () => {
            this.currentThemeName = themeSelect.value;
            await this.renderFromActiveFile();
        });
        row2.appendChild(themeSelect);

        // 字体选择下拉
        const fontSelect = document.createElement("select");
        fontSelect.className = "wet-select wet-select-wide";
        fontSelect.title = "正文字体";
        for (const f of getFontFamilyOptions()) {
            const opt = document.createElement("option");
            opt.value = f.value;
            opt.textContent = f.label;
            if (f.value === this.plugin.settings.fontFamily) opt.selected = true;
            fontSelect.appendChild(opt);
        }
        fontSelect.addEventListener("change", async () => {
            this.plugin.settings.fontFamily = fontSelect.value as FontFamilyPreset;
            await this.plugin.saveSettings();
            await this.renderFromActiveFile();
        });
        row2.appendChild(fontSelect);

        // ⚙️ 设置
        this.tbtn(row2, "⚙", "账户与设置", () => {
            // @ts-ignore - Obsidian internal API
            const setting = this.app.setting;
            if (setting) {
                setting.open();
                setting.openTabById("obsidian-wechat-format");
            }
        });
        this.sep(row2);

        // 账户选择下拉
        const accountSelect = document.createElement("select");
        accountSelect.className = "wet-select wet-select-wide";
        accountSelect.title = "选择公众号";
        const accounts = this.plugin.settings.wechatAccounts || [];
        if (accounts.length === 0) {
            const opt = document.createElement("option");
            opt.textContent = "未配置账户";
            opt.disabled = true;
            accountSelect.appendChild(opt);
        } else {
            for (const acc of accounts) {
                const opt = document.createElement("option");
                opt.value = acc.id;
                opt.textContent = acc.name || acc.appId;
                if (acc.id === this.plugin.settings.defaultAccountId) opt.selected = true;
                accountSelect.appendChild(opt);
            }
        }
        accountSelect.addEventListener("change", () => {
            this.plugin.settings.defaultAccountId = accountSelect.value;
            void this.plugin.saveSettings();
        });
        row2.appendChild(accountSelect);

        // 操作区（靠右对齐）
        const actionGroup = row2.createDiv({ cls: "wet-action-group" });
        const copyBtn = this.tbtn(actionGroup, "复制", "复制到剪贴板", () => this.copyToClipboard(), "wet-btn-copy");
        const pubBtn = this.tbtn(actionGroup, "发布", "发布到微信草稿箱", () => this.publishDraft(), "wet-btn-publish");
    }

    /** 工具栏按钮 */
    private tbtn(parent: HTMLElement, text: string, title: string, onClick: () => void, extraCls?: string): HTMLButtonElement {
        const btn = document.createElement("button");
        btn.textContent = text;
        btn.title = title;
        btn.className = `wet-btn ${extraCls || ""}`;
        btn.addEventListener("click", (e) => { e.preventDefault(); onClick(); });
        parent.appendChild(btn);
        return btn;
    }

    /** 分隔线 */
    private sep(parent: HTMLElement): void {
        const s = parent.createDiv({ cls: "wet-sep" });
    }

    // ─────────────────────────────────────────
    // 图片浮动工具条
    // ─────────────────────────────────────────

    private buildImageToolbar(toolbar: HTMLDivElement): void {
        toolbar.style.cssText = "position: absolute; z-index: 100; display: flex; gap: 6px; padding: 6px 10px; background: rgba(0,0,0,0.8); border-radius: 6px; align-items: center;";

        // 宽度
        const wLabel = toolbar.createSpan({ text: "宽度" });
        wLabel.style.cssText = "font-size: 11px; color: #fff;";
        const wSlider = document.createElement("input");
        wSlider.type = "range";
        wSlider.min = "30";
        wSlider.max = "100";
        wSlider.step = "5";
        wSlider.value = "100";
        wSlider.style.cssText = "width: 60px; cursor: pointer;";
        wSlider.addEventListener("input", () => {
            if (this.activeImage) {
                this.activeImage.style.maxWidth = `${wSlider.value}%`;
            }
        });
        toolbar.appendChild(wSlider);

        // 圆角
        const rLabel = toolbar.createSpan({ text: "圆角" });
        rLabel.style.cssText = "font-size: 11px; color: #fff; margin-left: 4px;";
        const rSlider = document.createElement("input");
        rSlider.type = "range";
        rSlider.min = "0";
        rSlider.max = "20";
        rSlider.step = "2";
        rSlider.value = "6";
        rSlider.style.cssText = "width: 50px; cursor: pointer;";
        rSlider.addEventListener("input", () => {
            if (this.activeImage) {
                this.activeImage.style.borderRadius = `${rSlider.value}px`;
            }
        });
        toolbar.appendChild(rSlider);

        // 阴影开关
        const shadowBtn = document.createElement("button");
        shadowBtn.textContent = "阴影";
        shadowBtn.style.cssText = "font-size: 11px; padding: 2px 8px; border: 1px solid #666; border-radius: 3px; background: transparent; color: #fff; cursor: pointer;";
        let shadowOn = true;
        shadowBtn.addEventListener("click", () => {
            shadowOn = !shadowOn;
            if (this.activeImage) {
                this.activeImage.style.boxShadow = shadowOn ? "0 4px 12px rgba(0,0,0,0.12)" : "none";
            }
            shadowBtn.style.background = shadowOn ? "#555" : "transparent";
        });
        toolbar.appendChild(shadowBtn);

        // 居中
        const centerBtn = document.createElement("button");
        centerBtn.textContent = "居中";
        centerBtn.style.cssText = "font-size: 11px; padding: 2px 8px; border: 1px solid #666; border-radius: 3px; background: transparent; color: #fff; cursor: pointer;";
        centerBtn.addEventListener("click", () => {
            if (this.activeImage) {
                const wrapper = this.activeImage.closest("section, div, p");
                if (wrapper) {
                    (wrapper as HTMLElement).style.textAlign = "center";
                }
            }
        });
        toolbar.appendChild(centerBtn);
    }

    // ─────────────────────────────────────────
    // 编辑器事件
    // ─────────────────────────────────────────

    private setupEditorEvents(): void {
        if (!this.editorEl || !this.imageToolbar) return;

        // 图片点击 → 显示浮动工具条
        this.editorEl.addEventListener("click", (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.tagName === "IMG") {
                this.activeImage = target as HTMLImageElement;
                this.showImageToolbar(target);
            } else {
                this.hideImageToolbar();
            }

            // 魔法刷子逻辑
            if (this.formatBrushActive) {
                this.handleFormatBrush(target);
            }
        });

        // Editor → MD 同步（启用：turndown 已有自定义规则处理）
        this.editorEl.addEventListener("input", () => {
            this.isDirty = true;
            this.debouncedSyncToFile();
        });

        // 点击编辑器外部时隐藏图片工具条
        this.containerEl.addEventListener("click", (e: MouseEvent) => {
            if (this.imageToolbar && !this.imageToolbar.contains(e.target as Node) &&
                !(e.target as HTMLElement)?.closest(".wechat-editor-content")) {
                this.hideImageToolbar();
            }
        });
    }

    private showImageToolbar(img: HTMLElement): void {
        if (!this.imageToolbar) return;
        this.imageToolbar.style.display = "flex";
        const rect = img.getBoundingClientRect();
        const containerRect = this.containerEl.getBoundingClientRect();
        this.imageToolbar.style.top = `${rect.top - containerRect.top - 40}px`;
        this.imageToolbar.style.left = `${rect.left - containerRect.left + rect.width / 2 - 150}px`;
    }

    private hideImageToolbar(): void {
        if (this.imageToolbar) {
            this.imageToolbar.style.display = "none";
        }
        this.activeImage = null;
    }

    // ─────────────────────────────────────────
    // 魔法刷子
    // ─────────────────────────────────────────

    private toggleFormatBrush(btn: HTMLButtonElement): void {
        this.formatBrushActive = !this.formatBrushActive;
        if (this.formatBrushActive) {
            btn.style.background = "#667eea";
            btn.style.color = "#fff";
            this.formatBrushStyle = null;
            this.formatBrushTag = null;
            // 记录当前选中元素的样式
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const el = range.startContainer.parentElement;
                if (el) {
                    this.formatBrushStyle = el.style.cssText;
                    this.formatBrushTag = el.tagName;
                }
            }
            new Notice("🪄 格式已采集，点击目标文字应用样式");
        } else {
            btn.style.background = "";
            btn.style.color = "";
            this.formatBrushStyle = null;
            this.formatBrushTag = null;
        }
    }

    private handleFormatBrush(target: HTMLElement): void {
        if (!this.formatBrushStyle) {
            // 第一次点击：采集样式
            this.formatBrushStyle = target.style.cssText;
            this.formatBrushTag = target.tagName;
            new Notice("🪄 格式已采集，点击目标文字应用样式");
        } else {
            // 第二次点击：应用样式
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const el = range.startContainer.parentElement;
                if (el && this.formatBrushStyle) {
                    el.style.cssText = this.formatBrushStyle;
                }
            } else {
                target.style.cssText = this.formatBrushStyle;
            }
            // 重置
            this.formatBrushActive = false;
            this.formatBrushStyle = null;
            this.formatBrushTag = null;
            // 重置按钮
            const brushBtn = this.toolbarEl?.querySelector("[title*='格式刷']") as HTMLButtonElement;
            if (brushBtn) {
                brushBtn.style.background = "";
                brushBtn.style.color = "";
            }
            new Notice("✅ 格式已应用");
        }
    }

    // ─────────────────────────────────────────
    // 渲染
    // ─────────────────────────────────────────

    private getOpenMarkdownFile(): TFile | null {
        for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
            const view = leaf.view;
            if (view instanceof MarkdownView && view.file?.extension === "md") {
                return view.file;
            }
        }
        return null;
    }

    private getCurrentMarkdownFile(): TFile | null {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile instanceof TFile && activeFile.extension === "md") {
            return activeFile;
        }

        if (this.currentFilePath) {
            const currentFile = this.app.vault.getAbstractFileByPath(this.currentFilePath);
            if (currentFile instanceof TFile && currentFile.extension === "md") {
                return currentFile;
            }
        }

        return this.getOpenMarkdownFile();
    }

    async renderFromActiveFile(): Promise<void> {
        const activeFile = this.getCurrentMarkdownFile();
        if (!activeFile) {
            if (this.editorEl) {
                this.editorEl.innerHTML = `<p style="color: #999; text-align: center; padding: 40px;">请打开一个 Markdown 文件</p>`;
            }
            this.currentFilePath = null;
            this.cachedFrontmatter = "";
            return;
        }

        // 记录当前渲染的文件路径
        this.currentFilePath = activeFile.path;

        try {
            const markdown = await this.app.vault.read(activeFile);

            // 缓存 frontmatter（写回时需要拼接）
            const fmMatch = markdown.match(/^---\n[\s\S]*?\n---\n*/);
            this.cachedFrontmatter = fmMatch ? fmMatch[0] : "";

            const baseTheme = applyOverrides(getTheme(this.currentThemeName), this.overrides);
            const theme = applyFontFamily(baseTheme, this.plugin.settings.fontFamily);
            let html = await convertMarkdown(markdown, theme);

            // 始终将本地图片转 base64，确保编辑器中能显示
            html = await processImagesInHtml(this.app, html, activeFile.path);

            if (this.editorEl) {
                // 保存光标位置
                const sel = window.getSelection();
                let savedOffset = -1;
                let savedNode: Node | null = null;
                if (sel && sel.rangeCount > 0 && this.editorEl.contains(sel.anchorNode)) {
                    savedOffset = sel.anchorOffset;
                    savedNode = sel.anchorNode;
                }

                this.editorEl.innerHTML = html;

                // 渲染完成后重置 dirty flag，避免渲染触发的 input 事件写回
                this.isDirty = false;
            }
        } catch (error) {
            console.error("[WeChat Editor] Render error:", error);
            if (this.editorEl) {
                this.editorEl.innerHTML = `<p style="color: red;">渲染失败: ${error}</p>`;
            }
        }
    }

    // ─────────────────────────────────────────
    // Editor → MD 同步
    // ─────────────────────────────────────────

    private async syncEditorToFile(): Promise<void> {
        if (!this.editorEl || !this.currentFilePath || !this.isDirty) {
            return;
        }
        this.isDirty = false;

        const activeFile = this.app.vault.getAbstractFileByPath(this.currentFilePath);
        if (!activeFile || !(activeFile instanceof TFile)) {
            console.log("[WeChat Editor] syncEditorToFile: file not found:", this.currentFilePath);
            return;
        }

        try {
            // 将编辑器 HTML 转换为 Markdown
            const html = this.editorEl.innerHTML;
            console.log("[WeChat Editor] syncEditorToFile: converting HTML, length:", html.length);
            const markdown = htmlToMarkdown(html);
            console.log("[WeChat Editor] syncEditorToFile: converted MD, length:", markdown.length);

            // 拼接 frontmatter
            const fullContent = this.cachedFrontmatter + markdown;

            // 设置防循环锁，写入文件
            this.isSelfUpdate = true;
            await this.app.vault.modify(activeFile, fullContent);
            console.log("[WeChat Editor] syncEditorToFile: file written successfully");

            // 延迟解锁，确保 modify 事件已触发并被忽略
            setTimeout(() => {
                this.isSelfUpdate = false;
            }, 100);
        } catch (error) {
            this.isSelfUpdate = false;
            console.error("[WeChat Editor] syncEditorToFile error:", error);
        }
    }

    // ─────────────────────────────────────────
    // 复制到剪贴板
    // ─────────────────────────────────────────

    private async copyToClipboard(): Promise<void> {
        if (!this.editorEl) return;

        try {
            let htmlContent = this.editorEl.innerHTML;

            // 尝试将图片上传到微信 CDN（需要已配置公众号账户）
            const accounts = this.plugin.settings.wechatAccounts || [];
            const account = accounts.find((a) => a.id === this.plugin.settings.defaultAccountId) || accounts[0];
            const activeFile = this.getCurrentMarkdownFile();

            if (account?.appId && account?.appSecret && activeFile) {
                try {
                    new Notice("⏳ 正在上传图片到微信...");
                    const {
                        applyDefaultProxyToAccount,
                        getAccessToken,
                        processHtmlImagesForWechat,
                    } = await import("./wechat-publisher");
                    const proxyAccount = applyDefaultProxyToAccount(account);
                    const token = await getAccessToken(
                        proxyAccount.appId,
                        proxyAccount.appSecret,
                        proxyAccount.proxyUrl,
                        proxyAccount.proxyKey
                    );
                    const result = await processHtmlImagesForWechat(
                        this.app,
                        htmlContent,
                        activeFile.path,
                        token,
                        proxyAccount.proxyUrl,
                        proxyAccount.proxyKey
                    );
                    htmlContent = result.html;
                    if (result.imageCount > 0) {
                        new Notice(`✅ ${result.imageCount} 张图片已上传到微信`);
                    }
                    if (result.warnings.length > 0) {
                        console.warn("[WeChat Editor] 图片上传警告:", result.warnings);
                    }
                } catch (uploadError) {
                    console.warn("[WeChat Editor] 图片上传失败，使用 base64:", uploadError);
                    new Notice("⚠️ 图片上传失败，将使用本地图片复制");
                }
            }

            const { clipboard } = require("electron") as {
                clipboard: { write: (data: { html?: string; text?: string }) => void };
            };

            clipboard.write({
                html: htmlContent,
                text: this.editorEl.innerText,
            });

            new Notice("✅ 已复制到剪贴板，可直接粘贴到公众号编辑器");
        } catch (error) {
            new Notice(`❌ 复制失败: ${error}`);
        }
    }

    // ─────────────────────────────────────────
    // 发布草稿
    // ─────────────────────────────────────────

    private async publishDraft(): Promise<void> {
        if (!this.editorEl) return;

        const accounts = this.plugin.settings.wechatAccounts || [];
        if (accounts.length === 0) {
            new Notice("❌ 请先在设置中配置微信公众号账户");
            return;
        }

        const activeFile = this.getCurrentMarkdownFile();
        if (!activeFile) {
            new Notice("❌ 请先打开一个 Markdown 文件");
            return;
        }

        // 选择账户
        let account = accounts.find((a) => a.id === this.plugin.settings.defaultAccountId) || accounts[0];
        const htmlContent = this.editorEl.innerHTML;
        const plainText = this.editorEl.innerText;

        new Notice("⏳ 正在发布到微信草稿箱...");

        try {
            const { applyDefaultProxyToAccount, publishToDraft } = await import("./wechat-publisher");
            account = applyDefaultProxyToAccount(account);

            // 解析 frontmatter
            const markdown = await this.app.vault.read(activeFile);
            const { wechatMeta } = preprocessObsidian(markdown);
            const author = wechatMeta.author;
            const digest = wechatMeta.digest;

            const result = await publishToDraft(
                this.app,
                account,
                htmlContent,
                activeFile.path,
                {
                    title: activeFile.basename,
                    author,
                    digest,
                }
            );

            new Notice(
                `✅ 草稿发布成功！\n📄 ${result.title}\n🖼️ ${result.imageCount} 张图片`,
                8000
            );

            // 发布成功后在系统默认浏览器打开公众号草稿箱
            try {
                const { shell } = require("electron");
                shell.openExternal("https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_list&action=list_card&type=10&sub_type=3&lang=zh_CN");
            } catch {
                // fallback
                window.open("https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_list&action=list_card&type=10&sub_type=3&lang=zh_CN");
            }

            if (result.warnings.length > 0) {
                console.warn("[WeChat Editor] Publish warnings:", result.warnings);
                new Notice(`⚠️ 发布成功，但有 ${result.warnings.length} 项警告（详见控制台）`, 6000);
            }
        } catch (error) {
            console.error("[WeChat Editor] Publish error:", error);
            const errText = String(error);
            if (/40164|invalid ip|IP 白名单|当前公网 IP/i.test(errText)) {
                try {
                    const { clipboard, shell } = require("electron");
                    clipboard.write({
                        html: htmlContent,
                        text: plainText,
                    });
                    await shell.openExternal("https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&isNew=1&type=10&lang=zh_CN");
                    new Notice(`⚠️ 微信 API 被 IP 白名单拦截。当前账号: ${account.name || account.appId}；Proxy: ${account.proxyUrl || "未配置"}；错误: ${errText}`, 20000);
                    return;
                } catch (fallbackError) {
                    console.error("[WeChat Editor] IP whitelist fallback failed:", fallbackError);
                }
            }
            new Notice(`❌ 发布失败: ${error}`);
        }
    }

    // ─────────────────────────────────────────
    // 工具方法
    // ─────────────────────────────────────────

    private createToolGroup(parent: HTMLElement, label: string): HTMLDivElement {
        const group = parent.createDiv();
        group.style.cssText = "display: flex; align-items: center; gap: 3px;";
        const lbl = group.createSpan({ text: label });
        lbl.style.cssText = "font-size: 10px; color: #aaa; margin-right: 2px; writing-mode: vertical-lr; text-orientation: mixed; letter-spacing: 1px;";
        return group;
    }

    private createToolBtn(parent: HTMLElement, text: string, title: string, onClick: () => void): HTMLButtonElement {
        const btn = document.createElement("button");
        btn.textContent = text;
        btn.title = title;
        btn.style.cssText = "font-size: 12px; padding: 3px 8px; border: 1px solid #ddd; border-radius: 4px; background: #fff; cursor: pointer; min-width: 28px; text-align: center; transition: all 0.15s;";
        btn.addEventListener("mouseenter", () => { btn.style.background = "#e8e8e8"; });
        btn.addEventListener("mouseleave", () => { if (!btn.style.color || btn.style.color === "") btn.style.background = "#fff"; });
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            onClick();
        });
        parent.appendChild(btn);
        return btn;
    }

    private addSeparator(parent: HTMLElement): void {
        const sep = parent.createDiv();
        sep.style.cssText = "width: 1px; height: 20px; background: #ddd; margin: 0 4px;";
    }

    private applyToSelection(fn: (el: HTMLElement) => void): void {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);
        if (range.collapsed) return;

        // 将选区包裹在 span 中
        const span = document.createElement("span");
        try {
            range.surroundContents(span);
            fn(span);
        } catch {
            // 如果跨元素选择导致 surroundContents 失败，回退
            const el = range.startContainer.parentElement;
            if (el) fn(el);
        }
    }

    // ─────────────────────────────────────────
    // 注入 CSS
    // ─────────────────────────────────────────

    private injectStyles(container: HTMLElement): void {
        const style = document.createElement("style");
        style.textContent = `
            /* ═══ Premium 工具栏 ═══ */
            .wechat-editor-toolbar {
                background: linear-gradient(180deg, #fafbfc 0%, #f0f2f5 100%) !important;
                border-bottom: 1px solid #e4e8eb !important;
                box-shadow: 0 1px 3px rgba(0,0,0,0.04) !important;
                padding: 6px 10px !important;
            }
            .wechat-editor-toolbar button {
                font-size: 12px !important;
                padding: 2px 6px !important;
                border: none !important;
                border-radius: 4px !important;
                background: transparent !important;
                cursor: pointer !important;
                min-width: 24px !important;
                height: 26px !important;
                color: #505050 !important;
                transition: all 0.15s !important;
                line-height: 1 !important;
            }
            .wechat-editor-toolbar button:hover {
                background: #e8f0fe !important;
                color: #1a73e8 !important;
            }
            .wechat-editor-toolbar button:active {
                transform: scale(0.95);
            }
            /* 发布按钮特殊样式 */
            .wechat-editor-toolbar button[title='发布到微信草稿箱'] {
                background: #07c160 !important;
                color: #fff !important;
                font-weight: 600 !important;
                padding: 2px 12px !important;
                border-radius: 6px !important;
                box-shadow: 0 2px 6px rgba(7,193,96,0.3) !important;
            }
            .wechat-editor-toolbar button[title='发布到微信草稿箱']:hover {
                background: #06ae56 !important;
                color: #fff !important;
                box-shadow: 0 3px 10px rgba(7,193,96,0.4) !important;
            }
            /* 复制按钮 */
            .wechat-editor-toolbar button[title='复制到剪贴板'] {
                background: #f0f9eb !important;
                color: #52c41a !important;
                font-weight: 500 !important;
            }
            /* 下拉选择框 */
            .wechat-editor-toolbar select {
                font-size: 11px !important;
                padding: 2px 4px !important;
                border: 1px solid #e4e8eb !important;
                border-radius: 4px !important;
                background: #fff !important;
                cursor: pointer !important;
                height: 26px !important;
                color: #505050 !important;
                transition: border-color 0.15s !important;
                outline: none !important;
            }
            .wechat-editor-toolbar select:hover {
                border-color: #1a73e8 !important;
            }
            /* 颜色/高亮按钮包裹 */
            .wechat-editor-toolbar input[type='color'] {
                cursor: pointer !important;
            }
            /* 分隔线 */
            .wechat-editor-toolbar > div > div:not([class]) {
                background: #e0e3e7 !important;
            }
            /* ═══ 编辑器 ═══ */
            .wechat-editor-content:focus {
                outline: none;
            }
            .wechat-editor-content img {
                cursor: pointer;
                transition: outline 0.15s;
            }
            .wechat-editor-content img:hover {
                outline: 2px solid #1a73e8;
                outline-offset: 2px;
            }
            /* 滚动条美化 */
            .wechat-editor-wrapper::-webkit-scrollbar {
                width: 6px;
            }
            .wechat-editor-wrapper::-webkit-scrollbar-thumb {
                background: #c1c1c1;
                border-radius: 3px;
            }
            .wechat-editor-wrapper::-webkit-scrollbar-track {
                background: transparent;
            }
        `;
        container.prepend(style);
    }

    /**
     * 获取当前编辑器中的 HTML 内容
     */
    getEditorHtml(): string {
        return this.editorEl?.innerHTML || "";
    }
}
