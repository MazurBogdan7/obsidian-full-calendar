import { App, TFile, TFolder, parseYaml, stringifyYaml } from "obsidian";

/** Read frontmatter + body from a markdown file */
export async function readFileFrontmatter(app: App, path: string): Promise<{ fm: Record<string, any>; body: string }> {
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return { fm: {}, body: "" };
  const content = await app.vault.read(file);
  return parseFrontmatter(content);
}

export function parseFrontmatter(content: string): { fm: Record<string, any>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { fm: {}, body: content };
  try {
    const fm = parseYaml(match[1]) || {};
    return { fm, body: match[2] };
  } catch {
    return { fm: {}, body: content };
  }
}

export function buildFileContent(fm: Record<string, any>, body: string): string {
  const yamlStr = stringifyYaml(fm).trimEnd();
  return `---\n${yamlStr}\n---\n${body}`;
}

/** Update frontmatter fields in a vault file */
export async function updateFileFrontmatter(
  app: App,
  path: string,
  updates: Record<string, any>
): Promise<void> {
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return;
  const content = await app.vault.read(file);
  const { fm, body } = parseFrontmatter(content);
  const newFm = { ...fm, ...updates };
  // Remove null/undefined keys
  for (const k of Object.keys(newFm)) {
    if (newFm[k] === undefined) delete newFm[k];
  }
  await app.vault.modify(file, buildFileContent(newFm, body));
}

/** Ensure a folder exists in the vault */
export async function ensureFolder(app: App, folderPath: string): Promise<void> {
  const existing = app.vault.getAbstractFileByPath(folderPath);
  if (existing instanceof TFolder) return;
  await app.vault.createFolder(folderPath);
}

/** Write JSON data to a vault file, creating parent folders if needed */
export async function writeJsonToVault(app: App, filePath: string, data: any): Promise<void> {
  const parts = filePath.split("/");
  const folder = parts.slice(0, -1).join("/");
  if (folder) await ensureFolder(app, folder);
  const json = JSON.stringify(data, null, 2);
  const existing = app.vault.getAbstractFileByPath(filePath);
  if (existing instanceof TFile) {
    await app.vault.modify(existing, json);
  } else {
    await app.vault.create(filePath, json);
  }
}

/** Read JSON from a vault file */
export async function readJsonFromVault(app: App, filePath: string): Promise<any> {
  const file = app.vault.getAbstractFileByPath(filePath);
  if (!(file instanceof TFile)) return null;
  try {
    return JSON.parse(await app.vault.read(file));
  } catch {
    return null;
  }
}

/** Format a duration in minutes as "Xч Yм" */
export function formatDuration(minutes: number): string {
  if (minutes < 0) minutes = 0;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}м`;
  if (m === 0) return `${h}ч`;
  return `${h}ч ${m}м`;
}

/** Get YYYY-MM-DD for a Date in LOCAL timezone (not UTC) */
export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Get the ISO week number */
export function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date as any) - (yearStart as any)) / 86400000 + 1) / 7);
}

/** Play a sound from a vault path, or a default beep if no path given */
export async function playAudio(app: App, soundPath: string | null): Promise<void> {
  if (!soundPath) {
    // Default beep via Web Audio API
    try {
      const ctx = new AudioContext();
      if (ctx.state === "suspended") await ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.6);
      setTimeout(() => ctx.close(), 1500);
    } catch (e) {
      console.warn("FCEnhanced: could not play default beep", e);
    }
    return;
  }

  console.log(`[FCEnhanced] playAudio: path="${soundPath}"`);

  // Determine MIME type from extension
  const ext = soundPath.split(".").pop()?.toLowerCase() ?? "";
  const mimeMap: Record<string, string> = {
    mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
    m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac",
  };
  const mime = mimeMap[ext] || "audio/mpeg";

  try {
    // Try as vault-relative path
    const vaultFile = app.vault.getAbstractFileByPath(soundPath);
    if (vaultFile instanceof TFile) {
      console.log(`[FCEnhanced] playAudio: found in vault`);
      const data = await app.vault.readBinary(vaultFile);
      const blob = new Blob([data], { type: mime });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
      return;
    }

    // Not found in vault — log clearly so user knows
    console.warn(`[FCEnhanced] playAudio: file not found in vault at "${soundPath}". Check the path in settings (relative to vault root, e.g. "audio/sound.mp3").`);

    // Last resort: try as a URL/absolute path
    const audio = new Audio(soundPath);
    await audio.play();
  } catch (e) {
    console.warn(`[FCEnhanced] playAudio: failed to play "${soundPath}":`, e);
  }
}

/** Convert "HH:MM" time string + date string "YYYY-MM-DD" to Date */
export function toDateTime(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}:00`);
}

// Per-file write lock — prevents concurrent processFrontMatter calls on same file
const _writeLocks = new Map<string, Promise<void>>();
export async function withFileLock(filePath: string, fn: () => Promise<void>): Promise<void> {
  const prev = _writeLocks.get(filePath) ?? Promise.resolve();
  let resolveLock!: () => void;
  const lockPromise = new Promise<void>((r) => { resolveLock = r; });
  _writeLocks.set(filePath, prev.then(() => lockPromise));
  try {
    await prev;
    await fn();
  } finally {
    resolveLock();
  }
}

/** Hex color to a dimmed/muted version */
export function dimColor(hex: string, factor = 0.4): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const blend = (c: number) => Math.round(c * factor + 128 * (1 - factor));
  return `rgb(${blend(r)}, ${blend(g)}, ${blend(b)})`;
}
