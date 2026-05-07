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
export function getMimeTypeForPath(filePath: string): string {
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
export function resolveImagePath(
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
 * SVG 会自动转为 PNG（微信公众号不支持 SVG）
 */
export async function imageToBase64(
    app: App,
    imageSrc: string,
    currentFilePath: string
): Promise<string | null> {
    if (isRemoteUrl(imageSrc)) {
        return imageSrc; // 网络图片保持原URL
    }

    // 解码 URL 编码的路径（空格等）
    const decodedSrc = decodeURIComponent(imageSrc);
    const file = resolveImagePath(app, decodedSrc, currentFilePath);
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
        const mimeType = getMimeTypeForPath(file.path);

        // SVG → PNG 转换（微信公众号不支持 SVG）
        if (file.extension.toLowerCase() === "svg") {
            try {
                const pngBase64 = await svgToPng(`data:image/svg+xml;base64,${base64}`);
                if (pngBase64) return pngBase64;
            } catch (e) {
                console.warn(`[WeChat Format] SVG→PNG 转换失败，使用原始 SVG: ${file.path}`, e);
            }
        }

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
 * 将 SVG data URI 转为 PNG data URI（通过 Canvas）
 */
function svgToPng(svgDataUri: string, maxWidth = 800): Promise<string | null> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const scale = img.width > maxWidth ? maxWidth / img.width : 1;
            const w = Math.round(img.width * scale);
            const h = Math.round(img.height * scale);
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) { resolve(null); return; }
            // 白色背景（SVG 可能是透明的）
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = () => {
            console.warn("[WeChat Format] SVG 加载失败");
            resolve(null);
        };
        img.src = svgDataUri;
    });
}

/**
 * 通过 canvas 把任意支持格式（png/jpg/webp/gif/bmp）的图片
 * 重新编码为微信可接受的 JPEG，并保证体积 ≤ maxBytes。
 * 处理逻辑：先按 maxWidth 缩放，再尝试 quality 0.85→0.7→0.55→0.4，
 * 仍超限则继续按 0.8 倍下采样直到通过或低于安全阈值。
 *
 * 返回：{ buffer, filename, mimeType } 或 null（无法解码时）
 */
export async function compressImageToFit(
    sourceData: ArrayBuffer,
    sourceMimeType: string,
    sourceFilename: string,
    maxBytes = 1024 * 1024,
    maxWidth = 1440
): Promise<{ buffer: ArrayBuffer; filename: string; mimeType: string } | null> {
    return new Promise((resolve) => {
        const blob = new Blob([sourceData], { type: sourceMimeType || "image/png" });
        const objectUrl = URL.createObjectURL(blob);
        const img = new Image();

        img.onload = async () => {
            try {
                let scale = img.width > maxWidth ? maxWidth / img.width : 1;
                const tryEncode = async (currentScale: number): Promise<{ buffer: ArrayBuffer; mimeType: string } | null> => {
                    const w = Math.max(1, Math.round(img.width * currentScale));
                    const h = Math.max(1, Math.round(img.height * currentScale));
                    const canvas = document.createElement("canvas");
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext("2d");
                    if (!ctx) return null;
                    // JPEG 不支持透明，铺白底，避免 PNG/GIF 透明区域变黑
                    ctx.fillStyle = "#ffffff";
                    ctx.fillRect(0, 0, w, h);
                    ctx.drawImage(img, 0, 0, w, h);

                    for (const quality of [0.85, 0.7, 0.55, 0.4]) {
                        const result = await canvasToBlobBuffer(canvas, "image/jpeg", quality);
                        if (result && result.byteLength <= maxBytes) {
                            return { buffer: result, mimeType: "image/jpeg" };
                        }
                    }
                    return null;
                };

                let result = await tryEncode(scale);
                // 如果 0.4 质量都过不了限制，按 0.8 倍继续下采样
                while (!result && scale > 0.2) {
                    scale *= 0.8;
                    result = await tryEncode(scale);
                }

                URL.revokeObjectURL(objectUrl);
                if (!result) {
                    resolve(null);
                    return;
                }

                const baseName = sourceFilename.replace(/\.[^.]+$/, "") || `image_${Date.now()}`;
                resolve({
                    buffer: result.buffer,
                    filename: `${baseName}.jpg`,
                    mimeType: result.mimeType,
                });
            } catch (error) {
                URL.revokeObjectURL(objectUrl);
                console.warn("[WeChat Format] 图片压缩失败:", error);
                resolve(null);
            }
        };
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            console.warn("[WeChat Format] 图片解码失败:", sourceFilename);
            resolve(null);
        };
        img.src = objectUrl;
    });
}

function canvasToBlobBuffer(
    canvas: HTMLCanvasElement,
    mimeType: string,
    quality: number
): Promise<ArrayBuffer | null> {
    return new Promise((resolve) => {
        canvas.toBlob(
            (blob) => {
                if (!blob) {
                    resolve(null);
                    return;
                }
                blob.arrayBuffer().then(
                    (buf) => resolve(buf),
                    () => resolve(null)
                );
            },
            mimeType,
            quality
        );
    });
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
