import fs from "fs";
import {execSync} from "child_process";

const files = execSync("git diff --cached --name-only", {
    encoding: "utf8"
})
    .split("\n")
    .filter(f => f.endsWith(".pyy"));

for (const f of files) {
    const target = f.replace(/\.pyy$/, ".ipynb");
    fs.copyFileSync(f, target);
    execSync(`git add "${target}"`);
}
