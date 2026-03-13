import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AppSettings, TrackerKind } from '@shared/types'
import { safeJsonParse } from '@shared/utils'

const SETTINGS_FILE = 'app-settings.json'

export class AppSettingsStore {
  private settings: AppSettings
  private readonly filePath: string

  constructor(baseDir: string) {
    this.filePath = join(baseDir, SETTINGS_FILE)
    this.settings = this.load()
  }

  get() {
    return this.settings
  }

  update(partial: Partial<AppSettings>) {
    this.settings = {
      ...this.settings,
      ...partial,
      localKanban: {
        ...this.settings.localKanban,
        ...partial.localKanban,
      },
    }
    this.save()
    return this.settings
  }

  setActiveTrackerKind(kind: TrackerKind | null) {
    return this.update({ activeTrackerKind: kind })
  }

  markOnboardingCompleted() {
    return this.update({ onboardingCompleted: true })
  }

  private load(): AppSettings {
    if (!existsSync(this.filePath)) {
      const initial = defaultSettings()
      this.settings = initial
      this.save()
      return initial
    }

    const parsed = safeJsonParse<Partial<AppSettings>>(readFileSync(this.filePath, 'utf8'))
    return {
      onboardingCompleted: parsed?.onboardingCompleted ?? false,
      activeTrackerKind: parsed?.activeTrackerKind ?? null,
      localKanban: {
        enabled: parsed?.localKanban?.enabled ?? false,
        initialized: parsed?.localKanban?.initialized ?? false,
        databasePath: parsed?.localKanban?.databasePath ?? null,
        lastOpenedBoardId: parsed?.localKanban?.lastOpenedBoardId ?? null,
      },
    }
  }

  private save() {
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2))
  }
}

function defaultSettings(): AppSettings {
  return {
    onboardingCompleted: false,
    activeTrackerKind: null,
    localKanban: {
      enabled: false,
      initialized: false,
      databasePath: null,
      lastOpenedBoardId: null,
    },
  }
}
