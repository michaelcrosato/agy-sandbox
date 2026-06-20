import { SpecLinter } from "./validate-specs.js";
import fs from "fs";
import path from "path";

describe("Specification Linter & Validator", () => {
  const tempDir = path.resolve("plan/specs/temp_test_linter");

  beforeAll(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("successfully validates a perfectly formatted spec", () => {
    const specPath = path.join(tempDir, "199_valid_test_spec.md");
    const content = `# SPEC-199: Valid Test Spec

- **Status:** Todo
- **Priority:** Normal

## Summary
This is a summary of the valid spec.

## Scope
### In
- \`src/net/ConnectionFloodSentry.js\`

## Acceptance Criteria
- [ ] Task checkbox item 1
- [ ] Task checkbox item 2
`;
    fs.writeFileSync(specPath, content, "utf8");

    const linter = new SpecLinter(path.resolve("."));
    const result = linter.validateSpec(specPath);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.index).toBe("199");
  });

  test("flags malformed spec filenames", () => {
    const specPath = path.join(tempDir, "invalid-filename.md");
    const content = `# SPEC-199: Valid Test Spec

## Summary
Valid summary.

## Scope
Valid scope.

## Acceptance Criteria
- [ ] Task checkbox item
`;
    fs.writeFileSync(specPath, content, "utf8");

    const linter = new SpecLinter(path.resolve("."));
    const result = linter.validateSpec(specPath);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("must match standard format");
  });

  test("flags spec missing H1 title", () => {
    const specPath = path.join(tempDir, "200_missing_h1.md");
    const content = `Some text instead of heading

## Summary
Valid summary.

## Scope
Valid scope.

## Acceptance Criteria
- [ ] Task checkbox item
`;
    fs.writeFileSync(specPath, content, "utf8");

    const linter = new SpecLinter(path.resolve("."));
    const result = linter.validateSpec(specPath);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("start with an H1 heading");
  });

  test("flags title mismatching filename index", () => {
    const specPath = path.join(tempDir, "201_title_mismatch.md");
    const content = `# SPEC-199: Mismatching Title

## Summary
Valid summary.

## Scope
Valid scope.

## Acceptance Criteria
- [ ] Task checkbox item
`;
    fs.writeFileSync(specPath, content, "utf8");

    const linter = new SpecLinter(path.resolve("."));
    const result = linter.validateSpec(specPath);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("must contain the spec ID");
  });

  test("flags missing Acceptance Criteria heading", () => {
    const specPath = path.join(tempDir, "202_missing_ac.md");
    const content = `# SPEC-202: Missing AC

## Summary
Valid summary.

## Scope
Valid scope.

## Other Section
- [ ] Task checkbox item
`;
    fs.writeFileSync(specPath, content, "utf8");

    const linter = new SpecLinter(path.resolve("."));
    const result = linter.validateSpec(specPath);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("missing an 'Acceptance Criteria'");
  });

  test("flags missing checkboxes", () => {
    const specPath = path.join(tempDir, "203_missing_checkboxes.md");
    const content = `# SPEC-203: Missing Checkboxes

## Summary
Valid summary.

## Scope
Valid scope.

## Acceptance Criteria
There are no checklist checkboxes here.
`;
    fs.writeFileSync(specPath, content, "utf8");

    const linter = new SpecLinter(path.resolve("."));
    const result = linter.validateSpec(specPath);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("must contain at least one checkbox");
  });

  test("validates all active specifications in the repository", () => {
    const linter = new SpecLinter(path.resolve("."));
    const results = linter.validateAll();

    // Log any errors so they are clearly visible in the Jest test runner output
    if (results.specErrors.length > 0) {
      console.warn("Spec validation errors found in active spec files:");
      for (const err of results.specErrors) {
        console.warn(`File: ${err.path}\n- ${err.errors.join("\n- ")}`);
      }
    }

    if (results.reconciliationErrors.length > 0) {
      console.warn("PROGRESS.md reconciliation errors found:");
      for (const err of results.reconciliationErrors) {
        console.warn(`- ${err}`);
      }
    }

    // Assert that we don't have active compliance errors in the codebase
    expect(results.specErrors).toHaveLength(0);
    expect(results.reconciliationErrors).toHaveLength(0);
  });
});
