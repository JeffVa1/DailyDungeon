// utils.js
// Shared utility helpers for DOM queries, date handling in Eastern time, and grid sizing.
export const qs = (sel) => document.querySelector(sel);
export const qsa = (sel) => Array.from(document.querySelectorAll(sel));

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function getEasternDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = { year: '1970', month: '01', day: '01' };
  formatter.formatToParts(date).forEach(({ type, value }) => {
    if (type === 'year' || type === 'month' || type === 'day') {
      parts[type] = value;
    }
  });
  return parts;
}

export function formatDateForEastern(date = new Date()) {
  const { year, month, day } = getEasternDateParts(date);
  return `${year}-${month}-${day}`;
}

export function getEasternWeekdayIndex(date = new Date()) {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
  }).format(date);
  return WEEKDAYS.indexOf(weekday);
}

export function getNextWeekdayDate(name) {
  const target = WEEKDAYS.indexOf(name);
  if (target === -1) return formatDateForEastern();
  const todayParts = getEasternDateParts();
  const baseDate = new Date(Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day));
  const diff = (target - getEasternWeekdayIndex(baseDate) + 7) % 7 || 7;
  const next = new Date(baseDate.getTime() + diff * 86400000);
  return formatDateForEastern(next);
}

export function getCellSizing() {
  const styles = getComputedStyle(document.documentElement);
  const cellSize = styles.getPropertyValue('--cell-size').trim() || '28px';
  const labelSize = styles.getPropertyValue('--label-size').trim() || '32px';
  const labelHeight = styles.getPropertyValue('--label-height').trim() || '24px';
  return { cellSize, labelSize, labelHeight };
}

export function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
