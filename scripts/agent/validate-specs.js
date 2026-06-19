import fs from "fs";
import path from "path";

const WORKSPACE_ROOT = path.resolve(".");

export class SpecLinter {
  constructor(workspaceRoot = WORKSPACE_ROOT) {
    this.workspaceRoot = workspaceRoot;
    this.specsDir = path.join(workspaceRoot, "plan/specs");
    this.progressFile = path.join(workspaceRoot, "plan/PROGRESS.md");
  }

  // Parse progress file to collect all defined spec indices
  parseProgressIndices() {
    if (!fs.existsSync(this.progressFile)) {
      return [];
    }
    const content = fs.readFileSync(this.progressFile, "utf8");
    const lines = content.split(/\r?\n/);
    const indices = [];

    // Match lines like: - [x] `103` ...
    // or - [ ] `019a` ...
    const progressRegex = /^-\s+\[[ x/]\]\s+`([a-z0-9_-]+)`/i;

    for (const line of lines) {
      const match = progressRegex.exec(line.trim());
      if (match) {
        indices.push(match[1]);
      }
    }
    return indices;
  }

  // Validate a single spec file
  validateSpec(filePath) {
    const filename = path.basename(filePath);
    const errors = [];
    // 1. Filename format: digits + optional letter, then underscore and kebab-case description
    const filenameRegex = /^(\d{3}[a-z]?)_([a-z0-9_#-]+)\.md$/i;
    const fileMatch = filenameRegex.exec(filename);
    if (!fileMatch) {
      errors.push(
        `Filename '${filename}' must match standard format 'XXX_description.md' (e.g. 176_zero_trace.md)`,
      );
      return { valid: false, errors };
    }

    const index = fileMatch[1];

    if (
      filename === "template.md" ||
      filename.includes("decomposition") ||
      filename.includes("design")
    ) {
      return { valid: true, errors: [], index };
    }

    let content;
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch (e) {
      errors.push(`Could not read file: ${e.message}`);
      return { valid: false, errors };
    }

    const lines = content.split(/\r?\n/);

    // 2. First line must be H1 heading
    const firstLine = lines.length > 0 ? lines[0].trim() : "";
    if (!firstLine.startsWith("# ")) {
      errors.push(
        "Spec must start with an H1 heading (e.g. '# SPEC-176: Title')",
      );
    } else {
      // Check that the H1 heading contains the filename index
      const headingText = firstLine.slice(2).trim();
      const indexRegex = new RegExp(`(?:SPEC-)?${index}\\b`, "i");
      if (!indexRegex.test(headingText)) {
        errors.push(
          `H1 title '${headingText}' must contain the spec ID '${index}'`,
        );
      }
    }

    // 3. Sections validation
    const headings = lines
      .filter((l) => l.startsWith("## "))
      .map((l) => l.slice(3).trim());

    if (headings.length < 2) {
      errors.push(
        `Spec must have at least 2 major sections (found only: ${headings.join(", ") || "none"})`,
      );
    }

    // Check for Acceptance Criteria section
    const hasAcceptanceCriteria = headings.some((h) =>
      /(Acceptance Criteria|Definition of Done|DoD)/i.test(h),
    );
    if (!hasAcceptanceCriteria) {
      errors.push(
        "Spec is missing an 'Acceptance Criteria' or 'Definition of Done' section heading ('## Acceptance Criteria')",
      );
    }

    // 4. Checkboxes validation: must have at least one checklist item
    const hasCheckboxes = lines.some((l) => /^\s*-\s+\[[ x/]\]/i.test(l));
    if (!hasCheckboxes) {
      errors.push(
        "Spec must contain at least one checkbox list item (e.g. '- [ ] Task')",
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      index,
    };
  }

  // Validate all specs and reconcile with PROGRESS.md
  validateAll() {
    const results = {
      specErrors: [], // { path: string, errors: string[] }
      reconciliationErrors: [], // string[]
      totalChecked: 0,
      passedCount: 0,
    };

    if (!fs.existsSync(this.specsDir)) {
      results.reconciliationErrors.push(
        `Specs directory does not exist at '${this.specsDir}'`,
      );
      return results;
    }

    const files = fs
      .readdirSync(this.specsDir)
      .filter((f) => f.endsWith(".md") && f !== "template.md")
      .map((f) => path.join(this.specsDir, f));

    const progressIndices = this.parseProgressIndices();
    const foundIndices = new Set();

    for (const file of files) {
      results.totalChecked++;
      const relativePath = path
        .relative(this.workspaceRoot, file)
        .replace(/\\/g, "/");
      const validation = this.validateSpec(file);

      if (!validation.valid) {
        results.specErrors.push({
          path: relativePath,
          errors: validation.errors,
        });
      } else {
        results.passedCount++;
        if (validation.index) {
          foundIndices.add(validation.index);
          const normalizedIndex = validation.index.replace(/^0+/, "");
          foundIndices.add(normalizedIndex);
        }
      }
    }

    // Reconciliation:
    // Check that every index in PROGRESS.md has a corresponding spec file
    for (const progressIndex of progressIndices) {
      const normalizedProgress = progressIndex.replace(/^0+/, "");
      const hasFile = Array.from(foundIndices).some(
        (idx) => idx === progressIndex || idx === normalizedProgress,
      );
      if (!hasFile) {
        results.reconciliationErrors.push(
          `PROGRESS.md contains spec ID '${progressIndex}', but no matching spec file was found in 'plan/specs/'`,
        );
      }
    }

    // Check that every spec file index exists in PROGRESS.md
    for (const file of files) {
      const filename = path.basename(file);
      if (filename === "template.md") continue;
      // Allow design docs or decomposition specs to be unregistered in PROGRESS.md
      if (filename.includes("decomposition") || filename.includes("design"))
        continue;

      const filenameRegex = /^(\d{3}[a-z]?)_/i;
      const match = filenameRegex.exec(filename);
      if (match) {
        const index = match[1];
        const normalizedIndex = index.replace(/^0+/, "");
        const hasProgress = progressIndices.some(
          (idx) => idx === index || idx.replace(/^0+/, "") === normalizedIndex,
        );
        if (!hasProgress) {
          results.reconciliationErrors.push(
            `Spec file '${filename}' exists, but its ID '${index}' is not registered in 'plan/PROGRESS.md'`,
          );
        }
      }
    }

    return results;
  }
}
