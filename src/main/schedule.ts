export function isTimeInSchedule(current: string, start: string, end: string): boolean {
  if (start === end) return false
  if (start < end) {
    return current >= start && current < end
  } else {
    // Spans midnight (e.g. 22:00 to 08:00)
    return current >= start || current < end
  }
}
