/**
 * Qdrant Vector Database Service
 * 
 * Handles all vector operations including embeddings storage,
 * similarity search, and collection management
 * Follows SOLID principles and clean architecture patterns
 */

import { QdrantClient } from '@qdrant/js-client-rest';

// Types for better type safety
export interface VectorDocument {
    id: string;
    vector: number[];
    payload: {
        content: string;
        title?: string;
        type: 'session' | 'document' | 'knowledge' | 'file';
        userId?: string;
        sessionId?: string;
        category?: string;
        tags?: string[];
        metadata?: Record<string, any>;
        createdAt: string;
        updatedAt: string;
    };
}

export interface SearchResult {
    id: string;
    score: number;
    payload: VectorDocument['payload'];
}

export interface SearchParams {
    vector: number[];
    limit?: number;
    scoreThreshold?: number;
    filter?: Record<string, any>;
    withPayload?: boolean;
    withVector?: boolean;
}

export interface CollectionInfo {
    name: string;
    vectorsCount: number;
    indexedVectorsCount: number;
    pointsCount: number;
    segmentsCount: number;
    status: string;
    optimizerStatus: string;
    payloadSchema: Record<string, any>;
}

export class QdrantService {
    private client: QdrantClient;
    private collections: {
        sessions: string;
        documents: string;
        knowledge: string;
        files: string;
    };

    constructor(url: string = 'http://localhost:6333') {
        this.client = new QdrantClient({
            url,
            checkCompatibility: false // Disable version compatibility check
        });
        this.collections = {
            sessions: 'sessions',
            documents: 'documents',
            knowledge: 'knowledge',
            files: 'files',
        };
    }

    /**
     * Initialize all collections with proper configuration
     */
    async initializeCollections(): Promise<void> {
        try {
            const collections = Object.values(this.collections);

            for (const collectionName of collections) {
                await this.createCollectionIfNotExists(collectionName);
            }

            console.log('✅ Qdrant collections initialized successfully');
        } catch (error) {
            throw new Error(`Failed to initialize Qdrant collections: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Create collection if it doesn't exist
     */
    private async createCollectionIfNotExists(collectionName: string): Promise<void> {
        try {
            let exists = false;
            try {
                const result = await this.client.collectionExists(collectionName);
                exists = result.exists || false;
            } catch (error) {
                // If collection doesn't exist, collectionExists throws an error
                exists = false;
            }

            if (!exists) {
                try {
                    await this.client.createCollection(collectionName, {
                        vectors: {
                            size: 1536, // OpenAI embedding dimension
                            distance: 'Cosine', // Best for semantic similarity
                        },
                        optimizers_config: {
                            default_segment_number: 2,
                        },
                        replication_factor: 1,
                    });
                } catch (createError: any) {
                    // If collection already exists, that's fine
                    if (createError.message?.includes('Bad Request') || createError.status === 400) {
                        console.log(`✅ Collection '${collectionName}' already exists`);
                        return;
                    }
                    throw createError;
                }

                // Create payload index for better filtering performance
                try {
                    await this.client.createPayloadIndex(collectionName, {
                        field_name: 'type',
                        field_schema: 'keyword',
                    });

                    await this.client.createPayloadIndex(collectionName, {
                        field_name: 'userId',
                        field_schema: 'keyword',
                    });

                    await this.client.createPayloadIndex(collectionName, {
                        field_name: 'sessionId',
                        field_schema: 'keyword',
                    });

                    await this.client.createPayloadIndex(collectionName, {
                        field_name: 'category',
                        field_schema: 'keyword',
                    });

                    await this.client.createPayloadIndex(collectionName, {
                        field_name: 'tags',
                        field_schema: 'keyword',
                    });
                } catch (indexError) {
                    // Indexes might already exist, continue
                    console.log(`⚠️  Some indexes for '${collectionName}' may already exist`);
                }

                console.log(`✅ Collection '${collectionName}' created with indexes`);
            } else {
                console.log(`✅ Collection '${collectionName}' already exists`);
            }
        } catch (error) {
            throw new Error(`Failed to create collection ${collectionName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Store session vector
     */
    async storeSessionVector(
        sessionId: string,
        vector: number[],
        payload: {
            content: string;
            title?: string;
            userId: string;
            category?: string;
            tags?: string[];
            metadata?: Record<string, any>;
        }
    ): Promise<void> {
        try {
            const document: VectorDocument = {
                id: sessionId,
                vector,
                payload: {
                    ...payload,
                    type: 'session',
                    sessionId,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
            };

            await this.client.upsert(this.collections.sessions, {
                wait: true,
                points: [document],
            });
        } catch (error) {
            throw new Error(`Failed to store session vector: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Store document vector
     */
    async storeDocumentVector(
        documentId: string,
        vector: number[],
        payload: {
            content: string;
            title: string;
            userId: string;
            category?: string;
            tags?: string[];
            metadata?: Record<string, any>;
        }
    ): Promise<void> {
        try {
            const document: VectorDocument = {
                id: documentId,
                vector,
                payload: {
                    ...payload,
                    type: 'document',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
            };

            await this.client.upsert(this.collections.documents, {
                wait: true,
                points: [document],
            });
        } catch (error) {
            throw new Error(`Failed to store document vector: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Store knowledge vector
     */
    async storeKnowledgeVector(
        knowledgeId: string,
        vector: number[],
        payload: {
            content: string;
            title: string;
            category: string;
            source: string;
            tags?: string[];
            trustScore?: number;
            metadata?: Record<string, any>;
        }
    ): Promise<void> {
        try {
            const document: VectorDocument = {
                id: knowledgeId,
                vector,
                payload: {
                    ...payload,
                    type: 'knowledge',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
            };

            await this.client.upsert(this.collections.knowledge, {
                wait: true,
                points: [document],
            });
        } catch (error) {
            throw new Error(`Failed to store knowledge vector: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Store file vector
     */
    async storeFileVector(
        fileId: string,
        vector: number[],
        payload: {
            content: string;
            title: string;
            sessionId: string;
            userId: string;
            fileType: string;
            tags?: string[];
            metadata?: Record<string, any>;
        }
    ): Promise<void> {
        try {
            // Validate inputs
            if (!fileId || typeof fileId !== 'string') {
                throw new Error('Invalid fileId provided');
            }

            if (!Array.isArray(vector) || vector.length !== 1536) {
                throw new Error(`Invalid vector dimensions: expected 1536, got ${vector?.length || 'undefined'}`);
            }

            // Ensure all required payload fields are strings and not undefined
            const cleanPayload = {
                content: String(payload.content || '').substring(0, 1000),
                title: String(payload.title || 'Untitled').substring(0, 100),
                type: 'file',
                sessionId: String(payload.sessionId || 'unknown').substring(0, 64),
                userId: String(payload.userId || 'unknown').substring(0, 32),
                fileType: String(payload.fileType || 'unknown').substring(0, 32),
                tags: Array.isArray(payload.tags) ? payload.tags.slice(0, 5).map(tag => String(tag).substring(0, 32)) : [],
                metadata: payload.metadata || {},
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            const point = {
                id: fileId,
                vector: vector,
                payload: cleanPayload
            };

            console.log(`Storing vector for ${fileId} with ${vector.length} dimensions`);

            await this.client.upsert(this.collections.files, {
                wait: true,
                points: [point],
            });

            console.log(`✅ Successfully stored vector in Qdrant for ${fileId}`);
        } catch (error: any) {
            console.error('Qdrant storage error details:', {
                fileId,
                vectorLength: vector?.length,
                errorMessage: error.message,
                errorStack: error.stack
            });
            throw new Error(`Failed to store file vector: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Search sessions by vector similarity
     */
    async searchSessions(
        queryVector: number[],
        userId: string,
        params: {
            limit?: number;
            scoreThreshold?: number;
            category?: string;
            tags?: string[];
        } = {}
    ): Promise<SearchResult[]> {
        try {
            const {
                limit = 10,
                scoreThreshold = 0.7,
                category,
                tags = [],
            } = params;

            const filter: Record<string, any> = {
                must: [
                    {
                        key: 'type',
                        match: { value: 'session' },
                    },
                    {
                        key: 'userId',
                        match: { value: userId },
                    },
                ],
            };

            if (category) {
                filter.must.push({
                    key: 'category',
                    match: { value: category },
                });
            }

            if (tags.length > 0) {
                filter.must.push({
                    key: 'tags',
                    match: { any: tags },
                });
            }

            const searchResult = await this.client.search(this.collections.sessions, {
                vector: queryVector,
                limit,
                score_threshold: scoreThreshold,
                filter,
                with_payload: true,
                with_vector: false,
            });

            return searchResult.map((result: any) => ({
                id: result.id as string,
                score: result.score,
                payload: result.payload as VectorDocument['payload'],
            }));
        } catch (error) {
            throw new Error(`Failed to search sessions: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Search documents by vector similarity
     */
    async searchDocuments(
        queryVector: number[],
        userId: string,
        params: {
            limit?: number;
            scoreThreshold?: number;
            category?: string;
            tags?: string[];
        } = {}
    ): Promise<SearchResult[]> {
        try {
            const {
                limit = 10,
                scoreThreshold = 0.7,
                category,
                tags = [],
            } = params;

            const filter: Record<string, any> = {
                must: [
                    {
                        key: 'type',
                        match: { value: 'document' },
                    },
                    {
                        key: 'userId',
                        match: { value: userId },
                    },
                ],
            };

            if (category) {
                filter.must.push({
                    key: 'category',
                    match: { value: category },
                });
            }

            if (tags.length > 0) {
                filter.must.push({
                    key: 'tags',
                    match: { any: tags },
                });
            }

            const searchResult = await this.client.search(this.collections.documents, {
                vector: queryVector,
                limit,
                score_threshold: scoreThreshold,
                filter,
                with_payload: true,
                with_vector: false,
            });

            return searchResult.map((result: any) => ({
                id: result.id as string,
                score: result.score,
                payload: result.payload as VectorDocument['payload'],
            }));
        } catch (error) {
            throw new Error(`Failed to search documents: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Search knowledge base by vector similarity
     */
    async searchKnowledge(
        queryVector: number[],
        params: {
            limit?: number;
            scoreThreshold?: number;
            category?: string;
            tags?: string[];
            minTrustScore?: number;
        } = {}
    ): Promise<SearchResult[]> {
        try {
            const {
                limit = 10,
                scoreThreshold = 0.75,
                category,
                tags = [],
                minTrustScore = 0.5,
            } = params;

            const filter: Record<string, any> = {
                must: [
                    {
                        key: 'type',
                        match: { value: 'knowledge' },
                    },
                ],
            };

            if (category) {
                filter.must.push({
                    key: 'category',
                    match: { value: category },
                });
            }

            if (tags.length > 0) {
                filter.must.push({
                    key: 'tags',
                    match: { any: tags },
                });
            }

            if (minTrustScore > 0) {
                filter.must.push({
                    key: 'trustScore',
                    range: {
                        gte: minTrustScore,
                    },
                });
            }

            const searchResult = await this.client.search(this.collections.knowledge, {
                vector: queryVector,
                limit,
                score_threshold: scoreThreshold,
                filter,
                with_payload: true,
                with_vector: false,
            });

            return searchResult.map((result: any) => ({
                id: result.id as string,
                score: result.score,
                payload: result.payload as VectorDocument['payload'],
            }));
        } catch (error) {
            throw new Error(`Failed to search knowledge: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Search files by vector similarity
     */
    async searchFiles(
        queryVector: number[],
        sessionId: string,
        params: {
            limit?: number;
            scoreThreshold?: number;
            fileType?: string;
            tags?: string[];
        } = {}
    ): Promise<SearchResult[]> {
        try {
            const {
                limit = 10,
                scoreThreshold = 0.7,
                fileType,
                tags = [],
            } = params;

            const filter: Record<string, any> = {
                must: [
                    {
                        key: 'type',
                        match: { value: 'file' },
                    },
                    {
                        key: 'sessionId',
                        match: { value: sessionId },
                    },
                ],
            };

            if (fileType) {
                filter.must.push({
                    key: 'fileType',
                    match: { value: fileType },
                });
            }

            if (tags.length > 0) {
                filter.must.push({
                    key: 'tags',
                    match: { any: tags },
                });
            }

            const searchResult = await this.client.search(this.collections.files, {
                vector: queryVector,
                limit,
                score_threshold: scoreThreshold,
                filter,
                with_payload: true,
                with_vector: false,
            });

            return searchResult.map((result: any) => ({
                id: result.id as string,
                score: result.score,
                payload: result.payload as VectorDocument['payload'],
            }));
        } catch (error) {
            throw new Error(`Failed to search files: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Delete vector by ID
     */
    async deleteVector(collection: keyof typeof this.collections, id: string): Promise<void> {
        try {
            await this.client.delete(this.collections[collection], {
                wait: true,
                points: [id],
            });
        } catch (error) {
            throw new Error(`Failed to delete vector: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Update vector payload
     */
    async updateVectorPayload(
        collection: keyof typeof this.collections,
        id: string,
        payload: Record<string, any>
    ): Promise<void> {
        try {
            await this.client.setPayload(this.collections[collection], {
                wait: true,
                payload,
                points: [id],
            });
        } catch (error) {
            throw new Error(`Failed to update vector payload: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get collection statistics
     */
    async getCollectionInfo(collection: keyof typeof this.collections): Promise<CollectionInfo> {
        try {
            const info = await this.client.getCollection(this.collections[collection]);
            return {
                name: this.collections[collection],
                vectorsCount: info.vectors_count || 0,
                indexedVectorsCount: info.indexed_vectors_count || 0,
                pointsCount: info.points_count || 0,
                segmentsCount: info.segments_count,
                status: info.status,
                optimizerStatus: typeof info.optimizer_status === 'string' ? info.optimizer_status : 'ok',
                payloadSchema: info.payload_schema,
            };
        } catch (error) {
            throw new Error(`Failed to get collection info: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get all collections info
     */
    async getAllCollectionsInfo(): Promise<Record<string, CollectionInfo>> {
        try {
            const collections = Object.keys(this.collections) as Array<keyof typeof this.collections>;
            const info: Record<string, CollectionInfo> = {};

            for (const collection of collections) {
                info[collection] = await this.getCollectionInfo(collection);
            }

            return info;
        } catch (error) {
            throw new Error(`Failed to get all collections info: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Health check
     */
    async healthCheck(): Promise<boolean> {
        try {
            // Use getCollections as a health check since healthCheck method doesn't exist
            await this.client.getCollections();
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Clear collection (for testing/development)
     */
    async clearCollection(collection: keyof typeof this.collections): Promise<void> {
        try {
            // Delete all points in the collection
            await this.client.delete(this.collections[collection], {
                wait: true,
                points: [], // Empty array means delete all
            });
        } catch (error) {
            throw new Error(`Failed to clear collection: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}

// Export singleton instance
let qdrantServiceInstance: QdrantService | null = null;

export function getQdrantService(url?: string): QdrantService {
    if (!qdrantServiceInstance) {
        qdrantServiceInstance = new QdrantService(url);
    }
    return qdrantServiceInstance;
}
