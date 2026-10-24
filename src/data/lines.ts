import type { Expression } from './portraits';

export interface Line {
  expr: Expression;
  text: string;
}

/** 대사가 나오는 상황 */
export type LineEvent = 'assigned' | 'unassigned' | 'poke' | 'towerUp' | 'welcomeBack';

type LineTable = Record<LineEvent, Line[]>;

/** 부원별 대사. 상황마다 여러 개를 넣으면 무작위로 하나가 나온다. */
export const LINES: Record<string, LineTable> = {
  haneul: {
    assigned: [
      { expr: 'smile', text: '마이크 체크, 원 투! 오늘도 새벽을 책임질게~' },
      { expr: 'smile', text: '내 목소리 듣고 잠 못 드는 사람, 손~!' },
    ],
    unassigned: [{ expr: 'sad', text: '에엑, 벌써 내려가? 한 곡만 더…' }],
    poke: [
      { expr: 'surprised', text: '꺅! 방송 중엔 놀래키지 마~!' },
      { expr: 'blush', text: '그, 그렇게 빤히 보면 멘트 까먹는다구…' },
      { expr: 'angry', text: '지금 ON AIR 불 들어와 있거든?!' },
    ],
    towerUp: [{ expr: 'surprised', text: '와, 송신탑 레벨업! 이제 옆 동네까지 들린대!' }],
    welcomeBack: [{ expr: 'smile', text: '어서 와! 없는 동안에도 열심히 떠들고 있었어~' }],
  },
  mirae: {
    assigned: [
      { expr: 'neutral', text: '레벨 체크 끝. 노이즈 없음. …시작해.' },
      { expr: 'smile', text: '이 믹서, 오늘 컨디션 좋아. 나도.' },
    ],
    unassigned: [{ expr: 'sad', text: '…케이블 정리는 내가 하고 갈게.' }],
    poke: [
      { expr: 'angry', text: '납땜 중이야. 손 대면 위험해.' },
      { expr: 'surprised', text: '…! 피드백 나는 줄 알았잖아.' },
      { expr: 'blush', text: '…장비 칭찬이면, 고마워.' },
    ],
    towerUp: [{ expr: 'smile', text: '출력 30% 상승. 계산대로야.' }],
    welcomeBack: [{ expr: 'neutral', text: '송출 로그 정상. 자리 비운 동안 끊김 0회.' }],
  },
  seoyun: {
    assigned: [
      { expr: 'smile', text: '오늘 원고는… 비 오는 날 받은 사연으로 할게요.' },
      { expr: 'neutral', text: '첫 문장은 정해 뒀어요. 나머진 밤이 써 줄 거예요.' },
    ],
    unassigned: [{ expr: 'sad', text: '아직 못 읽어 드린 사연이 있는데…' }],
    poke: [
      { expr: 'blush', text: '이 편지요? …제가 쓴 건 아니에요. 진짜로요.' },
      { expr: 'surprised', text: '앗, 원고가…! 순서 섞이면 안 되는데.' },
      { expr: 'angry', text: '마감 전엔 말 걸지 말아 주세요.' },
    ],
    towerUp: [{ expr: 'surprised', text: '사연함이 벌써 넘칠 것 같아요…!' }],
    welcomeBack: [{ expr: 'smile', text: '오셨네요. 그동안 온 사연, 정리해 뒀어요.' }],
  },
  yuri: {
    assigned: [
      { expr: 'smile', text: '안녕하세요~ 오늘의 게스트, 유리입니다!' },
      { expr: 'smile', text: '또 불러 줬네? 이쯤 되면 고정 아니야?' },
    ],
    unassigned: [{ expr: 'sad', text: '게스트는 원래 잠깐 왔다 가는 거지… 흑.' }],
    poke: [
      { expr: 'surprised', text: '어? 나 지금 인사하는 중이었는데!' },
      { expr: 'blush', text: '에헤헤, 오늘 머리핀 바꾼 거 티 나?' },
      { expr: 'angry', text: '내 가방 인형 만지지 마~!' },
    ],
    towerUp: [{ expr: 'smile', text: '청취자 늘었다! 나 덕분이지? 그치?' }],
    welcomeBack: [{ expr: 'smile', text: '왔다~! 기다리다가 사연 세 개 읽었어!' }],
  },
  dahye: {
    assigned: [
      { expr: 'neutral', text: '방송부장 다혜. 오늘도 사고 없이 간다.' },
      { expr: 'smile', text: '…좋아. 이 라인업이면 해볼 만하지.' },
    ],
    unassigned: [{ expr: 'sad', text: '부장이 빠져도 방송은 계속돼야 해. …알아.' }],
    poke: [
      { expr: 'angry', text: '완장 건드리지 마. 이건 자존심이야.' },
      { expr: 'blush', text: '…뭐. 할 말 있으면 빨리 해.' },
      { expr: 'surprised', text: '방금 그거, 방송 나간 거 아니지?' },
    ],
    towerUp: [{ expr: 'smile', text: '송신탑 증설 승인. 부원들, 수고했어.' }],
    welcomeBack: [{ expr: 'neutral', text: '늦었네. 방송실은 내가 지키고 있었어.' }],
  },
};

export function pickLine(memberId: string, event: LineEvent): Line | undefined {
  const lines = LINES[memberId]?.[event];
  if (!lines || lines.length === 0) return undefined;
  return lines[Math.floor(Math.random() * lines.length)];
}
