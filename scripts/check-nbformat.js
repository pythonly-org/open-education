import {execSync} from "child_process";

const files = execSync("git diff --cached --name-only", {encoding: "utf8"})
    .split("\n")
    .filter(f => f.endsWith(".ipynb"))
    .filter(Boolean);

if (files.length === 0) process.exit(0);

for (const file of files) {
    try {
        execSync(`node scripts/check-nbformat-strict.js "${file}"`, {stdio: "pipe"});
    } catch (e) {
        console.error(`❌ nbformat validation failed: ${file}`);
        console.error(e.stderr?.toString() || e.message);
        process.exit(1);
    }
}

console.log("✅ nbformat validation passed");
