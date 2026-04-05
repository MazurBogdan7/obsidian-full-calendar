/**
 * Enhanced Calendar Patch — Entry Point
 *
 * KEY FIX: event.id in FullCalendar eventDidMount is an EventStore counter ID
 * ("0", "1", "2"...) — NOT the vault file path. To get the file path, use:
 *   plugin.cache.getInfoForEditableEvent(id)?.location?.path
 */

import { WorkspaceLeaf, Notice, TFile } from "obsidian";
import { EnhancedSettings, DEFAULT_ENHANCED_SETTINGS } from "./types";
import { setupNoteLinker, showLinkedNotesPopup, getLinkedNotesCount, getPendingLinkedNotes, injectNoteLinkerUI } from "./noteLinker";
import { setupNotifications, injectNotificationUI } from "./notifications";
import { setupTracking, applyTrackingVisuals, injectTrackingUI, injectTrackingActionButtons } from "./tracking";
import { DashboardView, DASHBOARD_VIEW_TYPE } from "./dashboard";
import { EnhancedSettingTab } from "./settings";
import { withFileLock } from "./utils";

// Helper: get the vault file path for a FullCalendar event ID (counter "0","1"...)
function getFilePath(plugin: any, eventId: string): string | null {
  try {
    return plugin.cache.getInfoForEditableEvent(eventId)?.location?.path ?? null;
  } catch {
    return null;
  }
}

// =============================================================================
// Bootstrap — wait for the base plugin to finish loading
// =============================================================================
(function patchFullCalendar() {
  const tryPatch = (attempts = 0) => {
    const app: any = (window as any).app;
    if (!app) {
      if (attempts < 40) setTimeout(() => tryPatch(attempts + 1), 500);
      return;
    }
    const plugin = app.plugins?.plugins?.["obsidian-full-calendar"];
    if (!plugin) {
      if (attempts < 40) setTimeout(() => tryPatch(attempts + 1), 500);
      return;
    }
    applyEnhancements(app, plugin).catch(console.error);
  };
  setTimeout(() => tryPatch(), 1500);
})();

// =============================================================================
// Main enhancement entry
// =============================================================================
async function applyEnhancements(app: any, plugin: any) {

  // ── 1. Load / merge enhanced settings ─────────────────────────────────────
  const DATA_KEY = "enhanced_settings";
  const stored = await plugin.loadData();

  let enhancedSettings: EnhancedSettings = {
    notifications: Object.assign({}, DEFAULT_ENHANCED_SETTINGS.notifications, stored?.[DATA_KEY]?.notifications),
    tracking:      Object.assign({}, DEFAULT_ENHANCED_SETTINGS.tracking,      stored?.[DATA_KEY]?.tracking),
    dashboard:     Object.assign({}, DEFAULT_ENHANCED_SETTINGS.dashboard,     stored?.[DATA_KEY]?.dashboard),
    noteLinker:    Object.assign({}, DEFAULT_ENHANCED_SETTINGS.noteLinker,    stored?.[DATA_KEY]?.noteLinker),
  };
  plugin._enhancedSettings = enhancedSettings;

  const getSettings = (): EnhancedSettings => enhancedSettings;
  const saveSettings = async (s: EnhancedSettings) => {
    enhancedSettings = s;
    plugin._enhancedSettings = s;
    const cur = await plugin.loadData();
    await plugin.saveData({ ...cur, [DATA_KEY]: s });
  };

  // ── 2. Dashboard view ──────────────────────────────────────────────────────
  plugin.registerView(
    DASHBOARD_VIEW_TYPE,
    (leaf: WorkspaceLeaf) => new DashboardView(leaf, plugin, getSettings)
  );
  plugin.addCommand({
    id: "full-calendar-dashboard",
    name: "Открыть дашборд календаря",
    callback: () => {
      app.workspace.getLeaf("tab").setViewState({ type: DASHBOARD_VIEW_TYPE, active: true });
    },
  });

  // ── 3. Settings tab ────────────────────────────────────────────────────────
  patchSettingTab(app, plugin, getSettings, saveSettings);

  // ── 4. Bug 3 fix ───────────────────────────────────────────────────────────
  patchMoveEventToCalendar(plugin);

  // ── 5. Patch renderCalendar (visuals + badges only, no buttons on elements) ─
  patchRenderCalendar(app, plugin, getSettings);

  // ── 6. Notification timer ──────────────────────────────────────────────────
  const stopNotifications = setupNotifications(app, plugin, getSettings);
  plugin.register(() => stopNotifications());

  // ── 7. Tracking timer ─────────────────────────────────────────────────────
  const stopTracking = setupTracking(app, plugin, getSettings);
  plugin.register(() => stopTracking());

  // ── 8. Note linker modal observer ─────────────────────────────────────────
  const stopLinker = setupNoteLinker(app, plugin);
  plugin.register(() => stopLinker());

  // ── 9. Modal enhancer (tracking buttons INSIDE edit modal) ────────────────
  setupModalEnhancer(app, plugin, getSettings);

  console.log("✅ Full Calendar Enhanced patch applied");
  new Notice("📅 Расширенный календарь активен", 3000);
}

// =============================================================================
// Bug 3 fix
// =============================================================================
function patchMoveEventToCalendar(plugin: any) {
  const origMove = plugin.cache?.moveEventToCalendar?.bind(plugin.cache);
  if (!origMove) return;
  plugin.cache.moveEventToCalendar = async function (eventId: string, newCalendarId: string) {
    await origMove(eventId, newCalendarId);
    await new Promise<void>((r) => setTimeout(r, 1200));
  };
}

// =============================================================================
// Settings tab
// =============================================================================
function patchSettingTab(
  app: any,
  plugin: any,
  getSettings: () => EnhancedSettings,
  saveSettings: (s: EnhancedSettings) => Promise<void>
) {
  const enhancedTab = new EnhancedSettingTab(app, plugin, getSettings, saveSettings);

  const findTab = () =>
    app.setting?.pluginTabs?.find((t: any) => t.plugin === plugin) ??
    app.setting?.settingTabs?.find((t: any) => t.plugin === plugin);

  const attachToTab = (t: any) => {
    const orig = t.display.bind(t);
    t.display = function () {
      orig();
      setTimeout(() => {
        const el = this.containerEl ?? t.containerEl;
        if (el) enhancedTab.render(el);
      }, 50);
    };
  };

  const tab = findTab();
  if (tab) {
    attachToTab(tab);
  } else {
    setTimeout(() => { const t = findTab(); if (t) attachToTab(t); }, 3000);
  }
}

// =============================================================================
// Patch renderCalendar — visuals and badges only (no buttons on event elements)
// =============================================================================
function patchRenderCalendar(
  app: any,
  plugin: any,
  getSettings: () => EnhancedSettings
) {
  const origRender = plugin.renderCalendar?.bind(plugin);
  if (!origRender) return;

  plugin.renderCalendar = function (
    containerEl: HTMLElement,
    eventSources: any[],
    settings: any
  ) {
    const origDidMount   = settings?.eventDidMount;
    const origMouseEnter = settings?.eventMouseEnter;
    const origEventClick = settings?.eventClick;

    const patched = {
      ...settings,

      eventClick: (info: any) => {
        (window as any).__fcLastClickedEventId = info?.event?.id ?? null;
        if (origEventClick) origEventClick(info);
      },

      eventDidMount: (info: any) => {
        if (origDidMount) origDidMount(info);

        // Resolve actual vault file path (event.id is a counter, not a path)
        const filePath = getFilePath(plugin, info.event.id);

        // Tracking overlays (late-start dim, overtime extension)
        try { applyTrackingVisuals(info.el, info.event, app, filePath); } catch {}

        // Linked-notes badge
        try {
          const count = getLinkedNotesCount(app, filePath);
          if (count > 0) {
            const badge = document.createElement("span");
            badge.className = "fc-linked-notes-badge";
            badge.title = `Связанных заметок: ${count}`;
            badge.textContent = `🔗${count}`;
            info.el.appendChild(badge);
          }
        } catch {}
      },

      eventMouseEnter: (info: any) => {
        if (origMouseEnter) origMouseEnter(info);
        try {
          if (getSettings().noteLinker.showLinkedNotesOnHover) {
            const filePath = getFilePath(plugin, info.event.id);
            showLinkedNotesPopup(app, info.event, info.el, filePath);
          }
        } catch {}
      },
    };

    return origRender(containerEl, eventSources, patched);
  };

  try {
    for (const leaf of app.workspace.getLeavesOfType("full-calendar-view") as any[]) {
      leaf.view?.onOpen?.();
    }
  } catch {}
}

// =============================================================================
// Modal enhancer via window.__fcOnModalRendered hook (set in main.original.js
// inside ReactModal.onOpen, fires after ReactDOM.render completes).
//
// For create modal: eventId is null — no tracking buttons, only toggles.
// For edit modal:   eventId is the EventStore counter — shows ▶/⏹ buttons.
// =============================================================================
function setupModalEnhancer(
  app: any,
  plugin: any,
  getSettings: () => EnhancedSettings
) {
  type PendingState = {
    notification: { enabled?: boolean; startSound?: string | null; endSound?: string | null };
    tracking: { enabled: boolean };
  };

  (window as any).__fcOnModalRendered = (contentEl: HTMLElement, eventId: string | null) => {
    // Verify this is the event edit/create form
    if (!contentEl.querySelector("input#title")) return;

    const filePath = eventId ? getFilePath(plugin, eventId) : null;

    const pending: PendingState = {
      notification: { enabled: true, startSound: null, endSound: null },
      tracking: { enabled: getSettings().tracking.enabledByDefault },
    };

    let currentFm: any = {};
    if (filePath) {
      try {
        const file = app.vault.getAbstractFileByPath(filePath);
        if (file) {
          currentFm = app.metadataCache?.getFileCache(file)?.frontmatter ?? {};
          if (currentFm.notification) Object.assign(pending.notification, currentFm.notification);
          if (currentFm.tracking?.enabled !== undefined) pending.tracking.enabled = currentFm.tracking.enabled;
        }
      } catch {}
    }

    // ── Note linker UI ────────────────────────────────────────────────────────
    injectNoteLinkerUI(contentEl, app, plugin);

    // ── Tracking ▶/⏹ action buttons — only for existing events ──────────────
    if (filePath) {
      injectTrackingActionButtons(contentEl, app, plugin, filePath, currentFm, getSettings);
    }

    // ── Notification UI ───────────────────────────────────────────────────────
    injectNotificationUI(contentEl, pending.notification, getSettings(), (ns) => {
      Object.assign(pending.notification, ns);
    });

    // ── Tracking toggle UI ───────────────────────────────────────────────────
    injectTrackingUI(contentEl, pending.tracking, getSettings(), (ts) => {
      Object.assign(pending.tracking, ts);
    });

    // ── Submit: save all extended props in ONE processFrontMatter call ────────
    const form = contentEl.querySelector("form");
    form?.addEventListener("submit", () => {
      setTimeout(async () => {
        try {
          const fp = filePath ?? (await findNewestFile(app, plugin));
          if (!fp) return;
          const file = app.vault.getAbstractFileByPath(fp);
          if (!file) return;
          const linkedNotes = getPendingLinkedNotes();

          // Check if this is a recurring event — processFrontMatter corrupts
          // daysOfWeek: [S,F,...] by writing both inline and block forms simultaneously.
          // For recurring events we use a safe regex-based approach instead.
          const cachedFm = (app as any).metadataCache?.getFileCache(file)?.frontmatter ?? {};
          const isRecurring = !!(cachedFm.daysOfWeek || cachedFm.startRecur || cachedFm.rrule);

          await withFileLock(fp, async () => {
            if (isRecurring) {
              // Safe write: only patch the specific YAML lines we own, leave everything else intact
              await safeWriteEnhancedFields(app, file, pending, linkedNotes);
            } else {
              const pfm = (app as any).fileManager?.processFrontMatter;
              if (typeof pfm === "function") {
                await pfm.call(app.fileManager, file, (frontmatter: any) => {
                  // Only write non-null sound overrides to avoid masking global settings
                  const notifToWrite: any = { enabled: pending.notification.enabled };
                  if (pending.notification.startSound) notifToWrite.startSound = pending.notification.startSound;
                  if (pending.notification.endSound) notifToWrite.endSound = pending.notification.endSound;
                  frontmatter.notification = notifToWrite;
                  frontmatter.tracking = {
                    ...(frontmatter.tracking ?? {}),
                    enabled: pending.tracking.enabled,
                  };
                  if (linkedNotes.length > 0) frontmatter.linkedNotes = linkedNotes;
                });
              }
            }
          });
        } catch (e) {
          console.warn("FCEnhanced modal submit:", e);
        }
      }, 2500);
    });
  };
}

/**
 * Write notification/tracking/linkedNotes fields into a file's frontmatter
 * WITHOUT using processFrontMatter, to avoid corrupting inline YAML arrays
 * like daysOfWeek: [S,F,R,W,T,M,U] used by recurring events.
 *
 * Strategy: read raw text, strip any existing enhanced block, inject new one
 * just before the closing `---`, write back via vault.modify.
 */
async function safeWriteEnhancedFields(
  app: any,
  file: any,
  pending: { notification: any; tracking: any },
  linkedNotes: string[]
): Promise<void> {
  if (!(file instanceof TFile)) return;

  let text: string = await app.vault.read(file);

  // Find frontmatter block — tolerant regex: --- at start, then any content, then ---
  const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);
  if (!fmMatch) return;

  let fmBody = fmMatch[1];
  const after = text.slice(fmMatch[0].length); // body after closing ---

  // Remove lines belonging to our enhanced fields.
  // Each field may span multiple lines: the key line + indented sub-lines.
  for (const field of ["notification", "tracking", "linkedNotes"]) {
    fmBody = fmBody.replace(
      new RegExp(`^${field}:[^\n]*(?:\n[ \t]+[^\n]*)*`, "m"),
      ""
    );
  }

  // Normalize blank lines
  fmBody = fmBody.replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "").replace(/\n+$/, "");

  // Build enhanced YAML lines
  const lines: string[] = [];

  lines.push(`notification:`);
  lines.push(`  enabled: ${pending.notification.enabled !== false}`);
  if (pending.notification.startSound) lines.push(`  startSound: "${pending.notification.startSound}"`);
  if (pending.notification.endSound)   lines.push(`  endSound: "${pending.notification.endSound}"`);

  lines.push(`tracking:`);
  lines.push(`  enabled: ${pending.tracking.enabled}`);

  if (linkedNotes.length > 0) {
    lines.push(`linkedNotes:`);
    for (const n of linkedNotes) lines.push(`  - "${n}"`);
  }

  const enhanced = lines.join("\n");
  const newFmBody = fmBody ? `${fmBody}\n${enhanced}` : enhanced;
  // Ensure a single newline between closing --- and body
  const newText = `---\n${newFmBody}\n---\n${after}`;

  await app.vault.modify(file, newText);
}

async function findNewestFile(app: any, plugin: any): Promise<string | null> {
  const sources: any[] = plugin.settings?.calendarSources ?? [];
  let newest: any = null;
  const now = Date.now();
  for (const s of sources) {
    if (s.type !== "local" || !s.directory) continue;
    const dir = s.directory;
    const isRoot = dir === "/" || dir === "" || dir === ".";
    for (const f of app.vault.getFiles()) {
      const inDir = isRoot
        ? f.extension === "md"
        : (f.path.startsWith(dir + "/") || f.path === dir) && f.extension === "md";
      if (inDir && now - f.stat.mtime < 10000 && (!newest || f.stat.mtime > newest.stat.mtime)) {
        newest = f;
      }
    }
  }
  return newest?.path ?? null;
}
