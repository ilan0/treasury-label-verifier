import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const sourceFiles = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean)
  .filter((file) => !file.endsWith("package-lock.json"));

function filesUnder(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

const clientBundleFiles = filesUnder(".next/static");

const suspicious = [
  /sk-proj-[A-Za-z0-9_-]{20,}/,
  /sb_secret_[A-Za-z0-9_-]{20,}/,
  /vcp_[A-Za-z0-9_-]{20,}/,
  /signkey-prod-[A-Fa-f0-9]{32,}/,
  /(?:github_pat_|ghp_)[A-Za-z0-9_]{20,}/,
  /postgres(?:ql)?:\/\/[^:\s]+:[^@<{\s][^@\s]{7,}@/,
];

const findings = [];
for (const file of [...sourceFiles, ...clientBundleFiles]) {
  let contents;
  try {
    contents = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (suspicious.some((pattern) => pattern.test(contents))) findings.push(file);
}

if (findings.length) {
  console.error(
    `Potential credential material found in tracked files: ${findings.join(", ")}`,
  );
  process.exit(1);
}

const history = execFileSync(
  "git",
  ["log", "-p", "--all", "--no-ext-diff", "--pretty=format:"],
  { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
);
if (suspicious.some((pattern) => pattern.test(history))) {
  console.error("Potential credential material found in Git history.");
  process.exit(1);
}

console.log(
  `Secret scan passed (${sourceFiles.length} source files, ${clientBundleFiles.length} client bundle files, and Git history inspected).`,
);
