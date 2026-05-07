/**
 * 微信公众号 API 客户端
 * 封装 access_token、图片上传、草稿发布
 */
import { App, requestUrl } from "obsidian";
import { compressImageToFit, getMimeTypeForPath, isRemoteUrl, resolveImagePath } from "./image-handler";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface WechatMPAccount {
    id: string;
    name: string;
    appId: string;
    appSecret: string;
    proxyUrl?: string;
    proxyKey?: string;
}

export interface WechatDraftMeta {
    title: string;
    author?: string;
    digest?: string;
}

export interface WechatPublishResult {
    mediaId: string;
    title: string;
    imageCount: number;
    warnings: string[];
}

interface TokenCache {
    token: string;
    expiresAt: number;
}

// ─────────────────────────────────────────────
// Token Cache (in-memory)
// ─────────────────────────────────────────────

const tokenCacheMap = new Map<string, TokenCache>();
const WECHAT_REQUEST_TIMEOUT_MS = 15000;
const LEGACY_WECHAT_PROXY_URLS = new Set(["http://163.7.2.155:8080"]);

export const DEFAULT_WECHAT_PROXY_URL = "http://14.103.38.108:8080";
export const DEFAULT_WECHAT_PROXY_KEY = "";

export function applyDefaultProxyToAccount(account: WechatMPAccount): WechatMPAccount {
    const proxyUrl = account.proxyUrl && !LEGACY_WECHAT_PROXY_URLS.has(account.proxyUrl)
        ? account.proxyUrl
        : DEFAULT_WECHAT_PROXY_URL;

    return {
        ...account,
        proxyUrl,
        proxyKey: account.proxyKey || DEFAULT_WECHAT_PROXY_KEY,
    };
}

function buildWechatUrl(path: string, proxyUrl?: string): string {
    const base = proxyUrl ? proxyUrl.replace(/\/$/, "") : "https://api.weixin.qq.com";
    return `${base}${path}`;
}

function buildProxyHeaders(proxyKey?: string): Record<string, string> {
    return proxyKey ? { "X-Proxy-Key": proxyKey } : {};
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => {
            reject(new Error(`${label} 请求超时（${Math.round(timeoutMs / 1000)} 秒）`));
        }, timeoutMs);

        promise
            .then((value) => {
                window.clearTimeout(timer);
                resolve(value);
            })
            .catch((error) => {
                window.clearTimeout(timer);
                reject(error);
            });
    });
}

function isProxyTransportError(response: any): boolean {
    const proxyError = String(response?.json?.error ?? response?.text ?? "");
    return (
        response?.status >= 500 ||
        proxyError.includes("Proxy error")
    );
}

async function requestWechatApi(
    path: string,
    options: {
        method?: string;
        headers?: Record<string, string>;
        body?: string | ArrayBuffer;
    } = {},
    proxyUrl?: string,
    proxyKey?: string
): Promise<any> {
    const method = options.method || "GET";
    const headers = options.headers || {};
    const directUrl = `https://api.weixin.qq.com${path}`;

    if (proxyUrl) {
        try {
            const response = await withTimeout(
                requestUrl({
                    url: buildWechatUrl(path, proxyUrl),
                    method,
                    headers: { ...headers, ...buildProxyHeaders(proxyKey) },
                    body: options.body,
                }),
                WECHAT_REQUEST_TIMEOUT_MS,
                `微信代理 ${path}`
            );

            if (isProxyTransportError(response)) {
                throw new Error(
                    `微信固定代理请求失败：${response?.json?.error || response?.text || response?.status || "未知错误"}`
                );
            }

            return response;
        } catch (proxyError) {
            throw new Error(`微信固定代理不可用，未改用本机直连：${String(proxyError)}`);
        }
    }

    return withTimeout(
        requestUrl({
            url: directUrl,
            method,
            headers,
            body: options.body,
        }),
        WECHAT_REQUEST_TIMEOUT_MS,
        `微信直连 ${path}`
    );
}

function isInvalidIpError(payload: any): boolean {
    return payload?.errcode === 40164 || /invalid ip/i.test(String(payload?.errmsg ?? ""));
}

function formatTokenError(payload: any, endpoint: string, currentAppId: string): string {
    const errmsg = String(payload?.errmsg ?? "未知错误").trim();

    if (isInvalidIpError(payload)) {
        const ipMatch = errmsg.match(/invalid ip\s+([0-9.]+)/i);
        const currentIp = ipMatch ? ipMatch[1] : "未知";
        return `获取 access_token 失败：微信拒绝了当前网络环境的调用。当前公网 IP 为 ${currentIp}，还没有加到该公众号后台的「IP 白名单」。请在微信公众平台 -> 设置与开发 -> 开发接口管理 -> IP 白名单 中添加这个 IP 后再重试。（AppID: ${currentAppId}，接口: ${endpoint}）`;
    }

    return `获取 access_token 失败 [${payload?.errcode}]: ${errmsg}（AppID: ${currentAppId}，接口: ${endpoint}）`;
}

/**
 * 获取 access_token，带内存缓存（提前 5 分钟刷新）
 */
export async function getAccessToken(
    appId: string,
    appSecret: string,
    proxyUrl = DEFAULT_WECHAT_PROXY_URL,
    proxyKey = DEFAULT_WECHAT_PROXY_KEY
): Promise<string> {
    const cacheKey = `${appId}`;
    const cached = tokenCacheMap.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
        return cached.token;
    }

    let tokenResponse: any;
    let tokenEndpoint = "stable_token";

    try {
        tokenResponse = await requestWechatApi(
            "/cgi-bin/stable_token",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    grant_type: "client_credential",
                    appid: appId,
                    secret: appSecret,
                    force_refresh: false,
                }),
            },
            proxyUrl,
            proxyKey
        );
    } catch {
        tokenEndpoint = "token";
        tokenResponse = await requestWechatApi(
            `/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`,
            { method: "GET" },
            proxyUrl,
            proxyKey
        );
    }

    if (tokenResponse.json?.errcode && tokenEndpoint === "stable_token" && !isInvalidIpError(tokenResponse.json)) {
        tokenEndpoint = "token";
        tokenResponse = await requestWechatApi(
            `/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`,
            { method: "GET" },
            proxyUrl,
            proxyKey
        );
    }

    if (tokenResponse.json?.errcode) {
        throw new Error(formatTokenError(tokenResponse.json, tokenEndpoint, appId));
    }

    const freshToken = tokenResponse.json?.access_token;
    if (!freshToken) {
        throw new Error(`获取 access_token 失败：返回数据中无 access_token`);
    }

    const expiresInSec = tokenResponse.json.expires_in || 7200;
    tokenCacheMap.set(cacheKey, {
        token: freshToken,
        expiresAt: Date.now() + (expiresInSec - 300) * 1000,
    });

    return freshToken;
}

/**
 * 清除指定账户的 token 缓存
 */
export function clearTokenCache(appId?: string): void {
    if (appId) {
        tokenCacheMap.delete(appId);
    } else {
        tokenCacheMap.clear();
    }
}

// ─────────────────────────────────────────────
// 图片上传
// ─────────────────────────────────────────────

/**
 * 上传图文消息内图片，返回微信 URL
 * 接口：POST /cgi-bin/media/uploadimg
 * 限制：JPG/PNG，< 1MB，不占素材配额
 */
export async function uploadContentImage(
    token: string,
    imageData: ArrayBuffer,
    filename: string,
    proxyUrl = DEFAULT_WECHAT_PROXY_URL,
    proxyKey = DEFAULT_WECHAT_PROXY_KEY
): Promise<string> {
    const mimeType = getMimeTypeForPath(filename);

    // 校验大小
    if (imageData.byteLength > 1024 * 1024) {
        throw new Error(`图片过大（${(imageData.byteLength / 1024 / 1024).toFixed(1)}MB），微信限制 1MB`);
    }

    // 校验格式
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    if (!["jpg", "jpeg", "png"].includes(ext)) {
        throw new Error(`图片格式不支持（.${ext}），微信 uploadimg 仅支持 JPG/PNG`);
    }

    // 构建 multipart/form-data
    const boundary = `----WeChatUpload${Date.now()}`;
    const header = [
        `--${boundary}`,
        `Content-Disposition: form-data; name="media"; filename="${filename}"`,
        `Content-Type: ${mimeType}`,
        "",
        "",
    ].join("\r\n");
    const footer = `\r\n--${boundary}--\r\n`;

    const headerBytes = new TextEncoder().encode(header);
    const footerBytes = new TextEncoder().encode(footer);
    const imageBytes = new Uint8Array(imageData);

    const body = new Uint8Array(headerBytes.length + imageBytes.length + footerBytes.length);
    body.set(headerBytes, 0);
    body.set(imageBytes, headerBytes.length);
    body.set(footerBytes, headerBytes.length + imageBytes.length);

    const response = await requestWechatApi(
        `/cgi-bin/media/uploadimg?access_token=${token}`,
        {
            method: "POST",
            headers: {
                "Content-Type": `multipart/form-data; boundary=${boundary}`,
            },
            body: body.buffer,
        },
        proxyUrl,
        proxyKey
    );

    if (response.json?.errcode) {
        throw new Error(
            `上传图片失败 [${response.json.errcode}]: ${response.json.errmsg || "未知错误"}`
        );
    }

    const wechatUrl = response.json?.url;
    if (!wechatUrl) {
        throw new Error(`上传图片未返回 URL: ${JSON.stringify(response.json)}`);
    }

    return wechatUrl;
}

// ─────────────────────────────────────────────
// HTML 图片处理
// ─────────────────────────────────────────────

/**
 * 安全字符串替换 — 避免 String.replace 中 $ 等特殊字符的问题
 * base64 字符串中包含 $, + 等字符，用 split/join 代替 replace
 */
function safeReplace(str: string, search: string, replacement: string): string {
    const idx = str.indexOf(search);
    if (idx === -1) return str;
    return str.substring(0, idx) + replacement + str.substring(idx + search.length);
}

/**
 * 移除 HTML 中包含指定 src 的整个 <img> 标签（含外层 section 容器，如果只裹了它）。
 * 用于上传失败时清理破图，避免发布后留下指向 vault 本地路径的死链。
 */
function removeImgTagBySrc(html: string, src: string): string {
    const escaped = src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const tagRegex = new RegExp(`<img\\s+[^>]*src="${escaped}"[^>]*>`, "i");
    let next = html.replace(tagRegex, "");
    // 如果 img 外层是 marked renderer 包装的空 section（imgWrapper），一并移除
    next = next.replace(/<section[^>]*>\s*<\/section>/gi, "");
    return next;
}

/**
 * 处理 HTML 中所有图片：上传到微信图床，替换 src
 */
export async function processHtmlImagesForWechat(
    app: App,
    html: string,
    currentFilePath: string,
    token: string,
    proxyUrl = DEFAULT_WECHAT_PROXY_URL,
    proxyKey = DEFAULT_WECHAT_PROXY_KEY
): Promise<{ html: string; imageCount: number; warnings: string[] }> {
    const imgRegex = /<img\s+([^>]*?)src="([^"]+)"([^>]*?)>/gi;
    const matches: { full: string; src: string }[] = [];
    const warnings: string[] = [];
    let imageCount = 0;

    let match;
    while ((match = imgRegex.exec(html)) !== null) {
        matches.push({ full: match[0], src: match[2] });
    }

    let result = html;
    const MAX_BYTES = 1024 * 1024;
    const ALLOWED_EXTS = new Set(["jpg", "jpeg", "png"]);

    for (const m of matches) {
        try {
            // 已经是微信 URL，跳过
            if (m.src.includes("mmbiz.qpic.cn") || m.src.includes("mmbiz.qlogo.cn")) {
                imageCount++;
                continue;
            }

            let imageData: ArrayBuffer;
            let filename: string;
            let mimeType: string;

            if (m.src.startsWith("data:")) {
                // Base64 图片
                const parts = m.src.match(/^data:image\/([\w+]+);base64,(.+)$/);
                if (!parts) {
                    warnings.push(`无法解析 base64 图片`);
                    result = removeImgTagBySrc(result, m.src);
                    continue;
                }
                let ext = parts[1].replace(/\+.*/, ""); // svg+xml -> svg
                if (ext === "jpeg") ext = "jpg";
                if (ext === "svg") {
                    warnings.push(`SVG 图片不支持微信，已跳过`);
                    result = removeImgTagBySrc(result, m.src);
                    continue;
                }
                filename = `image_${Date.now()}_${imageCount}.${ext}`;
                mimeType = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
                const binaryStr = atob(parts[2]);
                const bytes = new Uint8Array(binaryStr.length);
                for (let i = 0; i < binaryStr.length; i++) {
                    bytes[i] = binaryStr.charCodeAt(i);
                }
                imageData = bytes.buffer;
            } else if (isRemoteUrl(m.src)) {
                // 外部 URL 图片 → 先下载
                try {
                    const resp = await requestUrl({ url: m.src, method: "GET" });
                    imageData = resp.arrayBuffer;
                    const urlPath = new URL(m.src).pathname;
                    filename = urlPath.split("/").pop() || `download_${Date.now()}.jpg`;
                    if (!filename.match(/\.(jpg|jpeg|png|webp|gif|bmp)$/i)) {
                        filename = `${filename}.jpg`;
                    }
                    mimeType = getMimeTypeForPath(filename);
                } catch (dlError) {
                    warnings.push(`下载外部图片失败: ${m.src} (${String(dlError)})`);
                    result = removeImgTagBySrc(result, m.src);
                    continue;
                }
            } else {
                // 本地 vault 图片
                const file = resolveImagePath(app, m.src, currentFilePath);
                if (!file) {
                    warnings.push(`未找到本地图片: ${m.src}`);
                    result = removeImgTagBySrc(result, m.src);
                    continue;
                }
                imageData = await app.vault.readBinary(file);
                filename = file.name;
                mimeType = getMimeTypeForPath(filename);
            }

            // 体积超限或格式不支持 → 自动压缩重编码为 JPEG
            const ext = filename.split(".").pop()?.toLowerCase() || "";
            const tooBig = imageData.byteLength > MAX_BYTES;
            const formatBad = !ALLOWED_EXTS.has(ext);
            if (tooBig || formatBad) {
                const compressed = await compressImageToFit(imageData, mimeType, filename, MAX_BYTES);
                if (!compressed) {
                    warnings.push(
                        `图片压缩失败 (原 ${(imageData.byteLength / 1024 / 1024).toFixed(1)}MB, .${ext})，已移除: ${filename}`
                    );
                    result = removeImgTagBySrc(result, m.src);
                    continue;
                }
                imageData = compressed.buffer;
                filename = compressed.filename;
            }

            // 上传到微信
            const wechatUrl = await uploadContentImage(token, imageData, filename, proxyUrl, proxyKey);
            result = safeReplace(result, m.src, wechatUrl);
            imageCount++;
        } catch (uploadError) {
            const srcPreview = m.src.startsWith("data:") ? m.src.slice(0, 50) + "..." : m.src;
            warnings.push(`上传失败: ${srcPreview} (${String(uploadError)})`);
            // 上传失败一律移除 img 标签，避免破图
            result = removeImgTagBySrc(result, m.src);
        }
    }

    return { html: result, imageCount, warnings };
}

// ─────────────────────────────────────────────
// 封面图上传（永久素材）
// ─────────────────────────────────────────────

/**
 * 生成默认封面图 — 200×200 蓝色 JPEG (内嵌 base64)
 * 微信要求 thumb_media_id 必填，此为无文章图片时的兜底封面
 */
function generateDefaultThumbJpeg(): ArrayBuffer {
    const b64 = "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCADIAMgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDzqiiiv7FP5vCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/2Q==";
    const binaryStr = atob(b64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes.buffer;
}

/**
 * 上传封面图（永久图片素材）到微信
 * 接口：POST /cgi-bin/material/add_material?type=image
 * 返回 media_id 用于 thumb_media_id
 */
export async function uploadThumbImage(
    token: string,
    imageData?: ArrayBuffer,
    filename?: string,
    proxyUrl = DEFAULT_WECHAT_PROXY_URL,
    proxyKey = DEFAULT_WECHAT_PROXY_KEY
): Promise<string> {
    const data = imageData || generateDefaultThumbJpeg();
    const fname = filename || "cover.jpg";
    const mimeType = getMimeTypeForPath(fname);

    const boundary = `----WeChatThumb${Date.now()}`;
    const header = [
        `--${boundary}`,
        `Content-Disposition: form-data; name="media"; filename="${fname}"`,
        `Content-Type: ${mimeType}`,
        "",
        "",
    ].join("\r\n");
    const footer = `\r\n--${boundary}--\r\n`;

    const headerBytes = new TextEncoder().encode(header);
    const footerBytes = new TextEncoder().encode(footer);
    const imageBytes = new Uint8Array(data);

    const body = new Uint8Array(headerBytes.length + imageBytes.length + footerBytes.length);
    body.set(headerBytes, 0);
    body.set(imageBytes, headerBytes.length);
    body.set(footerBytes, headerBytes.length + imageBytes.length);

    const response = await requestWechatApi(
        `/cgi-bin/material/add_material?access_token=${token}&type=image`,
        {
            method: "POST",
            headers: {
                "Content-Type": `multipart/form-data; boundary=${boundary}`,
            },
            body: body.buffer,
        },
        proxyUrl,
        proxyKey
    );

    if (response.json?.errcode) {
        throw new Error(
            `上传封面图失败 [${response.json.errcode}]: ${response.json.errmsg || "未知错误"}`
        );
    }

    const mediaId = response.json?.media_id;
    if (!mediaId) {
        throw new Error(`上传封面图未返回 media_id: ${JSON.stringify(response.json)}`);
    }

    return mediaId;
}

// ─────────────────────────────────────────────
// 草稿发布
// ─────────────────────────────────────────────

/**
 * 新建草稿
 * 接口：POST /cgi-bin/draft/add
 * 注意：thumb_media_id（封面图永久素材ID）为必填字段
 */
export async function createDraft(
    token: string,
    meta: WechatDraftMeta,
    htmlContent: string,
    thumbMediaId: string,
    proxyUrl = DEFAULT_WECHAT_PROXY_URL,
    proxyKey = DEFAULT_WECHAT_PROXY_KEY
): Promise<string> {
    const article: Record<string, string> = {
        title: meta.title,
        content: htmlContent,
    };

    // 封面图 — 只在有有效 thumb_media_id 时才填入
    if (thumbMediaId) {
        article.thumb_media_id = thumbMediaId;
    }

    if (meta.author) {
        article.author = meta.author;
    }
    if (meta.digest) {
        article.digest = meta.digest.slice(0, 128); // 微信限制 128 字
    }

    const body = JSON.stringify({
        articles: [article],
    });

    const response = await requestWechatApi(
        `/cgi-bin/draft/add?access_token=${token}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
        },
        proxyUrl,
        proxyKey
    );

    if (response.json?.errcode) {
        throw new Error(
            `创建草稿失败 [${response.json.errcode}]: ${response.json.errmsg || "未知错误"}`
        );
    }

    const mediaId = response.json?.media_id;
    if (!mediaId) {
        throw new Error(`创建草稿未返回 media_id: ${JSON.stringify(response.json)}`);
    }

    return mediaId;
}

// ─────────────────────────────────────────────
// 完整发布流程
// ─────────────────────────────────────────────

/**
 * 完整发布到微信草稿箱
 */
export async function publishToDraft(
    app: App,
    account: WechatMPAccount,
    htmlContent: string,
    currentFilePath: string,
    meta: WechatDraftMeta
): Promise<WechatPublishResult> {
    const warnings: string[] = [];
    const accountWithProxy = applyDefaultProxyToAccount(account);
    const proxyUrl = accountWithProxy.proxyUrl || DEFAULT_WECHAT_PROXY_URL;
    const proxyKey = accountWithProxy.proxyKey || DEFAULT_WECHAT_PROXY_KEY;

    // 1. 获取 access_token
    let token: string;
    try {
        token = await getAccessToken(account.appId, account.appSecret, proxyUrl, proxyKey);
    } catch (tokenError) {
        // token 失败时清缓存后重试
        clearTokenCache(account.appId);
        token = await getAccessToken(account.appId, account.appSecret, proxyUrl, proxyKey);
    }

    // 2. 处理文章内图片 → 上传到微信图床
    const imageResult = await processHtmlImagesForWechat(
        app,
        htmlContent,
        currentFilePath,
        token,
        proxyUrl,
        proxyKey
    );
    warnings.push(...imageResult.warnings);

    // 3. 标题截断（微信限制 64 字符）
    if (meta.title && meta.title.length > 64) {
        meta.title = meta.title.slice(0, 61) + "...";
    }

    // 4. 上传封面图（永久素材）获取 thumb_media_id
    //    策略：从文章中提取第一张图片作为封面
    let thumbMediaId: string;
    try {
        // 从处理后的 HTML 中提取第一张图片 URL
        const imgMatch = imageResult.html.match(/<img[^>]+src="([^"]+)"/i);
        if (imgMatch && imgMatch[1]) {
            const firstImgUrl = imgMatch[1];
            // 如果是微信CDN图片（已上传），下载后重传为永久素材
            if (firstImgUrl.startsWith("http")) {
                const imgResp = await requestUrl({ url: firstImgUrl });
                thumbMediaId = await uploadThumbImage(
                    token,
                    imgResp.arrayBuffer,
                    "cover.jpg",
                    proxyUrl,
                    proxyKey
                );
            } else if (firstImgUrl.startsWith("data:")) {
                // base64 图片，解码后上传
                const b64Match = firstImgUrl.match(/^data:[^;]+;base64,(.+)$/);
                if (b64Match) {
                    const binaryStr = atob(b64Match[1]);
                    const bytes = new Uint8Array(binaryStr.length);
                    for (let i = 0; i < binaryStr.length; i++) {
                        bytes[i] = binaryStr.charCodeAt(i);
                    }
                    thumbMediaId = await uploadThumbImage(
                        token,
                        bytes.buffer,
                        "cover.png",
                        proxyUrl,
                        proxyKey
                    );
                } else {
                    throw new Error("无法解析 base64 图片");
                }
            } else {
                throw new Error("无可用图片");
            }
        } else {
            throw new Error("文章中没有图片");
        }
    } catch (thumbError) {
        // 封面图提取失败 → 用默认兜底封面图上传获取有效 media_id
        // 微信 draft/add 强制要求 thumb_media_id 必填，不能传空
        try {
            thumbMediaId = await uploadThumbImage(token, undefined, undefined, proxyUrl, proxyKey);
            warnings.push(`封面图: ${String(thumbError)}。已使用默认封面，请在公众号后台手动替换。`);
        } catch (defaultThumbError) {
            warnings.push(`封面图: ${String(thumbError)}。默认封面也上传失败: ${String(defaultThumbError)}`);
            thumbMediaId = "";
        }
    }

    // 5. 创建草稿
    const mediaId = await createDraft(token, meta, imageResult.html, thumbMediaId, proxyUrl, proxyKey);

    return {
        mediaId,
        title: meta.title,
        imageCount: imageResult.imageCount,
        warnings,
    };
}
