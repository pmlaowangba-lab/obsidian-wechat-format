/**
 * X OAuth 2.0 Authorization Code Flow with PKCE
 * 
 * Obsidian 桌面端专用：启动本地 HTTP server 接收授权回调
 */

export interface XOAuth2TokenSet {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;   // Unix timestamp (ms)
    scope: string;
}

// ─── PKCE helpers ───

function base64UrlEncode(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = "";
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
    }
    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

function randomString(length: number): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    const bytes = new Uint8Array(length);
    if (globalThis.crypto?.getRandomValues) {
        globalThis.crypto.getRandomValues(bytes);
    } else {
        for (let i = 0; i < length; i++) {
            bytes[i] = Math.floor(Math.random() * 256);
        }
    }
    return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export async function generatePKCE(): Promise<{ codeVerifier: string; codeChallenge: string }> {
    const codeVerifier = randomString(64);

    if (globalThis.crypto?.subtle) {
        const encoder = new TextEncoder();
        const digest = await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(codeVerifier));
        return { codeVerifier, codeChallenge: base64UrlEncode(digest) };
    }

    // Fallback: plain method (less secure but works)
    return { codeVerifier, codeChallenge: codeVerifier };
}

// ─── OAuth 2.0 Flow ───

const X_AUTH_URL = "https://x.com/i/oauth2/authorize";
const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";
const REDIRECT_PORT = 17839;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;

const DEFAULT_SCOPES = [
    "tweet.read",
    "tweet.write",
    "users.read",
    "offline.access",
].join(" ");

/**
 * 启动完整 OAuth 2.0 PKCE 授权流程
 * 1. 启动本地 HTTP server 监听回调
 * 2. 打开浏览器让用户授权
 * 3. 收到 code 后交换 token
 * 4. 关闭 server，返回 token
 */
export async function startOAuth2Flow(clientId: string, clientSecret?: string): Promise<XOAuth2TokenSet> {
    const { codeVerifier, codeChallenge } = await generatePKCE();
    const state = randomString(32);
    const challengeMethod = (globalThis.crypto?.subtle) ? "S256" : "plain";

    // 构造授权 URL
    const authUrl = new URL(X_AUTH_URL);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authUrl.searchParams.set("scope", DEFAULT_SCOPES);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", challengeMethod);

    return new Promise<XOAuth2TokenSet>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const http = require("http") as typeof import("http");
        const { shell } = require("electron") as {
            shell: { openExternal: (url: string) => Promise<void> };
        };

        let settled = false;
        const timeout = setTimeout(() => {
            if (!settled) {
                settled = true;
                server.close();
                reject(new Error("OAuth 授权超时（5分钟），请重试"));
            }
        }, 5 * 60 * 1000);

        const server = http.createServer(async (req: any, res: any) => {
            try {
                const reqUrl = new URL(req.url || "/", `http://localhost:${REDIRECT_PORT}`);

                if (reqUrl.pathname !== "/callback") {
                    res.writeHead(404);
                    res.end("Not Found");
                    return;
                }

                const code = reqUrl.searchParams.get("code");
                const returnedState = reqUrl.searchParams.get("state");
                const error = reqUrl.searchParams.get("error");

                if (error) {
                    const desc = reqUrl.searchParams.get("error_description") || error;
                    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
                    res.end(buildResultPage(false, `授权失败: ${desc}`));
                    if (!settled) {
                        settled = true;
                        clearTimeout(timeout);
                        server.close();
                        reject(new Error(`OAuth 授权失败: ${desc}`));
                    }
                    return;
                }

                if (!code || returnedState !== state) {
                    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
                    res.end(buildResultPage(false, "无效的授权回调"));
                    return;
                }

                // 交换 token
                const tokens = await exchangeCodeForToken(code, codeVerifier, clientId, clientSecret);

                res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
                res.end(buildResultPage(true, "授权成功！你可以关闭此窗口，回到 Obsidian。"));

                if (!settled) {
                    settled = true;
                    clearTimeout(timeout);
                    server.close();
                    resolve(tokens);
                }
            } catch (err) {
                res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
                res.end(buildResultPage(false, `Token 获取失败: ${err}`));
                if (!settled) {
                    settled = true;
                    clearTimeout(timeout);
                    server.close();
                    reject(err);
                }
            }
        });

        server.on("error", (err: Error) => {
            if (!settled) {
                settled = true;
                clearTimeout(timeout);
                reject(new Error(`无法启动本地授权服务: ${err.message}`));
            }
        });

        server.listen(REDIRECT_PORT, "127.0.0.1", () => {
            shell.openExternal(authUrl.toString()).catch((err) => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timeout);
                    server.close();
                    reject(new Error(`无法打开浏览器: ${err}`));
                }
            });
        });
    });
}

/**
 * 用 authorization code 交换 access_token + refresh_token
 */
async function exchangeCodeForToken(
    code: string,
    codeVerifier: string,
    clientId: string,
    clientSecret?: string
): Promise<XOAuth2TokenSet> {
    const body = new URLSearchParams({
        code,
        grant_type: "authorization_code",
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
        code_verifier: codeVerifier,
    }).toString();

    const headers: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
    };

    // Confidential Client 需要 Basic Auth
    if (clientSecret) {
        headers["Authorization"] = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
    }

    const response = await fetch(X_TOKEN_URL, {
        method: "POST",
        headers,
        body,
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Token 交换失败 (${response.status}): ${text}`);
    }

    const data = await response.json();
    return parseTokenResponse(data);
}

/**
 * 使用 refresh_token 刷新 access_token
 */
export async function refreshAccessToken(
    refreshToken: string,
    clientId: string,
    clientSecret?: string
): Promise<XOAuth2TokenSet> {
    const body = new URLSearchParams({
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        client_id: clientId,
    }).toString();

    const headers: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
    };

    if (clientSecret) {
        headers["Authorization"] = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
    }

    const response = await fetch(X_TOKEN_URL, {
        method: "POST",
        headers,
        body,
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Token 刷新失败 (${response.status}): ${text}`);
    }

    const data = await response.json();
    return parseTokenResponse(data);
}

function parseTokenResponse(data: any): XOAuth2TokenSet {
    const accessToken = data.access_token;
    const refreshToken = data.refresh_token || "";
    const expiresIn = data.expires_in || 7200;
    const scope = data.scope || "";

    if (!accessToken) {
        throw new Error(`Token 响应缺少 access_token: ${JSON.stringify(data)}`);
    }

    return {
        accessToken,
        refreshToken,
        expiresAt: Date.now() + expiresIn * 1000,
        scope,
    };
}

/**
 * 检查 token 是否即将过期（提前 5 分钟）
 */
export function isTokenExpiringSoon(tokens: XOAuth2TokenSet): boolean {
    return Date.now() > tokens.expiresAt - 5 * 60 * 1000;
}

// ─── Callback HTML ───

function buildResultPage(success: boolean, message: string): string {
    const emoji = success ? "✅" : "❌";
    const color = success ? "#1da1f2" : "#e0245e";
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>X 授权</title>
<style>
  body { font-family: system-ui, sans-serif; display: flex; align-items: center;
         justify-content: center; height: 100vh; margin: 0;
         background: #15202b; color: #e7e9ea; }
  .card { text-align: center; padding: 3rem; border-radius: 16px;
          background: #192734; box-shadow: 0 4px 24px rgba(0,0,0,.4); max-width: 400px; }
  h1 { font-size: 2.5rem; margin-bottom: 0.5rem; }
  p { font-size: 1.1rem; color: #8899a6; margin-top: 0.5rem; }
  .badge { display: inline-block; padding: 0.3rem 1rem; border-radius: 999px;
           background: ${color}22; color: ${color}; font-weight: 600;
           font-size: 0.9rem; margin-top: 1rem; }
</style></head>
<body><div class="card">
  <h1>${emoji}</h1>
  <p>${message}</p>
  <div class="badge">Obsidian X Publisher</div>
</div></body></html>`;
}
