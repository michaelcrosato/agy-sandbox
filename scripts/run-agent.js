import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config({ quiet: true });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPOSITORY =
  process.env.GITHUB_REPOSITORY || "michaelcrosato/agy-sandbox";
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-3.5-flash";

const SUBSTRATE_PATHS = new Set([
  "docs/AXIOMS.md",
  "docs/AGENT-LOOP.md",
  "scripts/assert-gate-integrity.ps1",
  "scripts/local-gate.ps1",
  "scripts/run-autonomous-loop.ps1",
  "scripts/validate-log-compliance.py",
  "scripts/manifest.txt",
]);

if (GEMINI_API_KEY && GEMINI_API_KEY.startsWith("ghp_")) {
  console.error("GEMINI_API_KEY appears to contain a GitHub token. Aborting.");
  process.exit(1);
}

const genAI =
  GEMINI_API_KEY && GEMINI_API_KEY !== "hidden"
    ? new GoogleGenAI({ apiKey: GEMINI_API_KEY })
    : new GoogleGenAI({});

function runCommand(command, options = {}) {
  try {
    console.log(`$ ${command}`);
    const output = execSync(command, {
      encoding: "utf-8",
      stdio: "pipe",
      ...options,
    });
    return { success: true, output };
  } catch (error) {
    return {
      success: false,
      output: `${error.stdout || ""}${error.stderr || ""}${error.message || ""}`,
    };
  }
}

function requiredEnvForIssue(issueNumber) {
  if (issueNumber === "0") return;
  if (!GITHUB_TOKEN || GITHUB_TOKEN === "hidden") {
    console.error("GITHUB_TOKEN is required for non-mock issue runs.");
    process.exit(1);
  }
}

function parseIssueNumber() {
  const args = process.argv.slice(2);
  let issueNumber = process.env.ISSUE_NUMBER;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--issue" && args[i + 1]) issueNumber = args[i + 1];
  }
  if (!issueNumber) {
    console.error("No issue number specified. Use --issue <number>.");
    process.exit(1);
  }
  return String(issueNumber);
}

async function fetchIssueDetails(issueNumber) {
  if (issueNumber === "0") {
    let title = "Local Mock Dry Run Issue";
    let body =
      "Implement a small, reversible improvement and prove it with npm run agent:check.";
    if (fs.existsSync("plan/mock_issue.md")) {
      const content = fs.readFileSync("plan/mock_issue.md", "utf-8");
      const [firstLine = "", ...rest] = content.split("\n");
      title = firstLine.replace(/^#\s*/, "").trim() || title;
      body = rest.join("\n").trim() || body;
    }
    return { title, body, commentsUrl: null };
  }

  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_REPOSITORY}/issues/${issueNumber}`,
    {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "agy-autonomous-agent",
      },
    },
  );
  if (!response.ok) {
    throw new Error(
      `Failed to fetch issue: ${response.status} ${response.statusText}`,
    );
  }
  const issue = await response.json();
  return {
    title: issue.title,
    body: issue.body || "",
    commentsUrl: issue.comments_url,
  };
}

async function fetchIssueComments(commentsUrl) {
  if (!commentsUrl) return [];
  const response = await fetch(commentsUrl, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "agy-autonomous-agent",
    },
  });
  if (!response.ok) return [];
  const comments = await response.json();
  return comments.map((comment) => `${comment.user.login}: ${comment.body}`);
}

async function addIssueComment(issueNumber, body) {
  if (issueNumber === "0") {
    console.log(`[MOCK issue comment]\n${body}`);
    return;
  }
  await fetch(
    `https://api.github.com/repos/${GITHUB_REPOSITORY}/issues/${issueNumber}/comments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "User-Agent": "agy-autonomous-agent",
      },
      body: JSON.stringify({ body }),
    },
  );
}

async function createPullRequest(branchName, title, body) {
  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_REPOSITORY}/pulls`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "User-Agent": "agy-autonomous-agent",
      },
      body: JSON.stringify({ title, body, head: branchName, base: "main" }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Failed to create PR: ${response.status} ${await response.text()}`,
    );
  }
  const pr = await response.json();
  return pr.html_url;
}

function readIfExists(filePath) {
  return fs.existsSync(filePath)
    ? `--- FILE: ${filePath} ---\n${fs.readFileSync(filePath, "utf-8")}\n`
    : "";
}

function listGitFiles() {
  const result = runCommand("git ls-files", { maxBuffer: 1024 * 1024 * 20 });
  if (!result.success) return [];
  return result.output.split(/\r?\n/).filter(Boolean);
}

function getContextPack() {
  const alwaysRead = [
    "AGENTS.md",
    ".github/AGENT_RULES.md",
    "docs/GOAL.md",
    "plan/PROGRESS.md",
    "docs/ai/REPO_MAP.md",
    "package.json",
  ];
  const files = listGitFiles().filter((filePath) => {
    if (!filePath.startsWith("src/")) return false;
    if (!filePath.endsWith(".js")) return false;
    return !filePath.includes("/node_modules/");
  });

  const chunks = [];
  for (const filePath of alwaysRead) chunks.push(readIfExists(filePath));
  for (const filePath of files) chunks.push(readIfExists(filePath));
  return chunks.join("\n");
}

function normalizePath(relativePath) {
  const normalized = path.normalize(relativePath).replaceAll("\\", "/");
  if (
    normalized.startsWith("../") ||
    normalized === ".." ||
    path.isAbsolute(normalized)
  ) {
    throw new Error(`Unsafe path outside workspace: ${relativePath}`);
  }
  return normalized;
}

function assertWritablePath(relativePath) {
  const normalized = normalizePath(relativePath);
  if (SUBSTRATE_PATHS.has(normalized)) {
    throw new Error(`Blocked substrate write: ${normalized}`);
  }
  return normalized;
}

function applyFileOperations(operations) {
  const originals = new Map();
  for (const operation of operations) {
    const target = assertWritablePath(operation.path);
    if (!originals.has(target)) {
      originals.set(
        target,
        fs.existsSync(target) ? fs.readFileSync(target, "utf-8") : null,
      );
    }

    if (operation.action === "create" || operation.action === "modify") {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, operation.content, "utf-8");
      console.log(`wrote ${target}`);
    } else if (operation.action === "delete") {
      if (fs.existsSync(target)) fs.unlinkSync(target);
      console.log(`deleted ${target}`);
    }
  }
  return originals;
}

function restoreOriginals(originals) {
  for (const [filePath, content] of originals.entries()) {
    if (content === null) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } else {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content, "utf-8");
    }
  }
}

function checkoutTaskBranch(issueNumber, title) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
  const branchName = `auto/issue-${issueNumber}-${slug || "task"}-${Date.now()}`;
  const checkout = runCommand(`git checkout -b ${branchName}`);
  if (!checkout.success) throw new Error(checkout.output);
  return branchName;
}

async function run() {
  const issueNumber = parseIssueNumber();
  requiredEnvForIssue(issueNumber);

  const issue = await fetchIssueDetails(issueNumber);
  const comments = await fetchIssueComments(issue.commentsUrl);
  const branchName = checkoutTaskBranch(issueNumber, issue.title);

  const systemPrompt = `You are a fully autonomous AI developer agent working in agy-sandbox.
Follow AGENTS.md and .github/AGENT_RULES.md exactly.
Do not modify substrate files. Keep changes small. Add or update tests. The final work must pass npm run agent:check.
Return only a JSON array of file operations with complete file content.`;

  const userPrompt = `Issue #${issueNumber}\nTitle: ${issue.title}\nBody:\n${issue.body}\n\nComments:\n${comments.join("\n")}\n\nRepository context:\n${getContextPack()}`;

  const generationConfig = {
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          path: { type: Type.STRING },
          action: { type: Type.STRING, enum: ["create", "modify", "delete"] },
          content: { type: Type.STRING },
        },
        required: ["path", "action", "content"],
      },
    },
  };

  let feedback = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`generation attempt ${attempt}/3 using ${MODEL_NAME}`);
    let resultText;
    if (issueNumber === "0") {
      const serverPath = "src/server.js";
      let content = fs.readFileSync(serverPath, "utf-8");
      const commentPattern = /\/\/ MOCK DRY RUN ACTIVE - \d+/;
      const commentStr = `// MOCK DRY RUN ACTIVE - ${Date.now()}`;
      if (commentPattern.test(content)) {
        content = content.replace(commentPattern, commentStr);
      } else {
        content += `\n${commentStr}\n`;
      }
      resultText = JSON.stringify([
        {
          path: "src/server.js",
          action: "modify",
          content: content,
        },
      ]);
    } else {
      const result = await genAI.models.generateContent({
        model: MODEL_NAME,
        contents: `${systemPrompt}\n\n${userPrompt}${feedback ? `\n\nPrevious gate output:\n${feedback}` : ""}`,
        config: generationConfig,
      });
      resultText = result.text;
    }

    let operations;
    try {
      operations = JSON.parse(resultText);
    } catch (error) {
      feedback = `Model response was not valid JSON: ${error.message}`;
      continue;
    }

    const originals = applyFileOperations(operations);
    const gate = runCommand("npm run agent:check", {
      maxBuffer: 1024 * 1024 * 30,
    });
    if (gate.success) {
      runCommand("git add .");
      const commitMessage = `feat: autonomously resolve issue #${issueNumber}\n\nResolves issue #${issueNumber}: ${issue.title}`;
      fs.writeFileSync(".git-commit-msg.txt", commitMessage, "utf-8");
      runCommand("git commit -F .git-commit-msg.txt");
      fs.unlinkSync(".git-commit-msg.txt");

      if (issueNumber === "0") {
        console.log(`[MOCK] committed ${branchName}; skipping push and PR.`);
        return;
      }

      const push = runCommand(`git push -u origin ${branchName}`);
      if (!push.success) throw new Error(push.output);

      const prUrl = await createPullRequest(
        branchName,
        `[AUTO] Resolve: ${issue.title}`,
        `Autonomous solution for #${issueNumber}.\n\nValidation: \`npm run agent:check\` passed.\n\nCloses #${issueNumber}.`,
      );
      await addIssueComment(
        issueNumber,
        `Autonomous solution proposed: ${prUrl}`,
      );
      return;
    }

    feedback = gate.output;
    restoreOriginals(originals);
  }

  await addIssueComment(
    issueNumber,
    "Autonomous coding failed after three attempts. No green commit was produced.",
  );
  process.exit(1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
