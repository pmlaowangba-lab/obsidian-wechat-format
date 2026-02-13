/**
 * Markdown → 微信公众号 HTML 转换引擎
 * 使用 marked 自定义 renderer，所有样式直接内联
 */
import { Marked, Renderer, Tokens } from "marked";
import hljs from "highlight.js";
import { WechatTheme } from "./themes";

/**
 * 规范化 Markdown 图片目标路径：
 * 含空格等特殊字符时用尖括号包裹，确保 marked 能正确识别为图片链接。
 */
function normalizeMarkdownImageDestination(path: string): string {
    const trimmedPath = path.trim();
    if (!trimmedPath) return trimmedPath;

    // 已是 <...> 形式时保持原样
    if (trimmedPath.startsWith("<") && trimmedPath.endsWith(">")) {
        return trimmedPath;
    }

    // 对包含空白字符的本地路径使用 <...> 包裹
    if (/\s/.test(trimmedPath)) {
        return `<${trimmedPath}>`;
    }

    return trimmedPath;
}

/**
 * 预处理 Obsidian 特殊语法
 */
export function preprocessObsidian(markdown: string): {
    content: string;
    footnotes: { index: number; url: string; text: string }[];
} {
    let content = markdown;
    const footnotes: { index: number; url: string; text: string }[] = [];
    let footnoteIndex = 0;

    // 移除 YAML frontmatter
    content = content.replace(/^---[\s\S]*?---\n*/m, "");

    // 优先处理图片嵌入: ![[image.png]] → ![image.png](image.png)
    // 必须在处理 [[link]] 之前，否则 ![[image]] 会被误判为 !image
    content = content.replace(/!\[\[([^\]]+?)\]\]/g, (_match, path) => {
        // 处理尺寸: ![[image.png|300]]
        const parts = path.split("|");
        const imagePath = parts[0].trim();
        const normalizedImagePath = normalizeMarkdownImageDestination(imagePath);
        if (parts.length > 1 && /^\d+$/.test(parts[1].trim())) {
            return `![${imagePath}](${normalizedImagePath})`;
        }
        return `![${imagePath}](${normalizedImagePath})`;
    });

    // 处理 Wikilinks: [[link|display]] → display, [[link]] → link
    content = content.replace(
        /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g,
        (_match, link, display) => {
            return display || link;
        }
    );

    // 处理 Callout blocks: > [!NOTE] title → 特殊标记
    content = content.replace(
        /^(>\s*)\[!(\w+)\]\s*(.*?)$\n((?:>.*\n?)*)/gm,
        (_match, _prefix, type, title, body) => {
            const bodyText = body
                .replace(/^>\s?/gm, "")
                .trim();
            const calloutTitle = title || type.charAt(0).toUpperCase() + type.slice(1);
            return `\n<!--CALLOUT_START:${type}:${calloutTitle}-->\n${bodyText}\n<!--CALLOUT_END-->\n`;
        }
    );

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

    return { content, footnotes };
}

/**
 * 创建自定义 marked renderer
 */
function createRenderer(theme: WechatTheme): Renderer {
    const renderer = new Renderer();

    // 标题
    renderer.heading = function (text, level) {
        const styleKey = `h${Math.min(level, 4)}` as "h1" | "h2" | "h3" | "h4";
        const style = theme.styles[styleKey] || theme.styles.h4;
        return `<h${level} style="${style}">${text}</h${level}>\n`;
    };

    // 段落
    renderer.paragraph = function (text) {
        // 检查是否是 Callout 标记
        if (text.includes("<!--CALLOUT_START:")) {
            return text;
        }
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
        let imgHtml = `<section style="${theme.styles.imgWrapper}">`;
        imgHtml += `<img src="${href}" alt="${alt}" style="${theme.styles.img}" />`;
        if (alt && alt !== href) {
            imgHtml += `<p style="${theme.styles.imgCaption}">${alt}</p>`;
        }
        imgHtml += `</section>`;
        return imgHtml;
    };

    // 无序/有序列表
    renderer.list = function (body, ordered, start) {
        const tag = ordered ? "ol" : "ul";
        const style = ordered ? theme.styles.ol : theme.styles.ul;
        const startAttr = (ordered && start !== 1) ? ` start="${start}"` : "";

        // 简单替换 li 样式
        const styledBody = body.replace(/<li>/g, `<li style="${theme.styles.li}">`);

        return `<${tag}${startAttr} style="${style}">${styledBody}</${tag}>\n`;
    };

    // 行内代码
    renderer.codespan = function (text) {
        return `<code style="${theme.styles.codeInline}">${text}</code>`;
    };

    // 代码块
    renderer.code = function (code, infostring, escaped) {
        const lang = (infostring || "").match(/\S*/)?.[0] || "";
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
            ? `<span style="position:absolute;top:6px;right:12px;font-size:12px;color:#888;">${lang}</span>`
            : "";
        return `<pre style="${theme.styles.codePre}; position:relative;">${langLabel}<code style="${theme.styles.codeBlock}">${highlighted}</code></pre>\n`;
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
 * 处理 Callout 标记，替换为带样式的 HTML
 */
function processCallouts(html: string, theme: WechatTheme): string {
    const calloutIcons: Record<string, string> = {
        note: "📝",
        tip: "💡",
        important: "❗",
        warning: "⚠️",
        caution: "🔴",
        info: "ℹ️",
        example: "📋",
        quote: "💬",
        abstract: "📑",
        summary: "📑",
        todo: "☑️",
        success: "✅",
        question: "❓",
        failure: "❌",
        danger: "⛔",
        bug: "🐛",
    };

    return html.replace(
        /<!--CALLOUT_START:(\w+):(.+?)-->([\s\S]*?)<!--CALLOUT_END-->/g,
        (_match, type, title, body) => {
            const icon = calloutIcons[type.toLowerCase()] || "📌";
            const bodyHtml = body.trim();
            return `<section style="${theme.styles.calloutContainer}">
        <p style="${theme.styles.calloutTitle}">${icon} ${title}</p>
        <section style="${theme.styles.calloutContent}">${bodyHtml}</section>
      </section>`;
        }
    );
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
    // 1. 预处理 Obsidian 语法
    const { content, footnotes } = preprocessObsidian(markdown);

    // 2. 使用 marked 转换为 HTML
    const marked = new Marked();
    marked.use({
        renderer: createRenderer(theme),
        gfm: true,
        breaks: true,
    });
    let html = await marked.parse(content);

    // 3. 处理 Callout 块
    html = processCallouts(html, theme);

    // 4. 包裹全局样式容器
    html = `<section style="${theme.styles.body}">${html}</section>`;

    // 5. 添加脚注
    if (footnotes.length > 0) {
        html += generateFootnotes(footnotes, theme);
    }

    return html;
}
