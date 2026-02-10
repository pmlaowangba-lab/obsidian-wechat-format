/**
 * 微信公众号文章主题样式
 * 所有样式直接内联到 HTML 元素的 style 属性
 */

export interface WechatTheme {
    name: string;
    label: string;
    styles: {
        // 全局
        body: string;
        // 标题
        h1: string;
        h2: string;
        h3: string;
        h4: string;
        // 正文
        p: string;
        strong: string;
        em: string;
        del: string;
        // 链接与脚注
        link: string;
        footnote: string;
        footnoteSection: string;
        // 列表
        ul: string;
        ol: string;
        li: string;
        // 引用
        blockquote: string;
        blockquoteP: string;
        // 代码
        codeInline: string;
        codePre: string;
        codeBlock: string;
        // 表格
        table: string;
        th: string;
        td: string;
        trEven: string;
        // 图片
        imgWrapper: string;
        img: string;
        imgCaption: string;
        // 分割线
        hr: string;
        // Callout
        calloutContainer: string;
        calloutTitle: string;
        calloutContent: string;
    };
}

export const THEMES: Record<string, WechatTheme> = {
    default: {
        name: "default",
        label: "默认蓝",
        styles: {
            body: "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 16px; color: #333; line-height: 1.8; padding: 0; margin: 0; word-break: break-word;",
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

    minimal: {
        name: "minimal",
        label: "简约黑白",
        styles: {
            body: "font-family: 'Georgia', 'Times New Roman', serif; font-size: 16px; color: #2c2c2c; line-height: 2; padding: 0; margin: 0; word-break: break-word;",
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

    dark_tech: {
        name: "dark_tech",
        label: "暗色科技",
        styles: {
            body: "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 16px; color: #333; line-height: 1.8; padding: 0; margin: 0; word-break: break-word;",
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
};

export function getTheme(name: string): WechatTheme {
    return THEMES[name] || THEMES["default"];
}

export function getThemeNames(): { value: string; label: string }[] {
    return Object.values(THEMES).map((t) => ({ value: t.name, label: t.label }));
}
