/**
 * Enhanced Settings Tab
 * Adds a section to the existing FullCalendar settings page via DOM injection,
 * or renders as a standalone section via a patched SettingTab.
 */

import { App, PluginSettingTab, Setting, Notice, TFile } from "obsidian";
import { EnhancedSettings } from "./types";
import { playAudio } from "./utils";
import { testNotifications } from "./notifications";

export class EnhancedSettingTab {
  app: App;
  plugin: any;
  getSettings: () => EnhancedSettings;
  saveSettings: (s: EnhancedSettings) => Promise<void>;

  constructor(
    app: App,
    plugin: any,
    getSettings: () => EnhancedSettings,
    saveSettings: (s: EnhancedSettings) => Promise<void>
  ) {
    this.app = app;
    this.plugin = plugin;
    this.getSettings = getSettings;
    this.saveSettings = saveSettings;
  }

  /** Inject our settings section into an existing settings container element */
  render(containerEl: HTMLElement) {
    const settings = this.getSettings();

    // Separator
    const sep = containerEl.createEl("hr");
    sep.style.cssText = "margin: 24px 0 16px 0; opacity: 0.3;";

    containerEl.createEl("h2", {
      text: "🚀 Расширенные функции календаря",
      cls: "fc-enhanced-settings-header"
    });

    // ==================== NOTIFICATIONS ====================
    containerEl.createEl("h3", { text: "🔔 Уведомления", cls: "fc-settings-section-header" });

    new Setting(containerEl)
      .setName("Включить уведомления")
      .setDesc("Показывать уведомления и воспроизводить звук при начале/конце событий")
      .addToggle(t => t
        .setValue(settings.notifications.enabled)
        .onChange(async v => {
          settings.notifications.enabled = v;
          await this.saveSettings(settings);
        })
      );

    new Setting(containerEl)
      .setName("Уведомлять за N минут до начала")
      .setDesc("0 = только в момент начала")
      .addSlider(s => s
        .setLimits(0, 30, 1)
        .setValue(settings.notifications.notifyBeforeMinutes)
        .setDynamicTooltip()
        .onChange(async v => {
          settings.notifications.notifyBeforeMinutes = v;
          await this.saveSettings(settings);
        })
      );

    new Setting(containerEl)
      .setName("Уведомлять об окончании событий")
      .addToggle(t => t
        .setValue(settings.notifications.notifyOnEnd)
        .onChange(async v => {
          settings.notifications.notifyOnEnd = v;
          await this.saveSettings(settings);
        })
      );

    new Setting(containerEl)
      .setName("Тест уведомлений")
      .setDesc("Принудительно проверить все события прямо сейчас (игнорирует настройку «включено» и уже сработавшие)")
      .addButton(b => b
        .setButtonText("▶ Запустить тест")
        .setCta()
        .onClick(() => testNotifications(this.app, this.plugin, settings))
      );

    new Setting(containerEl)
      .setName("Звук начала события (путь в хранилище)")
      .setDesc("Путь к файлу .mp3/.wav/.ogg в вашем хранилище. Оставьте пустым для звука по умолчанию (бип)")
      .addText(t => t
        .setPlaceholder("audio/start-sound.mp3")
        .setValue(settings.notifications.defaultStartSound || "")
        .onChange(async v => {
          settings.notifications.defaultStartSound = v.trim() || null;
          await this.saveSettings(settings);
        })
      )
      .addButton(b => b
        .setButtonText("▶ Тест")
        .onClick(() => playAudio(this.app, settings.notifications.defaultStartSound))
      );

    new Setting(containerEl)
      .setName("Звук конца события (путь в хранилище)")
      .setDesc("Путь к файлу .mp3/.wav/.ogg. Оставьте пустым для звука по умолчанию")
      .addText(t => t
        .setPlaceholder("audio/end-sound.mp3")
        .setValue(settings.notifications.defaultEndSound || "")
        .onChange(async v => {
          settings.notifications.defaultEndSound = v.trim() || null;
          await this.saveSettings(settings);
        })
      )
      .addButton(b => b
        .setButtonText("▶ Тест")
        .onClick(() => playAudio(this.app, settings.notifications.defaultEndSound))
      );

    // ==================== TRACKING ====================
    containerEl.createEl("h3", { text: "⏱ Трекинг выполнения", cls: "fc-settings-section-header" });

    new Setting(containerEl)
      .setName("Включать трекинг для новых событий по умолчанию")
      .setDesc("Можно переопределить отдельно для каждого события")
      .addToggle(t => t
        .setValue(settings.tracking.enabledByDefault)
        .onChange(async v => {
          settings.tracking.enabledByDefault = v;
          await this.saveSettings(settings);
        })
      );

    new Setting(containerEl)
      .setName("Показывать кнопки трекинга")
      .setDesc("Всплывающая панель «Приступил / Завершил» при наступлении времени события")
      .addToggle(t => t
        .setValue(settings.tracking.showTrackingButtons)
        .onChange(async v => {
          settings.tracking.showTrackingButtons = v;
          await this.saveSettings(settings);
        })
      );

    // ==================== DASHBOARD ====================
    containerEl.createEl("h3", { text: "📊 Дашборд", cls: "fc-settings-section-header" });

    new Setting(containerEl)
      .setName("Папка для данных дашборда")
      .setDesc("Куда сохранять данные трекинга и экспортные файлы")
      .addText(t => t
        .setPlaceholder("_calendar_dashboard")
        .setValue(settings.dashboard.saveFolder)
        .onChange(async v => {
          settings.dashboard.saveFolder = v.trim() || "_calendar_dashboard";
          await this.saveSettings(settings);
        })
      );

    new Setting(containerEl)
      .setName("Открыть дашборд")
      .addButton(b => b
        .setButtonText("Открыть дашборд")
        .setCta()
        .onClick(() => {
          this.plugin.app.workspace.getLeaf("tab").setViewState({
            type: "full-calendar-dashboard",
            active: true,
          });
        })
      );

    // ==================== NOTE LINKER ====================
    containerEl.createEl("h3", { text: "🔗 Привязка заметок", cls: "fc-settings-section-header" });

    new Setting(containerEl)
      .setName("Включить привязку заметок/папок к событиям")
      .addToggle(t => t
        .setValue(settings.noteLinker.enabled)
        .onChange(async v => {
          settings.noteLinker.enabled = v;
          await this.saveSettings(settings);
        })
      );
  }
}
