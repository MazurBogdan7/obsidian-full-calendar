/**
 * Build script — собирает плагин в папку dist/
 * Запуск: node build.mjs
 * Запуск с наблюдением: node build.mjs --watch
 */

import esbuild from "esbuild";
import fs from "fs";
import path from "path";

const isWatch = process.argv.includes("--watch");
const DIST = "dist";

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function buildDist() {
  // 1. Читаем оригинальный main.js и патч
  const original = fs.readFileSync("main.original.js", "utf8");
  const patch = fs.readFileSync("patch.js", "utf8");
  const mainJs = original + "\n\n// === ENHANCED PATCH START ===\n" + patch + "\n// === ENHANCED PATCH END ===\n";

  // 2. Читаем оригинальный CSS и наш расширенный
  const baseCss = fs.readFileSync("styles.original.css", "utf8");
  const enhancedCss = fs.readFileSync("src/enhanced.css", "utf8");
  const stylesCss = baseCss + "\n" + enhancedCss;

  // 3. Копируем manifest.json
  const manifest = fs.readFileSync("manifest.json", "utf8");

  // 4. Пишем в dist/
  ensureDir(DIST);
  fs.writeFileSync(path.join(DIST, "main.js"), mainJs, "utf8");
  fs.writeFileSync(path.join(DIST, "styles.css"), stylesCss, "utf8");
  fs.writeFileSync(path.join(DIST, "manifest.json"), manifest, "utf8");

  const sizeKb = Math.round(mainJs.length / 1024);
  console.log(`\n✅ Сборка готова в папке "${DIST}/"`);
  console.log(`   main.js    — ${sizeKb} KB`);
  console.log(`   styles.css — ${Math.round(stylesCss.length / 1024)} KB`);
  console.log(`   manifest.json`);
  console.log(`\n📂 Скопируй папку dist/ в:`);
  console.log(`   {хранилище}/.obsidian/plugins/obsidian-full-calendar/\n`);
}

async function build() {
  console.log("⚙️  Компилирую TypeScript патч...");

  await esbuild.build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    external: ["obsidian"],
    format: "cjs",
    outfile: "patch.js",
    platform: "browser",
    target: "es2018",
    logLevel: "silent",
    minify: false,
  });

  buildDist();
}

if (isWatch) {
  console.log("👀 Режим наблюдения (watch). Ctrl+C для остановки.\n");

  const ctx = await esbuild.context({
    entryPoints: ["src/index.ts"],
    bundle: true,
    external: ["obsidian"],
    format: "cjs",
    outfile: "patch.js",
    platform: "browser",
    target: "es2018",
    logLevel: "silent",
    plugins: [{
      name: "rebuild-on-change",
      setup(b) {
        b.onEnd((result) => {
          if (result.errors.length > 0) {
            console.error("❌ Ошибка сборки:", result.errors);
            return;
          }
          buildDist();
        });
      }
    }]
  });

  await ctx.watch();
  buildDist(); // Первая сборка сразу
} else {
  build().catch((e) => {
    console.error("❌ Ошибка сборки:", e.message);
    process.exit(1);
  });
}
