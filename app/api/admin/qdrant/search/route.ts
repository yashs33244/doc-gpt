/**
 * Qdrant Vector Search API
 * Performs vector search across collections
 */

import { NextRequest, NextResponse } from 'next/server';

// Force Node.js runtime for Prisma compatibility
export const runtime = 'nodejs';
import { getQdrantService } from '../../../../../lib/vector/qdrant-service';

export async function POST(req: NextRequest) {
    try {
        const { query, collection, limit = 10 } = await req.json();

        if (!query) {
            return NextResponse.json(
                { error: 'Query is required' },
                { status: 400 }
            );
        }

        const qdrant = getQdrantService();

        // Generate a mock embedding for the query
        // In production, you'd use OpenAI embeddings API
        const mockEmbedding = Array.from({ length: 1536 }, () => Math.random() - 0.5);

        let results = [];

        if (collection === 'knowledge') {
            results = await qdrant.searchKnowledge(mockEmbedding, {
                limit,
                scoreThreshold: 0.5
            });
        } else if (collection === 'sessions') {
            results = await qdrant.searchSessions(mockEmbedding, 'admin-user', {
                limit,
                scoreThreshold: 0.5
            });
        } else if (collection === 'documents') {
            results = await qdrant.searchDocuments(mockEmbedding, 'admin-user', {
                limit,
                scoreThreshold: 0.5
            });
        } else if (collection === 'files') {
            results = await qdrant.searchFiles(mockEmbedding, 'admin-session', {
                limit,
                scoreThreshold: 0.5
            });
        } else {
            return NextResponse.json(
                { error: 'Invalid collection name' },
                { status: 400 }
            );
        }

        return NextResponse.json({
            query,
            collection,
            results: results.map(result => ({
                id: result.id,
                score: result.score,
                payload: result.payload
            }))
        });

    } catch (error) {
        console.error('Vector search failed:', error);
        return NextResponse.json(
            { error: 'Search failed' },
            { status: 500 }
        );
    }
}
