import type { MaybeRefOrGetter } from 'vue';

const LOCK_COUNTDOWN_REFRESH_MS = 60_000;

export function useTaskLockCountdown(
  expiresAt: MaybeRefOrGetter<string | undefined>,
) {
  const currentTime = ref(Date.now());
  let countdownTimer: ReturnType<typeof setInterval> | null = null;

  const timeRemaining = computed(() =>
    formatTaskLockTimeRemaining(toValue(expiresAt), currentTime.value),
  );

  onMounted(() => {
    countdownTimer = setInterval(() => {
      currentTime.value = Date.now();
    }, LOCK_COUNTDOWN_REFRESH_MS);
  });

  onBeforeUnmount(() => {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  });

  return {
    timeRemaining,
  };
}

export function formatTaskLockTimeRemaining(
  expiresAt: string | undefined,
  currentTime: number,
): string {
  if (!expiresAt) {
    return '';
  }

  const remainingMilliseconds = new Date(expiresAt).getTime() - currentTime;

  if (!Number.isFinite(remainingMilliseconds) || remainingMilliseconds <= 0) {
    return 'Lock expired';
  }

  const remainingMinutes = Math.ceil(remainingMilliseconds / 60_000);
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;

  if (hours === 0) {
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} left`;
  }

  return `${hours} ${hours === 1 ? 'hour' : 'hours'}, ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} left`;
}
