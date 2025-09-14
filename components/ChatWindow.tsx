"use client";

import { type Message } from "ai";
import { useChat } from "ai/react";
import { useState, useEffect } from "react";
import type { FormEvent, ReactNode } from "react";
import { toast } from "sonner";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";

import { ChatMessageBubble } from "@/components/ChatMessageBubble";
import { IntermediateStep } from "./IntermediateStep";
import { Button } from "./ui/button";
import { ArrowDown, LoaderCircle, Paperclip, Brain, Search, FileText } from "lucide-react";
import { Checkbox } from "./ui/checkbox";
import { UploadDocumentsForm } from "./UploadDocumentsForm";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";
import { Skeleton } from "./ui/skeleton";
import { cn } from "@/utils/cn";

interface ReasoningStep {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  icon: any;
  description: string;
  timestamp?: Date;
}

function ReasoningProgress({ steps, currentStep }: { steps: ReasoningStep[], currentStep: string }) {
  return (
    <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg">
      <div className="flex items-center gap-2 mb-3">
        <Brain className="w-5 h-5 text-blue-600" />
        <h3 className="font-medium text-blue-900">Doctor GPT is thinking...</h3>
      </div>
      
      <div className="space-y-3">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isActive = step.id === currentStep;
          const isCompleted = step.status === 'completed';
          const isError = step.status === 'error';
          
          return (
            <div key={step.id} className="flex items-center gap-3">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center",
                isCompleted ? "bg-green-100 text-green-600" :
                isActive ? "bg-blue-100 text-blue-600 animate-pulse" :
                isError ? "bg-red-100 text-red-600" :
                "bg-gray-100 text-gray-400"
              )}>
                {isCompleted ? "✓" : 
                 isError ? "✗" :
                 isActive ? <Icon className="w-4 h-4" /> :
                 <Icon className="w-4 h-4" />}
              </div>
              
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "font-medium text-sm",
                    isCompleted ? "text-green-700" :
                    isActive ? "text-blue-700" :
                    isError ? "text-red-700" :
                    "text-gray-500"
                  )}>
                    {step.name}
                  </span>
                  {isActive && (
                    <Badge variant="secondary" className="text-xs">
                      Processing
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-gray-600">{step.description}</p>
              </div>
              
              {isActive && (
                <div className="w-16">
                  <Progress value={Math.random() * 100} className="h-1" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChatMessages(props: {
  messages: Message[];
  emptyStateComponent: ReactNode;
  sourcesForMessages: Record<string, any>;
  aiEmoji?: string;
  className?: string;
}) {
  return (
    <div className="flex flex-col max-w-[768px] mx-auto pb-12 w-full">
      {props.messages.map((m, i) => {
        if (m.role === "system") {
          return <IntermediateStep key={m.id} message={m} />;
        }

        const sourceKey = (props.messages.length - 1 - i).toString();
        return (
          <ChatMessageBubble
            key={m.id}
            message={m}
            aiEmoji={props.aiEmoji}
            sources={props.sourcesForMessages[sourceKey]}
          />
        );
      })}
    </div>
  );
}

export function ChatInput(props: {
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onStop?: () => void;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  loading?: boolean;
  placeholder?: string;
  children?: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  const disabled = props.loading && props.onStop == null;
  return (
    <form
      onSubmit={(e) => {
        e.stopPropagation();
        e.preventDefault();

        if (props.loading) {
          props.onStop?.();
        } else {
          props.onSubmit(e);
        }
      }}
      className={cn("flex w-full flex-col", props.className)}
    >
      <div className="border border-input bg-secondary rounded-lg flex flex-col gap-2 max-w-[768px] w-full mx-auto">
        <input
          value={props.value}
          placeholder={props.placeholder}
          onChange={props.onChange}
          className="border-none outline-none bg-transparent p-4"
        />

        <div className="flex justify-between ml-4 mr-2 mb-2">
          <div className="flex gap-3">{props.children}</div>

          <div className="flex gap-2 self-end">
            {props.actions}
            <Button type="submit" className="self-end" disabled={disabled}>
              {props.loading ? (
                <span role="status" className="flex justify-center">
                  <LoaderCircle className="animate-spin" />
                  <span className="sr-only">Loading...</span>
                </span>
              ) : (
                <span>Send</span>
              )}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

function ScrollToBottom(props: { className?: string }) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  if (isAtBottom) return null;
  return (
    <Button
      variant="outline"
      className={props.className}
      onClick={() => scrollToBottom()}
    >
      <ArrowDown className="w-4 h-4" />
      <span>Scroll to bottom</span>
    </Button>
  );
}

function StickyToBottomContent(props: {
  content: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const context = useStickToBottomContext();

  // scrollRef will also switch between overflow: unset to overflow: auto
  return (
    <div
      ref={context.scrollRef}
      style={{ width: "100%", height: "100%" }}
      className={cn("grid grid-rows-[1fr,auto]", props.className)}
    >
      <div ref={context.contentRef} className={props.contentClassName}>
        {props.content}
      </div>

      {props.footer}
    </div>
  );
}

export function ChatLayout(props: { content: ReactNode; footer: ReactNode }) {
  return (
    <StickToBottom>
      <StickyToBottomContent
        className="absolute inset-0"
        contentClassName="py-8 px-2"
        content={props.content}
        footer={
          <div className="sticky bottom-8 px-2">
            <ScrollToBottom className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4" />
            {props.footer}
          </div>
        }
      />
    </StickToBottom>
  );
}

export function ChatWindow(props: {
  endpoint: string;
  emptyStateComponent: ReactNode;
  placeholder?: string;
  emoji?: string;
  showIngestForm?: boolean;
  showIntermediateStepsToggle?: boolean;
}) {
  const [showIntermediateSteps, setShowIntermediateSteps] = useState(
    !!props.showIntermediateStepsToggle,
  );
  const [intermediateStepsLoading, setIntermediateStepsLoading] =
    useState(false);

  const [sourcesForMessages, setSourcesForMessages] = useState<
    Record<string, any>
  >({});

  const [uploadedDocuments, setUploadedDocuments] = useState<any[]>([]);
  const [sessionId] = useState(() => 'session-' + Date.now());
  const [userId] = useState(() => 'user-' + Date.now());
  
  // Reasoning progress state
  const [reasoningSteps, setReasoningSteps] = useState<ReasoningStep[]>([
    { id: 'query_analysis', name: 'Query Analysis', status: 'pending', icon: Brain, description: 'Analyzing your medical question' },
    { id: 'document_retrieval', name: 'Document Retrieval', status: 'pending', icon: FileText, description: 'Searching uploaded documents' },
    { id: 'web_search', name: 'Medical Research', status: 'pending', icon: Search, description: 'Gathering medical knowledge' },
    { id: 'reasoning', name: 'Medical Reasoning', status: 'pending', icon: Brain, description: 'Generating evidence-based response' },
  ]);
  const [currentReasoningStep, setCurrentReasoningStep] = useState<string>('');
  const [showReasoning, setShowReasoning] = useState(false);
  const [hasActiveQuery, setHasActiveQuery] = useState(false);

  const chat = useChat({
    api: props.endpoint,
    body: {
      sessionId,
      userId,
      uploadedDocuments: uploadedDocuments.length > 0 ? uploadedDocuments : undefined,
    },
    onResponse(response) {
      const sourcesHeader = response.headers.get("x-sources");
      const sources = sourcesHeader
        ? JSON.parse(Buffer.from(sourcesHeader, "base64").toString("utf8"))
        : [];

      const messageIndexHeader = response.headers.get("x-message-index");
      if (sources.length && messageIndexHeader !== null) {
        setSourcesForMessages({
          ...sourcesForMessages,
          [messageIndexHeader]: sources,
        });
      }
    },
    streamMode: "text",
    onError: (e) => {
      console.error('Chat error:', e);
      setShowReasoning(false);
      setHasActiveQuery(false);
      toast.error(`Error while processing your request`, {
        description: e.message,
      });
    },
  });

  // SSE event handling for real-time reasoning updates
  useEffect(() => {
    // Only show reasoning for medical queries and when actually loading
    if (!chat.isLoading || !props.endpoint.includes('doctor-gpt') || !hasActiveQuery) {
      setShowReasoning(false);
      return;
    }
    
    // Reset reasoning steps when starting a new request
    setReasoningSteps(prev => prev.map(step => ({ ...step, status: 'pending' as const })));
    setCurrentReasoningStep('');
    setShowReasoning(true);
    
    // Connect to SSE endpoint for real-time updates
    const eventSource = new EventSource(`/api/chat/doctor-gpt/events?sessionId=${sessionId}`);
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'step_start':
            setCurrentReasoningStep(data.step);
            setReasoningSteps(prev => prev.map(step => 
              step.id === data.step 
                ? { ...step, status: 'processing' as const }
                : step
            ));
            break;
            
          case 'step_complete':
            setReasoningSteps(prev => prev.map(step => 
              step.id === data.step 
                ? { ...step, status: 'completed' as const }
                : step
            ));
            break;
            
          case 'complete':
            setShowReasoning(false);
            setHasActiveQuery(false);
            setReasoningSteps(prev => prev.map(step => ({ ...step, status: 'completed' as const })));
            break;
            
          case 'error':
            setReasoningSteps(prev => prev.map(step => 
              step.id === data.step 
                ? { ...step, status: 'error' as const }
                : step
            ));
            break;
        }
      } catch (error) {
        console.error('Failed to parse SSE event:', error);
      }
    };
    
    eventSource.onerror = () => {
      console.warn('SSE connection error, falling back to simulation');
      eventSource.close();
      
      // Fallback to simulated progress
      const simulateProgress = () => {
        const steps = ['query_analysis', 'document_retrieval', 'web_search', 'reasoning'];
        let currentIndex = 0;
        
        const interval = setInterval(() => {
          if (currentIndex < steps.length) {
            const stepId = steps[currentIndex];
            setCurrentReasoningStep(stepId);
            
            setReasoningSteps(prev => prev.map(step => 
              step.id === stepId 
                ? { ...step, status: 'processing' as const }
                : step.status === 'processing' 
                  ? { ...step, status: 'completed' as const }
                  : step
            ));
            
            currentIndex++;
          } else {
            clearInterval(interval);
            setShowReasoning(false);
            setHasActiveQuery(false);
            setReasoningSteps(prev => prev.map(step => ({ ...step, status: 'completed' as const })));
          }
        }, 1500);
        
        return interval;
      };
      
      const interval = simulateProgress();
      return () => clearInterval(interval);
    };
    
    return () => {
      eventSource.close();
    };
  }, [chat.isLoading, sessionId, props.endpoint, hasActiveQuery]);

  // Cleanup effect to reset reasoning state
  useEffect(() => {
    if (!chat.isLoading && !hasActiveQuery) {
      setShowReasoning(false);
      setCurrentReasoningStep('');
    }
  }, [chat.isLoading, hasActiveQuery]);

  async function sendMessage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (chat.isLoading || intermediateStepsLoading) return;

    // Set active query flag when user sends a message
    setHasActiveQuery(true);

    if (!showIntermediateSteps) {
      // For regular chat, also show reasoning for medical queries
      if (props.endpoint.includes('doctor-gpt')) {
        setShowReasoning(true);
        setReasoningSteps(prev => prev.map(step => ({ ...step, status: 'pending' as const })));
      }
      chat.handleSubmit(e);
      return;
    }

    // Some extra work to show intermediate steps properly
    setIntermediateStepsLoading(true);
    setShowReasoning(true);

    chat.setInput("");
    const messagesWithUserReply = chat.messages.concat({
      id: chat.messages.length.toString(),
      content: chat.input,
      role: "user",
    });
    chat.setMessages(messagesWithUserReply);

    const response = await fetch(props.endpoint, {
      method: "POST",
      body: JSON.stringify({
        messages: messagesWithUserReply,
        show_intermediate_steps: true,
        sessionId,
        userId,
        uploadedDocuments: uploadedDocuments.length > 0 ? uploadedDocuments : undefined,
      }),
    });
    
    let json: any;
    try {
      json = await response.json();
    } catch (parseError) {
      console.error('Failed to parse response JSON:', parseError);
      toast.error(`Error parsing response from server`);
      setIntermediateStepsLoading(false);
      return;
    }
    
    setIntermediateStepsLoading(false);

    if (!response.ok) {
      toast.error(`Error while processing your request`, {
        description: json.error || 'Unknown server error',
      });
      return;
    }

    const responseMessages: Message[] = Array.isArray(json.messages) ? json.messages : [];

    // Represent intermediate steps as system messages for display purposes
    // TODO: Add proper support for tool messages
    const toolCallMessages = responseMessages.filter(
      (responseMessage: Message) => {
        return (
          (responseMessage.role === "assistant" &&
            !!responseMessage.tool_calls?.length) ||
          responseMessage.role === "tool"
        );
      },
    );

    const intermediateStepMessages = [];
    for (let i = 0; i < toolCallMessages.length; i += 2) {
      const aiMessage = toolCallMessages[i];
      const toolMessage = toolCallMessages[i + 1];
      intermediateStepMessages.push({
        id: (messagesWithUserReply.length + i / 2).toString(),
        role: "system" as const,
        content: JSON.stringify({
          action: aiMessage.tool_calls?.[0],
          observation: toolMessage.content,
        }),
      });
    }
    const newMessages = messagesWithUserReply;
    for (const message of intermediateStepMessages) {
      newMessages.push(message);
      chat.setMessages([...newMessages]);
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 + Math.random() * 1000),
      );
    }

    // Ensure we have a valid response message
    const lastResponseMessage = responseMessages[responseMessages.length - 1];
    const responseContent = lastResponseMessage?.content || 
                           json.response || 
                           'I apologize, but I encountered an issue processing your request. Please try again.';

    // Only add the assistant message if we have valid content
    if (responseContent && responseContent.trim().length > 0) {
      chat.setMessages([
        ...newMessages,
        {
          id: newMessages.length.toString(),
          content: responseContent,
          role: "assistant",
        },
      ]);
    } else {
      // If no valid response, show error message
      chat.setMessages([
        ...newMessages,
        {
          id: newMessages.length.toString(),
          content: 'I apologize, but I was unable to generate a proper response. Please try rephrasing your question or try again later.',
          role: "assistant",
        },
      ]);
    }
  }

  return (
    <ChatLayout
      content={
        <>
 
          
          {chat.messages.length === 0 ? (
            <div>
              {props.emptyStateComponent}
              {uploadedDocuments.length > 0 && (
                <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h3 className="font-medium text-blue-900 mb-2">📚 Uploaded Documents</h3>
                  <div className="space-y-2">
                    {uploadedDocuments.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between p-2 bg-white rounded border">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{doc.fileName}</p>
                          <p className="text-xs text-gray-500">{doc.reportType}</p>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          Ready
                        </Badge>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-blue-700 mt-2">
                    💡 You can now ask questions about these documents!
                  </p>
                </div>
              )}
            </div>
          ) : (
            <>
              <ChatMessages
                aiEmoji={props.emoji}
                messages={chat.messages}
                emptyStateComponent={props.emptyStateComponent}
                sourcesForMessages={sourcesForMessages}
              />
              
              {/* Show uploaded documents in chat area too */}
              {uploadedDocuments.length > 0 && chat.messages.length > 0 && (
                <div className="max-w-[768px] mx-auto mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span className="font-medium text-blue-900 text-sm">
                      Reference Documents ({uploadedDocuments.length})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {uploadedDocuments.map((doc) => (
                      <Badge key={doc.id} variant="secondary" className="text-xs">
                        {doc.fileName}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      }
      footer={
        <ChatInput
          value={chat.input}
          onChange={chat.handleInputChange}
          onSubmit={sendMessage}
          loading={chat.isLoading || intermediateStepsLoading}
          placeholder={props.placeholder ?? "What's it like to be a pirate?"}
        >
          {props.showIngestForm && (
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  className="pl-2 pr-3 -ml-2"
                >
                  <Paperclip className="size-4" />
                  <span>Upload document</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Upload document</DialogTitle>
                  <DialogDescription>
                    Upload a document to use for the chat.
                  </DialogDescription>
                </DialogHeader>
                <UploadDocumentsForm 
                  sessionId={sessionId}
                  userId={userId}
                  onDocumentUploaded={(doc) => {
                    setUploadedDocuments(prev => [...prev, doc]);
                    toast.success("Document uploaded successfully! You can now ask questions about it.");
                  }}
                />
              </DialogContent>
            </Dialog>
          )}

          {props.showIntermediateStepsToggle && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="show_intermediate_steps"
                name="show_intermediate_steps"
                checked={showIntermediateSteps}
                disabled={chat.isLoading || intermediateStepsLoading}
                onCheckedChange={(e) => setShowIntermediateSteps(!!e)}
              />
              <label htmlFor="show_intermediate_steps" className="text-sm">
                Show intermediate steps
              </label>
            </div>
          )}
        </ChatInput>
      }
    />
  );
}
