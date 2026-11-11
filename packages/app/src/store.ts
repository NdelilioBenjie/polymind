import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { ApiError, fetchCatalogue, streamChat } from "./api";
import { titleFrom, uid } from "./lib/format";
import { BUILTIN_PROMPTS, systemPrompt } from "./lib/prompts";
import type {
  Answer,
  Catalogue,
  Conversation,
  ModelInfo,
  PageContext,
  Platform,
  SavedPrompt,
  ThemeChoice,
  Turn,
} from "./types";

const MAX_CONVERSATIONS = 40;
const FALLBACK_MAX_MODELS = 4;

let platform: Platform = { kind: "web", apiBase: "" };
export const setPlatform = (next: Platform): void => {
  platform = next;
};
export const getPlatform = (): Platform => platform;

/** localStorage, but writes are coalesced so token streaming does not hammer it. */
const debouncedStorage: StateStorage = (() => {
  const pending = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    timer = undefined;
    for (const [key, value] of pending) {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* storage full or blocked: the session still works in memory */
      }
    }
    pending.clear();
  };
  if (typeof window !== "undefined") window.addEventListener("pagehide", flush);
  return {
    getItem: (key) => {
      try {
        return pending.get(key) ?? localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem: (key, value) => {
      pending.set(key, value);
      timer ??= setTimeout(flush, 400);
    },
    removeItem: (key) => {
      pending.delete(key);
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
})();

const controllers = new Map<string, AbortController>();

interface SendOptions {
  /** Full text for the models when it differs from the visible prompt. */
  instruction?: string;
  /** Start a fresh conversation instead of continuing the open one. */
  fresh?: boolean;
}

export interface PolymindState {
  conversations: Conversation[];
  activeId: string | null;
  selectedModelIds: string[];
  customPrompts: SavedPrompt[];
  theme: ThemeChoice;
  apiBaseOverride: string;

  catalogue: Catalogue | null;
  catalogueStatus: "idle" | "loading" | "ready" | "error";
  catalogueError: string | null;
  draft: string;
  /** A short message shown under the question box. */
  notice: string | null;

  loadCatalogue: () => Promise<void>;
  setDraft: (draft: string) => void;
  setNotice: (notice: string | null) => void;
  setTheme: (theme: ThemeChoice) => void;
  setApiBaseOverride: (value: string) => void;

  toggleModel: (id: string) => void;
  removeModel: (id: string) => void;

  newConversation: () => void;
  openConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  clearConversations: () => void;
  setPage: (page: PageContext | undefined) => void;

  send: (prompt: string, options?: SendOptions) => void;
  retry: (turnId: string, answerId: string) => void;
  stop: (answerId?: string) => void;

  savePrompt: (prompt: { id?: string; title: string; body: string }) => void;
  deletePrompt: (id: string) => void;
}

export const apiBase = (state: Pick<PolymindState, "apiBaseOverride">): string =>
  (state.apiBaseOverride.trim() || platform.apiBase).replace(/\/+$/, "");

/** Chooses sensible defaults the first time the catalogue loads, and drops
 *  remembered models that no longer exist or are no longer available. */
function reconcileSelection(selected: string[], catalogue: Catalogue): string[] {
  const usable = new Map(catalogue.models.filter((model) => model.available).map((model) => [model.id, model]));
  const kept = selected.filter((id) => usable.has(id)).slice(0, catalogue.maxModelsPerPrompt);
  if (kept.length > 0) return kept;

  const picks: ModelInfo[] = [];
  const byRecency = [...usable.values()].sort((a, b) => b.created - a.created);
  for (const model of byRecency) {
    if (picks.length === 2) break;
    if (!picks.some((pick) => pick.provider === model.provider)) picks.push(model);
  }
  return picks.map((model) => model.id);
}

export const usePolymind = create<PolymindState>()(
  persist(
    (set, get) => {
      const patchAnswer = (conversationId: string, answerId: string, patch: (answer: Answer) => Answer) =>
        set((state) => ({
          conversations: state.conversations.map((conversation) =>
            conversation.id !== conversationId
              ? conversation
              : {
                  ...conversation,
                  updatedAt: Date.now(),
                  turns: conversation.turns.map((turn) =>
                    turn.answers.some((answer) => answer.id === answerId)
                      ? { ...turn, answers: turn.answers.map((a) => (a.id === answerId ? patch(a) : a)) }
                      : turn,
                  ),
                },
          ),
        }));

      /** Builds the message history one model should see: its own earlier
       *  answers where it has them, otherwise the first finished answer. */
      const historyFor = (conversation: Conversation, turn: Turn, modelId: string) => {
        const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
          { role: "system", content: systemPrompt(conversation.page) },
        ];
        for (const earlier of conversation.turns) {
          if (earlier.id === turn.id) break;
          const own = earlier.answers.find((a) => a.modelId === modelId && a.content && a.status !== "error");
          const reply = own ?? earlier.answers.find((a) => a.content && a.status === "done");
          if (!reply) continue;
          messages.push({ role: "user", content: earlier.instruction ?? earlier.prompt });
          messages.push({ role: "assistant", content: reply.content });
        }
        messages.push({ role: "user", content: turn.instruction ?? turn.prompt });
        return messages;
      };

      const run = (conversationId: string, turnId: string, answerId: string) => {
        const conversation = get().conversations.find((c) => c.id === conversationId);
        const turn = conversation?.turns.find((t) => t.id === turnId);
        const answer = turn?.answers.find((a) => a.id === answerId);
        if (!conversation || !turn || !answer) return;

        const controller = new AbortController();
        controllers.set(answerId, controller);
        const startedAt = performance.now();
        let firstTokenMs: number | undefined;

        // Tokens arrive far faster than React needs to paint; batch them per frame.
        let buffered = "";
        let frame = 0;
        const flush = () => {
          frame = 0;
          if (!buffered) return;
          const text = buffered;
          buffered = "";
          patchAnswer(conversationId, answerId, (a) => ({
            ...a,
            content: a.content + text,
            status: "streaming",
            firstTokenMs: a.firstTokenMs ?? firstTokenMs,
          }));
        };

        const finish = (patch: Partial<Answer>) => {
          if (frame) cancelAnimationFrame(frame);
          flush();
          controllers.delete(answerId);
          patchAnswer(conversationId, answerId, (a) => ({
            ...a,
            ...patch,
            totalMs: Math.round(performance.now() - startedAt),
          }));
        };

        streamChat({
          apiBase: apiBase(get()),
          model: answer.modelId,
          messages: historyFor(conversation, turn, answer.modelId),
          signal: controller.signal,
          onStart: ({ simulated }) => patchAnswer(conversationId, answerId, (a) => ({ ...a, simulated })),
          onDelta: (text) => {
            firstTokenMs ??= Math.round(performance.now() - startedAt);
            buffered += text;
            frame ||= requestAnimationFrame(flush);
          },
        })
          .then(() => finish({ status: "done" }))
          .catch((error: unknown) => {
            if ((error as Error).name === "AbortError") return finish({ status: "stopped" });
            const message = error instanceof ApiError ? error.message : "Something went wrong. Retry.";
            finish({ status: "error", error: message });
          });
      };

      return {
        conversations: [],
        activeId: null,
        selectedModelIds: [],
        customPrompts: [],
        theme: "system",
        apiBaseOverride: "",

        catalogue: null,
        catalogueStatus: "idle",
        catalogueError: null,
        draft: "",
        notice: null,

        async loadCatalogue() {
          if (platform.kind === "extension" && !apiBase(get())) {
            set({ catalogueStatus: "error", catalogueError: "Add your Polymind server address in Settings to get started." });
            return;
          }
          set({ catalogueStatus: "loading", catalogueError: null });
          try {
            const catalogue = await fetchCatalogue(apiBase(get()));
            set((state) => ({
              catalogue,
              catalogueStatus: "ready",
              selectedModelIds: reconcileSelection(state.selectedModelIds, catalogue),
            }));
          } catch (error) {
            set({
              catalogueStatus: "error",
              catalogueError: error instanceof ApiError ? error.message : "The model list did not load.",
            });
          }
        },

        setDraft: (draft) => set({ draft }),
        setNotice: (notice) => set({ notice }),
        setTheme: (theme) => set({ theme }),
        setApiBaseOverride: (value) => set({ apiBaseOverride: value }),

        toggleModel(id) {
          const { selectedModelIds, catalogue } = get();
          if (selectedModelIds.includes(id)) {
            set({ selectedModelIds: selectedModelIds.filter((selected) => selected !== id) });
            return;
          }
          const limit = catalogue?.maxModelsPerPrompt ?? FALLBACK_MAX_MODELS;
          if (selectedModelIds.length >= limit) return;
          set({ selectedModelIds: [...selectedModelIds, id] });
        },
        removeModel: (id) =>
          set((state) => ({ selectedModelIds: state.selectedModelIds.filter((selected) => selected !== id) })),

        newConversation: () => set({ activeId: null, draft: "" }),
        openConversation: (id) => set({ activeId: id }),
        deleteConversation(id) {
          const conversation = get().conversations.find((c) => c.id === id);
          conversation?.turns.forEach((turn) => turn.answers.forEach((a) => controllers.get(a.id)?.abort()));
          set((state) => ({
            conversations: state.conversations.filter((c) => c.id !== id),
            activeId: state.activeId === id ? null : state.activeId,
          }));
        },
        clearConversations() {
          controllers.forEach((controller) => controller.abort());
          set({ conversations: [], activeId: null });
        },

        setPage(page) {
          const { activeId } = get();
          if (activeId) {
            set((state) => ({
              conversations: state.conversations.map((c) => (c.id === activeId ? { ...c, page } : c)),
            }));
          } else if (page) {
            const now = Date.now();
            const conversation: Conversation = {
              id: uid(), title: page.title, turns: [], page, createdAt: now, updatedAt: now,
            };
            set((state) => ({
              conversations: [conversation, ...state.conversations].slice(0, MAX_CONVERSATIONS),
              activeId: conversation.id,
            }));
          }
        },

        send(prompt, options = {}) {
          const text = prompt.trim();
          const state = get();
          if (!text || state.selectedModelIds.length === 0) return;

          const names = new Map(state.catalogue?.models.map((model) => [model.id, model.name]));
          const turn: Turn = {
            id: uid(),
            prompt: text,
            instruction: options.instruction,
            createdAt: Date.now(),
            answers: state.selectedModelIds.map((modelId) => ({
              id: uid(),
              modelId,
              modelName: names.get(modelId) ?? modelId,
              content: "",
              status: "waiting",
            })),
          };

          const existing = options.fresh ? undefined : state.conversations.find((c) => c.id === state.activeId);
          const conversation: Conversation = existing
            ? {
                ...existing,
                title: existing.turns.length === 0 ? titleFrom(text) : existing.title,
                turns: [...existing.turns, turn],
                updatedAt: Date.now(),
              }
            : { id: uid(), title: titleFrom(text), turns: [turn], createdAt: Date.now(), updatedAt: Date.now() };

          set({
            draft: "",
            activeId: conversation.id,
            conversations: [conversation, ...state.conversations.filter((c) => c.id !== conversation.id)].slice(
              0,
              MAX_CONVERSATIONS,
            ),
          });
          turn.answers.forEach((answer) => run(conversation.id, turn.id, answer.id));
        },

        retry(turnId, answerId) {
          const conversation = get().conversations.find((c) => c.turns.some((t) => t.id === turnId));
          if (!conversation) return;
          controllers.get(answerId)?.abort();
          patchAnswer(conversation.id, answerId, (a) => ({
            ...a, content: "", status: "waiting", error: undefined, firstTokenMs: undefined, totalMs: undefined,
          }));
          run(conversation.id, turnId, answerId);
        },

        stop(answerId) {
          if (answerId) controllers.get(answerId)?.abort();
          else controllers.forEach((controller) => controller.abort());
        },

        savePrompt({ id, title, body }) {
          set((state) => ({
            customPrompts: id
              ? state.customPrompts.map((p) => (p.id === id ? { ...p, title, body } : p))
              : [{ id: uid(), title, body }, ...state.customPrompts],
          }));
        },
        deletePrompt: (id) =>
          set((state) => ({ customPrompts: state.customPrompts.filter((p) => p.id !== id) })),
      };
    },
    {
      name: "polymind",
      version: 1,
      storage: createJSONStorage(() => debouncedStorage),
      partialize: (state) => ({
        conversations: state.conversations,
        activeId: state.activeId,
        selectedModelIds: state.selectedModelIds,
        customPrompts: state.customPrompts,
        theme: state.theme,
        apiBaseOverride: state.apiBaseOverride,
      }),
      // Answers that were mid-stream when the tab closed can never finish.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.conversations = state.conversations.map((conversation) => ({
          ...conversation,
          turns: conversation.turns.map((turn) => ({
            ...turn,
            answers: turn.answers.map((answer) =>
              answer.status === "waiting" || answer.status === "streaming"
                ? { ...answer, status: "stopped" as const }
                : answer,
            ),
          })),
        }));
      },
    },
  ),
);

export const allPrompts = (state: Pick<PolymindState, "customPrompts">): SavedPrompt[] => [
  ...state.customPrompts,
  ...BUILTIN_PROMPTS,
];

export const isBusy = (conversation: Conversation | undefined): boolean =>
  !!conversation?.turns.some((turn) =>
    turn.answers.some((answer) => answer.status === "waiting" || answer.status === "streaming"),
  );
