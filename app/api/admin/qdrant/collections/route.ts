/**
 * Qdrant Collections API
 * Returns information about all collections in the vector database
 */

import { NextResponse } from 'next/server';
import { getQdrantService } from '../../../../../lib/vector/qdrant-service';

// Force Node.js runtime for Prisma compatibility
export const runtime = 'nodejs';

export async function GET() {
    try {
        const qdrant = getQdrantService();

        // Get all collections info
        const collectionsInfo = await qdrant.getAllCollectionsInfo();

        // Convert to array format for easier handling
        const collections = Object.entries(collectionsInfo).map(([name, info]) => ({
            name,
            vectorsCount: info.vectorsCount,
            indexedVectorsCount: info.indexedVectorsCount,
            pointsCount: info.pointsCount,
            segmentsCount: info.segmentsCount,
            status: info.status,
            optimizerStatus: info.optimizerStatus
        }));

        return NextResponse.json(collections);

    } catch (error) {
        console.error('Failed to fetch collections:', error);
        return NextResponse.json(
            { error: 'Failed to fetch collections' },
            { status: 500 }
        );
    }
}
