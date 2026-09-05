export type SessionStatus = 'fetching' | 'streaming' | 'complete' | 'error';
export type Session = {
  id: string;
  url: string;
  title: string;
  summary: string;
  excerpt: string;
  status: SessionStatus;
  error: string | null;
  createdAt: number;
  updatedAt: number;
  wordCount: number;
  sourceTruncated: boolean;
};
export type Message = {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'streaming' | 'complete' | 'error';
  error: string | null;
  createdAt: number;
};
export type SessionDetail = Session & { messages: Message[] };
export type StreamEvent =
  | { type: 'session'; session: Session }
  | { type: 'delta'; text: string }
  | { type: 'message'; message: Message }
  | { type: 'done'; session?: Session; message?: Message }
  | {
      type: 'error';
      message: string;
      session?: Session;
      chatMessage?: Message;
    };
