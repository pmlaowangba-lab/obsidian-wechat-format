const fs = require('fs');

function testYuqueConvert() {
    console.log("=== Testing Yuque Converter ===\n");
    // Since we cannot run the TS file directly without setup, we will reproduce the pure logic here
    const CALLOUT_TO_YUQUE = {
        note: "info", info: "info", abstract: "info", summary: "info",
        tip: "tips", success: "success",
        question: "warning", important: "warning", warning: "warning",
        caution: "danger", danger: "danger", failure: "danger", bug: "danger",
        example: "info", quote: "info", todo: "info",
    };

    function convertToYuque(markdown) {
        let content = markdown;
        content = content.replace(/\r\n/g, "\n");
        content = content.replace(/^---\n[\s\S]*?\n---\n*/, "");
        
        content = content.replace(/!\[\[([^\]|]+?)(?:\|(\d+))?\]\]/g, (_m, path, _size) => {
            return `![${path}](${path})`;
        });
        
        content = content.replace(
            /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g,
            (_m, link, display) => display || link
        );

        content = content.replace(/==(.+?)==/g, "**$1**");

        const lines = content.split("\n");
        const outputLines = [];
        let i = 0;
        while (i < lines.length) {
            const calloutMatch = lines[i].match(/^>\s*\[!(\w+)\][-+]?\s*(.*)/);
            if (calloutMatch) {
                const type = calloutMatch[1].toLowerCase();
                const title = calloutMatch[2].trim();
                const yuqueType = CALLOUT_TO_YUQUE[type] || "info";
                const bodyLines = [];
                i++;
                while (i < lines.length && /^>\s?/.test(lines[i])) {
                    const stripped = lines[i].replace(/^>\s?/, "");
                    bodyLines.push(stripped);
                    i++;
                }
                if (title) {
                    outputLines.push(`:::${yuqueType}`);
                    outputLines.push(`**${title}**`);
                } else {
                    outputLines.push(`:::${yuqueType}`);
                }
                for (const bl of bodyLines) {
                    outputLines.push(bl);
                }
                outputLines.push(":::");
                outputLines.push("");
            } else {
                outputLines.push(lines[i]);
                i++;
            }
        }
        return outputLines.join("\n").trim() + "\n";
    }

    const testMarkdown = fs.readFileSync('D:/课程总总文件包/Obsidian 知识库/老王Win库/yuque-test.md', 'utf8');
    const result = convertToYuque(testMarkdown);
    console.log(result);
}

testYuqueConvert();
