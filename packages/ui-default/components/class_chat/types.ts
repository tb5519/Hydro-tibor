export interface ClassChatConfig {
  enabled: boolean;
  uid: number;
  canTeach: boolean;
  apiUrl: string;
  socketUrl?: string;
  avatarUrl?: string;
  name?: string;
}

export interface ChatPeer {
  uid: number;
  name: string;
  avatarUrl?: string;
  domainId: string;
  unread: number;
  online?: boolean;
  lastMessage?: string;
  lastAt?: string;
}

export interface ChatMessage {
  id: string;
  from: number;
  to: number;
  kind: 'text' | 'file' | 'image' | 'snapshot';
  text?: string;
  createdAt: string;
  seq?: number;
  read?: boolean;
  clientId?: string;
  attachment?: { name: string; size: number; mime: string; url: string };
  snapshot?: { title: string; pid: string | number; domainId: string; lang: string; code?: string; codePreview?: string; url: string };
}

export interface ChatRoster {
  canTeach: boolean;
  peers: ChatPeer[];
  unread: number;
  quotaBytes: number;
  maxFileBytes: number;
  maxImageBytes: number;
}

export const peerKey = (peer: Pick<ChatPeer, 'uid' | 'domainId'>) => `${peer.domainId}:${peer.uid}`;

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function safeAssetUrl(value: string | undefined, base: string, sameOrigin = false) {
  if (!value) return '';
  try {
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (sameOrigin && url.origin !== new URL(base).origin) return '';
    return url.href;
  } catch { return ''; }
}

export function messageSummary(message: ChatMessage) {
  if (message.kind === 'snapshot') return `题目与代码 · ${message.snapshot?.title || '编程问题'}`;
  if (message.kind === 'image') return '[图片]';
  if (message.kind === 'file') return `[文件] ${message.attachment?.name || ''}`;
  return message.text || '';
}
