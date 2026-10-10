"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import mermaid from "mermaid";
import { useAuth } from "../../lib/AuthContext";

// --- Custom Mermaid Chart Component ---
const Mermaid = ({ chart }: { chart: string }) => {
  const [svg, setSvg] = useState<string>("");

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      themeVariables: {
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        primaryTextColor: '#1e293b',
        lineColor: '#e2e8f0',
        pie1: '#2563eb',
        pie2: '#38bdf8',
        pie3: '#818cf8',
        pie4: '#34d399',
        pie5: '#fbbf24',
        pie6: '#f472b6',
        pie7: '#a78bfa',
        pie8: '#f87171',
        pie9: '#fb923c',
        pie10: '#94a3b8',
        pieStrokeColor: '#ffffff',
        pieStrokeWidth: '3px',
        pieOpacity: '1.0',
        pieTitleTextSize: '18px',
        pieTitleTextColor: '#0f172a',
        pieSectionTextSize: '13px',
        pieLegendTextSize: '13px',
        pieLegendTextColor: '#334155',
      }
    });

    const renderChart = async () => {
      try {
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        const { svg: renderedSvg } = await mermaid.render(id, chart);
        setSvg(renderedSvg);
      } catch (error) {
        console.error("Mermaid rendering failed:", error);
      }
    };

    renderChart();
  }, [chart]);

  return svg ? (
    <div 
      className="flex justify-center my-6 p-8 bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }} 
    />
  ) : (
    <div className="flex justify-center my-6 p-8 bg-slate-50 border border-slate-200 rounded-xl animate-pulse">
       <span className="text-slate-400 text-sm font-semibold">Rendering visualization...</span>
    </div>
  );
};

// --- Main Chat Page Component ---
export default function AiQueryPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<{ role: 'user' | 'ai', text: string }[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [recentPrompts, setRecentPrompts] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load recent prompts from local storage on initial mount
  useEffect(() => {
    const savedPrompts = localStorage.getItem('reAIgent_recent_prompts');
    if (savedPrompts) {
      setRecentPrompts(JSON.parse(savedPrompts));
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    
    // Update local storage with the new prompt (keep last 5 unique)
    const updatedPrompts = [userMessage, ...recentPrompts.filter(p => p !== userMessage)].slice(0, 5);
    setRecentPrompts(updatedPrompts);
    localStorage.setItem('reAIgent_recent_prompts', JSON.stringify(updatedPrompts));

    const newMessages = [...messages, { role: 'user' as const, text: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const res = await fetch("/api/ai-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          prompt: userMessage,
          history: messages 
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch response");

      setMessages([...newMessages, { role: 'ai', text: data.response }]);
    } catch (err: any) {
      setMessages([...newMessages, { role: 'ai', text: `**System Error:** ${err.message}. Please check API logs.` }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 h-[calc(100vh-120px)] flex flex-col">
      
      {/* Standardized Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end pb-2 border-b border-slate-200 flex-shrink-0">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight mb-4">AI Query</h2>
        </div>
      </header>

      {/* Standardized Main Container */}
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-0">
        
        {/* Chat History Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-8 bg-slate-50/30">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-60">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 border border-slate-200 shadow-sm">
                <span className="text-3xl">✨</span>
              </div>
              <p className="text-slate-600 font-bold text-lg">reAIgent Assistant</p>
              <p className="text-sm text-slate-500 mt-2 max-w-md leading-relaxed">
                Ask anything about your real estate portfolio. I can calculate metrics, compare lease costs, and generate visual charts based on live database records.
              </p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[95%] sm:max-w-[85%] rounded-2xl p-6 ${msg.role === 'user' ? 'bg-blue-600 text-white shadow-md rounded-br-sm' : 'bg-white border border-slate-200 shadow-sm rounded-bl-sm'}`}>
                  
                  {msg.role === 'ai' && (
                    <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
                      <span className="text-lg leading-none">✨</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">reAIgent Engine</span>
                    </div>
                  )}
                  
                  <div className={msg.role === 'user' ? 'text-sm font-medium' : 'prose prose-sm prose-slate max-w-none text-sm leading-relaxed'}>
                    {msg.role === 'user' ? (
                      msg.text
                    ) : (
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]} 
                        components={{
                          code({ node, inline, className, children, ...props }: any) {
                            const match = /language-(\w+)/.exec(className || '');
                            const isMermaid = match && match[1] === 'mermaid';
                            
                            if (!inline && isMermaid) {
                              return <Mermaid chart={String(children).replace(/\n$/, '')} />;
                            }
                            
                            return !inline ? (
                              <div className="bg-slate-800 text-slate-100 p-4 rounded-lg my-4 overflow-x-auto text-xs font-mono shadow-inner">
                                <code className={className} {...props}>{children}</code>
                              </div>
                            ) : (
                              <code className="bg-slate-100 border border-slate-200 text-blue-700 px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
                                {children}
                              </code>
                            );
                          },
                          table: ({node, ...props}) => <div className="overflow-x-auto my-6 border border-slate-200 rounded-xl shadow-sm"><table className="w-full text-left border-collapse text-sm bg-white" {...props} /></div>,
                          thead: ({node, ...props}) => <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[11px] font-bold tracking-wider" {...props} />,
                          th: ({node, ...props}) => <th className="px-4 py-3" {...props} />,
                          td: ({node, ...props}) => <td className="px-4 py-3 border-b border-slate-100 text-slate-700" {...props} />,
                          h3: ({node, ...props}) => <h3 className="text-lg font-bold text-slate-900 mt-6 mb-3" {...props} />,
                          p: ({node, ...props}) => <div className="mb-4 text-slate-700 leading-relaxed last:mb-0" {...props} />,
                          ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-4 text-slate-700 space-y-1" {...props} />,
                        }}
                      >
                        {msg.text}
                      </ReactMarkdown>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 shadow-sm rounded-2xl rounded-bl-sm p-6 flex items-center gap-3">
                <span className="text-lg leading-none mr-2">✨</span>
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Chat Input Area */}
        <div className="p-6 bg-white border-t border-slate-200 flex flex-col items-center">
          <form onSubmit={handleSubmit} className="flex gap-3 w-full relative">
            <input 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask for site counts, lease analysis, or to draw a chart..."
              className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent block p-4 pr-16 outline-none transition-all shadow-inner placeholder-slate-400"
            />
            <button 
              type="submit"
              disabled={!input.trim() || isLoading}
              className="absolute right-2 top-2 bottom-2 aspect-square bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg flex items-center justify-center transition-colors shadow-sm"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            </button>
          </form>

          {/* Recent Prompts Log */}
          {recentPrompts.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 w-full justify-start items-center">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mr-1">Recent:</span>
              {recentPrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setInput(prompt)}
                  className="text-[11px] bg-slate-50 border border-slate-200 text-slate-600 px-3 py-1.5 rounded-full hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-colors truncate max-w-[300px]"
                  title={prompt}
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          <p className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-5">
            Powered by Gemini AI • Responses are dynamically generated based on live database records
          </p>
        </div>

      </div>
    </div>
  );
}