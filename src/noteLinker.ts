/**
 * Feature 1: Note/Folder Linking
 *
 * BUG-FIX notes:
 * - We no longer patch cache.addEvent / cache.updateEventWithId with manual
 *   frontmatter writes.  Those patches triggered metadataCache.changed which
 *   raced with EventStore.add() and caused "already exists" errors.
 * - Instead we use Obsidian's atomic processFrontMatter (v0.16+) inside a
 *   MutationObserver that intercepts the modal's submit button click.
 *   processFrontMatter does NOT re-fire metadataCache.changed for unrelated
 *   fields, so no double-add race.
 * - IMPORTANT: This module no longer attaches its own form submit listener.
 *   The single submit listener in index.ts calls getPendingLinkedNotes() and
 *   saves everything in ONE processFrontMatter call to avoid race conditions.
 */

import { App, TFile, TFolder, FuzzySuggestModal } from "obsidian";

// Linked notes selected in the currently-open modal session
let pendingLinkedNotes: string[] = [];

/** Called by index.ts setupModalEnhancer to read the current selection */
export function getPendingLinkedNotes(): string[] {
  return [...pendingLinkedNotes];
}

export function setupNoteLinker(_app: App, _basePlugin: any): () => void {
  // No-op: injection is now done via injectNoteLinkerUI called from setupModalEnhancer
  return () => {};
}

/** Called directly from setupModalEnhancer after React renders the modal */
export function injectNoteLinkerUI(modalEl: HTMLElement, app: App, plugin: any) {
  tryInjectNoteLinker(app, modalEl, plugin);
}

// ---------------------------------------------------------------------------
function tryInjectNoteLinker(app: App, modalEl: HTMLElement, plugin: any) {
  if (!modalEl.querySelector("input#title")) return; // not our modal
  if (modalEl.querySelector(".fc-note-linker")) return; // already injected

  // Reset pending state for this new modal session
  pendingLinkedNotes = [];

  // Pre-populate if editing an existing event
  const eventId = (window as any).__fcLastClickedEventId as string | null;
  if (eventId) {
    loadExistingLinkedNotes(app, plugin, eventId).then((notes) => {
      pendingLinkedNotes = notes;
      refreshNoteList(listEl, pendingLinkedNotes);
    });
  }

  // ── Build UI ────────────────────────────────────────────────────────────
  const container = document.createElement("div");
  container.className = "fc-note-linker";

  const hdr = document.createElement("p");
  hdr.style.cssText = "margin:0 0 6px 0;font-weight:600;font-size:13px;color:var(--text-muted);";
  hdr.textContent = "🔗 Связанные заметки / папки";
  container.appendChild(hdr);

  const listEl = document.createElement("div");
  listEl.className = "fc-note-list";
  listEl.style.cssText = "display:flex;flex-direction:column;gap:4px;margin-bottom:6px;";
  container.appendChild(listEl);

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.textContent = "+ Добавить заметку / папку";
  addBtn.style.cssText =
    "font-size:12px;padding:4px 10px;cursor:pointer;" +
    "background:var(--interactive-normal);border:1px solid var(--background-modifier-border);" +
    "border-radius:4px;color:var(--text-normal);";
  addBtn.onclick = () => {
    new NoteFolderPickerModal(app, (chosen) => {
      if (!pendingLinkedNotes.includes(chosen)) pendingLinkedNotes.push(chosen);
      refreshNoteList(listEl, pendingLinkedNotes);
    }).open();
  };
  container.appendChild(addBtn);

  // Insert before last <p> (submit row) in the form
  const form = modalEl.querySelector("form");
  if (!form) return;
  const ps = form.querySelectorAll("p");
  const last = ps[ps.length - 1];
  if (last) form.insertBefore(container, last);
  else form.appendChild(container);

  // NOTE: No form submit listener here.
  // The single submit listener in index.ts setupModalEnhancer calls
  // getPendingLinkedNotes() and saves all fields in ONE processFrontMatter call.
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getEventFilePath(plugin: any, eventId: string): string | null {
  try {
    return plugin.cache.getInfoForEditableEvent(eventId)?.location?.path ?? null;
  } catch {
    return null;
  }
}

async function loadExistingLinkedNotes(app: App, plugin: any, eventId: string): Promise<string[]> {
  try {
    const path = getEventFilePath(plugin, eventId);
    if (!path) return [];
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return [];
    const fm = (app as any).metadataCache?.getFileCache(file)?.frontmatter ?? {};
    return Array.isArray(fm.linkedNotes) ? fm.linkedNotes : [];
  } catch {
    return [];
  }
}

function refreshNoteList(container: HTMLElement, notes: string[]) {
  container.innerHTML = "";
  for (const note of notes) {
    const row = document.createElement("div");
    row.style.cssText =
      "display:flex;align-items:center;gap:6px;font-size:12px;" +
      "padding:2px 4px;background:var(--background-secondary);border-radius:4px;";

    const icon = document.createElement("span");
    icon.textContent = note.endsWith("/") || !note.includes(".") ? "📁" : "📄";

    const label = document.createElement("span");
    label.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    label.textContent = note;
    label.title = note;

    const rm = document.createElement("button");
    rm.type = "button";
    rm.textContent = "✕";
    rm.style.cssText =
      "background:none;border:none;cursor:pointer;color:var(--text-muted);padding:0 2px;font-size:11px;";
    rm.onclick = () => {
      pendingLinkedNotes = pendingLinkedNotes.filter((n) => n !== note);
      refreshNoteList(container, pendingLinkedNotes);
    };

    row.appendChild(icon);
    row.appendChild(label);
    row.appendChild(rm);
    container.appendChild(row);
  }
}

// ---------------------------------------------------------------------------
// Fuzzy picker modal
// ---------------------------------------------------------------------------
class NoteFolderPickerModal extends FuzzySuggestModal<string> {
  private cb: (path: string) => void;

  constructor(app: App, cb: (path: string) => void) {
    super(app);
    this.cb = cb;
    this.setPlaceholder("Найти заметку или папку…");
  }

  getItems(): string[] {
    const items: string[] = [];
    for (const f of this.app.vault.getAllLoadedFiles()) {
      if (f instanceof TFolder && f.path !== "/") items.push(f.path + "/");
      else if (f instanceof TFile && f.extension === "md") items.push(f.path);
    }
    return items.sort();
  }

  getItemText(item: string): string {
    return item;
  }

  onChooseItem(item: string) {
    this.cb(item);
  }
}

// ---------------------------------------------------------------------------
// Hover popup showing linked notes (called from eventMouseEnter patch)
// ---------------------------------------------------------------------------
export function showLinkedNotesPopup(app: App, event: any, targetEl: HTMLElement, filePath?: string | null) {
  // filePath is passed explicitly because event.id is a counter, not a vault path
  const fp = filePath ?? (event.id as string);
  if (!fp) return;

  const file = (app as any).vault?.getAbstractFileByPath(fp);
  if (!(file instanceof TFile)) return;

  const fm: any = (app as any).metadataCache?.getFileCache(file)?.frontmatter ?? {};
  const linkedNotes: string[] = Array.isArray(fm.linkedNotes) ? fm.linkedNotes : [];
  if (linkedNotes.length === 0 || !(file instanceof TFile)) return;

  document.querySelectorAll(".fc-linked-notes-popup").forEach((el) => el.remove());

  const popup = document.createElement("div");
  popup.className = "fc-linked-notes-popup";

  const title = document.createElement("div");
  title.style.cssText =
    "font-weight:600;margin-bottom:6px;color:var(--text-muted);" +
    "font-size:11px;text-transform:uppercase;letter-spacing:.5px;";
  title.textContent = "Связанные заметки";
  popup.appendChild(title);

  for (const notePath of linkedNotes) {
    const row = document.createElement("div");
    row.style.cssText =
      "display:flex;align-items:center;gap:6px;padding:3px 0;" +
      "cursor:pointer;color:var(--text-accent);";
    row.textContent =
      (notePath.endsWith("/") ? "📁 " : "📄 ") +
      notePath.replace(/\/$/, "").split("/").pop();
    row.title = notePath;
    row.onclick = () => {
      const f = app.vault.getAbstractFileByPath(notePath.replace(/\/$/, ""));
      if (f instanceof TFile) app.workspace.openLinkText(notePath, "", false);
      popup.remove();
    };
    popup.appendChild(row);
  }

  const rect = targetEl.getBoundingClientRect();
  popup.style.left = `${rect.left}px`;
  popup.style.top = `${rect.bottom + 4}px`;
  document.body.appendChild(popup);

  const remove = () => {
    popup.remove();
    targetEl.removeEventListener("mouseleave", remove);
  };
  targetEl.addEventListener("mouseleave", remove);
  setTimeout(() => popup.remove(), 5000);
}

// ---------------------------------------------------------------------------
// Badge count helper (used in eventDidMount patch)
// reads directly from file cache, not extendedProps
// ---------------------------------------------------------------------------
// filePath must be the actual vault file path (not the FullCalendar event.id counter)
export function getLinkedNotesCount(app: App, filePath: string | null | undefined): number {
  try {
    if (!filePath) return 0;
    const file = (app as any).vault?.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) return 0;
    const fm = (app as any).metadataCache?.getFileCache(file)?.frontmatter ?? {};
    return Array.isArray(fm.linkedNotes) ? fm.linkedNotes.length : 0;
  } catch {
    return 0;
  }
}
