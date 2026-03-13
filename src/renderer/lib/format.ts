import { formatDistanceToNowStrict } from "date-fns";

export function formatInt(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatRelativeTime(value: string | null) {
  if (!value) return "n/a";
  return formatDistanceToNowStrict(new Date(value), { addSuffix: false });
}

export function formatDurationMs(ms: number | null) {
  if (ms == null) return "n/a";
  return `${Math.max(Math.round(ms / 1000), 0)}s`;
}
