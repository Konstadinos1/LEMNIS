import { create } from 'zustand';
import type { Thread, Message } from '@/types/message';

interface ChatState {
  threads: Record<string, Thread>;
  messages: Record<string, Message[]>;
  activeThreadId: string | null;

  setThreads: (threads: Thread[]) => void;
  upsertThread: (thread: Thread) => void;
  setMessages: (threadId: string, messages: Message[]) => void;
  appendMessage: (threadId: string, message: Message) => void;
  updateMessageStatus: (
    threadId: string,
    messageId: string,
    patch: Partial<Message>
  ) => void;
  setActiveThread: (threadId: string | null) => void;
  markRead: (threadId: string) => void;
  /** Update lastMessage + increment unreadCount without overwriting other thread fields. */
  touchLastMessage: (threadId: string, message: Message) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  threads: {},
  messages: {},
  activeThreadId: null,

  setThreads: (threads) =>
    set({ threads: Object.fromEntries(threads.map((t) => [t.id, t])) }),

  upsertThread: (thread) =>
    set((s) => ({ threads: { ...s.threads, [thread.id]: thread } })),

  setMessages: (threadId, messages) =>
    set((s) => ({ messages: { ...s.messages, [threadId]: messages } })),

  appendMessage: (threadId, message) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [threadId]: [...(s.messages[threadId] ?? []), message],
      },
    })),

  updateMessageStatus: (threadId, messageId, patch) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [threadId]: (s.messages[threadId] ?? []).map((m) =>
          m.id === messageId ? { ...m, ...patch } : m
        ),
      },
    })),

  setActiveThread: (activeThreadId) => set({ activeThreadId }),

  markRead: (threadId) =>
    set((s) => ({
      threads: {
        ...s.threads,
        [threadId]: { ...s.threads[threadId], unreadCount: 0 },
      },
    })),

  touchLastMessage: (threadId, message) =>
    set((s) => {
      const existing = s.threads[threadId];
      if (!existing) return s;
      return {
        threads: {
          ...s.threads,
          [threadId]: {
            ...existing,
            lastMessage: message,
            unreadCount: existing.unreadCount + 1,
          },
        },
      };
    }),
}));
