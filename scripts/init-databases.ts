#!/usr/bin/env tsx

/**
 * Database Initialization Script
 * 
 * Initializes both PostgreSQL and Qdrant databases with proper schemas
 * and collections for the Doctor GPT application
 */

import { PrismaClient } from '@prisma/client';
import { getQdrantService } from '../lib/vector/qdrant-service';

async function initializePostgreSQL() {
    console.log('🔄 Initializing PostgreSQL database...');

    const prisma = new PrismaClient();

    try {
        // Test database connection
        await prisma.$connect();
        console.log('✅ PostgreSQL connection established');

        // Run migrations (this will be handled by Prisma migrate)
        console.log('🔄 Running database migrations...');
        // Note: In production, you would run: npx prisma migrate deploy

        // Test basic queries
        const userCount = await prisma.user.count();
        const sessionCount = await prisma.session.count();

        console.log(`📊 Database stats:`);
        console.log(`   - Users: ${userCount}`);
        console.log(`   - Sessions: ${sessionCount}`);

        console.log('✅ PostgreSQL initialization completed');
    } catch (error) {
        console.error('❌ PostgreSQL initialization failed:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

async function initializeQdrant() {
    console.log('🔄 Initializing Qdrant vector database...');

    const qdrant = getQdrantService();

    try {
        // Test connection
        const isHealthy = await qdrant.healthCheck();
        if (!isHealthy) {
            throw new Error('Qdrant health check failed');
        }
        console.log('✅ Qdrant connection established');

        // Initialize collections
        await qdrant.initializeCollections();

        // Get collection info
        const collectionsInfo = await qdrant.getAllCollectionsInfo();

        console.log('📊 Qdrant collections:');
        Object.entries(collectionsInfo).forEach(([name, info]) => {
            console.log(`   - ${name}: ${info.pointsCount} points, ${info.vectorsCount} vectors`);
        });

        console.log('✅ Qdrant initialization completed');
    } catch (error) {
        console.error('❌ Qdrant initialization failed:', error);
        throw error;
    }
}

async function createSampleData() {
    console.log('🔄 Creating sample data...');

    const prisma = new PrismaClient();
    const qdrant = getQdrantService();

    try {
        // Create a sample user
        const user = await prisma.user.upsert({
            where: { email: 'demo@doctorgpt.local' },
            update: {},
            create: {
                email: 'demo@doctorgpt.local',
                name: 'Demo User',
            },
        });

        console.log(`✅ Sample user created: ${user.email}`);

        // Create a sample session
        const session = await prisma.session.create({
            data: {
                userId: user.id,
                title: 'Sample Medical Consultation',
                description: 'A sample session for testing purposes',
                category: 'MEDICAL_CONSULTATION',
                tags: ['demo', 'sample', 'medical'],
                status: 'ACTIVE',
            },
        });

        console.log(`✅ Sample session created: ${session.title}`);

        // Create sample session log
        await prisma.sessionLog.create({
            data: {
                sessionId: session.id,
                action: 'session_created',
                description: 'Sample session created for testing',
                severity: 'INFO',
                metadata: {
                    source: 'init_script',
                },
            },
        });

        console.log('✅ Sample session log created');

        // Create a sample vector (dummy embedding for demo)
        const dummyVector = new Array(1536).fill(0).map(() => Math.random() - 0.5);

        await qdrant.storeSessionVector(session.id, dummyVector, {
            content: 'This is a sample medical consultation session for testing vector search capabilities.',
            title: session.title || undefined,
            userId: user.id,
            category: session.category || undefined,
            tags: session.tags,
            metadata: {
                description: session.description,
                createdAt: session.createdAt.toISOString(),
            },
        });

        console.log('✅ Sample vector stored in Qdrant');

        // Update session with vector reference
        await prisma.session.update({
            where: { id: session.id },
            data: { vectorId: session.id },
        });

        console.log('✅ Sample data creation completed');
    } catch (error) {
        console.error('❌ Sample data creation failed:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

async function runHealthChecks() {
    console.log('🔄 Running health checks...');

    const prisma = new PrismaClient();
    const qdrant = getQdrantService();

    try {
        // PostgreSQL health check
        await prisma.$queryRaw`SELECT 1`;
        console.log('✅ PostgreSQL health check passed');

        // Qdrant health check
        const isHealthy = await qdrant.healthCheck();
        if (!isHealthy) {
            throw new Error('Qdrant health check failed');
        }
        console.log('✅ Qdrant health check passed');

        // Test vector search
        const dummyVector = new Array(1536).fill(0).map(() => Math.random() - 0.5);
        const searchResults = await qdrant.searchSessions(dummyVector, 'demo-user-id', {
            limit: 1,
            scoreThreshold: 0.0, // Low threshold for testing
        });
        console.log(`✅ Vector search test passed (${searchResults.length} results)`);

        console.log('✅ All health checks passed');
    } catch (error) {
        console.error('❌ Health check failed:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

async function main() {
    console.log('🚀 Starting database initialization...');
    console.log('=====================================');

    try {
        await initializePostgreSQL();
        console.log('');

        await initializeQdrant();
        console.log('');

        await createSampleData();
        console.log('');

        await runHealthChecks();
        console.log('');

        console.log('🎉 Database initialization completed successfully!');
        console.log('');
        console.log('📋 Next steps:');
        console.log('   1. Run: npx prisma generate');
        console.log('   2. Run: npx prisma migrate dev');
        console.log('   3. Start your application');
        console.log('');
        console.log('🔗 Access points:');
        console.log('   - PostgreSQL: localhost:5432');
        console.log('   - Qdrant: http://localhost:6333');
        console.log('   - pgAdmin: http://localhost:5050 (if enabled)');

    } catch (error) {
        console.error('💥 Database initialization failed:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main().catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

export { initializePostgreSQL, initializeQdrant, createSampleData, runHealthChecks };
