function normalizeText(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function buildBranchName(issueKey, title) {
  if (!issueKey || !title) {
    throw new Error("Use: npm run branch:name -- <ISSUE-123> \"titulo da tarefa\"");
  }

  const normalizedIssueKey = normalizeText(issueKey);
  const normalizedTitle = normalizeText(title);

  return `${normalizedIssueKey}-${normalizedTitle}`;
}

function main() {
  const [issueKey, ...titleParts] = process.argv.slice(2);
  const title = titleParts.join(" ");

  const branchName = buildBranchName(issueKey, title);
  console.log(branchName);
}

main();
