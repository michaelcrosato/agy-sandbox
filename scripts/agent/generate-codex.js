import fs from "fs";
import path from "path";

/**
 * Self-Synchronizing Codebase "Living Codex" Generator (SPEC-101).
 * Parses codebase classes, functions, exports, tests, and specs to compile
 * a machine-readable JSON graph and a human-readable markdown ontology.
 */

const WORKSPACE_ROOT = path.resolve(".");
const SOURCE_DIRS = [
  "src/engine",
  "src/physics",
  "src/net",
  "src/persistence",
  "src/server",
];

// Helper to recursively walk a directory and collect file paths
function walkDirectory(dir, filter = () => true) {
  let results = [];
  let list;
  try {
    list = fs.readdirSync(dir);
  } catch {
    return results;
  }
  for (const file of list) {
    const filePath = path.join(dir, file);
    try {
      const stat = fs.statSync(filePath);
      if (stat && stat.isDirectory()) {
        results = results.concat(walkDirectory(filePath, filter));
      } else if (filter(file, filePath)) {
        results.push(filePath);
      }
    } catch {
      // Ignore files deleted or locked concurrently during test runs
    }
  }
  return results;
}

// Extract JSDocs, classes, functions, and lines of code from a JS file
function parseSourceFile(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  const relativePath = path
    .relative(WORKSPACE_ROOT, filePath)
    .replace(/\\/g, "/");
  const lines = content.split(/\r?\n/);
  const loc = lines.length;

  const classes = [];
  const exports = [];
  let currentJsDoc = null;

  // Simple regex-based symbol parser
  // Matches "export class ClassName" or "class ClassName"
  const classRegex = /(?:export\s+)?class\s+(\w+)/g;
  // Matches "export function functionName"
  const funcRegex = /export\s+function\s+(\w+)/g;
  // Matches "export const variableName ="
  const constRegex = /export\s+const\s+(\w+)\s*=/g;

  // Parse JSDocs and symbols line by line
  let inJsDoc = false;
  let jsDocLines = [];
  let fileOverview = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith("/**")) {
      inJsDoc = true;
      jsDocLines = [];
    }

    if (inJsDoc) {
      jsDocLines.push(line);
      if (line.endsWith("*/")) {
        inJsDoc = false;
        currentJsDoc = jsDocLines.join("\n");
        if (!fileOverview && classes.length === 0 && exports.length === 0) {
          fileOverview = currentJsDoc;
        }
      }
      continue;
    }

    // Check for class declaration
    let classMatch;
    classRegex.lastIndex = 0;
    if ((classMatch = classRegex.exec(line)) !== null) {
      classes.push({
        name: classMatch[1],
        jsdoc: currentJsDoc,
        line: i + 1,
      });
      currentJsDoc = null;
      continue;
    }

    // Check for function exports
    let funcMatch;
    funcRegex.lastIndex = 0;
    if ((funcMatch = funcRegex.exec(line)) !== null) {
      exports.push({
        name: funcMatch[1],
        type: "function",
        jsdoc: currentJsDoc,
        line: i + 1,
      });
      currentJsDoc = null;
      continue;
    }

    // Check for constant exports
    let constMatch;
    constRegex.lastIndex = 0;
    if ((constMatch = constRegex.exec(line)) !== null) {
      exports.push({
        name: constMatch[1],
        type: "constant",
        jsdoc: currentJsDoc,
        line: i + 1,
      });
      currentJsDoc = null;
      continue;
    }

    // If a line is not a symbol, clear stale JSDoc after a few lines
    if (line === "" && !inJsDoc) {
      currentJsDoc = null;
    }
  }

  return {
    path: relativePath,
    loc,
    classes,
    exports,
    fileOverview,
  };
}

// Parse Jest/Vitest test file to extract describe and test block names
function parseTestFile(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  const relativePath = path
    .relative(WORKSPACE_ROOT, filePath)
    .replace(/\\/g, "/");
  const lines = content.split(/\r?\n/);

  const testCases = [];
  const testRegex = /(?:test|it|describe)\s*\(\s*["'`](.*?)["'`]/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    let match;
    testRegex.lastIndex = 0;
    if ((match = testRegex.exec(line)) !== null) {
      testCases.push({
        name: match[1],
        line: i + 1,
      });
    }
  }

  return {
    path: relativePath,
    testCases,
  };
}

// Parse specification files from plan/specs/
function parseSpecFile(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  const relativePath = path
    .relative(WORKSPACE_ROOT, filePath)
    .replace(/\\/g, "/");
  const filename = path.basename(filePath);

  const titleMatch = content.match(/^#\s+(.*)/m);
  const statusMatch = content.match(/-\s+\*\*Status:\*\*\s*(.*)/i);
  const priorityMatch = content.match(/-\s+\*\*Priority:\*\*\s*(.*)/i);
  const pillarMatch = content.match(/-\s+\*\*Product Pillar:\*\*\s*(.*)/i);

  // Extract referenced source files by scanning for files in backticks or links
  const filesMentioned = [];
  const fileRegex = /`src\/([^`]+?\.[a-z]+)`/g;
  let match;
  while ((match = fileRegex.exec(content)) !== null) {
    const fullPath = `src/${match[1]}`;
    if (!filesMentioned.includes(fullPath)) {
      filesMentioned.push(fullPath);
    }
  }

  return {
    path: relativePath,
    filename,
    title: titleMatch ? titleMatch[1].trim() : filename,
    status: statusMatch ? statusMatch[1].trim() : "Todo",
    priority: priorityMatch ? priorityMatch[1].trim() : "Normal",
    pillar: pillarMatch ? pillarMatch[1].trim() : "None",
    filesMentioned,
  };
}

// Generate the complete Codex graph object
export function generateCodexGraph() {
  const sourceFiles = [];
  const testFiles = [];
  const specFiles = [];

  // 1. Gather all source files
  for (const dir of SOURCE_DIRS) {
    const fullPath = path.resolve(dir);
    if (!fs.existsSync(fullPath)) continue;

    const files = walkDirectory(
      fullPath,
      (file) => file.endsWith(".js") && !file.endsWith(".test.js"),
    );
    for (const f of files) {
      const parsed = parseSourceFile(f);
      if (parsed) sourceFiles.push(parsed);
    }
  }

  // 2. Gather all test files
  const rootSrc = path.resolve("src");
  if (fs.existsSync(rootSrc)) {
    const tests = walkDirectory(rootSrc, (file) => file.endsWith(".test.js"));
    for (const t of tests) {
      const parsed = parseTestFile(t);
      if (parsed) testFiles.push(parsed);
    }
  }

  const scriptsDir = path.resolve("scripts");
  if (fs.existsSync(scriptsDir)) {
    const tests = walkDirectory(scriptsDir, (file) =>
      file.endsWith(".test.js"),
    );
    for (const t of tests) {
      const parsed = parseTestFile(t);
      if (parsed) testFiles.push(parsed);
    }
  }

  // 3. Gather all spec files
  const specsPath = path.resolve("plan/specs");
  if (fs.existsSync(specsPath)) {
    const specs = walkDirectory(specsPath, (file) => file.endsWith(".md"));
    for (const s of specs) {
      const parsed = parseSpecFile(s);
      if (parsed) specFiles.push(parsed);
    }
  }

  // 4. Map tests and specs to source files, and detect Epistemic Debt
  const mappedSourceFiles = sourceFiles.map((src) => {
    // Map test file (either src/area/File.test.js or under __tests__)
    const baseName = path.basename(src.path, ".js");
    const matchedTest = testFiles.find((t) => {
      return (
        t.path.includes(`/${baseName}.test.js`) ||
        t.path.includes(`/__tests__/${baseName}.test.js`) ||
        t.path.includes(`/__tests/${baseName}.test.js`)
      );
    });

    // Map referencing specs
    const matchedSpecs = specFiles.filter((spec) => {
      return spec.filesMentioned.includes(src.path);
    });

    // Detect missing JSDocs
    const missingJsDocSymbols = [];
    for (const c of src.classes) {
      if (!c.jsdoc)
        missingJsDocSymbols.push({ name: c.name, type: "class", line: c.line });
    }
    for (const e of src.exports) {
      if (!e.jsdoc)
        missingJsDocSymbols.push({ name: e.name, type: e.type, line: e.line });
    }

    return {
      ...src,
      testFile: matchedTest ? matchedTest.path : null,
      testCasesCount: matchedTest ? matchedTest.testCases.length : 0,
      referencingSpecs: matchedSpecs.map((s) => s.path),
      missingJsDocSymbols,
    };
  });

  // Calculate high-level stats
  const totalLoc = sourceFiles.reduce((sum, f) => sum + f.loc, 0);
  const totalTests = testFiles.reduce((sum, t) => sum + t.testCases.length, 0);
  const untestedFiles = mappedSourceFiles.filter((f) => !f.testFile);

  const epistemicDebt = {
    untestedCoreFiles: untestedFiles.map((f) => f.path),
    missingJsDocs: mappedSourceFiles
      .filter((f) => f.missingJsDocSymbols.length > 0)
      .map((f) => ({
        path: f.path,
        symbols: f.missingJsDocSymbols,
      })),
    staleSpecReferences: specFiles
      .filter((spec) => {
        return spec.filesMentioned.some((f) => !fs.existsSync(path.resolve(f)));
      })
      .map((spec) => ({
        spec: spec.path,
        brokenFiles: spec.filesMentioned.filter(
          (f) => !fs.existsSync(path.resolve(f)),
        ),
      })),
  };

  return {
    generatedAt: new Date().toISOString(),
    stats: {
      totalSourceFiles: sourceFiles.length,
      totalTestFiles: testFiles.length,
      totalSpecFiles: specFiles.length,
      totalLoc,
      totalTests,
      untestedCoreFilesCount: untestedFiles.length,
    },
    files: mappedSourceFiles,
    specs: specFiles,
    epistemicDebt,
  };
}

// Generate the beautiful human-readable CODEX.md file contents
function generateMarkdownCodex(graph) {
  let md = `# 📖 STARFALL LIVING CODEX · SEMANTIC ONTOLOGY REGISTER

> **Dynamic Machine-Generated Codebase Ontology Map (SPEC-101)**
> Generated: \`${graph.generatedAt}\` · Baseline: \`${graph.stats.totalLoc.toLocaleString()} LOC\` across \`${graph.stats.totalSourceFiles} source files\`

---

## 📊 SYSTEM METRICS & HEALTH

| Category | Metric | Status |
| --- | --- | --- |
| **Total Code Volume** | \`${graph.stats.totalLoc.toLocaleString()} LOC\` | 🟢 Healthy |
| **Source Modules** | \`${graph.stats.totalSourceFiles} files\` | 🟢 Structured |
| **Test Suites** | \`${graph.stats.totalTestFiles} test files\` | 🟢 Integrated |
| **Total Test Cases** | \`${graph.stats.totalTests} cases\` | 🟢 Deterministic |
| **Active/Archived Specs** | \`${graph.stats.totalSpecFiles} specifications\` | 🟢 Traceable |
| **Untested Core Modules** | \`${graph.stats.untestedCoreFilesCount} files\` | ${graph.stats.untestedCoreFilesCount > 0 ? "⚠️ Debt Pending" : "🟢 100% Covered"} |

---

## 🗺️ REPOSITORY ONTOLOGY MAP

`;

  // Group files by directory
  const directoryGroups = {};
  for (const file of graph.files) {
    const dir = path.dirname(file.path).replace(/\\/g, "/");
    if (!directoryGroups[dir]) directoryGroups[dir] = [];
    directoryGroups[dir].push(file);
  }

  for (const [dir, files] of Object.entries(directoryGroups)) {
    md += `### 📂 Directory: \`${dir}/\`

| File | LOC | Classes / Exports | Unit Test File | Referencing Specs |
| --- | --- | --- | --- | --- |
`;
    for (const f of files) {
      const symbols =
        [
          ...f.classes.map((c) => `\`class ${c.name}\``),
          ...f.exports.map((e) => `\`${e.type} ${e.name}\``),
        ].join(", ") || "_None_";

      const testCol = f.testFile
        ? `[${path.basename(f.testFile)}](file:///${WORKSPACE_ROOT.replace(/\\/g, "/")}/${f.testFile})`
        : "❌ _Untested_";
      const specsCol =
        f.referencingSpecs
          .map(
            (s) =>
              `[\`${path.basename(s, ".md")}\`](file:///${WORKSPACE_ROOT.replace(/\\/g, "/")}/${s})`,
          )
          .join("<br>") || "_None_";

      md += `| [${path.basename(f.path)}](file:///${WORKSPACE_ROOT.replace(/\\/g, "/")}/${f.path}) | ${f.loc} | ${symbols} | ${testCol} | ${specsCol} |\n`;
    }
    md += "\n";
  }

  md += `---

## ⚡ EPISTEMIC DEBT & STALE LOGIC REPORT

### ⚠️ Untested Core Modules (${graph.epistemicDebt.untestedCoreFiles.length})
${
  graph.epistemicDebt.untestedCoreFiles.length === 0
    ? "_None! All core modules have associated test suites._"
    : graph.epistemicDebt.untestedCoreFiles
        .map((f) => `- [ ] \`${f}\` is missing a unit test suite.`)
        .join("\n")
}

### ⚠️ Stale Specification File References (${graph.epistemicDebt.staleSpecReferences.length})
${
  graph.epistemicDebt.staleSpecReferences.length === 0
    ? "_None! All specification file references correspond to real paths._"
    : graph.epistemicDebt.staleSpecReferences
        .map(
          (s) =>
            `- [ ] Spec [\`${path.basename(s.spec)}\`](file:///${WORKSPACE_ROOT.replace(/\\/g, "/")}/${s.spec}) references missing files: ${s.brokenFiles.map((bf) => `\`${bf}\``).join(", ")}`,
        )
        .join("\n")
}

### ⚠️ Missing JSDoc Type Signatures (${graph.epistemicDebt.missingJsDocs.reduce((sum, d) => sum + d.symbols.length, 0)} symbols)
${
  graph.epistemicDebt.missingJsDocs.length === 0
    ? "_None! All exported classes and functions have JSDoc type signatures._"
    : graph.epistemicDebt.missingJsDocs
        .map(
          (d) =>
            `- \`${d.path}\`:\n` +
            d.symbols
              .map(
                (sym) =>
                  `  - Line ${sym.line}: Missing JSDoc for \`${sym.type} ${sym.name}\``,
              )
              .join("\n"),
        )
        .join("\n")
}
`;

  return md;
}

// Clean JSDoc text to get the first sentence/paragraph
function cleanJsDocDescription(jsdoc) {
  if (!jsdoc) return "";
  const lines = jsdoc.split(/\r?\n/);
  const cleanLines = lines
    .map((l) => {
      let s = l.trim();
      if (s.startsWith("/**")) s = s.slice(3);
      if (s.endsWith("*/")) s = s.slice(0, -2);
      if (s.startsWith("*")) s = s.slice(1);
      return s.trim();
    })
    .filter((s) => s.length > 0);

  if (cleanLines.length === 0) return "";

  const fullText = cleanLines.join(" ");
  const sentenceMatch = fullText.match(/^([^.!?]+[.!?])/);
  if (sentenceMatch) {
    return sentenceMatch[1].trim();
  }
  return cleanLines[0];
}

// Formats a filename to a clean title
function formatFilename(filePath) {
  const base = path.basename(filePath, ".js");
  return base
    .replace(/([A-Z])/g, " $1")
    .trim()
    .replace(/^./, (str) => str.toUpperCase());
}

// Generate the beautiful human-readable REPO_MAP.md file contents
function generateMarkdownRepoMap(graph) {
  let md = `# Repo Map (for agents)

Where things live, what to read, and what to skip. Pair this with \`git ls-files\` (which already
excludes \`node_modules/\`) and \`.aiignore\`. Full operating rules: \`../../AGENTS.md\`.

## Entry points

| What | File | Notes |
| --- | --- | --- |
| **Game server** (authoritative) | \`src/server.js\` | Node \`ws\` + static HTTP on \`:8080\`. ~1900 lines, **not unit-tested**, organized by lettered section headers (e.g. "J. Authoritative World State Broadcast"). Read the section you need. |
| **Browser client** bootstrap | \`src/main.js\` | Loaded by \`index.html\`; wires engine + \`src/client/*\`. Not unit-tested. |
| **Page shell** | \`index.html\`, \`index.css\` | DOM/HUD the client renders into. |
| \`package.json\` \`main\` | \`src/index.js\` | ⚠️ A demo stub (\`add\`/\`subtract\`/\`greet\`) — **not** a real entry point. Don't be misled. |

## Core product logic — \`src/\` (this is what you improve)

| Area | Path | Pure? | Tested? |
| --- | --- | --- | --- |
`;

  // Sort files by path alphabetically
  const sortedFiles = [...graph.files].sort((a, b) =>
    a.path.localeCompare(b.path),
  );

  for (const f of sortedFiles) {
    const area =
      cleanJsDocDescription(f.fileOverview) || formatFilename(f.path);
    const pure =
      f.path.startsWith("src/server") || f.path.startsWith("src/client")
        ? "no"
        : "yes";
    const tested = f.testFile ? "yes" : "no";
    const pathLink = `[\`${f.path}\`](file:///${WORKSPACE_ROOT.replace(/\\/g, "/")}/${f.path})`;
    md += `| ${area} | ${pathLink} | ${pure} | ${tested} |\n`;
  }

  md += `
Rule of thumb: anything under \`engine/\`, \`physics/\`, \`net/\`, \`persistence/\` is pure and **must** stay
that way (no DOM, sockets, timers, or \`Math.random\` in test-reachable paths). Tests sit beside source
as \`*.test.js\`.

## Config & tooling

- \`package.json\` — scripts (\`test\`, \`lint\`, \`format\`, \`format:check\`, \`agent:bootstrap\`, \`agent:check\`), deps.
- \`eslint.config.js\` — flat config; \`no-unused-vars: warn\`; globals node+jest+browser.
- \`.github/workflows/ci.yml\` — the gate of record: prettier **--check** → eslint → jest on push/PR to \`main\`.
- \`scripts/agent/*.{sh,ps1}\` — agent-facing wrappers; \`check\` mirrors CI exactly.
- \`.env.example\` — runtime/automation env vars (copy to \`.env\`, which is gitignored).

## Governance / substrate (read; never modify the substrate set)

- \`docs/AXIOMS.md\`, \`docs/AGENT-LOOP.md\` — constitution + loop protocol (**substrate, read-only**).
- \`docs/GOAL.md\` — product blueprint (writable; the North Star and pillars P1–P8).
- \`docs/LOG.md\` — append-only ledger, newest-first.
- \`.github/AGENT_RULES.md\` — coding standards + git workflow (writable).
- \`scripts/{assert-gate-integrity,local-gate,run-autonomous-loop}.ps1\`, \`scripts/validate-log-compliance.py\`,
  \`scripts/manifest.txt\` — **substrate, read-only**.
- \`scripts/{claude-night.ps1, run-agent.js}\` — autonomous launchers (writable, not substrate).

## Skip (don't read into context)

- \`node_modules/\`, \`.git/\`, \`package-lock.json\`, \`coverage/\`, \`data/\` (runtime saves, gitignored),
  \`night-queue/\` (local task queue, gitignored), \`.claude/\`. See \`.aiignore\`.
`;

  return md;
}

// Main execution entrypoint
export function run() {
  console.log("🔍 Extracting codebase ontology map...");
  const graph = generateCodexGraph();

  const codexJsonPath = path.resolve("plan/codex.json");
  const codexMdPath = path.resolve("plan/CODEX.md");
  const repoMapPath = path.resolve("docs/ai/REPO_MAP.md");

  console.log(
    `💾 Writing structured codebase ontology data to ${codexJsonPath}...`,
  );
  fs.writeFileSync(codexJsonPath, JSON.stringify(graph, null, 2), "utf8");

  console.log(`💾 Writing beautiful markdown ontology to ${codexMdPath}...`);
  const md = generateMarkdownCodex(graph);
  fs.writeFileSync(codexMdPath, md, "utf8");

  console.log(
    `💾 Writing automated codebase repository map to ${repoMapPath}...`,
  );
  const repoMapContent = generateMarkdownRepoMap(graph);
  fs.writeFileSync(repoMapPath, repoMapContent, "utf8");

  console.log("✅ Codebase Living Codex successfully synchronized!");
}

// Run if called directly
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  run();
}
