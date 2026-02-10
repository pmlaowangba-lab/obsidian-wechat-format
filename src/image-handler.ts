/**
 * 图片处理模块
 * 将 Obsidian vault 中的本地图片转为 base64 Data URI
 */
import { App, TFile, normalizePath } from "obsidian";

const MIME_TYPES: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    bmp: "image/bmp",
};

/**
 * 获取图片的 MIME 类型
 */
function getMimeType(filePath: string): string {
    const ext = filePath.split(".").pop()?.toLowerCase() || "";
    return MIME_TYPES[ext] || "image/png";
}

/**
 * 判断是否为网络图片 URL
 */
export function isRemoteUrl(src: string): boolean {
    return /^https?:\/\//i.test(src);
}

/**
 * 解析 Obsidian 中的图片路径（支持相对路径和 vault 路径）
 */
function resolveImagePath(
    app: App,
    imageSrc: string,
    currentFilePath: string
): TFile | null {
    // 去除可能的 URL 编码
    const decoded = decodeURIComponent(imageSrc);

    // 尝试直接通过路径查找
    const directFile = app.vault.getAbstractFileByPath(normalizePath(decoded));
    if (directFile instanceof TFile) {
        return directFile;
    }

    // 尝试相对于当前文件目录查找
    const currentDir = currentFilePath.substring(
        0,
        currentFilePath.lastIndexOf("/")
    );
    const relativePath = normalizePath(`${currentDir}/${decoded}`);
    const relativeFile = app.vault.getAbstractFileByPath(relativePath);
    if (relativeFile instanceof TFile) {
        return relativeFile;
    }

    // 尝试在整个 vault 中按文件名搜索
    const fileName = decoded.split("/").pop() || decoded;
    const allFiles = app.vault.getFiles();
    const found = allFiles.find(
        (f) =>
            f.name === fileName &&
            Object.keys(MIME_TYPES).includes(f.extension.toLowerCase())
    );

    return found || null;
}

/**
 * 将本地图片转为 base64 Data URI
 */
export async function imageToBase64(
    app: App,
    imageSrc: string,
    currentFilePath: string
): Promise<string | null> {
    if (isRemoteUrl(imageSrc)) {
        return imageSrc; // 网络图片保持原URL
    }

    const file = resolveImagePath(app, imageSrc, currentFilePath);
    if (!file) {
        console.warn(`[WeChat Format] 找不到图片: ${imageSrc}`);
        return null;
    }

    try {
        const arrayBuffer = await app.vault.readBinary(file);
        const uint8Array = new Uint8Array(arrayBuffer);
        let binary = "";
        for (let i = 0; i < uint8Array.length; i++) {
            binary += String.fromCharCode(uint8Array[i]);
        }
        const base64 = btoa(binary);
        const mimeType = getMimeType(file.path);

        // 检查大小（约 10MB 限制）
        if (arrayBuffer.byteLength > 10 * 1024 * 1024) {
            console.warn(
                `[WeChat Format] 图片过大 (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)}MB): ${file.path}`
            );
        }

        return `data:${mimeType};base64,${base64}`;
    } catch (error) {
        console.error(`[WeChat Format] 读取图片失败: ${file.path}`, error);
        return null;
    }
}

/**
 * 批量处理 HTML 中的所有图片
 * 将 <img src="..."> 中的本地图片路径替换为 base64
 */
export async function processImagesInHtml(
    app: App,
    html: string,
    currentFilePath: string
): Promise<string> {
    const imgRegex = /<img\s+([^>]*?)src="([^"]+)"([^>]*?)>/gi;
    const matches: { full: string; src: string }[] = [];

    let match;
    while ((match = imgRegex.exec(html)) !== null) {
        matches.push({ full: match[0], src: match[2] });
    }

    let result = html;
    for (const m of matches) {
        const base64Src = await imageToBase64(app, m.src, currentFilePath);
        if (base64Src) {
            result = result.replace(m.src, base64Src);
        }
    }

    return result;
}
