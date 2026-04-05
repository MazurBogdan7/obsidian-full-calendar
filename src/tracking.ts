/**
 * Feature 3: Hard Event Tracking
 *
 * Tracking buttons live inside the event edit modal (not on calendar elements).
 * Vault files are scanned directly — extendedProps never has tracking data.
 */

import { App, Notice, TFile } from "obsidian";
import { EnhancedSettings } from "./types";
import { dimColor, withFileLock } from "./utils";

// Paths already auto-added to dashboard this session (for untracked events)
const autoDashboardAdded = new Set<string>();

export function setupTracking(app: App, basePlugin: any, getSettings: () => EnhancedSettings): () => void {
  const id = window.setInterval(() => {
    checkAutoAddUntracked(app, basePlugin, getSettings());
  }, 60_000);

  // First check shortly after init
  setTimeout(() => checkAutoAddUntracked(app, basePlugin, getSettings()), 5000);

  return () => window.clearInterval(id);
}

// ---------------------------------------------------------------------------
// Auto-add untracked finished events to dashboard
// ---------------------------------------------------------------------------
async function checkAutoAddUntracked(app: App, plugin: any, settings: EnhancedSettings) {
  const now = new Date();
  const sources: any[] = plugin.settings?.calendarSources ?? [];

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

    for (const file of files) {
      const fm: any = (app as any).metadataCache?.getFileCache(file)?.frontmatter ?? {};
      if (!fm.date || !fm.startTime || !fm.endTime) continue;

      // Only for events where tracking is explicitly off OR enabledByDefault is false and not set
      const trackEnabled: boolean =
        fm.tracking?.enabled !== undefined
          ? !!fm.tracking.enabled
          : settings.tracking.enabledByDefault;

      if (trackEnabled) continue; // tracked events are handled by the user via buttons

      // fm.date may be a JS Date object (YAML auto-parses unquoted dates)
      const dateStr = fm.date instanceof Date
        ? fm.date.toISOString().slice(0, 10)
        : String(fm.date).slice(0, 10);

      let plannedStart: Date;
      let plannedEnd: Date;
      try {
        plannedStart = new Date(`${dateStr}T${String(fm.startTime).trim()}`);
        const endDateStr = fm.endDate
          ? (fm.endDate instanceof Date ? fm.endDate.toISOString().slice(0,10) : String(fm.endDate).slice(0,10))
          : dateStr;
        plannedEnd = new Date(`${endDateStr}T${String(fm.endTime).trim()}`);
        // Cross-midnight: shift end to next day if no explicit endDate and end <= start
        if (!fm.endDate && plannedEnd <= plannedStart) {
          plannedEnd = new Date(plannedEnd.getTime() + 24 * 60 * 60 * 1000);
        }
      } catch { continue; }
      if (isNaN(plannedStart.getTime()) || isNaN(plannedEnd.getTime())) continue;

      // Only add once the event has finished
      if (now.getTime() < plannedEnd.getTime()) continue;

      const key = `${file.path}:${fm.date}`;
      if (autoDashboardAdded.has(key)) continue;
      autoDashboardAdded.add(key);

      try {
        const { saveDashboardEventRecord } = await import("./dashboard");
        await saveDashboardEventRecord(app, plugin, {
          id: file.path,
          title: fm.title ?? file.basename,
          calendarId: file.path.split("/")[0],
          plannedStart: plannedStart.toISOString(),
          plannedEnd: plannedEnd.toISOString(),
          tracked: false,
          linkedNotes: Array.isArray(fm.linkedNotes) ? fm.linkedNotes : [],
        });
      } catch (e) {
        console.warn("FCEnhanced: auto dashboard record error:", e);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Visual overlays on FullCalendar event elements
// filePath must be the actual vault path (event.id is just a counter string)
// ---------------------------------------------------------------------------
export function applyTrackingVisuals(
  el: HTMLElement,
  event: any,
  app: App,
  filePath?: string | null
) {
  if (!filePath) return;

  const file = (app as any).vault?.getAbstractFileByPath(filePath);
  if (!(file instanceof TFile)) return;

  const fm: any = (app as any).metadataCache?.getFileCache(file)?.frontmatter ?? {};
  const tracking = fm.tracking;
  if (!tracking?.startedAt && !tracking?.endedAt) return;

  const plannedStart: Date = event.start;
  const plannedEnd: Date = event.end;
  if (!plannedStart || !plannedEnd) return;

  const duration = plannedEnd.getTime() - plannedStart.getTime();
  if (duration <= 0) return;

  const color: string = event.backgroundColor || event.borderColor || fm.color || "#3788d8";

  // Late start overlay
  if (tracking.startedAt) {
    const actualStart = new Date(tracking.startedAt);
    const lateMs = actualStart.getTime() - plannedStart.getTime();
    if (lateMs > 60_000) {
      const latePct = Math.min((lateMs / duration) * 100, 100);
      const overlay = document.createElement("div");
      overlay.className = "fc-tracking-late-overlay";
      overlay.style.cssText = `position:absolute;top:0;left:0;right:0;height:${latePct}%;background:${dimColor(color, 0.35)};z-index:1;border-radius:3px 3px 0 0;pointer-events:none;`;
      const lbl = document.createElement("div");
      lbl.className = "fc-tracking-label";
      lbl.style.cssText = "position:absolute;top:2px;left:4px;z-index:2;pointer-events:none;font-size:10px;";
      lbl.textContent = `▷ ${fmt(actualStart)}`;
      el.style.position = "relative";
      el.appendChild(overlay);
      el.appendChild(lbl);
    }
  }

  // Overtime extension
  if (tracking.endedAt) {
    const actualEnd = new Date(tracking.endedAt);
    const overMs = actualEnd.getTime() - plannedEnd.getTime();
    if (overMs > 60_000) {
      const overPct = Math.min((overMs / duration) * 100, 60);
      const ext = document.createElement("div");
      ext.className = "fc-tracking-overtime";
      ext.style.cssText = `position:absolute;left:0;right:0;bottom:-${overPct}%;height:${overPct}%;background:${color};opacity:0.65;z-index:1;border-radius:0 0 3px 3px;pointer-events:none;`;
      const lbl = document.createElement("div");
      lbl.className = "fc-tracking-label";
      lbl.style.cssText = `position:absolute;bottom:calc(-${overPct}% + 2px);left:4px;z-index:2;pointer-events:none;font-size:10px;`;
      lbl.textContent = `■ ${fmt(actualEnd)}`;
      el.style.position = "relative";
      el.style.overflow = "visible";
      el.appendChild(ext);
      el.appendChild(lbl);
    }
  }
}

function fmt(d: Date): string {
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Tracking ACTION buttons in the event edit modal.
// Always shown when editing an existing event (filePath is known).
// ▶ = mark start (any time), ⏹ = mark end (only after start).
// ---------------------------------------------------------------------------
export function injectTrackingActionButtons(
  modalEl: HTMLElement,
  app: any,
  plugin: any,
  filePath: string,
  fm: any,
  getSettings: () => EnhancedSettings
) {
  if (modalEl.querySelector(".fc-tracking-actions")) return;

  const alreadyStarted = !!fm?.tracking?.startedAt;
  const alreadyEnded   = !!fm?.tracking?.endedAt;

  const section = document.createElement("div");
  section.className = "fc-tracking-actions fc-enhanced-section";

  const header = document.createElement("p");
  header.style.cssText = "margin:0 0 8px 0;font-weight:600;font-size:13px;color:var(--text-muted);";
  header.textContent = "⏱ Трекинг выполнения";
  section.appendChild(header);

  // Status line
  const status = document.createElement("p");
  status.style.cssText = "font-size:12px;color:var(--text-faint);margin:0 0 8px 0;line-height:1.6;";
  status.textContent = buildStatusText(fm);
  section.appendChild(status);

  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;";

  // ── ▶ Start button ───────────────────────────────────────────────────────
  if (!alreadyStarted) {
    const startBtn = makeTrackingBtn("▶ Приступил к задаче", "fc-modal-tracking-start");
    startBtn.addEventListener("click", async () => {
      startBtn.disabled = true;
      startBtn.textContent = "…";
      const nowISO = new Date().toISOString();
      try {
        const file = (app as any).vault.getAbstractFileByPath(filePath);
        if (!file) throw new Error("file not found");
        await withFileLock(filePath, () =>
          (app as any).fileManager.processFrontMatter(file, (frontmatter: any) => {
            if (!frontmatter.tracking) frontmatter.tracking = {};
            frontmatter.tracking.enabled   = true;
            frontmatter.tracking.startedAt = nowISO;
          })
        );
        // Update fm reference for the end button
        fm.tracking = fm.tracking ?? {};
        fm.tracking.startedAt = nowISO;
        fm.tracking.enabled = true;

        status.textContent = buildStatusText(fm);
        startBtn.remove();

        // Add ⏹ button
        const endBtn = buildEndBtn(app, plugin, filePath, fm, status);
        btnRow.appendChild(endBtn);
      } catch (err) {
        console.warn("FCEnhanced start tracking:", err);
        startBtn.disabled = false;
        startBtn.textContent = "▶ Приступил к задаче";
      }
    });
    btnRow.appendChild(startBtn);
  }

  // ── ⏹ End button ─────────────────────────────────────────────────────────
  if (alreadyStarted && !alreadyEnded) {
    const endBtn = buildEndBtn(app, plugin, filePath, fm, status);
    btnRow.appendChild(endBtn);
  }

  // ── Already completed ─────────────────────────────────────────────────────
  // (status text is enough, no buttons needed)

  section.appendChild(btnRow);
  insertBeforeSubmit(modalEl, section);
}

function buildStatusText(fm: any): string {
  const alreadyStarted = !!fm?.tracking?.startedAt;
  const alreadyEnded   = !!fm?.tracking?.endedAt;
  if (!alreadyStarted) return "Ещё не начато — нажмите ▶ когда приступите";
  const s = new Date(fm.tracking.startedAt);
  const startStr = `${s.getHours().toString().padStart(2,"0")}:${s.getMinutes().toString().padStart(2,"0")}`;
  if (!alreadyEnded) return `▶ Начато в ${startStr} — нажмите ⏹ когда завершите`;
  const e = new Date(fm.tracking.endedAt);
  const endStr = `${e.getHours().toString().padStart(2,"0")}:${e.getMinutes().toString().padStart(2,"0")}`;
  return `✅ Начато ${startStr} → завершено ${endStr}`;
}

function buildEndBtn(
  app: any,
  plugin: any,
  filePath: string,
  fm: any,
  statusEl: HTMLElement
): HTMLButtonElement {
  const endBtn = makeTrackingBtn("⏹ Завершил задачу", "fc-modal-tracking-end");
  endBtn.addEventListener("click", async () => {
    endBtn.disabled = true;
    endBtn.textContent = "…";
    const nowISO = new Date().toISOString();
    const startedAt = fm?.tracking?.startedAt ?? null;
    try {
      const file = (app as any).vault.getAbstractFileByPath(filePath);
      if (!file) throw new Error("file not found");
      await withFileLock(filePath, () =>
        (app as any).fileManager.processFrontMatter(file, (frontmatter: any) => {
          if (!frontmatter.tracking) frontmatter.tracking = {};
          frontmatter.tracking.endedAt = nowISO;
        })
      );
      fm.tracking = fm.tracking ?? {};
      fm.tracking.endedAt = nowISO;
      statusEl.textContent = buildStatusText(fm);
      endBtn.remove();

      // Save dashboard record
      try {
        const { saveDashboardEventRecord } = await import("./dashboard");
        const _dateStr = fm.date instanceof Date ? fm.date.toISOString().slice(0,10) : String(fm.date ?? "").slice(0,10);
        const pStart = _dateStr && fm.startTime ? new Date(`${_dateStr}T${String(fm.startTime).trim()}`) : null;
        let pEnd: Date | null = null;
        if (_dateStr && fm.endTime) {
          const endDateStr = fm.endDate
            ? (fm.endDate instanceof Date ? fm.endDate.toISOString().slice(0,10) : String(fm.endDate).slice(0,10))
            : _dateStr;
          pEnd = new Date(`${endDateStr}T${String(fm.endTime).trim()}`);
          // Cross-midnight: shift end to next day if no explicit endDate and end <= start
          if (!fm.endDate && pStart && pEnd <= pStart) {
            pEnd = new Date(pEnd.getTime() + 24 * 60 * 60 * 1000);
          }
        }
        if (pStart && pEnd) {
          await saveDashboardEventRecord(app, plugin, {
            id: filePath,
            title: fm.title ?? filePath.split("/").pop()?.replace(".md", "") ?? "",
            calendarId: filePath.split("/")[0],
            plannedStart: pStart.toISOString(),
            plannedEnd:   pEnd.toISOString(),
            actualStart:  startedAt ?? undefined,
            actualEnd:    nowISO,
            tracked:      true,
            linkedNotes:  Array.isArray(fm.linkedNotes) ? fm.linkedNotes : [],
          });
        }
      } catch (e) {
        console.warn("FCEnhanced dashboard record:", e);
      }
    } catch (err) {
      console.warn("FCEnhanced end tracking:", err);
      endBtn.disabled = false;
      endBtn.textContent = "⏹ Завершил задачу";
    }
  });
  return endBtn;
}

function makeTrackingBtn(text: string, cls: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = text;
  btn.className = `fc-modal-tracking-btn ${cls}`;
  return btn;
}

// ---------------------------------------------------------------------------
// Per-event tracking TOGGLE (enable/disable tracking for this event)
// ---------------------------------------------------------------------------
export function injectTrackingUI(
  modalEl: HTMLElement,
  currentTracking: { enabled?: boolean } | undefined,
  globalSettings: EnhancedSettings,
  onChange: (t: { enabled: boolean }) => void
) {
  if (modalEl.querySelector(".fc-tracking-section")) return;

  const state = { enabled: currentTracking?.enabled ?? globalSettings.tracking.enabledByDefault };

  const section = document.createElement("div");
  section.className = "fc-tracking-section fc-enhanced-section";

  const header = document.createElement("p");
  header.style.cssText = "margin:0 0 6px 0;font-weight:600;font-size:13px;color:var(--text-muted);";
  header.textContent = "⚙️ Настройки трекинга";
  section.appendChild(header);

  const row = document.createElement("p");
  row.style.cssText = "display:flex;align-items:center;gap:8px;margin:4px 0;";

  const lbl = document.createElement("label");
  lbl.textContent = "Вести трекинг для этого события";
  lbl.style.cssText = "font-size:13px;flex:1;";

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = state.enabled;
  cb.onchange = () => { state.enabled = cb.checked; onChange({ ...state }); };

  row.appendChild(lbl);
  row.appendChild(cb);
  section.appendChild(row);

  const hint = document.createElement("p");
  hint.style.cssText = "font-size:11px;color:var(--text-faint);margin:2px 0 0;";
  hint.textContent = "Если выключено — событие добавляется в дашборд автоматически после окончания";
  section.appendChild(hint);

  insertBeforeSubmit(modalEl, section);
}

function insertBeforeSubmit(modalEl: HTMLElement, el: HTMLElement) {
  const form = modalEl.querySelector("form");
  if (!form) return;
  const ps = form.querySelectorAll("p");
  const last = ps[ps.length - 1];
  if (last) form.insertBefore(el, last);
  else form.appendChild(el);
}
