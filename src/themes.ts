/**
 * 微信公众号文章主题样式
 * 10 款专业排版模板，所有样式直接内联到 HTML 元素的 style 属性
 */

export interface WechatTheme {
    name: string;
    label: string;
    styles: {
        body: string;
        h1: string;
        h2: string;
        h3: string;
        h4: string;
        p: string;
        strong: string;
        em: string;
        del: string;
        link: string;
        footnote: string;
        footnoteSection: string;
        ul: string;
        ol: string;
        li: string;
        blockquote: string;
        blockquoteP: string;
        codeInline: string;
        codePre: string;
        codeBlock: string;
        table: string;
        th: string;
        td: string;
        trEven: string;
        imgWrapper: string;
        img: string;
        imgCaption: string;
        hr: string;
        calloutContainer: string;
        calloutTitle: string;
        calloutContent: string;
    };
}

/**
 * 排版覆盖参数
 */
export interface ThemeOverrides {
    fontSize?: number;       // 正文字号 (14-17)
    lineHeight?: number;     // 行高 (1.6-2.0)
    paragraphSpacing?: number; // 段间距 (8-16)
    sidePadding?: number;    // 两侧间距 (0-32)
    accentColor?: string;    // 主色调
}

/**
 * 应用排版覆盖参数到主题
 */
export const FONT_FAMILY_PRESETS = {
    "theme-default": {
        label: "跟随主题",
        css: "",
    },
    pingfang: {
        label: "苹方",
        css: "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    },
    yahei: {
        label: "微软雅黑",
        css: "'Microsoft YaHei', 'PingFang SC', 'Hiragino Sans GB', sans-serif",
    },
    songti: {
        label: "宋体",
        css: "'STSong', 'Songti SC', 'SimSun', serif",
    },
    kaiti: {
        label: "楷体",
        css: "'Kaiti SC', 'STKaiti', 'KaiTi', serif",
    },
    system: {
        label: "系统默认",
        css: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    },
} as const;

export type FontFamilyPreset = keyof typeof FONT_FAMILY_PRESETS;

const FONT_STYLE_KEYS: Array<keyof WechatTheme["styles"]> = [
    "body",
    "h1",
    "h2",
    "h3",
    "h4",
    "p",
    "strong",
    "em",
    "del",
    "link",
    "footnote",
    "footnoteSection",
    "li",
    "blockquoteP",
    "th",
    "td",
    "imgCaption",
    "calloutTitle",
    "calloutContent",
];

export function getFontFamilyOptions(): { value: FontFamilyPreset; label: string }[] {
    return Object.entries(FONT_FAMILY_PRESETS).map(([value, preset]) => ({
        value: value as FontFamilyPreset,
        label: preset.label,
    }));
}

export function applyFontFamily(theme: WechatTheme, preset?: string): WechatTheme {
    const fontCss = preset ? FONT_FAMILY_PRESETS[preset as FontFamilyPreset]?.css : "";
    if (!fontCss) {
        return theme;
    }

    const styles = { ...theme.styles };
    const fontFamily = `font-family: ${fontCss};`;

    for (const key of FONT_STYLE_KEYS) {
        styles[key] = replaceOrAppend(styles[key], "font-family", fontFamily);
    }

    return {
        name: theme.name,
        label: theme.label,
        styles,
    };
}

export function applyOverrides(theme: WechatTheme, overrides: ThemeOverrides): WechatTheme {
    if (!overrides || Object.keys(overrides).length === 0) {
        return theme;
    }

    const result: WechatTheme = {
        name: theme.name,
        label: theme.label,
        styles: { ...theme.styles },
    };

    const { fontSize, lineHeight, paragraphSpacing, sidePadding, accentColor } = overrides;

    // 覆盖正文字号
    if (fontSize) {
        const sizeStr = `font-size: ${fontSize}px;`;
        result.styles.p = replaceOrAppend(result.styles.p, "font-size", sizeStr);
        result.styles.li = replaceOrAppend(result.styles.li, "font-size", sizeStr);
    }

    // 覆盖行高
    if (lineHeight) {
        const lhStr = `line-height: ${lineHeight};`;
        result.styles.p = replaceOrAppend(result.styles.p, "line-height", lhStr);
        result.styles.li = replaceOrAppend(result.styles.li, "line-height", lhStr);
        result.styles.body = replaceOrAppend(result.styles.body, "line-height", lhStr);
    }

    // 覆盖段间距
    if (paragraphSpacing) {
        const marginStr = `margin: ${paragraphSpacing}px 0;`;
        result.styles.p = replaceOrAppend(result.styles.p, "margin", marginStr);
    }

    // 覆盖两侧间距
    if (sidePadding !== undefined) {
        const paddingStr = `padding: 0 ${sidePadding}px;`;
        result.styles.body = replaceOrAppend(result.styles.body, "padding", paddingStr);
    }

    // 覆盖主色调
    if (accentColor) {
        result.styles.h1 = result.styles.h1.replace(/color:\s*#[0-9a-fA-F]{3,8}/g, `color: ${accentColor}`);
        result.styles.h2 = result.styles.h2.replace(/color:\s*#[0-9a-fA-F]{3,8}/g, `color: ${accentColor}`);
        result.styles.strong = result.styles.strong.replace(/color:\s*#[0-9a-fA-F]{3,8}/g, `color: ${accentColor}`);
        result.styles.link = result.styles.link.replace(/color:\s*#[0-9a-fA-F]{3,8}/g, `color: ${accentColor}`);
        result.styles.codeInline = result.styles.codeInline.replace(/color:\s*#[0-9a-fA-F]{3,8}/g, `color: ${accentColor}`);

        // 边框颜色
        const borderReplace = (s: string) =>
            s.replace(/border-left:\s*\d+px\s+solid\s+#[0-9a-fA-F]{3,8}/g, (m) =>
                m.replace(/#[0-9a-fA-F]{3,8}/, accentColor)
            ).replace(/border-bottom:\s*\d+px\s+solid\s+#[0-9a-fA-F]{3,8}/g, (m) =>
                m.replace(/#[0-9a-fA-F]{3,8}/, accentColor)
            );
        result.styles.h1 = borderReplace(result.styles.h1);
        result.styles.h2 = borderReplace(result.styles.h2);
        result.styles.blockquote = borderReplace(result.styles.blockquote);
    }

    return result;
}

/**
 * 替换或追加 CSS 属性值
 */
function replaceOrAppend(style: string, prop: string, newValue: string): string {
    const regex = new RegExp(`${prop}\\s*:[^;]+;`, "g");
    if (regex.test(style)) {
        return style.replace(regex, newValue);
    }
    return style.endsWith(";") ? `${style} ${newValue}` : `${style}; ${newValue}`;
}

// ─────────────────────────────────────────────
// 10 款排版模板
// ─────────────────────────────────────────────

export const THEMES: Record<string, WechatTheme> = {

    // ── 1. 摸鱼绿 ──
    // ── 0. 语雀 (Yuque) ──
    "yuque": {
        name: "yuque",
        label: "语雀",
        styles: {
            body: "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; color: #262626; line-height: 1.74; padding: 0 16px; margin: 0; word-break: break-word;",
            h1: "font-size: 24px; font-weight: 700; color: #262626; margin: 24px 0 16px 0; line-height: 1.5; border: none;",
            h2: "font-size: 20px; font-weight: 700; color: #262626; margin: 20px 0 12px 0; line-height: 1.5; border: none;",
            h3: "font-size: 16px; font-weight: 700; color: #262626; margin: 16px 0 12px 0; line-height: 1.5;",
            h4: "font-size: 15px; font-weight: 700; color: #595959; margin: 14px 0 10px 0; line-height: 1.5;",
            p: "font-size: 15px; color: #262626; line-height: 1.74; margin: 16px 0;",
            strong: "font-weight: 700; color: #262626;",
            em: "font-style: italic; color: #595959;",
            del: "text-decoration: line-through; color: #bfbfbf;",
            link: "color: #1890ff; text-decoration: none;",
            footnote: "font-size: 12px; color: #1890ff; vertical-align: super; text-decoration: none;",
            footnoteSection: "font-size: 14px; color: #8c8c8c; border-top: 1px solid #f0f0f0; margin-top: 32px; padding-top: 16px;",
            ul: "margin: 12px 0; padding-left: 20px; list-style-type: disc;",
            ol: "margin: 12px 0; padding-left: 20px; list-style-type: decimal;",
            li: "font-size: 15px; color: #262626; line-height: 1.74; margin: 4px 0;",
            blockquote: "border-left: 3px solid #e1e4e8; color: #586069; padding: 0 1em; margin: 16px 0;",
            blockquoteP: "font-size: 15px; color: #586069; line-height: 1.74;",
            codeInline: "font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; background-color: rgba(27,31,35,0.05); color: #24292e; padding: 0.2em 0.4em; border-radius: 3px; font-size: 13px;",
            codePre: "background-color: #f6f8fa; border-radius: 6px; padding: 16px; margin: 16px 0; overflow-x: auto;",
            codeBlock: "font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 13px; line-height: 1.45; color: #24292e; display: block; overflow-x: auto;",
            table: "border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 14px;",
            th: "background-color: #fafafa; color: #262626; padding: 8px 16px; text-align: left; font-weight: 600; border: 1px solid #f0f0f0;",
            td: "padding: 8px 16px; border: 1px solid #f0f0f0; color: #595959;",
            trEven: "background-color: #fff;",
            imgWrapper: "text-align: center; margin: 16px 0;",
            img: "max-width: 100%; border-radius: 4px;",
            imgCaption: "font-size: 13px; color: #8c8c8c; margin-top: 8px; text-align: center;",
            hr: "border: none; border-top: 1px solid #e1e4e8; margin: 24px 0;",
            calloutContainer: "background-color: #e8f3ff; border: 1px solid #91caff; border-radius: 4px; padding: 12px 16px; margin: 16px 0;",
            calloutTitle: "font-weight: 600; font-size: 15px; color: #1677ff; margin-bottom: 4px;",
            calloutContent: "font-size: 15px; color: #262626; line-height: 1.74;",
        },
    },

    "moyu-green": {
        name: "moyu-green",
        label: "摸鱼绿",
        styles: {
            body: "font-family: 'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif; font-size: 16px; color: #232323; line-height: 2; padding: 0 28px; margin: 0; word-break: break-word; letter-spacing: 0.5px;",
            h1: "font-size: 28px; font-weight: 900; color: #111827; margin: 36px 0 20px 0; line-height: 1.3; text-align: center;",
            h2: "font-size: 22px; font-weight: 800; color: #111827; margin: 48px 0 24px 0; line-height: 1.4; border-left: 4px solid #059669; padding-left: 12px;",
            h3: "font-size: 18px; font-weight: 800; color: #059669; margin: 24px 0 12px 0; line-height: 1.4;",
            h4: "font-size: 16px; font-weight: 600; color: #374151; margin: 20px 0 10px 0; line-height: 1.4;",
            p: "font-size: 16px; color: #232323; line-height: 2; margin: 24px 0; text-align: justify; letter-spacing: 0.5px;",
            strong: "font-weight: 700; color: #111827; background-image: linear-gradient(to right, #D1FAE5, #ECFDF5, transparent); -webkit-box-decoration-break: clone; box-decoration-break: clone; padding: 2px 4px;",
            em: "font-style: normal; border-bottom: 2px solid #A7F3D0; font-weight: 600; color: #111827;",
            del: "text-decoration: line-through; color: #9CA3AF;",
            link: "color: #059669; text-decoration: none; font-weight: 600;",
            footnote: "font-size: 11px; color: #059669; vertical-align: super; text-decoration: none;",
            footnoteSection: "font-size: 13px; color: #9CA3AF; border-top: 1px solid #E5E7EB; margin-top: 32px; padding-top: 16px;",
            ul: "margin: 10px 0; padding-left: 24px; list-style-type: disc;",
            ol: "margin: 10px 0; padding-left: 24px; list-style-type: decimal;",
            li: "font-size: 14px; color: #374151; line-height: 1.8; margin: 8px 0;",
            blockquote: "background: #fff; border-radius: 8px; padding: 16px 20px; margin: 16px 0; border: 1px solid #E5E7EB; border-left: 3px solid #059669;",
            blockquoteP: "font-size: 15px; color: #374151; line-height: 1.8; margin: 4px 0;",
            codeInline: "font-family: 'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace; background: linear-gradient(135deg, #ECFDF5 0%, #F0FDF4 50%, #FFF7ED 100%); color: #059669; padding: 2px 8px; border-radius: 4px; font-size: 13px; font-weight: 600;",
            codePre: "background: #FAFAFA; border-radius: 8px; padding: 16px; margin: 16px 0; overflow-x: auto; border: 1px solid #E5E7EB;",
            codeBlock: "font-family: 'SFMono-Regular',Consolas,monospace; font-size: 13px; line-height: 1.6; color: #1F2937; display: block; overflow-x: auto;",
            table: "border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 13px;",
            th: "background-color: #059669; color: #fff; padding: 10px 14px; text-align: left; font-weight: 700; border: 1px solid #059669;",
            td: "padding: 10px 14px; border: 1px solid #E5E7EB; color: #374151;",
            trEven: "background-color: #F0FDF4;",
            imgWrapper: "text-align: center; margin: 24px 0; border: 1px solid #E5E7EB; border-radius: 12px; padding: 8px; background: #fff;",
            img: "max-width: 100%; display: block; border-radius: 8px;",
            imgCaption: "font-size: 12px; color: #9CA3AF; margin-top: 6px; text-align: center;",
            hr: "border: none; border-top: 1px dashed #E5E7EB; margin: 32px 0;",
            calloutContainer: "background: #fff; border: 1px solid #E5E7EB; border-left: 3px solid #059669; border-radius: 8px; padding: 16px 20px; margin: 20px 0;",
            calloutTitle: "font-weight: 700; font-size: 15px; color: #111827; margin-bottom: 8px;",
            calloutContent: "font-size: 15px; color: #374151; line-height: 1.8;",
        },
    },

    // ── 2. 科技蓝 ──
    "tech-blue": {
        name: "tech-blue",
        label: "科技蓝",
        styles: {
            body: "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 16px; color: #333; line-height: 1.8; padding: 0 28px; margin: 0; word-break: break-word;",
            h1: "font-size: 24px; font-weight: bold; color: #1a73e8; border-bottom: 2px solid #1a73e8; padding-bottom: 8px; margin: 30px 0 20px 0; line-height: 1.4;",
            h2: "font-size: 20px; font-weight: bold; color: #1a73e8; border-left: 4px solid #1a73e8; padding-left: 12px; margin: 28px 0 16px 0; line-height: 1.4;",
            h3: "font-size: 18px; font-weight: bold; color: #333; margin: 24px 0 12px 0; line-height: 1.4;",
            h4: "font-size: 16px; font-weight: bold; color: #555; margin: 20px 0 10px 0; line-height: 1.4;",
            p: "font-size: 16px; color: #333; line-height: 1.8; margin: 10px 0; letter-spacing: 0.5px;",
            strong: "font-weight: bold; color: #1a73e8;",
            em: "font-style: italic; color: #555;",
            del: "text-decoration: line-through; color: #999;",
            link: "color: #1a73e8; text-decoration: none;",
            footnote: "font-size: 12px; color: #1a73e8; vertical-align: super; text-decoration: none;",
            footnoteSection: "font-size: 14px; color: #666; border-top: 1px solid #eee; margin-top: 30px; padding-top: 16px;",
            ul: "margin: 10px 0; padding-left: 24px; list-style-type: disc;",
            ol: "margin: 10px 0; padding-left: 24px; list-style-type: decimal;",
            li: "font-size: 16px; color: #333; line-height: 1.8; margin: 4px 0;",
            blockquote: "border-left: 4px solid #1a73e8; background-color: #f0f7ff; padding: 12px 16px; margin: 16px 0; border-radius: 0 4px 4px 0;",
            blockquoteP: "font-size: 15px; color: #555; line-height: 1.7; margin: 4px 0;",
            codeInline: "font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; background-color: #f0f7ff; color: #1a73e8; padding: 2px 6px; border-radius: 3px; font-size: 14px;",
            codePre: "background-color: #282c34; border-radius: 8px; padding: 16px; margin: 16px 0; overflow-x: auto;",
            codeBlock: "font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 14px; line-height: 1.6; color: #abb2bf; display: block; overflow-x: auto;",
            table: "border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 14px;",
            th: "background-color: #1a73e8; color: #fff; padding: 10px 14px; text-align: left; font-weight: bold; border: 1px solid #ddd;",
            td: "padding: 10px 14px; border: 1px solid #ddd; color: #333;",
            trEven: "background-color: #f8f9fa;",
            imgWrapper: "text-align: center; margin: 20px 0;",
            img: "max-width: 100%; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);",
            imgCaption: "font-size: 13px; color: #999; margin-top: 6px; text-align: center;",
            hr: "border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;",
            calloutContainer: "background-color: #f0f7ff; border: 1px solid #1a73e8; border-radius: 6px; padding: 14px 16px; margin: 16px 0;",
            calloutTitle: "font-weight: bold; color: #1a73e8; margin-bottom: 6px; font-size: 15px;",
            calloutContent: "font-size: 15px; color: #555; line-height: 1.7;",
        },
    },

    // ── 2. 简约黑白 ──
    minimal: {
        name: "minimal",
        label: "简约黑白",
        styles: {
            body: "font-family: 'Georgia', 'Times New Roman', serif; font-size: 16px; color: #2c2c2c; line-height: 2; padding: 0 28px; margin: 0; word-break: break-word;",
            h1: "font-size: 26px; font-weight: bold; color: #000; margin: 36px 0 20px 0; line-height: 1.3; text-align: center;",
            h2: "font-size: 21px; font-weight: bold; color: #000; margin: 32px 0 16px 0; line-height: 1.3; border-bottom: 1px solid #ccc; padding-bottom: 6px;",
            h3: "font-size: 18px; font-weight: bold; color: #333; margin: 26px 0 12px 0; line-height: 1.4;",
            h4: "font-size: 16px; font-weight: bold; color: #555; margin: 22px 0 10px 0; line-height: 1.4;",
            p: "font-size: 16px; color: #2c2c2c; line-height: 2; margin: 12px 0; letter-spacing: 1px;",
            strong: "font-weight: bold; color: #000;",
            em: "font-style: italic; color: #444;",
            del: "text-decoration: line-through; color: #aaa;",
            link: "color: #333; text-decoration: underline;",
            footnote: "font-size: 12px; color: #666; vertical-align: super; text-decoration: none;",
            footnoteSection: "font-size: 13px; color: #888; border-top: 1px solid #ddd; margin-top: 36px; padding-top: 16px;",
            ul: "margin: 12px 0; padding-left: 24px; list-style-type: disc;",
            ol: "margin: 12px 0; padding-left: 24px; list-style-type: decimal;",
            li: "font-size: 16px; color: #2c2c2c; line-height: 2; margin: 6px 0;",
            blockquote: "border-left: 3px solid #999; background-color: #fafafa; padding: 12px 18px; margin: 18px 0;",
            blockquoteP: "font-size: 15px; color: #666; line-height: 1.8; margin: 4px 0; font-style: italic;",
            codeInline: "font-family: 'SFMono-Regular', Consolas, monospace; background-color: #f5f5f5; color: #333; padding: 2px 6px; border-radius: 3px; font-size: 14px;",
            codePre: "background-color: #f5f5f5; border: 1px solid #e0e0e0; border-radius: 4px; padding: 16px; margin: 16px 0; overflow-x: auto;",
            codeBlock: "font-family: 'SFMono-Regular', Consolas, monospace; font-size: 14px; line-height: 1.6; color: #333; display: block; overflow-x: auto;",
            table: "border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 14px;",
            th: "background-color: #333; color: #fff; padding: 10px 14px; text-align: left; font-weight: bold; border: 1px solid #ccc;",
            td: "padding: 10px 14px; border: 1px solid #ccc; color: #333;",
            trEven: "background-color: #fafafa;",
            imgWrapper: "text-align: center; margin: 24px 0;",
            img: "max-width: 100%; border-radius: 2px;",
            imgCaption: "font-size: 13px; color: #999; margin-top: 8px; text-align: center; font-style: italic;",
            hr: "border: none; border-top: 1px solid #ddd; margin: 30px 0;",
            calloutContainer: "background-color: #fafafa; border: 1px solid #ccc; border-radius: 4px; padding: 14px 16px; margin: 16px 0;",
            calloutTitle: "font-weight: bold; color: #333; margin-bottom: 6px; font-size: 15px;",
            calloutContent: "font-size: 15px; color: #555; line-height: 1.8;",
        },
    },

    // ── 3. 暗色科技 ──
    "dark-tech": {
        name: "dark-tech",
        label: "暗色科技",
        styles: {
            body: "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 16px; color: #333; line-height: 1.8; padding: 0 28px; margin: 0; word-break: break-word;",
            h1: "font-size: 24px; font-weight: bold; color: #e67e22; margin: 30px 0 20px 0; line-height: 1.4; border-bottom: 2px solid #e67e22; padding-bottom: 8px;",
            h2: "font-size: 20px; font-weight: bold; color: #e67e22; border-left: 4px solid #e67e22; padding-left: 12px; margin: 28px 0 16px 0; line-height: 1.4;",
            h3: "font-size: 18px; font-weight: bold; color: #444; margin: 24px 0 12px 0; line-height: 1.4;",
            h4: "font-size: 16px; font-weight: bold; color: #666; margin: 20px 0 10px 0; line-height: 1.4;",
            p: "font-size: 16px; color: #333; line-height: 1.8; margin: 10px 0; letter-spacing: 0.5px;",
            strong: "font-weight: bold; color: #e67e22;",
            em: "font-style: italic; color: #555;",
            del: "text-decoration: line-through; color: #999;",
            link: "color: #e67e22; text-decoration: none;",
            footnote: "font-size: 12px; color: #e67e22; vertical-align: super; text-decoration: none;",
            footnoteSection: "font-size: 14px; color: #888; border-top: 1px solid #444; margin-top: 30px; padding-top: 16px;",
            ul: "margin: 10px 0; padding-left: 24px; list-style-type: disc;",
            ol: "margin: 10px 0; padding-left: 24px; list-style-type: decimal;",
            li: "font-size: 16px; color: #333; line-height: 1.8; margin: 4px 0;",
            blockquote: "border-left: 4px solid #e67e22; background-color: #fff8f0; padding: 12px 16px; margin: 16px 0; border-radius: 0 4px 4px 0;",
            blockquoteP: "font-size: 15px; color: #555; line-height: 1.7; margin: 4px 0;",
            codeInline: "font-family: 'SFMono-Regular', Consolas, monospace; background-color: #2d2d2d; color: #e6db74; padding: 2px 6px; border-radius: 3px; font-size: 14px;",
            codePre: "background-color: #1e1e1e; border-radius: 8px; padding: 16px; margin: 16px 0; overflow-x: auto; border: 1px solid #444;",
            codeBlock: "font-family: 'SFMono-Regular', Consolas, monospace; font-size: 14px; line-height: 1.6; color: #d4d4d4; display: block; overflow-x: auto;",
            table: "border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 14px;",
            th: "background-color: #2d2d2d; color: #e67e22; padding: 10px 14px; text-align: left; font-weight: bold; border: 1px solid #444;",
            td: "padding: 10px 14px; border: 1px solid #ddd; color: #333;",
            trEven: "background-color: #fafafa;",
            imgWrapper: "text-align: center; margin: 20px 0;",
            img: "max-width: 100%; border-radius: 6px; border: 1px solid #333;",
            imgCaption: "font-size: 13px; color: #999; margin-top: 6px; text-align: center;",
            hr: "border: none; border-top: 1px solid #444; margin: 24px 0;",
            calloutContainer: "background-color: #fff8f0; border: 1px solid #e67e22; border-radius: 6px; padding: 14px 16px; margin: 16px 0;",
            calloutTitle: "font-weight: bold; color: #e67e22; margin-bottom: 6px; font-size: 15px;",
            calloutContent: "font-size: 15px; color: #555; line-height: 1.7;",
        },
    },

    // ── 4. 暖阳橙 ──
    "warm-orange": {
        name: "warm-orange",
        label: "暖阳橙",
        styles: {
            body: "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 16px; color: #4a4a4a; line-height: 1.8; padding: 0 28px; margin: 0; word-break: break-word;",
            h1: "font-size: 24px; font-weight: bold; color: #ff6b35; border-bottom: 2px solid #ffa62b; padding-bottom: 8px; margin: 30px 0 20px 0; line-height: 1.4;",
            h2: "font-size: 20px; font-weight: bold; color: #fff; background-color: #ff6b35; padding: 6px 14px; border-radius: 4px; margin: 28px 0 16px 0; line-height: 1.4; display: inline-block;",
            h3: "font-size: 18px; font-weight: bold; color: #ff6b35; margin: 24px 0 12px 0; line-height: 1.4;",
            h4: "font-size: 16px; font-weight: bold; color: #666; margin: 20px 0 10px 0; line-height: 1.4;",
            p: "font-size: 16px; color: #4a4a4a; line-height: 1.8; margin: 10px 0; letter-spacing: 0.5px;",
            strong: "font-weight: bold; color: #ff6b35;",
            em: "font-style: italic; color: #888;",
            del: "text-decoration: line-through; color: #bbb;",
            link: "color: #ff6b35; text-decoration: none;",
            footnote: "font-size: 12px; color: #ff6b35; vertical-align: super; text-decoration: none;",
            footnoteSection: "font-size: 14px; color: #888; border-top: 1px solid #ffd9c0; margin-top: 30px; padding-top: 16px;",
            ul: "margin: 10px 0; padding-left: 24px; list-style-type: disc;",
            ol: "margin: 10px 0; padding-left: 24px; list-style-type: decimal;",
            li: "font-size: 16px; color: #4a4a4a; line-height: 1.8; margin: 4px 0;",
            blockquote: "border-left: 4px solid #ffa62b; background-color: #fff9f0; padding: 12px 16px; margin: 16px 0; border-radius: 0 6px 6px 0;",
            blockquoteP: "font-size: 15px; color: #666; line-height: 1.7; margin: 4px 0;",
            codeInline: "font-family: 'SFMono-Regular', Consolas, monospace; background-color: #fff3e6; color: #e65100; padding: 2px 6px; border-radius: 3px; font-size: 14px;",
            codePre: "background-color: #282c34; border-radius: 8px; padding: 16px; margin: 16px 0; overflow-x: auto;",
            codeBlock: "font-family: 'SFMono-Regular', Consolas, monospace; font-size: 14px; line-height: 1.6; color: #abb2bf; display: block; overflow-x: auto;",
            table: "border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 14px; border-radius: 6px; overflow: hidden;",
            th: "background-color: #ff6b35; color: #fff; padding: 10px 14px; text-align: left; font-weight: bold; border: 1px solid #ffa62b;",
            td: "padding: 10px 14px; border: 1px solid #ffd9c0; color: #4a4a4a;",
            trEven: "background-color: #fff9f0;",
            imgWrapper: "text-align: center; margin: 20px 0;",
            img: "max-width: 100%; border-radius: 12px; box-shadow: 0 4px 12px rgba(255,107,53,0.15);",
            imgCaption: "font-size: 13px; color: #bbb; margin-top: 6px; text-align: center;",
            hr: "border: none; border-top: 2px dashed #ffd9c0; margin: 24px 0;",
            calloutContainer: "background-color: #fff9f0; border: 1px solid #ffa62b; border-radius: 8px; padding: 14px 16px; margin: 16px 0;",
            calloutTitle: "font-weight: bold; color: #ff6b35; margin-bottom: 6px; font-size: 15px;",
            calloutContent: "font-size: 15px; color: #666; line-height: 1.7;",
        },
    },

    // ── 5. 渐变紫 ──
    "gradient-purple": {
        name: "gradient-purple",
        label: "渐变紫",
        styles: {
            body: "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 16px; color: #3d3d3d; line-height: 1.8; padding: 0 28px; margin: 0; word-break: break-word;",
            h1: "font-size: 24px; font-weight: bold; color: #6c5ce7; border-bottom: 2px solid #a29bfe; padding-bottom: 8px; margin: 30px 0 20px 0; line-height: 1.4;",
            h2: "font-size: 20px; font-weight: bold; color: #6c5ce7; border-left: 4px solid #a29bfe; padding-left: 12px; margin: 28px 0 16px 0; line-height: 1.4;",
            h3: "font-size: 18px; font-weight: bold; color: #6c5ce7; margin: 24px 0 12px 0; line-height: 1.4;",
            h4: "font-size: 16px; font-weight: bold; color: #888; margin: 20px 0 10px 0; line-height: 1.4;",
            p: "font-size: 16px; color: #3d3d3d; line-height: 1.8; margin: 10px 0; letter-spacing: 0.5px;",
            strong: "font-weight: bold; color: #6c5ce7;",
            em: "font-style: italic; color: #888;",
            del: "text-decoration: line-through; color: #bbb;",
            link: "color: #6c5ce7; text-decoration: none;",
            footnote: "font-size: 12px; color: #6c5ce7; vertical-align: super; text-decoration: none;",
            footnoteSection: "font-size: 14px; color: #888; border-top: 1px solid #e8e4ff; margin-top: 30px; padding-top: 16px;",
            ul: "margin: 10px 0; padding-left: 24px; list-style-type: disc;",
            ol: "margin: 10px 0; padding-left: 24px; list-style-type: decimal;",
            li: "font-size: 16px; color: #3d3d3d; line-height: 1.8; margin: 4px 0;",
            blockquote: "border-left: 3px dashed #a29bfe; background-color: #f5f3ff; padding: 12px 16px; margin: 16px 0; border-radius: 0 6px 6px 0;",
            blockquoteP: "font-size: 15px; color: #666; line-height: 1.7; margin: 4px 0;",
            codeInline: "font-family: 'SFMono-Regular', Consolas, monospace; background-color: #f0edff; color: #6c5ce7; padding: 2px 6px; border-radius: 3px; font-size: 14px;",
            codePre: "background-color: #2d2b55; border-radius: 8px; padding: 16px; margin: 16px 0; overflow-x: auto;",
            codeBlock: "font-family: 'SFMono-Regular', Consolas, monospace; font-size: 14px; line-height: 1.6; color: #e4e0ff; display: block; overflow-x: auto;",
            table: "border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 14px;",
            th: "background-color: #6c5ce7; color: #fff; padding: 10px 14px; text-align: left; font-weight: bold; border: 1px solid #a29bfe;",
            td: "padding: 10px 14px; border: 1px solid #e8e4ff; color: #3d3d3d;",
            trEven: "background-color: #f9f8ff;",
            imgWrapper: "text-align: center; margin: 20px 0;",
            img: "max-width: 100%; border-radius: 8px; box-shadow: 0 4px 16px rgba(108,92,231,0.15);",
            imgCaption: "font-size: 13px; color: #a29bfe; margin-top: 6px; text-align: center;",
            hr: "border: none; border-top: 2px solid #e8e4ff; margin: 24px 0;",
            calloutContainer: "background-color: #f5f3ff; border: 1px solid #a29bfe; border-radius: 8px; padding: 14px 16px; margin: 16px 0;",
            calloutTitle: "font-weight: bold; color: #6c5ce7; margin-bottom: 6px; font-size: 15px;",
            calloutContent: "font-size: 15px; color: #666; line-height: 1.7;",
        },
    },

    // ── 6. 商务灰 ──
    "business-gray": {
        name: "business-gray",
        label: "商务灰",
        styles: {
            body: "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 16px; color: #2d3436; line-height: 1.8; padding: 0 28px; margin: 0; word-break: break-word;",
            h1: "font-size: 24px; font-weight: bold; color: #2d3436; border-bottom: 2px solid #636e72; padding-bottom: 8px; margin: 30px 0 20px 0; line-height: 1.4;",
            h2: "font-size: 20px; font-weight: bold; color: #fff; background-color: #2d3436; padding: 8px 16px; margin: 28px 0 16px 0; line-height: 1.4;",
            h3: "font-size: 18px; font-weight: bold; color: #2d3436; border-bottom: 1px solid #b2bec3; padding-bottom: 4px; margin: 24px 0 12px 0; line-height: 1.4;",
            h4: "font-size: 16px; font-weight: bold; color: #636e72; margin: 20px 0 10px 0; line-height: 1.4;",
            p: "font-size: 16px; color: #2d3436; line-height: 1.8; margin: 10px 0; letter-spacing: 0.3px;",
            strong: "font-weight: bold; color: #2d3436;",
            em: "font-style: italic; color: #636e72;",
            del: "text-decoration: line-through; color: #b2bec3;",
            link: "color: #2d3436; text-decoration: underline;",
            footnote: "font-size: 12px; color: #636e72; vertical-align: super; text-decoration: none;",
            footnoteSection: "font-size: 14px; color: #888; border-top: 1px solid #dfe6e9; margin-top: 30px; padding-top: 16px;",
            ul: "margin: 10px 0; padding-left: 24px; list-style-type: disc;",
            ol: "margin: 10px 0; padding-left: 24px; list-style-type: decimal;",
            li: "font-size: 16px; color: #2d3436; line-height: 1.8; margin: 4px 0;",
            blockquote: "border-left: 4px solid #636e72; background-color: #f5f6fa; padding: 12px 16px; margin: 16px 0;",
            blockquoteP: "font-size: 15px; color: #636e72; line-height: 1.7; margin: 4px 0;",
            codeInline: "font-family: 'SFMono-Regular', Consolas, monospace; background-color: #f1f2f6; color: #2d3436; padding: 2px 6px; border-radius: 3px; font-size: 14px;",
            codePre: "background-color: #f1f2f6; border: 1px solid #dfe6e9; border-radius: 4px; padding: 16px; margin: 16px 0; overflow-x: auto;",
            codeBlock: "font-family: 'SFMono-Regular', Consolas, monospace; font-size: 14px; line-height: 1.6; color: #2d3436; display: block; overflow-x: auto;",
            table: "border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 14px;",
            th: "background-color: #2d3436; color: #fff; padding: 10px 14px; text-align: left; font-weight: bold; border: 1px solid #636e72;",
            td: "padding: 10px 14px; border: 1px solid #dfe6e9; color: #2d3436;",
            trEven: "background-color: #f5f6fa;",
            imgWrapper: "text-align: center; margin: 20px 0;",
            img: "max-width: 100%; border-radius: 4px;",
            imgCaption: "font-size: 13px; color: #b2bec3; margin-top: 6px; text-align: center;",
            hr: "border: none; border-top: 1px solid #dfe6e9; margin: 24px 0;",
            calloutContainer: "background-color: #f5f6fa; border: 1px solid #b2bec3; border-radius: 4px; padding: 14px 16px; margin: 16px 0;",
            calloutTitle: "font-weight: bold; color: #2d3436; margin-bottom: 6px; font-size: 15px;",
            calloutContent: "font-size: 15px; color: #636e72; line-height: 1.7;",
        },
    },

    // ── 7. 自然绿 ──
    "nature-green": {
        name: "nature-green",
        label: "自然绿",
        styles: {
            body: "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 16px; color: #2d3436; line-height: 1.8; padding: 0 28px; margin: 0; word-break: break-word;",
            h1: "font-size: 24px; font-weight: bold; color: #00b894; border-bottom: 2px solid #55efc4; padding-bottom: 8px; margin: 30px 0 20px 0; line-height: 1.4;",
            h2: "font-size: 20px; font-weight: bold; color: #00b894; border-left: 4px solid #00b894; padding-left: 12px; background-color: #f0fff4; margin: 28px 0 16px 0; line-height: 1.4; padding-top: 6px; padding-bottom: 6px;",
            h3: "font-size: 18px; font-weight: bold; color: #00b894; margin: 24px 0 12px 0; line-height: 1.4;",
            h4: "font-size: 16px; font-weight: bold; color: #636e72; margin: 20px 0 10px 0; line-height: 1.4;",
            p: "font-size: 16px; color: #2d3436; line-height: 1.8; margin: 10px 0; letter-spacing: 0.5px;",
            strong: "font-weight: bold; color: #00b894;",
            em: "font-style: italic; color: #636e72;",
            del: "text-decoration: line-through; color: #b2bec3;",
            link: "color: #00b894; text-decoration: none;",
            footnote: "font-size: 12px; color: #00b894; vertical-align: super; text-decoration: none;",
            footnoteSection: "font-size: 14px; color: #888; border-top: 1px solid #c8f7e8; margin-top: 30px; padding-top: 16px;",
            ul: "margin: 10px 0; padding-left: 24px; list-style-type: disc;",
            ol: "margin: 10px 0; padding-left: 24px; list-style-type: decimal;",
            li: "font-size: 16px; color: #2d3436; line-height: 1.8; margin: 4px 0;",
            blockquote: "border-left: 4px solid #00b894; background-color: #f0fff4; padding: 12px 16px; margin: 16px 0; border-radius: 0 6px 6px 0;",
            blockquoteP: "font-size: 15px; color: #636e72; line-height: 1.7; margin: 4px 0;",
            codeInline: "font-family: 'SFMono-Regular', Consolas, monospace; background-color: #e8fdf5; color: #00896e; padding: 2px 6px; border-radius: 3px; font-size: 14px;",
            codePre: "background-color: #282c34; border-radius: 8px; padding: 16px; margin: 16px 0; overflow-x: auto;",
            codeBlock: "font-family: 'SFMono-Regular', Consolas, monospace; font-size: 14px; line-height: 1.6; color: #abb2bf; display: block; overflow-x: auto;",
            table: "border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 14px;",
            th: "background-color: #00b894; color: #fff; padding: 10px 14px; text-align: left; font-weight: bold; border: 1px solid #55efc4;",
            td: "padding: 10px 14px; border: 1px solid #c8f7e8; color: #2d3436;",
            trEven: "background-color: #f0fff4;",
            imgWrapper: "text-align: center; margin: 20px 0;",
            img: "max-width: 100%; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,184,148,0.12);",
            imgCaption: "font-size: 13px; color: #55efc4; margin-top: 6px; text-align: center;",
            hr: "border: none; border-top: 2px solid #c8f7e8; margin: 24px 0;",
            calloutContainer: "background-color: #f0fff4; border: 1px solid #55efc4; border-radius: 8px; padding: 14px 16px; margin: 16px 0;",
            calloutTitle: "font-weight: bold; color: #00b894; margin-bottom: 6px; font-size: 15px;",
            calloutContent: "font-size: 15px; color: #636e72; line-height: 1.7;",
        },
    },

    // ── 8. 玫瑰金 ──
    "elegant-rose": {
        name: "elegant-rose",
        label: "玫瑰金",
        styles: {
            body: "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 16px; color: #444; line-height: 1.8; padding: 0 28px; margin: 0; word-break: break-word;",
            h1: "font-size: 24px; font-weight: bold; color: #e84393; margin: 30px 0 20px 0; line-height: 1.4; text-align: center;",
            h2: "font-size: 20px; font-weight: bold; color: #e84393; border-bottom: 2px solid #fd79a8; padding-bottom: 6px; margin: 28px 0 16px 0; line-height: 1.4; text-align: center;",
            h3: "font-size: 18px; font-weight: bold; color: #e84393; margin: 24px 0 12px 0; line-height: 1.4;",
            h4: "font-size: 16px; font-weight: bold; color: #888; margin: 20px 0 10px 0; line-height: 1.4;",
            p: "font-size: 16px; color: #444; line-height: 1.8; margin: 10px 0; letter-spacing: 0.5px;",
            strong: "font-weight: bold; color: #e84393;",
            em: "font-style: italic; color: #888;",
            del: "text-decoration: line-through; color: #ccc;",
            link: "color: #e84393; text-decoration: none;",
            footnote: "font-size: 12px; color: #e84393; vertical-align: super; text-decoration: none;",
            footnoteSection: "font-size: 14px; color: #888; border-top: 1px solid #fce4ec; margin-top: 30px; padding-top: 16px;",
            ul: "margin: 10px 0; padding-left: 24px; list-style-type: disc;",
            ol: "margin: 10px 0; padding-left: 24px; list-style-type: decimal;",
            li: "font-size: 16px; color: #444; line-height: 1.8; margin: 4px 0;",
            blockquote: "border-left: 3px solid #fd79a8; background-color: #fff5f7; padding: 12px 16px; margin: 16px 0; border-radius: 0 6px 6px 0;",
            blockquoteP: "font-size: 15px; color: #888; line-height: 1.7; margin: 4px 0;",
            codeInline: "font-family: 'SFMono-Regular', Consolas, monospace; background-color: #fff0f3; color: #e84393; padding: 2px 6px; border-radius: 3px; font-size: 14px;",
            codePre: "background-color: #2d2b3a; border-radius: 8px; padding: 16px; margin: 16px 0; overflow-x: auto;",
            codeBlock: "font-family: 'SFMono-Regular', Consolas, monospace; font-size: 14px; line-height: 1.6; color: #f8c8dc; display: block; overflow-x: auto;",
            table: "border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 14px;",
            th: "background-color: #e84393; color: #fff; padding: 10px 14px; text-align: left; font-weight: bold; border: 1px solid #fd79a8;",
            td: "padding: 10px 14px; border: 1px solid #fce4ec; color: #444;",
            trEven: "background-color: #fff5f7;",
            imgWrapper: "text-align: center; margin: 20px 0;",
            img: "max-width: 100%; border-radius: 10px; border: 2px solid #fce4ec;",
            imgCaption: "font-size: 13px; color: #fd79a8; margin-top: 6px; text-align: center;",
            hr: "border: none; border-top: 2px dashed #fce4ec; margin: 24px 0;",
            calloutContainer: "background-color: #fff5f7; border: 1px solid #fd79a8; border-radius: 8px; padding: 14px 16px; margin: 16px 0;",
            calloutTitle: "font-weight: bold; color: #e84393; margin-bottom: 6px; font-size: 15px;",
            calloutContent: "font-size: 15px; color: #888; line-height: 1.7;",
        },
    },

    // ── 9. 星空藏蓝 ──
    "night-navy": {
        name: "night-navy",
        label: "星空藏蓝",
        styles: {
            body: "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 16px; color: #2c3e50; line-height: 1.8; padding: 0 28px; margin: 0; word-break: break-word;",
            h1: "font-size: 24px; font-weight: bold; color: #0984e3; border-bottom: 2px solid #74b9ff; padding-bottom: 8px; margin: 30px 0 20px 0; line-height: 1.4;",
            h2: "font-size: 20px; font-weight: bold; color: #fff; background-color: #0984e3; padding: 8px 16px; margin: 28px 0 16px 0; line-height: 1.4;",
            h3: "font-size: 18px; font-weight: bold; color: #0984e3; margin: 24px 0 12px 0; line-height: 1.4;",
            h4: "font-size: 16px; font-weight: bold; color: #636e72; margin: 20px 0 10px 0; line-height: 1.4;",
            p: "font-size: 16px; color: #2c3e50; line-height: 1.8; margin: 10px 0; letter-spacing: 0.5px;",
            strong: "font-weight: bold; color: #0984e3;",
            em: "font-style: italic; color: #636e72;",
            del: "text-decoration: line-through; color: #b2bec3;",
            link: "color: #0984e3; text-decoration: none;",
            footnote: "font-size: 12px; color: #0984e3; vertical-align: super; text-decoration: none;",
            footnoteSection: "font-size: 14px; color: #888; border-top: 1px solid #dfe6e9; margin-top: 30px; padding-top: 16px;",
            ul: "margin: 10px 0; padding-left: 24px; list-style-type: disc;",
            ol: "margin: 10px 0; padding-left: 24px; list-style-type: decimal;",
            li: "font-size: 16px; color: #2c3e50; line-height: 1.8; margin: 4px 0;",
            blockquote: "border-left: 4px solid #0984e3; background-color: #edf5ff; padding: 12px 16px; margin: 16px 0; border-radius: 0 4px 4px 0;",
            blockquoteP: "font-size: 15px; color: #636e72; line-height: 1.7; margin: 4px 0;",
            codeInline: "font-family: 'SFMono-Regular', Consolas, monospace; background-color: #edf5ff; color: #0984e3; padding: 2px 6px; border-radius: 3px; font-size: 14px;",
            codePre: "background-color: #0d1117; border-radius: 8px; padding: 16px; margin: 16px 0; overflow-x: auto;",
            codeBlock: "font-family: 'SFMono-Regular', Consolas, monospace; font-size: 14px; line-height: 1.6; color: #c9d1d9; display: block; overflow-x: auto;",
            table: "border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 14px;",
            th: "background-color: #0984e3; color: #fff; padding: 10px 14px; text-align: left; font-weight: bold; border: 1px solid #74b9ff;",
            td: "padding: 10px 14px; border: 1px solid #dfe6e9; color: #2c3e50;",
            trEven: "background-color: #f0f7ff;",
            imgWrapper: "text-align: center; margin: 20px 0;",
            img: "max-width: 100%; border-radius: 6px; box-shadow: 0 4px 16px rgba(9,132,227,0.15);",
            imgCaption: "font-size: 13px; color: #74b9ff; margin-top: 6px; text-align: center;",
            hr: "border: none; border-top: 2px solid #dfe6e9; margin: 24px 0;",
            calloutContainer: "background-color: #edf5ff; border: 1px solid #74b9ff; border-radius: 6px; padding: 14px 16px; margin: 16px 0;",
            calloutTitle: "font-weight: bold; color: #0984e3; margin-bottom: 6px; font-size: 15px;",
            calloutContent: "font-size: 15px; color: #636e72; line-height: 1.7;",
        },
    },

    // ── 10. 清新薄荷 ──
    "fresh-mint": {
        name: "fresh-mint",
        label: "清新薄荷",
        styles: {
            body: "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 16px; color: #333; line-height: 1.8; padding: 0 28px; margin: 0; word-break: break-word;",
            h1: "font-size: 24px; font-weight: bold; color: #00cec9; border-bottom: 2px solid #81ecec; padding-bottom: 8px; margin: 30px 0 20px 0; line-height: 1.4;",
            h2: "font-size: 20px; font-weight: bold; color: #00cec9; background-color: #e8fffe; padding: 6px 14px; border-radius: 20px; margin: 28px 0 16px 0; line-height: 1.4; display: inline-block;",
            h3: "font-size: 18px; font-weight: bold; color: #00cec9; margin: 24px 0 12px 0; line-height: 1.4;",
            h4: "font-size: 16px; font-weight: bold; color: #636e72; margin: 20px 0 10px 0; line-height: 1.4;",
            p: "font-size: 16px; color: #333; line-height: 1.8; margin: 10px 0; letter-spacing: 0.5px;",
            strong: "font-weight: bold; color: #00b5b2;",
            em: "font-style: italic; color: #888;",
            del: "text-decoration: line-through; color: #ccc;",
            link: "color: #00cec9; text-decoration: none;",
            footnote: "font-size: 12px; color: #00cec9; vertical-align: super; text-decoration: none;",
            footnoteSection: "font-size: 14px; color: #888; border-top: 1px solid #c8f7f6; margin-top: 30px; padding-top: 16px;",
            ul: "margin: 10px 0; padding-left: 24px; list-style-type: disc;",
            ol: "margin: 10px 0; padding-left: 24px; list-style-type: decimal;",
            li: "font-size: 16px; color: #333; line-height: 1.8; margin: 4px 0;",
            blockquote: "border-left: 3px dashed #81ecec; background-color: #f0ffff; padding: 12px 16px; margin: 16px 0; border-radius: 0 6px 6px 0;",
            blockquoteP: "font-size: 15px; color: #666; line-height: 1.7; margin: 4px 0;",
            codeInline: "font-family: 'SFMono-Regular', Consolas, monospace; background-color: #e8fffe; color: #00a19d; padding: 2px 6px; border-radius: 3px; font-size: 14px;",
            codePre: "background-color: #282c34; border-radius: 8px; padding: 16px; margin: 16px 0; overflow-x: auto;",
            codeBlock: "font-family: 'SFMono-Regular', Consolas, monospace; font-size: 14px; line-height: 1.6; color: #abb2bf; display: block; overflow-x: auto;",
            table: "border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 14px;",
            th: "background-color: #00cec9; color: #fff; padding: 10px 14px; text-align: left; font-weight: bold; border: 1px solid #81ecec;",
            td: "padding: 10px 14px; border: 1px solid #c8f7f6; color: #333;",
            trEven: "background-color: #f0ffff;",
            imgWrapper: "text-align: center; margin: 20px 0;",
            img: "max-width: 100%; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,206,201,0.12);",
            imgCaption: "font-size: 13px; color: #81ecec; margin-top: 6px; text-align: center;",
            hr: "border: none; border-top: 2px dashed #c8f7f6; margin: 24px 0;",
            calloutContainer: "background-color: #f0ffff; border: 1px solid #81ecec; border-radius: 8px; padding: 14px 16px; margin: 16px 0;",
            calloutTitle: "font-weight: bold; color: #00cec9; margin-bottom: 6px; font-size: 15px;",
            calloutContent: "font-size: 15px; color: #666; line-height: 1.7;",
        },
    },
};

// ─────────────────────────────────────────────
// 向后兼容：旧 key 映射
// ─────────────────────────────────────────────
THEMES["default"] = THEMES["moyu-green"];
THEMES["dark_tech"] = THEMES["dark-tech"];

export function getTheme(name: string): WechatTheme {
    return THEMES[name] || THEMES["moyu-green"];
}

export function getThemeNames(): { value: string; label: string }[] {
    // 排除别名 key
    const aliases = new Set(["default", "dark_tech"]);
    return Object.entries(THEMES)
        .filter(([key]) => !aliases.has(key))
        .map(([, t]) => ({ value: t.name, label: t.label }));
}
