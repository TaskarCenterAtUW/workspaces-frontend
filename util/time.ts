import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const shortFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'short',
  timeStyle: 'short'
});

export function formatShort(date: Date): string {
  return shortFormatter.format(date);
}

export function formatElapsed(date: Date): string {
  return dayjs(date).fromNow();
}
