/**
 * Server-Sent Events endpoint for real-time workflow updates
 * Provides streaming updates during Doctor GPT workflow execution
 */

import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

interface WorkflowEvent {
    type: 'progress' | 'step_start' | 'step_complete' | 'error' | 'complete';
    step?: string;
    message?: string;
    progress?: number;
    timestamp: string;
    sessionId: string;
}

// Store active SSE connections
const activeConnections = new Map<string, WritableStreamDefaultWriter>();

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
        return new Response('Missing sessionId parameter', { status: 400 });
    }

    // Create SSE stream
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        start(controller) {
            const writer = controller;

            // Store connection for this session
            activeConnections.set(sessionId, writer as any);

            // Send initial connection event
            const initialEvent: WorkflowEvent = {
                type: 'progress',
                message: 'Connected to Doctor GPT workflow stream',
                progress: 0,
                timestamp: new Date().toISOString(),
                sessionId
            };

            const data = `data: ${JSON.stringify(initialEvent)}\n\n`;
            writer.enqueue(encoder.encode(data));

            // Clean up on close
            req.signal.addEventListener('abort', () => {
                activeConnections.delete(sessionId);
                try {
                    writer.close();
                } catch (e) {
                    // Connection may already be closed
                }
            });
        },

        cancel() {
            activeConnections.delete(sessionId);
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Cache-Control',
        },
    });
}

/**
 * Send workflow update to connected clients
 */
export function sendWorkflowUpdate(sessionId: string, event: Omit<WorkflowEvent, 'timestamp' | 'sessionId'>) {
    const connection = activeConnections.get(sessionId);
    if (!connection) return;

    const workflowEvent: WorkflowEvent = {
        ...event,
        timestamp: new Date().toISOString(),
        sessionId
    };

    try {
        const encoder = new TextEncoder();
        const data = `data: ${JSON.stringify(workflowEvent)}\n\n`;
        (connection as any).enqueue(encoder.encode(data));
    } catch (error) {
        console.error('Failed to send SSE update:', error);
        activeConnections.delete(sessionId);
    }
}

/**
 * Send workflow step progress
 */
export function sendWorkflowProgress(sessionId: string, step: string, progress: number, message?: string) {
    sendWorkflowUpdate(sessionId, {
        type: 'progress',
        step,
        message: message || `Processing ${step}...`,
        progress
    });
}

/**
 * Send workflow step start
 */
export function sendWorkflowStepStart(sessionId: string, step: string, message?: string) {
    sendWorkflowUpdate(sessionId, {
        type: 'step_start',
        step,
        message: message || `Starting ${step}`,
        progress: 0
    });
}

/**
 * Send workflow step complete
 */
export function sendWorkflowStepComplete(sessionId: string, step: string, message?: string) {
    sendWorkflowUpdate(sessionId, {
        type: 'step_complete',
        step,
        message: message || `Completed ${step}`,
        progress: 100
    });
}

/**
 * Send workflow error
 */
export function sendWorkflowError(sessionId: string, error: string, step?: string) {
    sendWorkflowUpdate(sessionId, {
        type: 'error',
        step,
        message: error
    });
}

/**
 * Send workflow completion
 */
export function sendWorkflowComplete(sessionId: string, message?: string) {
    sendWorkflowUpdate(sessionId, {
        type: 'complete',
        message: message || 'Workflow completed successfully',
        progress: 100
    });
}
