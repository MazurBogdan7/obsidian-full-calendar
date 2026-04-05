// Extended settings for enhanced features
export interface EnhancedSettings {
  // Global notification settings
  notifications: {
    enabled: boolean;
    defaultStartSound: string | null;   // path in vault or null for default beep
    defaultEndSound: string | null;
    notifyBeforeMinutes: number;        // notify N minutes before start
    notifyOnEnd: boolean;
  };
  // Global tracking settings
  tracking: {
    enabledByDefault: boolean;
    showTrackingButtons: boolean;       // show floating buttons when event is active
  };
  // Dashboard settings
  dashboard: {
    saveFolder: string;                 // where to store dashboard data JSON files
    autoSave: boolean;
  };
  // Note linking settings
  noteLinker: {
    enabled: boolean;
    showLinkedNotesOnHover: boolean;
  };
}

export const DEFAULT_ENHANCED_SETTINGS: EnhancedSettings = {
  notifications: {
    enabled: true,
    defaultStartSound: null,
    defaultEndSound: null,
    notifyBeforeMinutes: 5,
    notifyOnEnd: true,
  },
  tracking: {
    enabledByDefault: true,
    showTrackingButtons: true,
  },
  dashboard: {
    saveFolder: "_calendar_dashboard",
    autoSave: true,
  },
  noteLinker: {
    enabled: true,
    showLinkedNotesOnHover: true,
  },
};

// Per-event extended frontmatter fields
export interface EventNotificationSettings {
  enabled?: boolean;
  startSound?: string | null;   // override global, null = use global, "none" = disabled
  endSound?: string | null;
}

export interface EventTracking {
  enabled?: boolean;
  startedAt?: string | null;    // ISO datetime when user pressed "Start"
  endedAt?: string | null;      // ISO datetime when user pressed "End"
}

export interface ExtendedEventData {
  linkedNotes?: string[];                   // array of vault paths
  notification?: EventNotificationSettings;
  tracking?: EventTracking;
}

// Dashboard data structures
export interface DayRecord {
  date: string;             // YYYY-MM-DD
  events: EventRecord[];
}

export interface EventRecord {
  id: string;
  title: string;
  calendarId: string;
  plannedStart: string;     // ISO
  plannedEnd: string;       // ISO
  actualStart?: string;     // ISO (from tracking)
  actualEnd?: string;       // ISO (from tracking)
  tracked: boolean;
  linkedNotes: string[];
}

// Internal plugin reference type (compiled plugin internals)
export interface FCPlugin {
  app: any;
  settings: any;
  cache: any;
  renderCalendar: Function;
  loadData: () => Promise<any>;
  saveData: (data: any) => Promise<void>;
  registerView: (type: string, creator: Function) => void;
  addCommand: (cmd: any) => void;
  registerInterval: (id: number) => void;
}
