import type { AppSettings, ServiceConfig, TrackerKind } from "@shared/types";

export function resolveEffectiveTrackerKind(
  config: ServiceConfig,
  settings: AppSettings,
): TrackerKind | null {
  if (settings.activeTrackerKind) {
    return settings.activeTrackerKind;
  }
  if (config.tracker.kind) {
    return config.tracker.kind;
  }
  if (settings.localKanban.enabled) {
    return "local";
  }
  return null;
}

export function hasConfiguredExternalTracker(config: ServiceConfig) {
  if (config.tracker.kind === "linear") {
    return Boolean(config.tracker.apiKey && config.tracker.projectSlug);
  }
  return config.tracker.kind !== "local" && config.tracker.kind !== "memory";
}
