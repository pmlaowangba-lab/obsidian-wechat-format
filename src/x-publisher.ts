import { App, requestUrl } from "obsidian";
import { marked } from "marked";
import { preprocessObsidian } from "./converter";
import { getMimeTypeForPath, isRemoteUrl, resolveImagePath } from "./image-handler";
import { XOAuth2TokenSet, refreshAccessToken, isTokenExpiringSoon } from "./x-oauth";

interface OAuth1Credentials {
    apiKey: string;
    apiKeySecret: string;
    accessToken: string;
    accessTokenSecret: string;
}

interface OAuth2Credentials {
    userAccessToken: string;
}

type XCredentials =
    | { mode: "oauth1"; oauth1: OAuth1Credentials }
    | { mode: "oauth2"; oauth2: OAuth2Credentials };

export interface XPublishResult {
    tweetId: string;
    url: string;
    textLength: number;
    mediaCount: number;
    warnings: string[];
    threadIds?: string[];
}

function parseEnv(content: string): Record<string, string> {
    const env: Record<string, string> = {};
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) {
            continue;
        }
        const idx = line.indexOf("=");
        if (idx <= 0) {
            continue;
        }
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
        env[key] = value;
    }
    return env;
}

async function loadXCredentials(
    app: App,
    pluginDir: string,
    settingsTokens?: XOAuth2TokenSet | null,
    clientId?: string,
    clientSecret?: string
): Promise<XCredentials> {
    // 优先使用 settings 中的 OAuth 2.0 token
    if (settingsTokens && settingsTokens.accessToken) {
        // 检查是否需要刷新
        if (isTokenExpiringSoon(settingsTokens) && settingsTokens.refreshToken && clientId) {
            try {
                const refreshed = await refreshAccessToken(settingsTokens.refreshToken, clientId, clientSecret);
                // 返回刷新后的 token，调用者负责保存
                (loadXCredentials as any).__refreshedTokens = refreshed;
                return {
                    mode: "oauth2",
                    oauth2: { userAccessToken: refreshed.accessToken },
                };
            } catch {
                // 刷新失败，使用现有 token
            }
        }
        return {
            mode: "oauth2",
            oauth2: { userAccessToken: settingsTokens.accessToken },
        };
    }

    // 回退到 .env 文件
    const envPath = `${app.vault.configDir}/plugins/${pluginDir}/.env`;
    let env: Record<string, string> = {};

    if (await app.vault.adapter.exists(envPath)) {
        const content = await app.vault.adapter.read(envPath);
        env = parseEnv(content);
    }

    const processEnv = (typeof process !== "undefined" ? (process as any).env : {}) || {};
    const getValue = (key: string) => env[key] || processEnv[key] || "";

    const apiKey = getValue("X_API_KEY");
    const apiKeySecret = getValue("X_API_KEY_SECRET");
    const accessToken = getValue("X_ACCESS_TOKEN");
    const accessTokenSecret = getValue("X_ACCESS_TOKEN_SECRET");
    const userAccessToken = getValue("X_USER_ACCESS_TOKEN");

    if (apiKey && apiKeySecret && accessToken && accessTokenSecret) {
        return {
            mode: "oauth1",
            oauth1: { apiKey, apiKeySecret, accessToken, accessTokenSecret },
        };
    }

    if (userAccessToken) {
        return {
            mode: "oauth2",
            oauth2: { userAccessToken },
        };
    }

    throw new Error(
        `缺少 X API 凭据。请在插件设置中配置 OAuth 2.0 授权，或在 ${envPath} 配置 API Key`
    );
}

function percentEncode(input: string): string {
    return encodeURIComponent(input).replace(/[!'()*]/g, (ch) =>
        `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
    );
}

function randomNonce(length = 32): string {
    const bytes = new Uint8Array(Math.max(8, Math.floor(length / 2)));
    if (globalThis.crypto?.getRandomValues) {
        globalThis.crypto.getRandomValues(bytes);
    } else {
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = Math.floor(Math.random() * 256);
        }
    }
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = "";
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
}

async function hmacSha1Base64(key: string, data: string): Promise<string> {
    if (!globalThis.crypto?.subtle) {
        throw new Error("当前环境不支持 WebCrypto，无法执行 OAuth 1.0a 签名");
    }
    const encoder = new TextEncoder();
    const cryptoKey = await globalThis.crypto.subtle.importKey(
        "raw",
        encoder.encode(key),
        { name: "HMAC", hash: "SHA-1" },
        false,
        ["sign"]
    );
    const signature = await globalThis.crypto.subtle.sign(
        "HMAC",
        cryptoKey,
        encoder.encode(data)
    );
    return arrayBufferToBase64(signature);
}

function normalizeUrlForOAuth(url: string): { baseUrl: string; queryParams: Array<[string, string]> } {
    const parsed = new URL(url);
    const queryParams: Array<[string, string]> = [];
    parsed.searchParams.forEach((value, key) => {
        queryParams.push([key, value]);
    });
    parsed.search = "";
    return { baseUrl: parsed.toString(), queryParams };
}

async function buildOAuth1AuthHeader(
    method: string,
    url: string,
    creds: OAuth1Credentials,
    extraParams: Array<[string, string]> = []
): Promise<string> {
    const oauthParams: Array<[string, string]> = [
        ["oauth_consumer_key", creds.apiKey],
        ["oauth_nonce", randomNonce()],
        ["oauth_signature_method", "HMAC-SHA1"],
        ["oauth_timestamp", Math.floor(Date.now() / 1000).toString()],
        ["oauth_token", creds.accessToken],
        ["oauth_version", "1.0"],
    ];

    const normalized = normalizeUrlForOAuth(url);
    const signingParams = [...oauthParams, ...normalized.queryParams, ...extraParams];

    signingParams.sort((a, b) => {
        if (a[0] === b[0]) {
            return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
        }
        return a[0] < b[0] ? -1 : 1;
    });

    const normalizedParamString = signingParams
        .map(([k, v]) => `${percentEncode(k)}=${percentEncode(v)}`)
        .join("&");
    const signatureBase = [
        method.toUpperCase(),
        percentEncode(normalized.baseUrl),
        percentEncode(normalizedParamString),
    ].join("&");
    const signingKey = `${percentEncode(creds.apiKeySecret)}&${percentEncode(creds.accessTokenSecret)}`;
    const signature = await hmacSha1Base64(signingKey, signatureBase);

    const authParams = [...oauthParams, ["oauth_signature", signature]];
    return `OAuth ${authParams
        .map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`)
        .join(", ")}`;
}

function extractApiError(responseBody: any, status: number): string {
    if (!responseBody) {
        return `HTTP ${status}`;
    }
    if (typeof responseBody === "string") {
        return responseBody;
    }
    if (responseBody.detail) {
        return responseBody.detail;
    }
    if (responseBody.title) {
        return responseBody.title;
    }
    if (Array.isArray(responseBody.errors) && responseBody.errors.length > 0) {
        const msg = responseBody.errors
            .map((e: any) => e.message || e.detail || JSON.stringify(e))
            .join(" | ");
        if (msg) {
            return msg;
        }
    }
    return JSON.stringify(responseBody);
}

async function requestJson(
    method: "POST" | "GET",
    url: string,
    headers: Record<string, string>,
    body?: string
): Promise<any> {
    const response = await requestUrl({
        url,
        method,
        headers,
        body,
        throw: false,
    });

    if (response.status >= 200 && response.status < 300) {
        return response.json;
    }

    throw new Error(
        `X API 请求失败 (${response.status}): ${extractApiError(response.json || response.text, response.status)}`
    );
}

function extractImageSources(markdown: string): string[] {
    const sources: string[] = [];
    const seen = new Set<string>();

    const pushSrc = (rawSrc: string) => {
        const src = rawSrc.trim();
        if (!src || seen.has(src)) {
            return;
        }
        seen.add(src);
        sources.push(src);
    };

    markdown.replace(/!\[\[([^\]]+?)\]\]/g, (_m, body) => {
        const src = String(body).split("|")[0]?.trim() || "";
        pushSrc(src);
        return _m;
    });

    markdown.replace(/!\[[^\]]*?\]\(([^)]+)\)/g, (_m, src) => {
        pushSrc(String(src));
        return _m;
    });

    return sources;
}

async function markdownToPlainText(markdown: string): Promise<string> {
    const { content, footnotes } = preprocessObsidian(markdown);
    const html = await marked.parse(content, {
        gfm: true,
        breaks: true,
    });
    const doc = new DOMParser().parseFromString(html, "text/html");
    let text = (doc.body.textContent || "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    if (footnotes.length > 0) {
        const footnoteText = footnotes
            .map((fn) => `[${fn.index}] ${fn.text}: ${fn.url}`)
            .join("\n");
        text += `\n\n参考链接\n${footnoteText}`;
    }

    return text;
}

interface UploadableImage {
    base64: string;
    mimeType: string;
    source: string;
}

async function collectUploadableImages(
    app: App,
    markdown: string,
    currentFilePath: string
): Promise<{ images: UploadableImage[]; warnings: string[] }> {
    const sources = extractImageSources(markdown);
    const images: UploadableImage[] = [];
    const warnings: string[] = [];
    const maxImages = 4;
    const maxBytes = 5 * 1024 * 1024;

    for (const src of sources) {
        if (images.length >= maxImages) {
            warnings.push(`图片超过 ${maxImages} 张，后续图片已跳过`);
            break;
        }
        if (isRemoteUrl(src) || src.startsWith("data:")) {
            warnings.push(`远程图片未自动上传: ${src}`);
            continue;
        }

        const file = resolveImagePath(app, src, currentFilePath);
        if (!file) {
            warnings.push(`未找到本地图片: ${src}`);
            continue;
        }

        const data = await app.vault.readBinary(file);
        if (data.byteLength > maxBytes) {
            warnings.push(`图片过大（>5MB）已跳过: ${file.path}`);
            continue;
        }

        images.push({
            base64: arrayBufferToBase64(data),
            mimeType: getMimeTypeForPath(file.path),
            source: file.path,
        });
    }

    return { images, warnings };
}

async function uploadMediaOAuth1(
    image: UploadableImage,
    creds: OAuth1Credentials
): Promise<string> {
    const url = "https://upload.twitter.com/1.1/media/upload.json";
    const params: Array<[string, string]> = [
        ["media_data", image.base64],
        ["media_category", "tweet_image"],
    ];
    const authHeader = await buildOAuth1AuthHeader("POST", url, creds, params);
    const body = params
        .map(([k, v]) => `${percentEncode(k)}=${percentEncode(v)}`)
        .join("&");
    const data = await requestJson("POST", url, {
        Authorization: authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
    }, body);

    const mediaId = data?.media_id_string || (data?.media_id ? String(data.media_id) : "");
    if (!mediaId) {
        throw new Error(`图片上传未返回 media_id: ${JSON.stringify(data)}`);
    }
    return mediaId;
}

async function uploadMediaOAuth2(
    image: UploadableImage,
    creds: OAuth2Credentials
): Promise<string> {
    const url = "https://api.x.com/2/media/upload";
    const data = await requestJson(
        "POST",
        url,
        {
            Authorization: `Bearer ${creds.userAccessToken}`,
            "Content-Type": "application/json",
        },
        JSON.stringify({
            media: image.base64,
            media_type: image.mimeType,
            media_category: "tweet_image",
        })
    );

    const mediaId = data?.data?.id || data?.id;
    if (!mediaId) {
        throw new Error(`图片上传未返回 media_id: ${JSON.stringify(data)}`);
    }
    return String(mediaId);
}

async function createTweetOAuth1(
    text: string,
    mediaIds: string[],
    creds: OAuth1Credentials
): Promise<string> {
    const url = "https://api.x.com/2/tweets";
    const authHeader = await buildOAuth1AuthHeader("POST", url, creds);
    const body: Record<string, any> = { text };
    if (mediaIds.length > 0) {
        body.media = { media_ids: mediaIds };
    }
    const data = await requestJson(
        "POST",
        url,
        {
            Authorization: authHeader,
            "Content-Type": "application/json",
        },
        JSON.stringify(body)
    );
    const tweetId = data?.data?.id || data?.id;
    if (!tweetId) {
        throw new Error(`发帖未返回 tweet id: ${JSON.stringify(data)}`);
    }
    return String(tweetId);
}

async function createTweetOAuth2(
    text: string,
    mediaIds: string[],
    creds: OAuth2Credentials
): Promise<string> {
    const url = "https://api.x.com/2/tweets";
    const body: Record<string, any> = { text };
    if (mediaIds.length > 0) {
        body.media = { media_ids: mediaIds };
    }
    const data = await requestJson(
        "POST",
        url,
        {
            Authorization: `Bearer ${creds.userAccessToken}`,
            "Content-Type": "application/json",
        },
        JSON.stringify(body)
    );
    const tweetId = data?.data?.id || data?.id;
    if (!tweetId) {
        throw new Error(`发帖未返回 tweet id: ${JSON.stringify(data)}`);
    }
    return String(tweetId);
}

// ─── Thread 拆分 ───

function splitIntoThread(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) {
        return [text];
    }

    const tweets: string[] = [];
    const paragraphs = text.split(/\n\n+/);
    let current = "";

    for (const para of paragraphs) {
        // 如果当前段落本身超过限制，按句子拆分
        if (para.length > maxLength) {
            if (current) {
                tweets.push(current.trim());
                current = "";
            }
            // 按句子拆
            const sentences = para.split(/(?<=[.!?。！？\n])\s*/);
            for (const sentence of sentences) {
                if ((current + " " + sentence).trim().length > maxLength) {
                    if (current) {
                        tweets.push(current.trim());
                    }
                    // 如果单句子也超过限制，硬截断
                    if (sentence.length > maxLength) {
                        for (let i = 0; i < sentence.length; i += maxLength) {
                            tweets.push(sentence.slice(i, i + maxLength));
                        }
                        current = "";
                    } else {
                        current = sentence;
                    }
                } else {
                    current = current ? current + " " + sentence : sentence;
                }
            }
        } else if ((current + "\n\n" + para).trim().length > maxLength) {
            if (current) {
                tweets.push(current.trim());
            }
            current = para;
        } else {
            current = current ? current + "\n\n" + para : para;
        }
    }
    if (current.trim()) {
        tweets.push(current.trim());
    }

    return tweets;
}

async function publishThread(
    tweets: string[],
    mediaIds: string[],
    credentials: XCredentials
): Promise<{ tweetIds: string[]; url: string }> {
    const tweetIds: string[] = [];
    let replyToId: string | undefined;

    for (let i = 0; i < tweets.length; i++) {
        const text = tweets[i];
        // 只有第一条带图片
        const currentMediaIds = i === 0 ? mediaIds : [];

        const url = "https://api.x.com/2/tweets";
        const body: Record<string, any> = { text };
        if (currentMediaIds.length > 0) {
            body.media = { media_ids: currentMediaIds };
        }
        if (replyToId) {
            body.reply = { in_reply_to_tweet_id: replyToId };
        }

        let tweetId: string;
        if (credentials.mode === "oauth1") {
            tweetId = await createTweetOAuth1(text, currentMediaIds, credentials.oauth1);
        } else {
            tweetId = await createTweetOAuth2(text, currentMediaIds, credentials.oauth2);
        }

        // 如果有 replyToId，需要重新用 reply 模式发帖
        if (replyToId) {
            const replyUrl = "https://api.x.com/2/tweets";
            const replyBody: Record<string, any> = {
                text,
                reply: { in_reply_to_tweet_id: replyToId },
            };
            if (currentMediaIds.length > 0) {
                replyBody.media = { media_ids: currentMediaIds };
            }

            if (credentials.mode === "oauth1") {
                const authHeader = await buildOAuth1AuthHeader("POST", replyUrl, credentials.oauth1);
                const data = await requestJson("POST", replyUrl, {
                    Authorization: authHeader,
                    "Content-Type": "application/json",
                }, JSON.stringify(replyBody));
                tweetId = String(data?.data?.id || data?.id);
            } else {
                const data = await requestJson("POST", replyUrl, {
                    Authorization: `Bearer ${credentials.oauth2.userAccessToken}`,
                    "Content-Type": "application/json",
                }, JSON.stringify(replyBody));
                tweetId = String(data?.data?.id || data?.id);
            }
        }

        tweetIds.push(tweetId);
        replyToId = tweetId;
    }

    return {
        tweetIds,
        url: `https://x.com/i/web/status/${tweetIds[0]}`,
    };
}

// ─── Main publish function ───

export interface XPublishOptions {
    settingsTokens?: XOAuth2TokenSet | null;
    clientId?: string;
    clientSecret?: string;
    threadMode?: "auto" | "always" | "never";
    maxTweetLength?: number;
    onTokenRefreshed?: (tokens: XOAuth2TokenSet) => void;
}

export async function publishMarkdownToXApi(
    app: App,
    markdown: string,
    currentFilePath: string,
    pluginDir: string,
    options: XPublishOptions = {}
): Promise<XPublishResult> {
    const {
        settingsTokens,
        clientId,
        clientSecret,
        threadMode = "auto",
        maxTweetLength = 280,
        onTokenRefreshed,
    } = options;

    const credentials = await loadXCredentials(app, pluginDir, settingsTokens, clientId, clientSecret);

    // 检查是否有刷新的 token
    const refreshed = (loadXCredentials as any).__refreshedTokens as XOAuth2TokenSet | undefined;
    if (refreshed && onTokenRefreshed) {
        onTokenRefreshed(refreshed);
        delete (loadXCredentials as any).__refreshedTokens;
    }

    const text = await markdownToPlainText(markdown);
    const mediaCollectResult = await collectUploadableImages(app, markdown, currentFilePath);
    const mediaIds: string[] = [];
    const warnings = [...mediaCollectResult.warnings];

    for (const image of mediaCollectResult.images) {
        try {
            const mediaId =
                credentials.mode === "oauth1"
                    ? await uploadMediaOAuth1(image, credentials.oauth1)
                    : await uploadMediaOAuth2(image, credentials.oauth2);
            mediaIds.push(mediaId);
        } catch (error) {
            warnings.push(`上传失败: ${image.source} (${String(error)})`);
        }
    }

    // 决定是否拆分为 Thread
    const shouldThread =
        threadMode === "always" ||
        (threadMode === "auto" && text.length > maxTweetLength);

    if (shouldThread && text.length > maxTweetLength) {
        const tweets = splitIntoThread(text, maxTweetLength);
        const result = await publishThread(tweets, mediaIds, credentials);
        return {
            tweetId: result.tweetIds[0],
            url: result.url,
            textLength: text.length,
            mediaCount: mediaIds.length,
            warnings,
            threadIds: result.tweetIds,
        };
    }

    // 单条发帖
    const tweetId =
        credentials.mode === "oauth1"
            ? await createTweetOAuth1(text, mediaIds, credentials.oauth1)
            : await createTweetOAuth2(text, mediaIds, credentials.oauth2);

    return {
        tweetId,
        url: `https://x.com/i/web/status/${tweetId}`,
        textLength: text.length,
        mediaCount: mediaIds.length,
        warnings,
    };
}
