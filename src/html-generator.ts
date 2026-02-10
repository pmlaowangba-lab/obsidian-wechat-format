/**
 * HTML 预览页面生成器
 * 生成一个完整的 HTML 页面，包含文章预览和一键复制按钮
 */

export function generatePreviewHtml(
    articleHtml: string,
    title: string
): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - 公众号预览</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 20px;
    }

    .header {
      text-align: center;
      padding: 20px 0 16px;
      color: #fff;
    }

    .header h1 {
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 6px;
      text-shadow: 0 2px 4px rgba(0,0,0,0.2);
    }

    .header p {
      font-size: 14px;
      opacity: 0.85;
    }

    .toolbar {
      display: flex;
      gap: 12px;
      justify-content: center;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }

    .copy-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 14px 36px;
      font-size: 16px;
      font-weight: 600;
      color: #fff;
      background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
      border: none;
      border-radius: 50px;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 4px 15px rgba(245, 87, 108, 0.4);
      letter-spacing: 1px;
    }

    .copy-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(245, 87, 108, 0.6);
    }

    .copy-btn:active {
      transform: translateY(0);
    }

    .copy-btn.success {
      background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
      box-shadow: 0 4px 15px rgba(67, 233, 123, 0.4);
    }

    .preview-container {
      width: 100%;
      max-width: 780px;
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.15);
      overflow: hidden;
      margin-bottom: 20px;
    }

    .phone-header {
      background: #f8f8f8;
      padding: 12px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #eee;
    }

    .phone-header .title {
      font-size: 14px;
      font-weight: 600;
      color: #333;
    }

    .phone-header .badge {
      font-size: 11px;
      padding: 3px 8px;
      background: #07c160;
      color: #fff;
      border-radius: 10px;
    }

    .article-content {
      padding: 24px 28px;
      line-height: 1.8;
    }

    .toast {
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%) translateY(-100px);
      background: rgba(0,0,0,0.8);
      color: #fff;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 15px;
      transition: transform 0.3s ease;
      z-index: 1000;
      backdrop-filter: blur(10px);
    }

    .toast.show {
      transform: translateX(-50%) translateY(0);
    }

    .footer {
      text-align: center;
      padding: 12px;
      color: rgba(255,255,255,0.6);
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>📋 公众号格式预览</h1>
    <p>${escapeHtml(title)}</p>
  </div>

  <div class="toolbar">
    <button class="copy-btn" id="copyBtn" onclick="copyArticle()">
      🎯 一键复制到公众号
    </button>
  </div>

  <div class="preview-container">
    <div class="phone-header">
      <span class="title">文章预览</span>
      <span class="badge">公众号格式</span>
    </div>
    <div class="article-content" id="articleContent">
      ${articleHtml}
    </div>
  </div>

  <div class="toolbar">
    <button class="copy-btn" id="copyBtn2" onclick="copyArticle()">
      🎯 一键复制到公众号
    </button>
  </div>

  <div class="footer">
    Obsidian WeChat Format Plugin · 复制后直接粘贴到公众号编辑器即可
  </div>

  <div class="toast" id="toast"></div>

  <script>
    async function copyArticle() {
      const content = document.getElementById('articleContent');
      const btn = document.getElementById('copyBtn');
      const btn2 = document.getElementById('copyBtn2');
      
      try {
        // 使用 ClipboardItem API 写入 text/html
        const htmlContent = content.innerHTML;
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const textBlob = new Blob([content.innerText], { type: 'text/plain' });
        
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': blob,
            'text/plain': textBlob
          })
        ]);
        
        // 成功反馈
        btn.innerHTML = '✅ 复制成功！';
        btn.classList.add('success');
        btn2.innerHTML = '✅ 复制成功！';
        btn2.classList.add('success');
        showToast('复制成功！直接粘贴到公众号编辑器即可 🎉');
        
        setTimeout(() => {
          btn.innerHTML = '🎯 一键复制到公众号';
          btn.classList.remove('success');
          btn2.innerHTML = '🎯 一键复制到公众号';
          btn2.classList.remove('success');
        }, 3000);
        
      } catch (err) {
        // 降级方案：使用 execCommand
        try {
          const range = document.createRange();
          range.selectNodeContents(content);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          document.execCommand('copy');
          selection.removeAllRanges();
          
          btn.innerHTML = '✅ 复制成功！';
          btn.classList.add('success');
          btn2.innerHTML = '✅ 复制成功！';
          btn2.classList.add('success');
          showToast('复制成功！直接粘贴到公众号编辑器即可 🎉');
          
          setTimeout(() => {
            btn.innerHTML = '🎯 一键复制到公众号';
            btn.classList.remove('success');
            btn2.innerHTML = '🎯 一键复制到公众号';
            btn2.classList.remove('success');
          }, 3000);
        } catch (e) {
          showToast('复制失败，请手动选择内容复制');
        }
      }
    }

    function showToast(message) {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
      }, 3000);
    }
  </script>
</body>
</html>`;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
