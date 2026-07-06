"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { MessageSquare, Send, BookOpen } from "lucide-react";
import { useCollection, useCreate } from "@/lib/data/hooks";
import { useAuth } from "@/lib/auth/context";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

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

export default function PolicyAssistantPage() {
  const { profile, user } = useAuth();
  const myUserId = profile?.userId ?? user?.id ?? "";

  const docsQ = useCollection("documents");
  const regsQ = useCollection("regulatorySources");
  const chatQ = useCollection("chatMessages");
  const createMsg = useCreate("chatMessages");

  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeDocs = (docsQ.data ?? []).filter((d) => d.status === "active").length;
  const activeRegs = (regsQ.data ?? []).filter((r) => r.reviewStatus === "current").length;

  // Load this user's saved SOP Assistant history once.
  const history = useMemo(
    () =>
      (chatQ.data ?? [])
        .filter((m) => m.assistant === "policy_assistant" && m.userId === myUserId)
        .sort((a, b) => a.createdDate.localeCompare(b.createdDate)),
    [chatQ.data, myUserId],
  );
  useEffect(() => {
    if (hydrated || chatQ.isLoading) return;
    if (history.length > 0) {
      setMessages([WELCOME, ...history.map((m) => ({ id: m.id, role: m.role, content: m.content }))]);
    }
    setHydrated(true);
  }, [history, chatQ.isLoading, hydrated]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function persist(role: "user" | "assistant", content: string) {
    if (!myUserId) return;
    try {
      await createMsg.mutateAsync({ userId: myUserId, assistant: "policy_assistant", role, content });
    } catch { /* non-blocking */ }
  }

  async function send() {
    const q = input.trim();
    if (!q) return;
    setInput("");
    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: q };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setThinking(true);
    void persist("user", q);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages
            .filter((m) => m.id !== "welcome")
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json() as { text?: string; error?: string };
      const answer = data.text ?? data.error ?? "Sorry, something went wrong.";
      setMessages((m) => [...m, { id: `a-${Date.now()}`, role: "assistant", content: answer }]);
      void persist("assistant", answer);
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
        {/* Context sources sidebar */}
        <Card className="lg:col-span-1">
          <CardHeader>
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
                  Answers are limited to your approved content. The assistant will not speculate beyond approved sources.
                </div>
              </>
            )}
          </CardContent>
        </Card>

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
                    className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
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
