import esbuild from "esbuild";
import fs from "fs";

const isWatch = process.argv.includes("--watch");

async function rebuild() {
  await esbuild.build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    external: ["obsidian"],
    format: "cjs",
    outfile: "patch.js",
    platform: "browser",
    target: "es2018",
    logLevel: "info",
  });

  const originalMain = fs.readFileSync("main.original.js", "utf8");
  const patch = fs.readFileSync("patch.js", "utf8");
  const combined = originalMain + "\n\n// === ENHANCED PATCH START ===\n" + patch + "\n// === ENHANCED PATCH END ===\n";
  fs.writeFileSync("main.js", combined, "utf8");
  console.log("main.js rebuilt (" + Math.round(combined.length / 1024) + " KB)");

  // Also rebuild CSS
  const baseCss = fs.readFileSync("styles.original.css", "utf8");
  const enhancedCss = fs.readFileSync("src/enhanced.css", "utf8");
  fs.writeFileSync("styles.css", baseCss + "\n" + enhancedCss, "utf8");
  console.log("styles.css rebuilt");
}

if (isWatch) {
  const ctx = await esbuild.context({
    entryPoints: ["src/index.ts"],
    bundle: true,
    external: ["obsidian"],
    format: "cjs",
    outfile: "patch.js",
    platform: "browser",
    target: "es2018",
    logLevel: "info",
    plugins: [{
      name: "rebuild-on-change",
      setup(build) {
        build.onEnd(() => rebuild().catch(console.error));
      }
    }]
  });
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  rebuild().catch(console.error);
}
