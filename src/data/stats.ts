/** 부원 능력치 종류. 새 능력치를 추가하면 STAT_LABELS도 함께 채운다. */
export type StatKey = 'voice' | 'tech' | 'writing' | 'charm';

export type Stats = Record<StatKey, number>;

export const STAT_KEYS: readonly StatKey[] = ['voice', 'tech', 'writing', 'charm'];

export const STAT_LABELS: Record<StatKey, string> = {
  voice: '목소리',
  tech: '기술',
  writing: '글솜씨',
  charm: '매력',
};
