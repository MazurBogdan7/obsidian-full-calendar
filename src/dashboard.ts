/**
 * Feature 4: Dashboard View
 */

import { App, ItemView, WorkspaceLeaf, TFile, Notice } from "obsidian";
import { EnhancedSettings, EventRecord } from "./types";
import { ensureFolder, writeJsonToVault, readJsonFromVault, formatDuration, toDateStr } from "./utils";

export const DASHBOARD_VIEW_TYPE = "full-calendar-dashboard";

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function fmtDateStr(dateStr: string): string {
  return dateStr;
}
function durationMin(r: EventRecord): number {
  if (!r.actualStart || !r.actualEnd) return 0;
  return (new Date(r.actualEnd).getTime() - new Date(r.actualStart).getTime()) / 60000;
}
function plannedMin(r: EventRecord): number {
  return (new Date(r.plannedEnd).getTime() - new Date(r.plannedStart).getTime()) / 60000;
}
function parseDateFromFm(fm: any): string | null {
  if (!fm?.date) return null;
  if (fm.date instanceof Date) return fm.date.toISOString().slice(0, 10);
  return String(fm.date).slice(0, 10);
}

// Build a scrollable section with search + optional column filters
function buildScrollableSection(
  parent: HTMLElement,
  title: string,
  columns: string[],
  rows: Array<Record<string, string>>,
  rowHeight = 36,
  visibleRows = 5
): void {
  const section = parent.createEl("div", { cls: "fc-dashboard-section" });
  section.createEl("h3", { text: title, cls: "fc-dashboard-section-title" });

  // Search bar
  const toolbar = section.createEl("div", { cls: "fc-section-toolbar" });
  const searchInput = toolbar.createEl("input", { cls: "fc-section-search" }) as HTMLInputElement;
  searchInput.type = "text";
  searchInput.placeholder = "Поиск по названию…";

  // Column filter selects
  const filterSelects: Map<string, HTMLSelectElement> = new Map();
  if (columns.length > 1) {
    const filterWrap = toolbar.createEl("div", { cls: "fc-section-filters" });
    for (const col of columns.slice(1)) {
      const values = [...new Set(rows.map(r => r[col] ?? ""))].filter(Boolean).sort();
      if (values.length > 1 && values.length <= 20) {
        const sel = filterWrap.createEl("select", { cls: "fc-section-filter-select" }) as HTMLSelectElement;
        sel.createEl("option", { text: col + ": все", value: "" });
        for (const v of values) sel.createEl("option", { text: v, value: v });
        filterSelects.set(col, sel);
      }
    }
  }

  // Table
  const tableWrap = section.createEl("div", { cls: "fc-scrollable-wrap" });
  tableWrap.style.cssText = `max-height:${rowHeight * visibleRows + 40}px;overflow-y:auto;`;

  const table = tableWrap.createEl("table", { cls: "fc-records-table" });
  const thead = table.createEl("thead");
  const headerRow = thead.createEl("tr");
  for (const col of columns) headerRow.createEl("th", { text: col });
  const tbody = table.createEl("tbody");

  function renderRows() {
    tbody.empty();
    const query = searchInput.value.toLowerCase();
    const filters: Record<string, string> = {};
    filterSelects.forEach((sel, col) => { filters[col] = sel.value; });

    const filtered = rows.filter(r => {
      const nameCol = columns[0];
      if (query && !(r[nameCol] ?? "").toLowerCase().includes(query)) return false;
      for (const [col, val] of Object.entries(filters)) {
        if (val && r[col] !== val) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      const tr = tbody.createEl("tr");
      tr.createEl("td", { text: "Нет данных", attr: { colspan: String(columns.length) } })
        .style.cssText = "text-align:center;color:var(--text-faint);padding:12px;";
      return;
    }

    for (const row of filtered) {
      const tr = tbody.createEl("tr");
      for (const col of columns) {
        const td = tr.createEl("td", { text: row[col] ?? "" });
        if (row.__cls?.[col]) td.addClass(row.__cls[col]);
      }
    }
  }

  searchInput.addEventListener("input", renderRows);
  filterSelects.forEach(sel => sel.addEventListener("change", renderRows));
  renderRows();
}

// ─── Dashboard View ────────────────────────────────────────────────────────────

export class DashboardView extends ItemView {
  private plugin: any;
  private getSettings: () => EnhancedSettings;
  private period: "week" | "month" | "year" = "week";
  private selectedActivity = "";   // currently selected activity for histogram

  constructor(leaf: WorkspaceLeaf, plugin: any, getSettings: () => EnhancedSettings) {
    super(leaf);
    this.plugin = plugin;
    this.getSettings = getSettings;
  }

  getViewType() { return DASHBOARD_VIEW_TYPE; }
  getDisplayText() { return "Дашборд календаря"; }
  getIcon() { return "bar-chart"; }

  async onOpen() { await this.render(); }
  async onClose() {}

  async render() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("fc-dashboard");

    // ── Header ────────────────────────────────────────────────────────────────
    const header = container.createEl("div", { cls: "fc-dashboard-header" });
    header.createEl("h2", { text: "Дашборд календаря", cls: "fc-dashboard-title" });

    const tabs = header.createEl("div", { cls: "fc-dashboard-tabs" });
    for (const [key, label] of [["week","Неделя"],["month","Месяц"],["year","Год"]] as const) {
      const tab = tabs.createEl("button", { text: label, cls: "fc-dashboard-tab" });
      if (this.period === key) tab.addClass("active");
      tab.onclick = () => { this.period = key; this.selectedActivity = ""; this.render(); };
    }
    const refreshBtn = header.createEl("button", { text: "🔄", cls: "fc-dashboard-refresh" });
    refreshBtn.title = "Обновить";
    refreshBtn.onclick = () => this.render();
    const exportBtn = header.createEl("button", { text: "📤 JSON", cls: "fc-dashboard-export" });
    exportBtn.onclick = () => this.exportData();

    // ── Load ──────────────────────────────────────────────────────────────────
    const { records, allEventTitles, dateRange } = await this.loadAll();

    const content = container.createEl("div", { cls: "fc-dashboard-content" });

    if (records.length === 0) {
      content.createEl("p", {
        text: "Нет данных трекинга за период. Используйте кнопки ▶ / ⏹ в редакторе события.",
        cls: "fc-dashboard-empty"
      });
    }

    // 1. Summary
    this.renderSummaryCards(content, records);

    // 2. Histogram: planned vs actual (day view only)
    this.renderPlannedVsActualHistogram(content, records, dateRange);

    // 3. Histogram: activity selector (all periods)
    this.renderActivityHistogram(content, records, allEventTitles, dateRange);

    // 4. Время по активностям — scrollable
    this.renderActivityBreakdown(content, records);

    // 5. Пунктуальность — scrollable
    this.renderPunctualitySection(content, records);

    // 6. Запланированные события — scrollable
    await this.renderPlannedSection(content, dateRange);

    // 7. Все события периода — scrollable
    this.renderRecordsTable(content, records);
  }

  // ── Date range ─────────────────────────────────────────────────────────────
  private getDateRange(): { start: Date; end: Date } {
    const now = new Date();
    let start: Date, end: Date;
    if (this.period === "week") {
      const dow = now.getDay();
      start = new Date(now);
      start.setDate(now.getDate() - dow + (dow === 0 ? -6 : 1));
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else if (this.period === "month") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else {
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    }
    return { start, end };
  }

  // ── Load records + collect recurring/repeated titles ───────────────────────
  private async loadAll(): Promise<{
    records: EventRecord[];
    allEventTitles: string[];   // titles eligible for activity histogram
    dateRange: { start: Date; end: Date };
  }> {
    const dateRange = this.getDateRange();
    const settings = this.getSettings();
    const folder = settings.dashboard.saveFolder;

    const records: EventRecord[] = [];

    // From saved JSON
    try {
      const folderPath = `${folder}/records`;
      const vaultFolder = this.app.vault.getAbstractFileByPath(folderPath);
      if (vaultFolder) {
        const files = this.app.vault.getFiles().filter(f =>
          f.path.startsWith(folderPath + "/") && f.extension === "json"
        );
        for (const file of files) {
          try {
            const data = JSON.parse(await this.app.vault.read(file));
            if (Array.isArray(data)) records.push(...data);
          } catch {}
        }
      }
    } catch {}

    // From vault scan
    const allTitlesInVault: { title: string; recurring: boolean }[] = [];
    await this.scanEventFiles(records, dateRange, allTitlesInVault);

    // Deduplicate records
    const seen = new Set<string>();
    const deduped = records.filter(r => {
      const key = `${r.id}:${r.plannedStart}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Filter by date range
    const filtered = deduped.filter(r => {
      const d = new Date(r.plannedStart);
      return d >= dateRange.start && d <= dateRange.end;
    });

    // Titles for activity histogram:
    // recurring events OR titles that appear > 1 time in filtered records
    const titleCount = new Map<string, number>();
    for (const r of filtered) titleCount.set(r.title, (titleCount.get(r.title) ?? 0) + 1);

    const recurringTitles = new Set(
      allTitlesInVault.filter(t => t.recurring).map(t => t.title)
    );

    const eligibleTitles = [...new Set(
      filtered
        .filter(r => recurringTitles.has(r.title) || (titleCount.get(r.title) ?? 0) > 1)
        .map(r => r.title)
    )].sort();

    return { records: filtered, allEventTitles: eligibleTitles, dateRange };
  }

  private async scanEventFiles(
    records: EventRecord[],
    dateRange: { start: Date; end: Date },
    allTitles: { title: string; recurring: boolean }[]
  ) {
    const sources = this.plugin.settings?.calendarSources || [];
    for (const source of sources) {
      if (source.type !== "local" || !source.directory) continue;
      const dir = source.directory;
      const isRoot = dir === "/" || dir === "" || dir === ".";
      const files = this.app.vault.getFiles().filter(f => {
        if (f.extension !== "md") return false;
        if (isRoot) return true;
        return f.path.startsWith(dir + "/") || f.path === dir;
      });
      for (const file of files) {
        try {
          const cache = (this.app as any).metadataCache.getFileCache(file);
          const fm = cache?.frontmatter;
          if (!fm) continue;

          // Skip files that are not calendar events (must have date+time or recurring markers)
          const isRecurring = !!(fm.daysOfWeek || fm.startRecur || fm.rrule);
          const isSingleEvent = !!(fm.date && fm.startTime);
          if (!isRecurring && !isSingleEvent) continue;
          const title = fm.title || file.basename;
          allTitles.push({ title, recurring: isRecurring });

          // Expand recurring events (daysOfWeek) into individual occurrences in the date range
          if (isRecurring && Array.isArray(fm.daysOfWeek) && fm.daysOfWeek.length > 0) {
            const DAYS_STR = "UMTWRFS";
            const dowSet = new Set(
              (fm.daysOfWeek as string[]).map(c => DAYS_STR.indexOf(String(c))).filter(n => n >= 0)
            );
            const startRecurDate = fm.startRecur ? new Date(String(fm.startRecur)) : new Date(0);
            const endRecurDate   = fm.endRecur   ? new Date(String(fm.endRecur))   : new Date(32503680000000);
            const recStart = new Date(Math.max(dateRange.start.getTime(), startRecurDate.getTime()));
            const recEnd   = new Date(Math.min(dateRange.end.getTime(),   endRecurDate.getTime()));

            const evStartStr = fm.startTime ? String(fm.startTime).trim().padStart(5, "0") : "00:00";
            const evEndStr   = fm.endTime   ? String(fm.endTime).trim().padStart(5, "0")   : null;

            const cur = new Date(recStart);
            cur.setHours(0, 0, 0, 0);
            while (cur <= recEnd) {
              if (dowSet.has(cur.getDay())) {
                const dayStr = toDateStr(cur);
                const occStart = new Date(`${dayStr}T${evStartStr}`);
                let occEnd: Date;
                if (evEndStr) {
                  occEnd = new Date(`${dayStr}T${evEndStr}`);
                  const endDayOffset = fm.endDayOffset ?? 0;
                  if (endDayOffset !== 0) {
                    occEnd = new Date(occEnd.getTime() + endDayOffset * 24 * 60 * 60 * 1000);
                  } else if (occEnd <= occStart) {
                    occEnd = new Date(occEnd.getTime() + 24 * 60 * 60 * 1000);
                  }
                } else {
                  occEnd = new Date(occStart.getTime() + 60 * 60 * 1000);
                }
                const occId = `${file.path}:occ:${dayStr}`;
                const alreadyIn = records.find(r => r.id === occId);
                if (!alreadyIn) {
                  records.push({
                    id: occId,
                    title,
                    calendarId: source.directory,
                    plannedStart: occStart.toISOString(),
                    plannedEnd:   occEnd.toISOString(),
                    actualStart:  undefined,
                    actualEnd:    undefined,
                    tracked:      false,
                    linkedNotes:  fm.linkedNotes || [],
                  });
                }
              }
              cur.setDate(cur.getDate() + 1);
            }
            continue; // recurring event expanded — skip single-record path below
          }

          // For range filtering (single events)
          const dateStr = parseDateFromFm(fm);
          if (!dateStr) continue;

          const startStr = fm.startTime ? String(fm.startTime).trim() : "00:00";
          const endStr   = fm.endTime   ? String(fm.endTime).trim()   : null;
          const plannedStart = new Date(`${dateStr}T${startStr}`);
          // Handle cross-midnight: if endTime < startTime and no explicit endDate, shift end to next day
          let plannedEnd: Date;
          if (endStr) {
            const endDateStr = fm.endDate
              ? (fm.endDate instanceof Date ? fm.endDate.toISOString().slice(0, 10) : String(fm.endDate).slice(0, 10))
              : dateStr;
            plannedEnd = new Date(`${endDateStr}T${endStr}`);
            if (!fm.endDate && plannedEnd <= plannedStart) {
              plannedEnd = new Date(plannedEnd.getTime() + 24 * 60 * 60 * 1000);
            }
          } else {
            plannedEnd = new Date(plannedStart.getTime() + 60 * 60 * 1000);
          }

          if (isNaN(plannedStart.getTime())) continue;
          if (plannedStart < dateRange.start || plannedStart > dateRange.end) continue;

          const tracking = fm.tracking;
          const existing = records.find(r => r.id === file.path && r.plannedStart === plannedStart.toISOString());
          if (!existing) {
            records.push({
              id: file.path,
              title,
              calendarId: source.directory,
              plannedStart: plannedStart.toISOString(),
              plannedEnd: plannedEnd.toISOString(),
              actualStart: tracking?.startedAt || undefined,
              actualEnd: tracking?.endedAt || undefined,
              tracked: !!(tracking?.startedAt || tracking?.endedAt),
              linkedNotes: fm.linkedNotes || [],
            });
          }
        } catch {}
      }
    }
  }

  // ── 1. Summary cards ───────────────────────────────────────────────────────
  private renderSummaryCards(el: HTMLElement, records: EventRecord[]) {
    const section = el.createEl("div", { cls: "fc-dashboard-section" });
    section.createEl("h3", { text: "Сводка", cls: "fc-dashboard-section-title" });
    const cards = section.createEl("div", { cls: "fc-dashboard-cards" });

    const tracked = records.filter(r => r.tracked);
    const totalPlannedMin = records.reduce((s, r) => s + plannedMin(r), 0);
    const totalActualMin  = tracked.reduce((s, r) => s + durationMin(r), 0);
    const startedLate = tracked.filter(r => r.actualStart &&
      new Date(r.actualStart).getTime() - new Date(r.plannedStart).getTime() > 60_000).length;
    const endedLate = tracked.filter(r => r.actualEnd &&
      new Date(r.actualEnd).getTime() - new Date(r.plannedEnd).getTime() > 60_000).length;
    const missed = records.filter(r => !r.tracked).length;

    const card = (label: string, value: string, cls = "") => {
      const c = cards.createEl("div", { cls: `fc-dashboard-card ${cls}` });
      c.createEl("div", { text: value, cls: "fc-card-value" });
      c.createEl("div", { text: label, cls: "fc-card-label" });
    };

    card("📅 Событий", String(records.length));
    card("⏱ Запланировано", formatDuration(totalPlannedMin));
    card("✅ Выполнено", formatDuration(totalActualMin), totalActualMin >= totalPlannedMin ? "positive" : "");
    card("⏰ Опоздал со стартом", String(startedLate), startedLate > 0 ? "warning" : "positive");
    card("🕐 Превысил время", String(endedLate), endedLate > 0 ? "warning" : "");
    card("❌ Не отслежено", String(missed), missed > 0 ? "danger" : "positive");
  }

  // ── 2. Planned vs Actual histogram (всегда показывает оба столбца) ─────────
  private renderPlannedVsActualHistogram(
    el: HTMLElement,
    records: EventRecord[],
    dateRange: { start: Date; end: Date }
  ) {
    const section = el.createEl("div", { cls: "fc-dashboard-section" });
    const periodLabel = this.period === "week" ? "по дням недели"
      : this.period === "month" ? "по дням месяца" : "по месяцам";
    section.createEl("h3", { text: `Запланировано vs Факт (${periodLabel})`, cls: "fc-dashboard-section-title" });

    const buckets = this.buildTimeBuckets(dateRange);
    for (const r of records) {
      const key = this.bucketKey(r.plannedStart);
      const b = buckets.get(key);
      if (!b) continue;
      b.planned += plannedMin(r);
      b.actual  += durationMin(r);
    }

    this.drawHistogram(section, buckets, dateRange, [
      { label: "Запланировано", color: "rgba(55,136,216,0.35)", field: "planned" },
      { label: "Факт",          color: "rgba(55,136,216,0.9)",  field: "actual" },
    ]);
  }

  // ── 3. Activity histogram with selector ────────────────────────────────────
  private renderActivityHistogram(
    el: HTMLElement,
    records: EventRecord[],
    eligibleTitles: string[],
    dateRange: { start: Date; end: Date }
  ) {
    const section = el.createEl("div", { cls: "fc-dashboard-section" });
    section.createEl("h3", { text: "Динамика по активности", cls: "fc-dashboard-section-title" });

    if (eligibleTitles.length === 0) {
      section.createEl("p", {
        text: "Нет повторяющихся событий или событий с одинаковым названием (нужно больше одного).",
        cls: "fc-empty-note"
      });
      return;
    }

    // Selector
    const toolbar = section.createEl("div", { cls: "fc-section-toolbar" });
    const sel = toolbar.createEl("select", { cls: "fc-activity-selector" }) as HTMLSelectElement;
    sel.createEl("option", { text: "— выберите активность —", value: "" });
    for (const t of eligibleTitles) sel.createEl("option", { text: t, value: t });
    if (this.selectedActivity && eligibleTitles.includes(this.selectedActivity)) {
      sel.value = this.selectedActivity;
    }

    const chartWrap = section.createEl("div");
    const hint = section.createEl("p", { cls: "fc-empty-note" });
    hint.textContent = "Выберите активность из списка выше";

    const drawSelected = () => {
      chartWrap.empty();
      hint.style.display = sel.value ? "none" : "";
      if (!sel.value) return;
      this.selectedActivity = sel.value;

      const buckets = this.buildTimeBuckets(dateRange);
      for (const r of records) {
        if (r.title !== sel.value) continue;
        const key = this.bucketKey(r.plannedStart);
        const b = buckets.get(key);
        if (!b) continue;
        b.planned += plannedMin(r);
        b.actual  += durationMin(r);
      }
      this.drawHistogram(chartWrap, buckets, dateRange, [
        { label: "Запланировано", color: "rgba(80,200,120,0.35)", field: "planned" },
        { label: "Факт",          color: "rgba(80,200,120,0.9)",  field: "actual" },
      ]);
    };

    sel.addEventListener("change", drawSelected);
    drawSelected();
  }

  // ── Histogram helpers ──────────────────────────────────────────────────────
  private buildTimeBuckets(dateRange: { start: Date; end: Date }): Map<string, { planned: number; actual: number }> {
    const buckets = new Map<string, { planned: number; actual: number }>();
    if (this.period === "year") {
      for (let m = 0; m < 12; m++) buckets.set(String(m), { planned: 0, actual: 0 });
    } else {
      const cur = new Date(dateRange.start);
      while (cur <= dateRange.end) {
        buckets.set(toDateStr(cur), { planned: 0, actual: 0 });
        cur.setDate(cur.getDate() + 1);
      }
    }
    return buckets;
  }

  private bucketKey(isoDate: string): string {
    const d = new Date(isoDate);
    return this.period === "year" ? String(d.getMonth()) : toDateStr(d);
  }

  private drawHistogram(
    el: HTMLElement,
    buckets: Map<string, { planned: number; actual: number }>,
    dateRange: { start: Date; end: Date },
    series: { label: string; color: string; field: "planned" | "actual" }[]
  ) {
    const canvas = el.createEl("canvas") as HTMLCanvasElement;
    canvas.width  = 800;
    canvas.height = 200;
    canvas.style.cssText = "max-width:100%;height:auto;display:block;margin:8px 0;";

    const ctx = canvas.getContext("2d")!;
    const entries = [...buckets.entries()];
    const maxVal = Math.max(...entries.map(([, v]) => Math.max(v.planned, v.actual)), 1);
    const barGroupW = Math.floor((canvas.width - 40) / entries.length);
    const chartH    = canvas.height - 30;
    const barW      = Math.max(2, Math.floor(barGroupW / series.length) - 2);

    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--background-secondary") || "#1e1e1e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < entries.length; i++) {
      const [key, vals] = entries[i];
      const groupX = 20 + i * barGroupW;

      for (let s = 0; s < series.length; s++) {
        const val = vals[series[s].field];
        const h   = Math.round((val / maxVal) * chartH);
        ctx.fillStyle = series[s].color;
        ctx.fillRect(groupX + s * (barW + 2), chartH - h, barW, h);
      }

      // X label
      ctx.fillStyle = "rgba(180,180,180,0.8)";
      ctx.font = "9px sans-serif";
      ctx.textAlign = "center";
      const label = this.period === "year"
        ? ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"][parseInt(key)]
        : key.slice(-2);
      ctx.fillText(label, groupX + barGroupW / 2, canvas.height - 4);
    }

    // Legend
    const legend = el.createEl("div", { cls: "fc-chart-legend" });
    for (const s of series) {
      const sp = legend.createEl("span");
      sp.innerHTML = `<span class="fc-legend-box" style="background:${s.color}"></span> ${s.label}`;
    }
  }

  // ── 4. Время по активностям — scrollable ───────────────────────────────────
  private renderActivityBreakdown(el: HTMLElement, records: EventRecord[]) {
    const byTitle = new Map<string, { actual: number; planned: number; count: number }>();
    for (const r of records) {
      const entry = byTitle.get(r.title) ?? { actual: 0, planned: 0, count: 0 };
      entry.planned += plannedMin(r);
      entry.actual  += durationMin(r);
      entry.count++;
      byTitle.set(r.title, entry);
    }

    const sorted = [...byTitle.entries()].sort((a, b) => b[1].actual - a[1].actual);
    if (sorted.length === 0) {
      const section = el.createEl("div", { cls: "fc-dashboard-section" });
      section.createEl("h3", { text: "Время по активностям", cls: "fc-dashboard-section-title" });
      section.createEl("p", { text: "Нет данных.", cls: "fc-empty-note" });
      return;
    }

    const rows = sorted.map(([title, v]) => ({
      "Активность": title,
      "Запланировано": formatDuration(v.planned),
      "Факт": v.actual > 0 ? formatDuration(v.actual) : "—",
      "Событий": String(v.count),
    }));

    buildScrollableSection(el, "Время по активностям",
      ["Активность", "Запланировано", "Факт", "Событий"], rows, 36, 5);
  }

  // ── 5. Пунктуальность — scrollable ────────────────────────────────────────
  private renderPunctualitySection(el: HTMLElement, records: EventRecord[]) {
    const tracked = records.filter(r => r.tracked);

    const rows = tracked.map(r => {
      let startStatus = "—", endStatus = "—";
      if (r.actualStart) {
        const late = Math.round((new Date(r.actualStart).getTime() - new Date(r.plannedStart).getTime()) / 60000);
        startStatus = late > 1 ? `+${late}м` : late < -1 ? `${late}м` : "✓";
      }
      if (r.actualEnd) {
        const over = Math.round((new Date(r.actualEnd).getTime() - new Date(r.plannedEnd).getTime()) / 60000);
        endStatus = over > 1 ? `+${over}м` : over < -1 ? `${over}м` : "✓";
      }
      return {
        "Событие":  r.title,
        "Дата":     toDateStr(new Date(r.plannedStart)),
        "Старт":    startStatus,
        "Конец":    endStatus,
      };
    });

    buildScrollableSection(el, "Пунктуальность",
      ["Событие", "Дата", "Старт", "Конец"], rows, 36, 5);
  }

  // ── 6. Запланированные события — scrollable ────────────────────────────────
  private async renderPlannedSection(el: HTMLElement, dateRange: { start: Date; end: Date }) {
    const sources = this.plugin.settings?.calendarSources || [];
    const rowsRaw: { title: string; date: string; time: string; tracked: string }[] = [];

    for (const source of sources) {
      if (source.type !== "local" || !source.directory) continue;
      const dir = source.directory;
      const isRoot = dir === "/" || dir === "" || dir === ".";
      const files = this.app.vault.getFiles().filter(f => {
        if (f.extension !== "md") return false;
        if (isRoot) return true;
        return f.path.startsWith(dir + "/") || f.path === dir;
      });
      for (const file of files) {
        try {
          const fm = (this.app as any).metadataCache?.getFileCache(file)?.frontmatter ?? {};
          // Skip non-calendar files
          if (!fm.date && !fm.startTime && !fm.daysOfWeek && !fm.startRecur && !fm.rrule) continue;
          const dateStr = parseDateFromFm(fm);
          if (!dateStr) continue;
          const startStr = fm.startTime ? String(fm.startTime).trim() : "00:00";
          const d = new Date(`${dateStr}T${startStr}`);
          if (isNaN(d.getTime()) || d < dateRange.start || d > dateRange.end) continue;
          rowsRaw.push({
            title:   fm.title ?? file.basename,
            date:    dateStr,
            time:    startStr + (fm.endTime ? `–${String(fm.endTime).trim()}` : ""),
            tracked: fm.tracking?.enabled === false ? "Нет" : fm.tracking?.startedAt ? "Начато" : "Да",
          });
        } catch {}
      }
    }

    rowsRaw.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const rows = rowsRaw.map(r => ({
      "Название": r.title,
      "Дата":     r.date,
      "Время":    r.time,
      "Трекинг":  r.tracked,
    }));

    buildScrollableSection(el, "Запланированные события периода",
      ["Название", "Дата", "Время", "Трекинг"], rows, 36, 5);
  }

  // ── 7. Все события периода — scrollable ────────────────────────────────────
  private renderRecordsTable(el: HTMLElement, records: EventRecord[]) {
    const sorted = [...records].sort((a, b) =>
      new Date(a.plannedStart).getTime() - new Date(b.plannedStart).getTime()
    );

    const rows = sorted.map(r => {
      const ps = new Date(r.plannedStart);
      const pe = new Date(r.plannedEnd);
      const planned = `${fmtTime(r.plannedStart)}–${fmtTime(r.plannedEnd)}`;
      let fact = "—";
      if (r.actualStart && r.actualEnd) {
        fact = `${fmtTime(r.actualStart)}–${fmtTime(r.actualEnd)} (${formatDuration(durationMin(r))})`;
      } else if (r.actualStart) {
        fact = `${fmtTime(r.actualStart)}–…`;
      }
      const status = !r.tracked ? "Не отслежено"
        : (r.actualStart && r.actualEnd) ? "✅ Готово" : "⏳ В процессе";
      return {
        "Дата":          toDateStr(ps),
        "Событие":       r.title,
        "Запланировано": planned,
        "Факт":          fact,
        "Статус":        status,
      };
    });

    buildScrollableSection(el, "Все события периода",
      ["Дата", "Событие", "Запланировано", "Факт", "Статус"], rows, 36, 5);
  }

  // ── Export ─────────────────────────────────────────────────────────────────
  private async exportData() {
    const { records } = await this.loadAll();
    const settings  = this.getSettings();
    const dateRange = this.getDateRange();
    const filePath  = `${settings.dashboard.saveFolder}/export_${toDateStr(new Date())}.json`;
    await writeJsonToVault(this.app, filePath, {
      exported: new Date().toISOString(),
      period:   this.period,
      from:     dateRange.start.toISOString(),
      to:       dateRange.end.toISOString(),
      records,
    });
    new Notice(`✅ Экспортировано: ${filePath}`);
  }
}

// ─── Save record ──────────────────────────────────────────────────────────────

export async function saveDashboardEventRecord(app: App, plugin: any, record: EventRecord) {
  const settings: any = (plugin as any)._enhancedSettings;
  const folder   = settings?.dashboard?.saveFolder || "_calendar_dashboard";
  const dateKey  = toDateStr(new Date(record.plannedStart));
  const filePath = `${folder}/records/${dateKey}.json`;

  let existing: EventRecord[] = (await readJsonFromVault(app, filePath)) || [];
  if (!Array.isArray(existing)) existing = [];

  const idx = existing.findIndex(r => r.id === record.id && r.plannedStart === record.plannedStart);
  if (idx >= 0) existing[idx] = record;
  else existing.push(record);

  await writeJsonToVault(app, filePath, existing);
}
