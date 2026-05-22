import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import dotenv from "dotenv";

dotenv.config();

// Ensure required environment variables are set
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPOSITORY =
  process.env.GITHUB_REPOSITORY || "michaelcrosato/agy-sandbox";

if (!GEMINI_API_KEY) {
  console.error("❌ Error: GEMINI_API_KEY environment variable is not set.");
  process.exit(1);
}

// Set up generative AI client
// Note: GoogleGenAI class might not exist, the standard import is `GoogleGenAI` or `GoogleGenAI` from @google/generative-ai
// Actually, standard modern import is:
// import { GoogleGenAI } from '@google/generative-ai'; is not correct in all versions.
// The correct import in standard @google/generative-ai v0.11+ is:
// import { GoogleGenerativeAI } from "@google/generative-ai";
// Let's verify by importing GoogleGenerativeAI.
import { GoogleGenerativeAI } from "@google/generative-ai";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Helper to run shell commands safely
function runCommand(command) {
  try {
    console.log(`Running: ${command}`);
    const stdout = execSync(command, { encoding: "utf-8", stdio: "pipe" });
    return { success: true, output: stdout };
  } catch (error) {
    return { success: false, output: error.stdout || error.message };
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
let issueNumber = process.env.ISSUE_NUMBER;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--issue" && args[i + 1]) {
    issueNumber = args[i + 1];
    break;
  }
}

if (!issueNumber) {
  console.error(
    "❌ Error: No issue number specified. Use --issue <number> or set the ISSUE_NUMBER env var.",
  );
  process.exit(1);
}

// Fetch issue details using the native fetch API
async function fetchIssueDetails(issueNum) {
  console.log(`Fetching details for issue #${issueNum}...`);
  const url = `https://api.github.com/repos/${GITHUB_REPOSITORY}/issues/${issueNum}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "agy-autonomous-agent",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch issue: ${response.statusText} (${response.status})`,
    );
  }

  const issueData = await response.json();
  return {
    title: issueData.title,
    body: issueData.body,
    commentsUrl: issueData.comments_url,
  };
}

// Fetch issue comments
async function fetchIssueComments(commentsUrl) {
  if (!commentsUrl) return [];
  console.log(`Fetching comments...`);
  const response = await fetch(commentsUrl, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "agy-autonomous-agent",
    },
  });

  if (!response.ok) {
    return [];
  }

  const comments = await response.json();
  return comments.map((c) => `${c.user.login}: ${c.body}`);
}

// Collect local file contents for context
function getLocalCodeContext() {
  const context = [];
  const srcDir = path.resolve("src");

  if (!fs.existsSync(srcDir)) {
    return "No src/ directory exists yet.";
  }

  function readDirRecursive(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        readDirRecursive(fullPath);
      } else if (
        file.endsWith(".js") ||
        file.endsWith(".json") ||
        file.endsWith(".md")
      ) {
        const relativePath = path.relative(process.cwd(), fullPath);
        const content = fs.readFileSync(fullPath, "utf-8");
        context.push(`--- FILE: ${relativePath} ---\n${content}\n`);
      }
    }
  }

  readDirRecursive(srcDir);
  return context.join("\n");
}

// Submit a PR to GitHub
async function createPullRequest(branchName, title, body) {
  console.log(`Creating Pull Request on GitHub...`);
  const url = `https://api.github.com/repos/${GITHUB_REPOSITORY}/pulls`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      "User-Agent": "agy-autonomous-agent",
    },
    body: JSON.stringify({
      title: title,
      body: body,
      head: branchName,
      base: "main",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to create Pull Request: ${response.statusText} - ${errorText}`,
    );
  }

  const prData = await response.json();
  console.log(`🚀 Pull Request successfully created: ${prData.html_url}`);
  return prData.html_url;
}

// Add a comment to the issue
async function addIssueComment(issueNum, body) {
  console.log(`Adding comment to issue #${issueNum}...`);
  const url = `https://api.github.com/repos/${GITHUB_REPOSITORY}/issues/${issueNum}/comments`;
  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      "User-Agent": "agy-autonomous-agent",
    },
    body: JSON.stringify({ body }),
  });
}

// Apply file operations generated by Gemini
function applyFileOperations(operations) {
  console.log("Applying operations generated by agent...");
  for (const op of operations) {
    const targetPath = path.resolve(op.path);

    // Security check: ensure path is within the workspace
    if (!targetPath.startsWith(process.cwd())) {
      console.warn(
        `⚠️ Warning: Blocked write operation outside workspace: ${op.path}`,
      );
      continue;
    }

    if (op.action === "create" || op.action === "modify") {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, op.content, "utf-8");
      console.log(`✅ Written: ${op.path}`);
    } else if (op.action === "delete") {
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
        console.log(`🗑️ Deleted: ${op.path}`);
      }
    }
  }
}

// Main autonomous loop
async function run() {
  try {
    // 1. Fetch Issue context
    const issue = await fetchIssueDetails(issueNumber);
    const comments = await fetchIssueComments(issue.commentsUrl);

    console.log(`\n--- Working on Issue #${issueNumber}: ${issue.title} ---`);
    console.log(`Description:\n${issue.body}\n`);

    // 2. Read Agent rules and existing files
    const agentRules = fs.existsSync(".github/AGENT_RULES.md")
      ? fs.readFileSync(".github/AGENT_RULES.md", "utf-8")
      : "";
    const codeContext = getLocalCodeContext();

    // 3. Initiate agent prompt
    const systemPrompt = `You are a fully autonomous AI developer agent.
You are tasked with solving the following GitHub Issue in a Node.js project.
Your modifications MUST strictly comply with the following instructions:
${agentRules}

Current repository codebase contents:
${codeContext}

Your response must be a structured JSON array representing the file operations to create, modify, or delete files to solve this issue.
Every file operation must provide the entire, complete replacement content for the file.

Response schema:
An array of objects, where each object has:
- "path": Relative path from project root (e.g. "src/math.js")
- "action": "create", "modify", or "delete"
- "content": "Complete contents of the file"`;

    const userPrompt = `GitHub Issue #${issueNumber} Details:
Title: ${issue.title}
Body: ${issue.body}
Comments:
${comments.join("\n")}`;

    // Use gemini-1.5-pro for high quality software engineering reasoning
    const modelName = "gemini-1.5-pro";
    console.log(`Calling LLM (${modelName}) to plan and generate changes...`);
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          description: "List of file operations to perform",
          items: {
            type: "OBJECT",
            properties: {
              path: { type: "STRING" },
              action: { type: "STRING", enum: ["create", "modify", "delete"] },
              content: { type: "STRING" },
            },
            required: ["path", "action", "content"],
          },
        },
      },
    });

    let currentPrompt = userPrompt;
    let feedback = "";
    let attempts = 0;
    const maxAttempts = 3;
    let success = false;

    // Self-correction loop
    while (attempts < maxAttempts && !success) {
      attempts++;
      console.log(
        `\n--- Code Generation Attempt ${attempts}/${maxAttempts} ---`,
      );

      const fullPrompt = `${systemPrompt}\n\n${currentPrompt}${feedback ? `\n\nPrevious attempt failed with errors:\n${feedback}\nPlease correct your code to fix these errors and ensure ALL tests pass.` : ""}`;
      const result = await model.generateContent(fullPrompt);
      const rawText = result.response.text();

      let operations;
      try {
        operations = JSON.parse(rawText);
      } catch (err) {
        console.error("Failed to parse Gemini JSON output:", err);
        feedback =
          "The output could not be parsed as valid JSON. Ensure your output matches the requested schema.";
        continue;
      }

      console.log(`Received ${operations.length} file operations.`);

      // Keep track of original state for reverting in case of failure
      const originalFiles = {};
      for (const op of operations) {
        if (fs.existsSync(op.path)) {
          originalFiles[op.path] = fs.readFileSync(op.path, "utf-8");
        } else {
          originalFiles[op.path] = null; // Marked for deletion if we revert
        }
      }

      // Apply the operations
      applyFileOperations(operations);

      // Verify changes (lint, format, test)
      console.log("Verifying code health...");
      const formatRes = runCommand("npm run format");
      const lintRes = runCommand("npm run lint");
      const testRes = runCommand("npm run test");

      if (formatRes.success && lintRes.success && testRes.success) {
        console.log("✨ All code health and unit tests passed perfectly!");
        success = true;
      } else {
        console.log("❌ Code health checks failed.");
        feedback = `Format output:\n${formatRes.output}\n\nLint output:\n${lintRes.output}\n\nTest output:\n${testRes.output}`;

        // Revert files to avoid corrupting workspace for next attempt
        console.log("Reverting changes for next attempt...");
        for (const [filePath, content] of Object.entries(originalFiles)) {
          if (content === null) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          } else {
            fs.writeFileSync(filePath, content, "utf-8");
          }
        }
      }
    }

    if (!success) {
      console.error(
        "❌ Failed to resolve the issue autonomously after maximum self-correction attempts.",
      );
      await addIssueComment(
        issueNumber,
        `❌ **Autonomous Coding Failed**\n\nThe autonomous agent failed to resolve this issue. All self-correction attempts resulted in compilation, lint, or test suite failures. Manual intervention is required.`,
      );
      process.exit(1);
    }

    // 4. Git branch, commit, push, PR
    console.log("Preparing Pull Request...");
    const branchName = `feat/issue-${issueNumber}-${issue.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 30)}`;

    // Check if branch exists, delete it if so
    runCommand(`git checkout main`);
    runCommand(`git branch -D ${branchName}`);

    // Create new branch
    runCommand(`git checkout -b ${branchName}`);

    // Add all modified files
    runCommand(`git add .`);

    // Commit
    const commitMsg = `feat: autonomously resolve issue #${issueNumber}

Resolves issue #${issueNumber}: "${issue.title}"`;
    // Write commit message to temporary file to avoid shell escaping issues
    fs.writeFileSync(".git-commit-msg.txt", commitMsg, "utf-8");
    runCommand(`git commit -F .git-commit-msg.txt`);
    fs.unlinkSync(".git-commit-msg.txt");

    // Push branch
    // Note: in CI, authentication is handled by the actions runner using the GITHUB_TOKEN
    const pushRes = runCommand(`git push -u origin ${branchName} --force`);
    if (!pushRes.success) {
      throw new Error(`Failed to push git branch: ${pushRes.output}`);
    }

    // Create Pull Request
    const prUrl = await createPullRequest(
      branchName,
      `[AUTO] Resolve: ${issue.title}`,
      `This Pull Request was generated autonomously by the **AGY Autonomous Coder Agent** to resolve issue #${issueNumber}.\n\n### Changes Implemented\n- Programmatically applied generated code improvements.\n- Fully validated with \`npm run lint\` and \`npm run test\` (all tests pass).\n- Checked and reformatted according to standard styling conventions.\n\nCloses #${issueNumber}.`,
    );

    // Comment on the issue
    await addIssueComment(
      issueNumber,
      `🚀 **Autonomous Solution Proposed!**\n\nI have successfully resolved the requirements for this issue and fully verified the solution against the local unit tests and style guides. All tests passed successfully.\n\nI have submitted a Pull Request containing the proposed improvements here:\n👉 **[Pull Request](${prUrl})**\n\nCloses #${issueNumber}.`,
    );

    // Return to main branch
    runCommand(`git checkout main`);
    console.log("🎉 Autonomous cycle successfully completed!");
  } catch (error) {
    console.error("❌ Error in autonomous runner execution:", error);
    process.exit(1);
  }
}

run();
