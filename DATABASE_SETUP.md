# Database Setup Guide

This guide explains how to set up the dual-database architecture for Doctor GPT, which uses PostgreSQL for relational data and Qdrant for vector operations.

## Architecture Overview

### PostgreSQL Database
- **Purpose**: Relational data storage (users, sessions, logs, metadata)
- **Port**: 5432
- **Features**: ACID compliance, complex queries, relationships
- **Data**: User accounts, session metadata, chat logs, cost tracking, file metadata

### Qdrant Vector Database
- **Purpose**: Vector embeddings and semantic search
- **Port**: 6333 (HTTP), 6334 (gRPC)
- **Features**: High-performance vector similarity search, filtering
- **Data**: Session embeddings, document embeddings, knowledge base vectors

## Quick Start

### 1. Start the Databases

```bash
# Start both PostgreSQL and Qdrant
bun run docker:up

# Or start with development tools (pgAdmin, etc.)
bun run docker:dev
```

### 2. Initialize the Databases

```bash
# Complete setup (generates Prisma client, runs migrations, initializes Qdrant)
bun run db:setup

# Or step by step:
bun run db:generate    # Generate Prisma client
bun run db:migrate     # Run PostgreSQL migrations
bun run db:init        # Initialize Qdrant collections
```

### 3. Verify Setup

```bash
# Check database health
bun run health-check

# View PostgreSQL data
bun run db:studio

# Check Qdrant collections
curl http://localhost:6333/collections
```

## Detailed Setup

### Environment Configuration

Copy the environment template:

```bash
cp env.example .env.local
```

Update the following variables in `.env.local`:

```env
# PostgreSQL Configuration
DATABASE_URL="postgresql://doctor_gpt:doctor_gpt_password@localhost:5432/doctor_gpt"
DIRECT_URL="postgresql://doctor_gpt:doctor_gpt_password@localhost:5432/doctor_gpt"

# Qdrant Configuration
QDRANT_URL="http://localhost:6333"
QDRANT_HTTP_PORT="6333"
QDRANT_GRPC_PORT="6334"

# Docker Database Configuration
DB_USER="doctor_gpt"
DB_PASSWORD="doctor_gpt_password"
DB_NAME="doctor_gpt"
DB_PORT="5432"
```

### Database Schema

#### PostgreSQL Tables

- **users**: User accounts and profiles
- **sessions**: Chat sessions with metadata
- **chats**: Individual chat messages
- **session_logs**: Detailed session activity logs
- **session_files**: File attachments per session
- **medical_reports**: Medical document metadata
- **medical_knowledge**: Knowledge base entries
- **cost_logs**: Cost tracking for AI operations
- **events**: System and user events

#### Qdrant Collections

- **sessions**: Session context embeddings
- **documents**: Medical document embeddings
- **knowledge**: Knowledge base embeddings
- **files**: File content embeddings

### Vector Search Capabilities

The system supports several types of vector search:

1. **Session Search**: Find similar past sessions
2. **Document Search**: Search through medical documents
3. **Knowledge Search**: Query the medical knowledge base
4. **File Search**: Search within uploaded files

Example usage:

```typescript
import { getQdrantService } from './lib/vector/qdrant-service';

const qdrant = getQdrantService();

// Search similar sessions
const results = await qdrant.searchSessions(
  queryVector,
  userId,
  {
    limit: 10,
    scoreThreshold: 0.7,
    category: 'MEDICAL_CONSULTATION'
  }
);
```

## Development Workflow

### Adding New Vector Data

1. **Generate embedding** using your preferred embedding model
2. **Store in Qdrant** using the appropriate service method
3. **Update PostgreSQL** with metadata and vector reference

```typescript
// Example: Store a new session vector
await sessionService.storeSessionVector(
  sessionId,
  embedding,
  content,
  {
    title: 'Medical Consultation',
    category: 'MEDICAL_CONSULTATION',
    tags: ['urgent', 'cardiology']
  }
);
```

### Database Migrations

PostgreSQL migrations are handled by Prisma:

```bash
# Create a new migration
bun run db:migrate

# Apply migrations in production
bun run db:deploy

# Reset database (development only)
bun run db:reset
```

Qdrant collections are managed programmatically and will be created automatically when the service initializes.

### Monitoring and Maintenance

#### PostgreSQL Monitoring

```bash
# View database statistics
bun run db:studio

# Check connection health
bun run health-check

# View logs
bun run docker:logs postgres
```

#### Qdrant Monitoring

```bash
# Check Qdrant health
curl http://localhost:6333/health

# View collection statistics
curl http://localhost:6333/collections

# View specific collection info
curl http://localhost:6333/collections/sessions
```

#### Performance Optimization

1. **PostgreSQL**:
   - Monitor query performance with `pg_stat_statements`
   - Use appropriate indexes (already configured)
   - Regular VACUUM and ANALYZE

2. **Qdrant**:
   - Monitor collection sizes and performance
   - Adjust vector index parameters as needed
   - Use payload filtering for better performance

## Production Deployment

### PostgreSQL

For production, consider:

- **Managed Database**: AWS RDS, Google Cloud SQL, or Azure Database
- **Connection Pooling**: PgBouncer or similar
- **Backup Strategy**: Automated backups and point-in-time recovery
- **Monitoring**: Database performance monitoring

### Qdrant

For production, consider:

- **Qdrant Cloud**: Managed Qdrant service
- **Self-hosted**: Qdrant cluster with proper configuration
- **Backup**: Regular snapshots of vector data
- **Scaling**: Horizontal scaling for large datasets

### Environment Variables

Production environment should include:

```env
# Production PostgreSQL
DATABASE_URL="postgresql://user:password@prod-host:5432/doctor_gpt"
DIRECT_URL="postgresql://user:password@prod-host:5432/doctor_gpt"

# Production Qdrant
QDRANT_URL="https://your-qdrant-cluster.com"
QDRANT_API_KEY="your-api-key"

# Security
JWT_SECRET="strong-random-secret"
NEXTAUTH_SECRET="strong-random-secret"
```

## Troubleshooting

### Common Issues

1. **Connection Refused**
   - Ensure Docker containers are running: `bun run docker:up`
   - Check port availability: `lsof -i :5432` and `lsof -i :6333`

2. **Migration Errors**
   - Reset database: `bun run db:reset`
   - Check Prisma schema syntax
   - Verify environment variables

3. **Vector Search Issues**
   - Check Qdrant health: `curl http://localhost:6333/health`
   - Verify collection exists: `curl http://localhost:6333/collections`
   - Check embedding dimensions match (1536 for OpenAI)

4. **Performance Issues**
   - Monitor database connections
   - Check vector collection sizes
   - Review query patterns

### Debug Commands

```bash
# View all container logs
bun run docker:logs

# Check specific service logs
docker logs doctor-gpt-postgres
docker logs doctor-gpt-qdrant

# Connect to PostgreSQL directly
docker exec -it doctor-gpt-postgres psql -U doctor_gpt -d doctor_gpt

# Check Qdrant collections
curl -X GET "http://localhost:6333/collections"
```

## Security Considerations

1. **Database Access**:
   - Use strong passwords
   - Limit network access
   - Enable SSL/TLS in production

2. **Vector Data**:
   - Consider data privacy for medical information
   - Implement proper access controls
   - Regular security audits

3. **API Keys**:
   - Store securely in environment variables
   - Rotate regularly
   - Monitor usage

## Backup and Recovery

### PostgreSQL Backup

```bash
# Create backup
docker exec doctor-gpt-postgres pg_dump -U doctor_gpt doctor_gpt > backup.sql

# Restore backup
docker exec -i doctor-gpt-postgres psql -U doctor_gpt doctor_gpt < backup.sql
```

### Qdrant Backup

```bash
# Create snapshot
curl -X POST "http://localhost:6333/snapshots/sessions"

# List snapshots
curl -X GET "http://localhost:6333/snapshots/sessions"
```

## Support

For issues related to:

- **PostgreSQL**: Check Prisma documentation and PostgreSQL logs
- **Qdrant**: Check Qdrant documentation and collection status
- **Application**: Check application logs and health checks

Use the health check script to diagnose common issues:

```bash
bun run health-check
```
