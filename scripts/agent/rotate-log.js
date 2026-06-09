import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");

const logPath = path.join(repoRoot, "docs/LOG.md");
const archiveDir = path.join(repoRoot, "docs/log");

function rotate() {
  if (!fs.existsSync(logPath)) {
    console.error(`Error: LOG.md not found at ${logPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(logPath, "utf8");
  const anchorRegex = /^\s*== LOG-ANCHOR ==\s*$/m;
  const match = content.match(anchorRegex);

  if (!match) {
    console.error(
      `Error: Standalone anchor "== LOG-ANCHOR ==" not found in LOG.md`,
    );
    process.exit(1);
  }

  const anchorIndex = match.index;
  const header = content.slice(0, anchorIndex + match[0].length);
  const logEntriesPart = content.slice(anchorIndex + match[0].length);

  // Split entries by "## YYYY-MM-DDThh:mm" headers
  const entryPattern = /(?=## \d{4}-\d{2}-\d{2}T\d{2}:\d{2})/g;
  const rawEntries = logEntriesPart
    .split(entryPattern)
    .map((e) => e.trim())
    .filter(Boolean);

  if (rawEntries.length === 0) {
    console.log("No log entries found to rotate.");
    return;
  }

  // Get current year-month in local timezone format: YYYY-MM
  // We can also infer the current month as the month of the most recent entry
  const firstEntryHeaderMatch = rawEntries[0].match(/^## (\d{4}-\d{2})/);
  if (!firstEntryHeaderMatch) {
    console.error("Error: Could not parse date from the latest log entry.");
    process.exit(1);
  }
  const currentMonth = firstEntryHeaderMatch[1]; // e.g., "2026-06"
  console.log(`Current active log month: ${currentMonth}`);

  const activeEntries = [];
  const archivedByMonth = {};

  for (const entry of rawEntries) {
    const match = entry.match(/^## (\d{4}-\d{2})/);
    if (!match) {
      console.warn(
        "Warning: Skipping entry with unparseable header:\n",
        entry.slice(0, 100),
      );
      continue;
    }
    const entryMonth = match[1];

    if (entryMonth === currentMonth) {
      activeEntries.push(entry);
    } else {
      if (!archivedByMonth[entryMonth]) {
        archivedByMonth[entryMonth] = [];
      }
      archivedByMonth[entryMonth].push(entry);
    }
  }

  // Write archived months
  if (Object.keys(archivedByMonth).length > 0) {
    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true });
    }

    for (const [month, entries] of Object.entries(archivedByMonth)) {
      const archivePath = path.join(archiveDir, `${month}.md`);
      let archiveContent;
      const newContent = entries.join("\n\n") + "\n";

      if (fs.existsSync(archivePath)) {
        archiveContent = fs.readFileSync(archivePath, "utf8");
        const headerEnd = archiveContent.indexOf("\n\n");
        if (headerEnd !== -1) {
          archiveContent =
            archiveContent.slice(0, headerEnd + 2) +
            newContent +
            "\n" +
            archiveContent.slice(headerEnd + 2);
        } else {
          archiveContent =
            `# Operational Log Archive — ${month}\n\n` +
            newContent +
            "\n" +
            archiveContent;
        }
      } else {
        archiveContent =
          `# Operational Log Archive — ${month}\n\n` + newContent;
      }

      fs.writeFileSync(archivePath, archiveContent, "utf8");
      console.log(
        `Archived ${entries.length} entries for ${month} into ${archivePath}`,
      );
    }
  }

  // Rewrite docs/LOG.md with only active entries
  const newLogContent = header + "\n\n" + activeEntries.join("\n\n") + "\n";
  fs.writeFileSync(logPath, newLogContent, "utf8");
  console.log(
    `Successfully rotated LOG.md. Retained ${activeEntries.length} active entries for ${currentMonth}.`,
  );
}

rotate();
