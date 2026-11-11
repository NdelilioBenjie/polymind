import { BookOpen, Plus, Settings, Trash2 } from "lucide-react";
import { dayLabel } from "../lib/format";
import { usePolymind } from "../store";
import type { Conversation } from "../types";
import { Logo } from "./Logo";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  onOpenPrompts: () => void;
  onOpenSettings: () => void;
}

function groupByDay(conversations: Conversation[]): Array<[string, Conversation[]]> {
  const groups = new Map<string, Conversation[]>();
  for (const conversation of conversations) {
    const label = dayLabel(conversation.updatedAt);
    groups.set(label, [...(groups.get(label) ?? []), conversation]);
  }
  return [...groups];
}

export function Sidebar({ open, onClose, onOpenPrompts, onOpenSettings }: SidebarProps) {
  const conversations = usePolymind((state) => state.conversations);
  const activeId = usePolymind((state) => state.activeId);
  const catalogue = usePolymind((state) => state.catalogue);
  const status = usePolymind((state) => state.catalogueStatus);
  const { newConversation, openConversation, deleteConversation } = usePolymind.getState();

  const usable = catalogue?.models.filter((model) => model.available).length ?? 0;
  const statusText =
    status === "error"
      ? "Server unreachable"
      : !catalogue
        ? "Connecting"
        : catalogue.mode === "demo"
          ? "Demo mode"
          : `${usable} models ready`;

  return (
    <>
      {open && <div className="pm-sidebar-scrim" onClick={onClose} />}
      <aside className="pm-sidebar" data-open={open} aria-label="Chats">
        <div className="pm-brand">
          <Logo />
          <span>Polymind</span>
        </div>

        <button
          className="pm-btn pm-btn--primary pm-sidebar__new"
          onClick={() => {
            newConversation();
            onClose();
          }}
        >
          <Plus size={16} />
          New chat
        </button>

        <nav className="pm-history">
          {conversations.length === 0 && <p className="pm-history__empty">Your chats will be listed here.</p>}
          {groupByDay(conversations).map(([label, items]) => (
            <section key={label}>
              <h3>{label}</h3>
              <ul>
                {items.map((conversation) => (
                  <li key={conversation.id} data-active={conversation.id === activeId}>
                    <button
                      className="pm-history__open"
                      onClick={() => {
                        openConversation(conversation.id);
                        onClose();
                      }}
                    >
                      {conversation.title}
                    </button>
                    <button
                      className="pm-icon-btn pm-history__delete"
                      aria-label={`Delete chat: ${conversation.title}`}
                      onClick={() => deleteConversation(conversation.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>

        <div className="pm-sidebar__foot">
          <button className="pm-nav-btn" onClick={onOpenPrompts}>
            <BookOpen size={16} />
            Prompt library
          </button>
          <button className="pm-nav-btn" onClick={onOpenSettings}>
            <Settings size={16} />
            Settings
          </button>
          <p className="pm-status" data-state={status === "error" ? "error" : (catalogue?.mode ?? "loading")}>
            <i aria-hidden />
            {statusText}
          </p>
        </div>
      </aside>
    </>
  );
}
