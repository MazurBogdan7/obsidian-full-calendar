/**
 * Feature 2: Event Notifications with Sound
 *
 * Scans vault files directly (NOT fc.getEvents()) because extendedProps
 * never receives notification frontmatter from toEventInput().
 */

import { App, Notice, TFile } from "obsidian";
import { EnhancedSettings } from "./types";
import { playAudio } from "./utils";

// Track which event+type combos we've already notified this session
const notifiedSet = new Set<string>();

/**
 * Inject a compact notification settings UI into the event edit modal.
 * pending = current per-event override values (read from frontmatter).
 * onChange = callback to update pending state when user changes something.
 */
export function injectNotificationUI(
  contentEl: HTMLElement,
  pending: { enabled?: boolean; startSound?: string | null; endSound?: string | null },
  settings: EnhancedSettings,
  onChange: (ns: Partial<typeof pending>) => void
): void {
  const section = contentEl.createEl("div", { cls: "fc-enhanced-section" });
  section.createEl("p", { text: "🔔 Уведомление для события", attr: { style: "font-weight:600;margin-bottom:6px;" } });

  // Toggle enabled
  const row1 = section.createEl("div", { attr: { style: "display:flex;align-items:center;gap:8px;margin-bottom:4px;" } });
  const cb = row1.createEl("input") as HTMLInputElement;
  cb.type = "checkbox";
  cb.checked = pending.enabled !== false;
  cb.id = "fc-notif-enabled";
  const lbl = row1.createEl("label", { text: "Уведомлять" });
  lbl.htmlFor = "fc-notif-enabled";
  cb.addEventListener("change", () => onChange({ enabled: cb.checked }));

  // Start sound override
  const row2 = section.createEl("div", { attr: { style: "display:flex;align-items:center;gap:8px;margin-bottom:4px;" } });
  row2.createEl("span", { text: "Звук начала:", attr: { style: "font-size:12px;min-width:80px;" } });
  const inp1 = row2.createEl("input") as HTMLInputElement;
  inp1.type = "text";
  inp1.placeholder = settings.notifications.defaultStartSound || "(по умолчанию)";
  inp1.value = pending.startSound ?? "";
  inp1.style.cssText = "flex:1;font-size:12px;padding:2px 6px;";
  inp1.addEventListener("input", () => onChange({ startSound: inp1.value.trim() || null }));

  // End sound override
  const row3 = section.createEl("div", { attr: { style: "display:flex;align-items:center;gap:8px;" } });
  row3.createEl("span", { text: "Звук конца:", attr: { style: "font-size:12px;min-width:80px;" } });
  const inp2 = row3.createEl("input") as HTMLInputElement;
  inp2.type = "text";
  inp2.placeholder = settings.notifications.defaultEndSound || "(по умолчанию)";
  inp2.value = pending.endSound ?? "";
  inp2.style.cssText = "flex:1;font-size:12px;padding:2px 6px;";
  inp2.addEventListener("input", () => onChange({ endSound: inp2.value.trim() || null }));
}

export function setupNotifications(app: App, basePlugin: any, getSettings: () => EnhancedSettings): () => void {
  // Run every 15 seconds for better accuracy at notifyBefore=0
  const intervalId = window.setInterval(() => {
    checkAndNotify(app, basePlugin, getSettings());
  }, 15_000);

  // Also check 4 seconds after startup
  setTimeout(() => checkAndNotify(app, basePlugin, getSettings()), 4000);

  return () => window.clearInterval(intervalId);
}

/** Public: call manually to test notifications (e.g. from settings button) */
export function testNotifications(app: App, plugin: any, settings: EnhancedSettings): void {
  const sources: any[] = plugin.settings?.calendarSources ?? [];
  if (sources.length === 0) {
    new Notice("⚠️ Нет локальных календарей в настройках плагина", 5000);
    return;
  }

  let found = 0;
  for (const source of sources) {
    if (source.type !== "local" || !source.directory) continue;
    const dir = source.directory;
    const isRoot = dir === "/" || dir === "" || dir === ".";
    const files = (app as any).vault
      .getFiles()
      .filter((f: TFile) => {
        if (f.extension !== "md") return false;
        if (isRoot) return true;
        return f.path.startsWith(dir + "/") || f.path === dir;
      });
    found += files.length;
  }

  // Clear notified set so test always fires
  notifiedSet.clear();
  checkAndNotify(app, plugin, settings, true);
  new Notice(`✅ Тест запущен. Найдено файлов событий: ${found}`, 4000);
}

function checkAndNotify(app: App, plugin: any, settings: EnhancedSettings, force = false) {
  if (!settings.notifications.enabled && !force) return;

  const now = new Date();
  const notifyBeforeMs = (settings.notifications.notifyBeforeMinutes ?? 5) * 60 * 1000;
  const sources: any[] = plugin.settings?.calendarSources ?? [];

  console.log(`[FCEnhanced] Notifications check: ${sources.length} sources, notifyBefore=${settings.notifications.notifyBeforeMinutes}min, time=${now.toLocaleTimeString()}`);

  if (sources.length === 0) {
    console.warn("[FCEnhanced] No calendarSources found on plugin.settings:", plugin.settings);
    return;
  }

  for (const source of sources) {
    if (source.type !== "local" || !source.directory) continue;

    const dir = source.directory;
    const isRoot = dir === "/" || dir === "" || dir === ".";
    const files = (app as any).vault
      .getFiles()
      .filter((f: TFile) => {
        if (f.extension !== "md") return false;
        if (isRoot) return true;
        return f.path.startsWith(dir + "/") || f.path === dir;
      });

    console.log(`[FCEnhanced] Scanning ${files.length} files in "${dir}" (isRoot=${isRoot})`);

    for (const file of files) {
      try {
        const fm: any = (app as any).metadataCache?.getFileCache(file)?.frontmatter ?? {};

        // Skip files that are not calendar events
        if (!fm.date || !fm.startTime) continue;

        // Per-event override: if explicitly disabled, skip
        if (fm.notification?.enabled === false) continue;

        // fm.date may be a JS Date object (YAML auto-parses unquoted dates)
        const dateStr: string = fm.date instanceof Date
          ? fm.date.toISOString().slice(0, 10)
          : String(fm.date).slice(0, 10);

        // startTime may be stored as "09:00" or "9:00"
        const startStr = String(fm.startTime).trim().padStart(5, "0");
        const endStr   = fm.endTime ? String(fm.endTime).trim().padStart(5, "0") : null;

        const plannedStart = new Date(`${dateStr}T${startStr}:00`);
        const plannedEnd   = endStr ? new Date(`${dateStr}T${endStr}:00`) : null;

        if (isNaN(plannedStart.getTime())) {
          console.warn(`[FCEnhanced] Invalid date for ${file.path}: dateStr="${dateStr}", startStr="${startStr}"`);
          continue;
        }

        const title = fm.title ?? file.basename;
        const msUntilStart = plannedStart.getTime() - now.getTime();

        // Window for start notification:
        // - fires up to notifyBefore minutes BEFORE start
        // - fires up to 3 minutes AFTER start (catch missed intervals)
        // When notifyBefore=0: fires in [-3min, +1min] around start
        const windowStart = -(3 * 60_000);                      // 3 min after start
        const windowEnd   = notifyBeforeMs + 60_000;             // 1 extra min before

        console.log(`[FCEnhanced] "${title}": msUntilStart=${Math.round(msUntilStart/1000)}s, window=[${windowStart/1000}s, ${windowEnd/1000}s]`);

        if (msUntilStart >= windowStart && msUntilStart <= windowEnd) {
          const key = `start:${file.path}:${dateStr}:${startStr}`;
          if (!notifiedSet.has(key)) {
            notifiedSet.add(key);
            const minLeft = Math.round(msUntilStart / 60000);
            const msg = minLeft > 0
              ? `⏰ Через ${minLeft} мин: ${title}\nНажми на событие → ▶ чтобы отметить начало`
              : `⏰ Начинается: ${title}\nНажми на событие → ▶ чтобы отметить начало`;
            new Notice(msg, 10000);
            console.log(`[FCEnhanced] Fired start notification for "${title}"`);

            // Only use per-event override if it's a non-empty string; null/undefined → global setting
            const startSoundOverride = fm.notification?.startSound;
            const sound = (startSoundOverride && typeof startSoundOverride === "string")
              ? startSoundOverride
              : settings.notifications.defaultStartSound;
            playAudio(app, sound ?? null);
          } else {
            console.log(`[FCEnhanced] "${title}" already notified (key=${key})`);
          }
        }

        // End notification
        if (!settings.notifications.notifyOnEnd) {
          // skip — notifyOnEnd disabled globally
        } else if (!plannedEnd) {
          console.log(`[FCEnhanced] "${title}": no endTime, skip end notification`);
        } else {
          const msUntilEnd = plannedEnd.getTime() - now.getTime();
          console.log(`[FCEnhanced] "${title}": msUntilEnd=${Math.round(msUntilEnd/1000)}s, endWindow=[-180s, 60s]`);
          if (msUntilEnd >= -3 * 60_000 && msUntilEnd <= 60_000) {
            const key = `end:${file.path}:${dateStr}:${endStr}`;
            if (!notifiedSet.has(key)) {
              notifiedSet.add(key);
              new Notice(`✅ Завершается: ${title}`, 8000);
              console.log(`[FCEnhanced] Fired end notification for "${title}"`);
              const endSoundOverride = fm.notification?.endSound;
              const sound = (endSoundOverride && typeof endSoundOverride === "string")
                ? endSoundOverride
                : settings.notifications.defaultEndSound;
              playAudio(app, sound ?? null);
            } else {
              console.log(`[FCEnhanced] "${title}" end already notified (key=${key})`);
            }
          }
        }
      } catch (e) {
        console.warn(`[FCEnhanced] Error processing file ${file.path}:`, e);
      }
    }
  }

  if (notifiedSet.size > 1000) notifiedSet.clear();
}
