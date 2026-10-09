import { CALENDAR_START, DAILY_PROMPTS } from './prompt-calendar.js';

const nouns = ['mushroom', 'kite', 'house', 'flower', 'moon', 'boat', 'apple', 'tree', 'cat', 'cup', 'cloud', 'fish', 'shoe', 'bird', 'castle', 'leaf', 'cake', 'chair', 'snail', 'hat', 'star'];
const actions = ['laughing', 'crying', 'dancing', 'sleeping', 'sneezing', 'singing', 'jumping', 'waving', 'yawning', 'running', 'hiding', 'skating', 'stretching', 'swimming', 'blushing', 'spinning', 'whistling', 'tumbling', 'floating', 'shivering', 'winking', 'tiptoeing', 'cheering'];
export function easternDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function formatPromptDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  const months = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
  return `${months[month - 1]} ${day}, ${year}`;
}
export function promptForDate(date) {
  const day = Math.floor(Date.parse(`${date}T12:00:00Z`) / 86400000);
  const start = Math.floor(Date.parse(`${CALENDAR_START}T12:00:00Z`) / 86400000);
  const index = day - start;
  // Historical dates retain their old mapping. Stored database titles remain
  // authoritative. Repeat curated entries only if no new weeks are appended.
  if (index >= 0) return DAILY_PROMPTS[index % DAILY_PROMPTS.length];
  return `${actions[((day % actions.length) + actions.length) % actions.length]} ${nouns[((day % nouns.length) + nouns.length) % nouns.length]}`;
}
