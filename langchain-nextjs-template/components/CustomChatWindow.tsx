"use client";

import { type Message } from "ai";
import { useState, useEffect, useRef } from "react";
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

interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
}

interface UploadedDocument {
  id: string;
  fileName: string;
  content: string;
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
            <div key={step.id} className={cn(
              "flex items-center gap-3 p-3 rounded-lg transition-all duration-200",
              isActive && "bg-blue-100 ring-2 ring-blue-300",
              isCompleted && "bg-green-50",
              isError && "bg-red-50"
            )}>
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center",
                isActive && "bg-blue-500 text-white animate-pulse",
                isCompleted && "bg-green-500 text-white",
                isError && "bg-red-500 text-white",
                !isActive && !isCompleted && !isError && "bg-gray-200 text-gray-500"
              )}>
                {isCompleted ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : isError ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <Icon className="w-4 h-4" />
                )}
              </div>
              
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "font-medium",
                    isActive && "text-blue-900",
                    isCompleted && "text-green-900",
                    isError && "text-red-900"
                  )}>
                    {step.name}
                  </span>
                  {isActive && (
                    <div className="flex space-x-1">
                      <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  )}
                </div>
                <p className={cn(
                  "text-sm",
                  isActive && "text-blue-700",
                  isCompleted && "text-green-700",
                  isError && "text-red-700",
                  !isActive && !isCompleted && !isError && "text-gray-600"
                )}>
                  {step.description}
                </p>
                {step.timestamp && (
                  <p className="text-xs text-gray-500 mt-1">
                    {step.timestamp.toLocaleTimeString()}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StickyToBottomContent(props: {
  content: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const context = useStickToBottomContext();

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
            {props.footer}
          </div>
        }
      />
    </StickToBottom>
  );
}

export function CustomChatWindow(props: {
  endpoint: string;
  emptyStateComponent: ReactNode;
  placeholder?: string;
  emoji?: string;
  showIngestForm?: boolean;
  showIntermediateStepsToggle?: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedDocument[]>([]);
  const [sourcesForMessages, setSourcesForMessages] = useState<Record<string, any>>({});
  const [showIntermediateSteps, setShowIntermediateSteps] = useState(false);
  
  // Generate consistent session and user IDs using UUID format
  const [sessionId] = useState(() => crypto.randomUUID());
  const [userId] = useState(() => crypto.randomUUID());

  // Reasoning state
  const [reasoningSteps, setReasoningSteps] = useState<ReasoningStep[]>([
    { id: 'intake', name: 'Analyzing Query', status: 'pending', icon: Search, description: 'Understanding your medical question' },
    { id: 'retrieval', name: 'Knowledge Retrieval', status: 'pending', icon: FileText, description: 'Searching medical databases and documents' },
    { id: 'reasoning', name: 'Medical Reasoning', status: 'pending', icon: Brain, description: 'Generating evidence-based response' },
  ]);
  const [currentReasoningStep, setCurrentReasoningStep] = useState<string>('');
  const [showReasoning, setShowReasoning] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      content: input.trim(),
      role: 'user'
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setShowReasoning(true);

    // Reset reasoning steps
    setReasoningSteps(prev => prev.map(step => ({ ...step, status: 'pending' as const })));
    setCurrentReasoningStep('intake');

    try {
      const requestBody = {
        messages: [userMessage],
        userId,
        sessionId,
        uploadedDocuments: uploadedDocuments.length > 0 ? uploadedDocuments : undefined,
        show_intermediate_steps: showIntermediateSteps,
        options: {
          enableMultiModel: true,
          enableWebSearch: false,
          enableCitations: true
        }
      };

      console.log('Sending request to:', props.endpoint);
      console.log('Request body:', JSON.stringify(requestBody, null, 2));

      const response = await fetch(props.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', response.headers);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`Server error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('Response result:', result);

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        content: result.response || 'I apologize, but I encountered an issue processing your request.',
        role: 'assistant'
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Update reasoning steps to completed
      setReasoningSteps(prev => prev.map(step => ({ ...step, status: 'completed' as const })));

    } catch (error) {
      console.error('Chat error:', error);
      
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        content: 'I apologize, but I encountered an error processing your request. Please try again.',
        role: 'assistant'
      };

      setMessages(prev => [...prev, errorMessage]);
      
      toast.error('Error processing your request', {
        description: error instanceof Error ? error.message : 'Unknown error occurred'
      });

      // Mark current step as error
      setReasoningSteps(prev => prev.map(step => 
        step.id === currentReasoningStep 
          ? { ...step, status: 'error' as const } 
          : step
      ));
    } finally {
      setIsLoading(false);
      setShowReasoning(false);
    }
  };

  const handleUploadedDocument = (doc: UploadedDocument) => {
    setUploadedDocuments(prev => [...prev, doc]);
    toast.success(`Document "${doc.fileName}" uploaded successfully!`);
  };

  return (
    <ChatLayout
      content={
        <div className="flex flex-col gap-4 max-w-5xl mx-auto">
          {messages.length === 0 ? (
            <>
              {props.emptyStateComponent}
              {props.showIngestForm && (
                <UploadDocumentsForm 
                  onDocumentUploaded={handleUploadedDocument}
                  sessionId={sessionId}
                  userId={userId}
                />
              )}
            </>
          ) : (
            <>
              {/* Show uploaded documents */}
              {uploadedDocuments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="text-sm font-medium text-gray-600">Uploaded documents:</span>
                  {uploadedDocuments.map((doc) => (
                    <Badge key={doc.id} variant="secondary" className="flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      {doc.fileName}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Show reasoning progress if active */}
              {showReasoning && (
                <ReasoningProgress steps={reasoningSteps} currentStep={currentReasoningStep} />
              )}

              {/* Chat messages */}
              {messages.map((message, index) => (
                <ChatMessageBubble
                  key={message.id}
                  message={message}
                  sources={sourcesForMessages[index.toString()] || []}
                  className={message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100'}
                />
              ))}

              {/* Loading indicator */}
              {isLoading && !showReasoning && (
                <div className="flex items-center gap-2 text-gray-500">
                  <LoaderCircle className="w-4 h-4 animate-spin" />
                  <span>Doctor GPT is thinking...</span>
                </div>
              )}
            </>
          )}
        </div>
      }
      footer={
        <div className="w-full max-w-5xl mx-auto">
          {/* Controls */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-4">
              {props.showIntermediateStepsToggle && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="show-intermediate-steps"
                    checked={showIntermediateSteps}
                    onCheckedChange={(checked) => setShowIntermediateSteps(!!checked)}
                  />
                  <label
                    htmlFor="show-intermediate-steps"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Show reasoning steps
                  </label>
                </div>
              )}
            </div>

            {props.showIngestForm && messages.length > 0 && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Paperclip className="w-4 h-4 mr-2" />
                    Upload Document
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Upload Medical Document</DialogTitle>
                    <DialogDescription>
                      Upload a medical document to enhance the AI's analysis.
                    </DialogDescription>
                  </DialogHeader>
                  <UploadDocumentsForm 
                    onDocumentUploaded={handleUploadedDocument}
                    sessionId={sessionId}
                    userId={userId}
                  />
                </DialogContent>
              </Dialog>
            )}
          </div>

          {/* Chat input */}
          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <div className="flex-1">
              <textarea
                className="w-full p-3 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={props.placeholder || "Type your message..."}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={1}
                style={{ minHeight: '44px', maxHeight: '120px' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e as any);
                  }
                }}
                disabled={isLoading}
              />
            </div>
            <Button 
              type="submit" 
              disabled={!input.trim() || isLoading}
              className="px-6"
            >
              {isLoading ? (
                <LoaderCircle className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  {props.emoji && <span className="mr-2">{props.emoji}</span>}
                  Send
                </>
              )}
            </Button>
          </form>
        </div>
      }
    />
  );
}
