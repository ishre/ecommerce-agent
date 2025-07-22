"use client";
import React, { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Bot, Send } from "lucide-react";
import Balancer from "react-wrap-balancer";
import Lottie from "lottie-react";
import aiStarsAnimation from "./lottie/AiStars.json";

interface Message {
  role: "user" | "assistant" | "loading";
  content: string;
}

type LoadingStage = "understanding" | "generating" | "explaining";

function AILoader({ stage }: { stage: LoadingStage }) {
  let label = "Understanding query…";
  let color = "text-green-400";
  if (stage === "generating") {
    label = "Communicating with database…";
    color = "text-emerald-700";
  } else if (stage === "explaining") {
    label = "Preparing response…";
    color = "text-emerald-800";
  }
  return (
    <div className={`flex items-center gap-3 px-3 py-2 font-medium ${color}`}>{label}</div>
  );
}

function Typewriter({ text, onDone }: { text: string; onDone?: () => void }) {
  const [displayed, setDisplayed] = useState("");
  const [minHeight, setMinHeight] = useState<number | undefined>(undefined);
  const fullRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (fullRef.current) {
      setMinHeight(fullRef.current.offsetHeight);
    }
  }, [text]);

  useEffect(() => {
    let i = 0;
    setDisplayed("");
    if (!text) return;
    const interval = setInterval(() => {
      setDisplayed(text.slice(0, i + 1));
      if (text.slice(0, i + 1).length === text.length) {
        clearInterval(interval);
        if (onDone) onDone();
      }
      i++;
    }, 18);
    return () => clearInterval(interval);
  }, [text, onDone]);

  // Split displayed text into characters for fade-in
  return (
    <>
      {/* Hidden full text for measuring height */}
      <div
        ref={fullRef}
        style={{
          visibility: "hidden",
          position: "absolute",
          pointerEvents: "none",
          height: "auto",
          whiteSpace: "pre-wrap",
          width: "100%",
        }}
        className="typewriter-measure"
        aria-hidden
      >
        <Balancer>{text}</Balancer>
      </div>
      {/* Visible typewriter text with fade-in */}
      <div style={{ minHeight }}>
        <Balancer>
          {Array.from(displayed).map((char, idx) => (
            <span
              key={idx}
              style={{
                opacity: 0,
                animation: `fadeInChar 0.25s ease forwards`,
                animationDelay: `${idx * 0.012}s`,
                display: char === " " ? "inline-block" : undefined,
              }}
            >
              {char}
            </span>
          ))}
        </Balancer>
      </div>
      <style jsx global>{`
        @keyframes fadeInChar {
          from { opacity: 0; transform: translateY(0.5em); }
          to { opacity: 1; transform: none; }
        }
      `}</style>
    </>
  );
}

export function Chatbot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<LoadingStage>("understanding");
  const [open, setOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg: Message = { role: "user", content: input };
    setMessages((msgs) => [...msgs, userMsg, { role: "loading", content: "" }]);
    setInput("");
    setLoading(true);
    setLoadingStage("understanding");
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: input }),
      });
      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      let buffer = "";
      let done = false;
      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          buffer += new TextDecoder().decode(value);
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const data = JSON.parse(line);
            if (data.stage === "understanding" || data.stage === "generating" || data.stage === "explaining") {
              setLoadingStage(data.stage);
            } else if (data.stage === "done") {
              setMessages((msgs) => [
                ...msgs.slice(0, -1),
                { role: "assistant", content: data.answer },
              ]);
              setLoading(false);
            } else if (data.stage === "error") {
              setMessages((msgs) => [
                ...msgs.slice(0, -1),
                { role: "assistant", content: `Error: ${data.error}` },
              ]);
              setLoading(false);
            }
          }
        }
      }
    } catch {
      setMessages((msgs) => [
        ...msgs.slice(0, -1),
        { role: "assistant", content: "Something went wrong." },
      ]);
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating AI button */}
      {!open && (
        <button
          className="fixed bottom-6 right-6 z-50 p-[6px] rounded-full shadow-2xl hover:scale-105 transition-all focus:outline-none focus:ring-4 focus:ring-blue-300 animate-gradient-x"
          onClick={() => setOpen(true)}
          aria-label="Open AI Chatbot"
          style={{
            background: "linear-gradient(135deg, #f26e77 0%, #3b82f6 50%, #34d399 100%)",
            backgroundSize: '200% 200%',
          }}
        >
          <span className="flex items-center gap-2 bg-white rounded-full px-4 py-3">
          <Lottie
                      animationData={aiStarsAnimation}
                      loop
                      autoplay
                      style={{ width: "30px", height: "30px" }}
                    /> 
            <span className="font-bold drop-shadow text-gray-600">Chat With Data</span>
          </span>
        </button>
      )}
      {/* Popup Chatbot */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[350px] max-w-[95vw] animate-slide-in">
          <Card className="shadow-2xl border-2 border-purple-600">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg flex items-center gap-3 text-purple-800">
              <Lottie
                      animationData={aiStarsAnimation}
                      loop
                      autoplay
                      style={{ width: "30px", height: "30px" }}
                    /> Anarix AI
              </CardTitle>
              <button
                className="ml-auto text-gray-400 hover:text-red-500 transition-colors"
                onClick={() => setOpen(false)}
                aria-label="Close Chatbot"
              >
                <X className="w-5 h-5" />
              </button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 min-h-[300px] max-h-[350px] overflow-y-auto mb-3 bg-white rounded p-2 ">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 text-center text-gray-500">
                    <Bot className="w-12 h-12 mb-3 text-[#f26e77] animate-bounce" />
                    <div className="font-semibold text-lg mb-1">No conversation yet</div>
                    <div className="text-sm mb-2">Ask a question about your e-commerce<br/> data to get started!</div>
                    <button
                      type="button"
                      className="flex -m-4 items-center justify-center gap-1  mt-3 p-[2.5px] rounded-full bg-gradient-to-r from-[#f26e77] via-blue-400 to-[#34d399] shadow-2xl transition-all focus:outline-none focus:ring-4 focus:ring-blue-300/60 max-w-full bg-[length:200%_200%] bg-[position:0%_50%] hover:bg-gradient-to-l hover:from-[#34d399] hover:via-blue-400 hover:to-[#f26e77] hover:bg-[position:100%_50%] duration-1000"
                      style={{
                        boxShadow: "0 2px 8px 0 rgba(80, 0, 120, 0.08)",
                        wordBreak: "break-word",
                        whiteSpace: "normal",
                        lineHeight: 1.3,
                      }}
                      onClick={() => {
                        setInput('What were my top selling items last month?');
                        if (!loading) handleSend();
                      }}
                    >
                      <span className="flex items-center justify-center gap-2 bg-white rounded-full px-3 py-1 w-full">
                        <div className="w-6 h-6 mr-1 mb-0.5 flex-shrink-0">
                          <Lottie
                            animationData={aiStarsAnimation}
                            loop
                            autoplay
                            style={{ width: "100%", height: "100%" }}
                          />
                        </div>
                        <span className="text-gray-700 text-[12px] font-semibold">
                          Try: &quot;My top selling items last month?&quot;
                        </span>
                      </span>
                    </button>
                  </div>
                )}
                {messages.map((msg: Message, i: number) => (
                  <div
                    key={i}
                    className={
                      msg.role === "user"
                        ? "flex flex-row-reverse items-end gap-2 text-right"
                        : "flex items-end gap-2 text-left"
                    }
                  >
                    
                    <div className="flex flex-col max-w-[80%]">
                      <div className={
                        msg.role === "user"
                          ? "flex flex-row-reverse items-center gap-1 mb-1"
                          : "flex items-center gap-1 mb-1"
                      }>
                        <Badge
                          variant={msg.role === "user" ? "secondary" : "default"}
                          className={
                            msg.role === "user"
                              ? "bg-gradient-to-br from-blue-400 to-purple-400 text-white border-none shadow font-semibold"
                              : msg.role === "assistant"
                              ? "bg-gradient-to-br from-green-400 to-blue-300 text-white border-none shadow font-semibold"
                              : ""
                          }
                        >
                          {msg.role === "user"
                            ? "You"
                            : msg.role === "assistant"
                            ? "AI"
                            : ""}
                        </Badge>
                      </div>
                      <div
                        className={
                          msg.role === "user"
                            ? "whitespace-pre-wrap break-words text-sm bg-blue-50 rounded-lg p-2 inline-block max-w-full text-blue-900"
                            : msg.role === "assistant"
                            ? "whitespace-pre-wrap break-words text-sm bg-green-50 rounded-lg p-2 inline-block max-w-full text-green-900"
                            : ""
                        }
                      >
                        {msg.role === "assistant" && i === messages.length - 1 && !loading ? (
                          <Typewriter text={msg.content} />
                        ) : (
                          <Balancer>{msg.content}</Balancer>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex items-end gap-2 text-left">
                    <div className="flex flex-col max-w-[80%]">
                      <div className="flex items-center gap-1 mb-1">
                        <Badge className="bg-gradient-to-br from-green-400 to-blue-300 text-white border-none shadow font-semibold">AI</Badge>
                      </div>
                      <div
                        className="whitespace-pre-wrap break-words text-sm bg-gradient-to-br from-green-50 via-blue-50 to-white rounded-lg p-2  max-w-full text-green-900 flex items-center min-h-[36px] border border-green-100 shadow-sm"
                        style={{
                          minHeight: 40,
                          background: "linear-gradient(135deg, #f0fdf4 60%, #e0f2fe 100%)",
                        }}
                      >
                        <AILoader stage={loadingStage} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
              <form
                className="flex gap-2 mt-2"
                onSubmit={e => {
                  e.preventDefault();
                  if (!loading && input.trim()) handleSend();
                }}
              >
                <Input
                  placeholder="Type your question…"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !loading && input.trim()) handleSend();
                  }}
                  disabled={loading}
                />
                <Button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="bg-gradient-to-br from-indigo-600 via-purple-500 to-pink-500 text-white text- shadow font-bold flex items-center gap-1 px-4 py-2 hover:scale-105 transition-all"
                  style={{ color: "#fff" }}
                >
                  <Send className="w-4 h-4 mr-1" />
                  {loading ? "Thinking…" : "Send"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
      <style jsx global>{`
        @keyframes slide-in {
          0% {
            opacity: 0;
            transform: translateY(40px) scale(0.95);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-slide-in {
          animation: slide-in 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
        @keyframes gradient-x {
          0%, 100% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
        }
        .animate-gradient-x {
          animation: gradient-x 3s ease-in-out infinite;
        }
      `}</style>
    </>
  );
} 