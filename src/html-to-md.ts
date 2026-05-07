/**
 * HTML → Markdown 反向转换器
 * 将编辑器中的富文本 HTML 转换回 Markdown，
 * 处理自定义 h2 装饰模板、callout、代码块等特殊结构
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const TurndownService = require("turndown");

/**
 * 创建并配置 turndown 实例
 */
function createTurndownService(): any {
    const td = new TurndownService({
        headingStyle: "atx",
        hr: "---",
        bulletListMarker: "-",
        codeBlockStyle: "fenced",
        emDelimiter: "*",
        strongDelimiter: "**",
    });

    // ── 规则 1: h2 装饰模板 ──
    // converter.ts 生成的 h2 是 section>section+section+section 的 flex 布局
    td.addRule("h2-decorated", {
        filter: (node: HTMLElement) => {
            if (node.nodeName !== "SECTION") return false;
            const style = node.getAttribute("style") || "";
            return (
                style.includes("display:flex") &&
                style.includes("align-items:center") &&
                node.textContent?.includes("PART") === true
            );
        },
        replacement: (_content: string, node: HTMLElement) => {
            const sections = node.querySelectorAll(":scope > section");
            const lastSection = sections[sections.length - 1];
            const titleP = lastSection?.querySelector("p");
            const title = titleP?.textContent?.trim() || node.textContent?.replace(/\d+PART/g, "").trim() || "";
            return `\n## ${title}\n\n`;
        },
    });

    // ── 规则 2: Callout blocks ──
    td.addRule("callout-block", {
        filter: (node: HTMLElement) => {
            if (node.nodeName !== "SECTION") return false;
            const style = node.getAttribute("style") || "";
            return (
                style.includes("border-left:3px solid") &&
                style.includes("border-radius:8px") &&
                style.includes("padding:16px")
            );
        },
        replacement: (_content: string, node: HTMLElement) => {
            const titleP = node.querySelector(":scope > p");
            const titleText = titleP?.textContent?.trim() || "";
            const typeMap: Record<string, string> = {
                "📝": "note", "💡": "tip", "❗": "important",
                "⚠️": "warning", "🔴": "caution", "ℹ️": "info",
                "📋": "example", "💬": "quote", "📑": "abstract",
                "☑️": "todo", "✅": "success", "❓": "question",
                "❌": "failure", "⛔": "danger", "🐛": "bug", "📌": "note",
            };
            let calloutType = "note";
            let cleanTitle = titleText;
            for (const [icon, type] of Object.entries(typeMap)) {
                if (titleText.startsWith(icon)) {
                    calloutType = type;
                    cleanTitle = titleText.slice(icon.length).trim();
                    break;
                }
            }
            const bodySection = node.querySelector(":scope > section");
            const bodyPs = bodySection ? bodySection.querySelectorAll("p") : [];
            const bodyLines: string[] = [];
            bodyPs.forEach((p: Element) => {
                const text = p.textContent?.trim() || "";
                if (text) bodyLines.push(`> ${text}`);
            });
            const header = `> [!${calloutType}] ${cleanTitle}`;
            const body = bodyLines.join("\n");
            return `\n${header}\n${body}\n\n`;
        },
    });

    // ── 规则 3: 代码块 (带 macOS headerBar 的 pre) ──
    td.addRule("code-block-custom", {
        filter: (node: HTMLElement) => {
            if (node.nodeName !== "PRE") return false;
            const firstChild = node.firstElementChild;
            return firstChild?.nodeName === "SECTION" && (firstChild.getAttribute("style") || "").includes("border-radius:8px 8px 0 0");
        },
        replacement: (_content: string, node: HTMLElement) => {
            const langSpan = node.querySelector("section > span:last-child");
            const lang = langSpan?.textContent?.trim() || "";
            const codeEl = node.querySelector("code");
            const code = codeEl?.textContent || "";
            return `\n\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
        },
    });

    // ── 规则 4: 脚注 section → 忽略 ──
    td.addRule("footnote-section", {
        filter: (node: HTMLElement) => {
            if (node.nodeName !== "SECTION") return false;
            const style = node.getAttribute("style") || "";
            return style.includes("border-top") && (node.textContent?.includes("参考链接") === true);
        },
        replacement: () => "",
    });

    // ── 规则 5: sup 脚注标记 → 忽略 ──
    td.addRule("footnote-sup", {
        filter: (node: HTMLElement) => {
            return node.nodeName === "SUP" && /^\[\d+\]$/.test(node.textContent || "");
        },
        replacement: () => "",
    });

    // ── 规则 6: mark 高亮 → ==text== ──
    td.addRule("highlight-mark", {
        filter: "mark" as any,
        replacement: (content: string) => `==${content}==`,
    });

    // ── 规则 7: 图片 wrapper section ──
    td.addRule("img-wrapper", {
        filter: (node: HTMLElement) => {
            if (node.nodeName !== "SECTION") return false;
            const style = node.getAttribute("style") || "";
            return style.includes("text-align: center") && !!node.querySelector("img");
        },
        replacement: (_content: string, node: HTMLElement) => {
            const img = node.querySelector("img");
            if (!img) return "";
            const src = img.getAttribute("src") || "";
            const alt = img.getAttribute("alt") || "";
            return `\n![${alt}](${src})\n\n`;
        },
    });

    // ── 规则 8: 外层 body section → 直接穿透 ──
    td.addRule("body-wrapper", {
        filter: (node: HTMLElement) => {
            if (node.nodeName !== "SECTION") return false;
            const parent = node.parentElement;
            if (!parent) return false;
            const style = node.getAttribute("style") || "";
            return (
                parent.getAttribute("contenteditable") === "true" &&
                (style.includes("font-family") || style.includes("word-break"))
            );
        },
        replacement: (content: string) => content,
    });

    // ── 规则 9: inline code ──
    td.addRule("inline-code", {
        filter: (node: HTMLElement) => {
            return node.nodeName === "CODE" && !(node.parentNode && node.parentNode.nodeName === "PRE");
        },
        replacement: (content: string) => `\`${content}\``,
    });

    // ── 规则 10: em 特殊处理 ──
    td.addRule("em-custom", {
        filter: (node: HTMLElement) => {
            if (node.nodeName !== "EM") return false;
            const style = node.getAttribute("style") || "";
            return style.includes("font-style: normal") || style.includes("border-bottom");
        },
        replacement: (content: string) => `*${content}*`,
    });

    return td;
}

// 单例缓存
let _tdInstance: any = null;

function getTurndownService(): any {
    if (!_tdInstance) {
        _tdInstance = createTurndownService();
    }
    return _tdInstance;
}

/**
 * 将编辑器 HTML 转换为 Markdown
 */
export function htmlToMarkdown(html: string): string {
    const td = getTurndownService();
    let md = td.turndown(html);

    // 后处理：清理多余空行
    md = md.replace(/\n{3,}/g, "\n\n");
    md = md.trim() + "\n";

    return md;
}
