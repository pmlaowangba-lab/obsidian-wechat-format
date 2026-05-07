/**
 * Markdown → 微信公众号 HTML 转换引擎
 * 使用 marked 自定义 renderer，所有样式直接内联
 */
import { Marked, Renderer, Tokens } from "marked";
import hljs from "highlight.js";
import { WechatTheme } from "./themes";

/**
 * 微信 Frontmatter 元数据
 */
export interface WechatFrontmatter {
    author?: string;
    digest?: string;
    account?: string;
}

/**
 * 解析 YAML frontmatter 中的 wechat 字段
 */
function parseFrontmatter(markdown: string): WechatFrontmatter {
    const match = markdown.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};
    const fm = match[1];
    const meta: WechatFrontmatter = {};
    const authorMatch = fm.match(/wechat_author:\s*["']?(.+?)["']?\s*$/m);
    const digestMatch = fm.match(/wechat_digest:\s*["']?(.+?)["']?\s*$/m);
    const accountMatch = fm.match(/wechat_account:\s*["']?(.+?)["']?\s*$/m);
    if (authorMatch) meta.author = authorMatch[1];
    if (digestMatch) meta.digest = digestMatch[1];
    if (accountMatch) meta.account = accountMatch[1];
    return meta;
}

/**
 * 预处理 Obsidian 特殊语法
 */
export function preprocessObsidian(markdown: string, theme?: WechatTheme): {
    content: string;
    footnotes: { index: number; url: string; text: string }[];
    wechatMeta: WechatFrontmatter;
} {
    let content = markdown;
    // 统一换行符（Windows \r\n → \n）
    content = content.replace(/\r\n/g, "\n");
    const footnotes: { index: number; url: string; text: string }[] = [];
    let footnoteIndex = 0;

    // 解析 frontmatter
    const wechatMeta = parseFrontmatter(content);

    // 移除 YAML frontmatter（不使用 m 标志，^ 只匹配字符串开头，避免误吞 --- hr 分隔线）
    content = content.replace(/^---\n[\s\S]*?\n---\n*/, "");

    // 优先处理图片嵌入: ![[image.png]] → ![image.png](encoded_path)
    // 必须在处理 [[link]] 之前，否则 ![[image]] 会被误判为 !image
    content = content.replace(/!\[\[([^\]]+?)\]\]/g, (_match, path) => {
        // 处理尺寸: ![[image.png|300]]
        const parts = path.split("|");
        const imagePath = parts[0].trim();
        // URL-encode 路径（空格→%20），marked 才能正确解析
        const encodedPath = encodeURI(imagePath);
        return `![${imagePath}](${encodedPath})`;
    });

    // 处理标准 markdown 图片中路径含空格的情况
    // ![alt](Pasted image xxx.png) → ![alt](Pasted%20image%20xxx.png)
    content = content.replace(
        /!\[([^\]]*)\]\(([^)]*\s[^)]*)\)/g,
        (_match, alt, path) => {
            const encodedPath = encodeURI(path.trim());
            return `![${alt}](${encodedPath})`;
        }
    );

    // 处理 Wikilinks: [[link|display]] → display, [[link]] → link
    content = content.replace(
        /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g,
        (_match, link, display) => {
            return display || link;
        }
    );


    // Callout 图标和颜色
    const calloutIcons: Record<string, string> = {
        note: "📝", tip: "💡", important: "❗", warning: "⚠️", caution: "🔴",
        info: "ℹ️", example: "📋", quote: "💬", abstract: "📑", summary: "📑",
        todo: "☑️", success: "✅", question: "❓", failure: "❌", danger: "⛔", bug: "🐛",
    };
    const calloutColors: Record<string, string> = {
        note: "#3B82F6", info: "#3B82F6", abstract: "#3B82F6", summary: "#3B82F6",
        todo: "#3B82F6", tip: "#10B981", success: "#10B981", important: "#F59E0B",
        warning: "#F59E0B", question: "#F59E0B", caution: "#EF4444", danger: "#EF4444",
        bug: "#EF4444", failure: "#EF4444", example: "#8B5CF6", quote: "#6B7280",
    };

    // 简易 markdown→HTML 内联转换（用于 callout body）
    function inlineMarkdown(text: string): string {
        return text
            // 先用占位符保护链接（避免 HTML 转义破坏）
            .replace(/<(https?:\/\/[^>]+)>/g, '%%LINK%%$1%%ENDLINK%%')
            .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '%%LINK%%$1%%ENDLINK%%')
            .replace(/(^|\s)(https?:\/\/[^\s<>]+)/g, '$1%%LINK%%$2%%ENDLINK%%')
            // autolink 已用占位符保护，不再需要全局 HTML 转义
            // markdown 内联格式
            .replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:700;color:#111827;">$1</strong>')
            .replace(/`([^`]+)`/g, '<code style="background:#F3F4F6;padding:2px 6px;border-radius:3px;font-size:13px;color:#059669;">$1</code>')
            .replace(/==(.+?)==/g, '<mark style="background:linear-gradient(to right,#D1FAE5,#ECFDF5,transparent);padding:2px 4px;">$1</mark>')
            // 还原链接占位符为带颜色的 span
            .replace(/%%LINK%%(.+?)%%ENDLINK%%/g, '<span style="color:#1a73e8;text-decoration:underline;word-break:break-all;">$1</span>');
    }

    function createFencedCodeBlock(text: string, lang = "text"): string {
        let maxInnerFenceLength = 0;
        const fenceRegex = /`+/g;
        let fenceMatch: RegExpExecArray | null;
        while ((fenceMatch = fenceRegex.exec(text)) !== null) {
            maxInnerFenceLength = Math.max(maxInnerFenceLength, fenceMatch[0].length);
        }
        const fence = "`".repeat(Math.max(3, maxInnerFenceLength + 1));
        return `${fence}${lang}\n${text}\n${fence}`;
    }

    // 处理 Callout blocks — 逐行解析，直接生成最终 HTML
    const lines = content.split("\n");
    const outputLines: string[] = [];
    let i = 0;
    while (i < lines.length) {
        const calloutMatch = lines[i].match(/^>\s*\[!(\w+)\][-+]?\s*(.*)/);
        if (calloutMatch) {
            const type = calloutMatch[1].toLowerCase();
            const title = calloutMatch[2].trim() || type.charAt(0).toUpperCase() + type.slice(1);
            const bodyLines: string[] = [];
            i++;
            while (i < lines.length && /^>\s?/.test(lines[i])) {
                const stripped = lines[i].replace(/^>\s?/, "");
                const nestedMatch = stripped.match(/^>\s*\[!(\w+)\][-+]?\s*(.*)/);
                if (nestedMatch) {
                    const nestedTitle = nestedMatch[2].trim() || nestedMatch[1];
                    bodyLines.push(`**⚠️ ${nestedTitle}**`);
                    i++;
                    while (i < lines.length && /^>\s*>/.test(lines[i])) {
                        bodyLines.push(lines[i].replace(/^>\s*>\s?/, ""));
                        i++;
                    }
                } else {
                    bodyLines.push(stripped);
                    i++;
                }
            }
            // 将 body 转为 HTML 段落
            const bodyText = bodyLines.join("\n").trim();
            const bodyParagraphs = bodyText.split(/\n\n+/).filter(p => p.trim());
            const bodyHtml = bodyParagraphs
                .map(p => {
                    const trimmed = p.trim();
                    if (!trimmed) return "";
                    const html = inlineMarkdown(trimmed).replace(/\n/g, "<br/>");
                    return `<p style="margin:6px 0;line-height:1.8;">${html}</p>`;
                })
                .join("");

            const icon = calloutIcons[type] || "📌";
            const color = calloutColors[type] || "#059669";

            // 直接输出完整 HTML — marked 会把独立 HTML 块原样保留
            outputLines.push("");
            if (theme?.name === "yuque") {
                // 语雀更稳定地识别代码块；callout 标题保留为正文，内容转为 text 代码块
                outputLines.push(title);
                outputLines.push("");
                outputLines.push(createFencedCodeBlock(bodyText || title));
            } else {
                // 其他微信主题：保留原有的 section 等复杂微信兼容标签
                const tColor = color; // fallback
                outputLines.push(`<section style="background:#fff;border:1px solid #E5E7EB;border-left:3px solid ${tColor};border-radius:8px;padding:16px 20px;margin:20px 0;">`);
                outputLines.push(`<p style="font-weight:700;font-size:15px;color:#111827;margin:0 0 8px 0;">${icon} ${inlineMarkdown(title)}</p>`);
                outputLines.push(`<section style="font-size:15px;color:#374151;line-height:1.8;">${bodyHtml}</section>`);
                outputLines.push(`</section>`);
            }
            outputLines.push("");
        } else {
            outputLines.push(lines[i]);
            i++;
        }
    }
    content = outputLines.join("\n");

    // 处理 Obsidian 高亮语法: ==text== → <mark>（放在 callout 处理之后，避免 callout 内 <mark> 被转义）
    content = content.replace(/==(.+?)==/g, '<mark style="background:linear-gradient(to right,#D1FAE5,#ECFDF5,transparent);padding:2px 4px;">$1</mark>');

    // 收集外部链接并转为脚注（公众号不支持外链点击）
    // 使用负向断言排除图片 ![]()
    content = content.replace(
        /(?<!!)\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
        (_match, text, url) => {
            footnoteIndex++;
            footnotes.push({ index: footnoteIndex, url, text });
            return `${text}<sup style="font-size:12px;color:#1a73e8;">[${footnoteIndex}]</sup>`;
        }
    );

    return { content, footnotes, wechatMeta };
}

/**
 * 创建自定义 marked renderer
 */
function createRenderer(theme: WechatTheme): Renderer {
    const renderer = new Renderer();

    // 标题 — h2 自动编号装饰
    let h2Counter = 0;
    renderer.heading = function (text, level) {
        if (level === 2 && theme.name !== "yuque") {
            h2Counter++;
            const num = String(h2Counter).padStart(2, "0");
            // 从 body 样式中提取 font-family，注入到 h2 模板
            const fontMatch = theme.styles.body.match(/font-family:\s*([^;]+);/);
            const fontFamily = fontMatch ? `font-family: ${fontMatch[1]};` : "";
            return `<section style="display:flex;align-items:center;margin:48px 0 24px 0;gap:16px;">
                <section style="text-align:center;line-height:1;">
                    <span style="font-size:32px;font-weight:900;color:#059669;letter-spacing:-1px;">${num}</span><br/>
                    <span style="font-size:10px;color:#9CA3AF;letter-spacing:3px;">PART</span>
                </section>
                <section style="width:2px;height:36px;background:#E5E7EB;"></section>
                <section style="flex:1;">
                    <p style="font-size:22px;font-weight:800;color:#111827;margin:0;line-height:1.3;${fontFamily}">${text}</p>
                </section>
            </section>\n`;
        }
        const styleKey = `h${Math.min(level, 4)}` as "h1" | "h2" | "h3" | "h4";
        const style = theme.styles[styleKey] || theme.styles.h4;
        return `<h${level} style="${style}">${text}</h${level}>\n`;
    };

    // 段落
    renderer.paragraph = function (text) {
        return `<p style="${theme.styles.p}">${text}</p>\n`;
    };

    // 加粗
    renderer.strong = function (text) {
        return `<strong style="${theme.styles.strong}">${text}</strong>`;
    };

    // 斜体
    renderer.em = function (text) {
        return `<em style="${theme.styles.em}">${text}</em>`;
    };

    // 删除线
    renderer.del = function (text) {
        return `<del style="${theme.styles.del}">${text}</del>`;
    };

    // 链接
    renderer.link = function (href, _title, text) {
        return `<span style="${theme.styles.link}">${text}</span>`;
    };

    // 图片
    renderer.image = function (href, _title, text) {
        const alt = text || "";
        // 不渲染图片标题（文件名），微信公众号图片不需要标题
        return `<section style="${theme.styles.imgWrapper}"><img src="${href}" alt="${alt}" style="${theme.styles.img}" /></section>`;
    };

    // 列表项 — 逐项清理 <p> 包裹（loose list 产生的）
    renderer.listitem = function (text) {
        const clean = text
            .replace(/<p[^>]*>/g, '')
            .replace(/<\/p>/g, '')
            .replace(/^\s+|\s+$/g, '')
            .replace(/<br\s*\/?>\s*$/g, '');
        return `<li style="${theme.styles.li}">${clean}</li>\n`;
    };

    // 无序/有序列表
    renderer.list = function (body, ordered, start) {
        const tag = ordered ? "ol" : "ul";
        const style = ordered ? theme.styles.ol : theme.styles.ul;
        const startAttr = (ordered && start !== 1) ? ` start="${start}"` : "";
        return `<${tag}${startAttr} style="${style}">${body}</${tag}>\n`;
    };

    // 行内代码
    renderer.codespan = function (text) {
        return `<code style="${theme.styles.codeInline}">${text}</code>`;
    };

    // 代码块
    renderer.code = function (code, infostring, escaped) {
        const lang = (infostring || "").match(/\S*/)?.[0] || "";

        if (theme.name === "yuque") {
            const safeLang = escapeHtml(lang || "text");
            return `<pre data-language="${safeLang}"><code class="language-${safeLang}">${escapeHtml(code)}</code></pre>\n`;
        }

        let highlighted: string;

        // 如果未转义，先转义？marked 传入的 code 通常是未转义的 content
        // 但如果 renderer.code 接收到的 escaped 为 true，则不需要转义？
        // marked v12: code(code, infostring, escaped)

        if (lang && hljs.getLanguage(lang)) {
            try {
                highlighted = hljs.highlight(code, { language: lang }).value;
            } catch {
                highlighted = escapeHtml(code);
            }
        } else {
            try {
                highlighted = hljs.highlightAuto(code).value;
            } catch {
                highlighted = escapeHtml(code);
            }
        }

        const langLabel = lang
            ? `<span style="font-size:11px;color:#9CA3AF;margin-left:auto;">${lang}</span>`
            : "";
        // 深色标题栏 + macOS 圆点
        const headerBar = `<section style="display:flex;align-items:center;gap:6px;background:#E5E7EB;padding:8px 12px;border-radius:8px 8px 0 0;margin:-16px -16px 12px -16px;"><span style="width:10px;height:10px;border-radius:50%;background:#FF5F57;display:inline-block;"></span><span style="width:10px;height:10px;border-radius:50%;background:#FEBC2E;display:inline-block;"></span><span style="width:10px;height:10px;border-radius:50%;background:#28C840;display:inline-block;"></span>${langLabel}</section>`;
        return `<pre style="${theme.styles.codePre}; position:relative;">${headerBar}<code style="${theme.styles.codeBlock}">${highlighted}</code></pre>\n`;
    };

    // 引用
    renderer.blockquote = function (quote) {
        const styledText = quote.replace(
            /<p style="[^"]*">/g,
            `<p style="${theme.styles.blockquoteP}">`
        );
        return `<blockquote style="${theme.styles.blockquote}">${styledText}</blockquote>\n`;
    };

    // 表格
    renderer.table = function (header, body) {
        let html = `<table style="${theme.styles.table}">`;

        // Header styling
        const styledHeader = header
            .replace(/<th>/g, `<th style="${theme.styles.th}">`);
        html += `<thead>${styledHeader}</thead>`;

        // Body styling - zebra striping is hard with regex, simplify to just td styling
        // We can try to split by <tr> to apply even styling if needed, but keeping it simple for now
        let styledBody = body
            .replace(/<td>/g, `<td style="${theme.styles.td}">`);

        // Zebra striping approximation: replace <tr> with <tr style> 
        // But we don't know index. Let's just apply td styles and ignore zebra for now or generic tr style
        // Or we can match all <tr> and replace with a counter function?
        // replace callback
        let rowIndex = 0;
        styledBody = styledBody.replace(/<tr>/g, () => {
            const style = (rowIndex++ % 2 === 1) ? ` style="${theme.styles.trEven}"` : "";
            return `<tr${style}>`;
        });

        html += `<tbody>${styledBody}</tbody></table>\n`;
        return html;
    };

    // 分割线
    renderer.hr = function () {
        return `<hr style="${theme.styles.hr}" />\n`;
    };

    return renderer;
}

/**
 * HTML 转义
 */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}



/**
 * 生成脚注 HTML
 */
function generateFootnotes(
    footnotes: { index: number; url: string; text: string }[],
    theme: WechatTheme
): string {
    if (footnotes.length === 0) return "";

    let html = `<section style="${theme.styles.footnoteSection}">`;
    html += `<p style="font-weight: bold; margin-bottom: 8px;">参考链接</p>`;
    for (const fn of footnotes) {
        html += `<p style="font-size: 13px; color: #888; margin: 4px 0; word-break: break-all;">[${fn.index}] ${fn.text}: ${fn.url}</p>`;
    }
    html += `</section>`;
    return html;
}

/**
 * 主转换函数：Markdown → 公众号 HTML
 */
export async function convertMarkdown(
    markdown: string,
    theme: WechatTheme
): Promise<string> {
    // 1. 预处理 Obsidian 语法（含 Callout 直接生成 HTML）
    const { content, footnotes } = preprocessObsidian(markdown, theme);

    // 2. 使用 marked 转换为 HTML（Callout 已是原始 HTML 块，marked 直接保留）
    const marked = new Marked();
    marked.use({
        renderer: createRenderer(theme),
        gfm: true,
        breaks: true,
    });
    let html = await marked.parse(content);

    // 3. 包裹全局样式容器
    html = `<section style="${theme.styles.body}">${html}</section>`;

    // 4. 添加脚注
    if (footnotes.length > 0) {
        html += generateFootnotes(footnotes, theme);
    }

    return html;
}
