"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { MessageSquare, Send, BookOpen, Plus } from "lucide-react";
import { useCollection, useCreate } from "@/lib/data/hooks";
import { useAuth } from "@/lib/auth/context";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/dates";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const WELCOME: Message = {
  id: "welcome",
  role: "assistant",
  content: "Hello! I'm the SOP Assistant. Ask me anything about your compliance policies, HIPAA requirements, OSHA standards, or any of your active documents. I'll answer based on your approved sources.",
};

const LEGACY = "legacy"; // bucket for messages saved before conversations existed

function newConversationId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `c-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export default function PolicyAssistantPage() {
  const { profile, user } = useAuth();
  const myUserId = profile?.userId ?? user?.id ?? "";

  const docsQ = useCollection("documents");
  const regsQ = useCollection("regulatorySources");
  const chatQ = useCollection("chatMessages");
  const createMsg = useCreate("chatMessages");

  const [conversationId, setConversationId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeDocs = (docsQ.data ?? []).filter((d) => d.status === "active").length;
  const activeRegs = (regsQ.data ?? []).filter((r) => r.reviewStatus === "current").length;

  // This user's SOP Assistant messages, oldest first.
  const mine = useMemo(
    () =>
      (chatQ.data ?? [])
        .filter((m) => m.assistant === "policy_assistant" && m.userId === myUserId)
        .sort((a, b) => a.createdDate.localeCompare(b.createdDate)),
    [chatQ.data, myUserId],
  );

  const messagesFor = useCallback(
    (cid: string): Message[] =>
      mine
        .filter((m) => (m.conversationId ?? LEGACY) === cid)
        .map((m) => ({ id: m.id, role: m.role, content: m.content })),
    [mine],
  );

  // Group messages into conversations for the sidebar, newest activity first.
  const convos = useMemo(() => {
    const map = new Map<string, { id: string; title: string; updated: string }>();
    for (const m of mine) {
      const cid = m.conversationId ?? LEGACY;
      const existing = map.get(cid);
      if (!existing) {
        map.set(cid, {
          id: cid,
          title: cid === LEGACY ? "Earlier conversation" : m.role === "user" ? m.content : "New conversation",
          updated: m.createdDate,
        });
      } else {
        if (m.createdDate > existing.updated) existing.updated = m.createdDate;
        if (cid !== LEGACY && existing.title === "New conversation" && m.role === "user") existing.title = m.content;
      }
    }
    return Array.from(map.values()).sort((a, b) => b.updated.localeCompare(a.updated));
  }, [mine]);

  // On first load: resume the most recent conversation, or start fresh.
  useEffect(() => {
    if (hydrated || chatQ.isLoading || !myUserId) return;
    if (convos.length > 0) {
      const latest = convos[0].id;
      setConversationId(latest);
      setMessages([WELCOME, ...messagesFor(latest)]);
    } else {
      setConversationId(newConversationId());
    }
    setHydrated(true);
  }, [hydrated, chatQ.isLoading, myUserId, convos, messagesFor]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function openConversation(cid: string) {
    if (cid === conversationId || thinking) return;
    setConversationId(cid);
    setMessages([WELCOME, ...messagesFor(cid)]);
    setInput("");
  }

  function startNewChat() {
    if (thinking) return;
    setConversationId(newConversationId());
    setMessages([WELCOME]);
    setInput("");
  }

  async function persist(role: "user" | "assistant", content: string, cid: string | null) {
    if (!myUserId) return;
    try {
      await createMsg.mutateAsync({ userId: myUserId, assistant: "policy_assistant", role, content, conversationId: cid });
    } catch { /* non-blocking */ }
  }

  async function send() {
    const q = input.trim();
    if (!q) return;
    setInput("");
    const cid = conversationId || newConversationId();
    if (!conversationId) setConversationId(cid);
    const persistCid = cid === LEGACY ? null : cid;

    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: q };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setThinking(true);
    void persist("user", q, persistCid);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages
            .filter((m) => m.id !== "welcome")
            .map((m) => ({ role: m.role, content: m.content })),
          conversationId: persistCid,
        }),
      });
      const data = await res.json() as { text?: string; error?: string };
      const answer = data.text ?? data.error ?? "Sorry, something went wrong.";
      setMessages((m) => [...m, { id: `a-${Date.now()}`, role: "assistant", content: answer }]);
      void persist("assistant", answer, persistCid);
    } catch {
      setMessages((m) => [...m, { id: `a-${Date.now()}`, role: "assistant", content: "Network error — please try again." }]);
    } finally {
      setThinking(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="SOP Assistant"
        description="Ask questions about your compliance policies. Answers are constrained to your active documents and approved regulatory sources."
      />

      <div className="grid gap-4 lg:grid-cols-4">
        {/* Left column: conversations + knowledge base */}
        <div className="space-y-4 lg:col-span-1">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <MessageSquare className="size-4 text-muted-foreground" />
                  Conversations
                </CardTitle>
                <Button size="sm" variant="outline" onClick={startNewChat} disabled={thinking} className="h-7 px-2 text-xs">
                  <Plus className="size-3.5" /> New
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-2">
              {chatQ.isLoading ? (
                <div className="space-y-2 p-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
                </div>
              ) : convos.length === 0 ? (
                <p className="px-2 py-3 text-xs text-muted-foreground">
                  No past conversations yet. Ask a question to start one.
                </p>
              ) : (
                <ul className="max-h-64 space-y-1 overflow-y-auto">
                  {convos.map((c) => (
                    <li key={c.id}>
                      <button
                        onClick={() => openConversation(c.id)}
                        className={`w-full rounded-md px-2 py-2 text-left text-xs transition-colors ${
                          c.id === conversationId
                            ? "bg-primary/10 text-foreground"
                            : "hover:bg-secondary/50 text-muted-foreground"
                        }`}
                      >
                        <span className="line-clamp-1 font-medium text-foreground">{c.title}</span>
                        <span className="text-[11px] text-muted-foreground">{formatDate(c.updated)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <BookOpen className="size-4 text-muted-foreground" />
                Knowledge base
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {docsQ.isLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <>
                  <div>
                    <p className="font-medium">{activeDocs} active documents</p>
                    <p className="text-muted-foreground">Policies, SOPs, procedures</p>
                  </div>
                  <div>
                    <p className="font-medium">{activeRegs} regulatory sources</p>
                    <p className="text-muted-foreground">HIPAA, OSHA, state regs</p>
                  </div>
                  <div className="rounded-md border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
                    Answers are limited to your approved content. The assistant remembers your earlier conversations but will not speculate beyond approved sources.
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Chat area */}
        <Card className="flex flex-col lg:col-span-3" style={{ height: "600px" }}>
          <CardHeader className="border-b border-border pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <MessageSquare className="size-4 text-primary" />
              Conversation
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col overflow-hidden p-0">
            <div className="flex-1 overflow-y-auto space-y-4 p-4">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] whitespace-pre-wrap rounded-xl px-4 py-3 text-sm leading-relaxed ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-foreground"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {thinking && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] rounded-xl bg-secondary px-4 py-3">
                    <div className="flex gap-1">
                      <span className="size-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="size-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="size-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            <div className="border-t border-border p-3">
              <form
                onSubmit={(e) => { e.preventDefault(); void send(); }}
                className="flex gap-2"
              >
                <input
                  className="input flex-1"
                  placeholder="Ask about a policy, regulation, or procedure…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={thinking}
                />
                <Button type="submit" disabled={!input.trim() || thinking} aria-label="Send message">
                  <Send className="size-4" />
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
