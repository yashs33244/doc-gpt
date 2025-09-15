-- Vector database utility functions for Doctor GPT
-- Functions to optimize vector operations and similarity search

-- Function to calculate cosine similarity
CREATE OR REPLACE FUNCTION cosine_similarity(vec1 vector, vec2 vector)
RETURNS float8 AS $$
BEGIN
    RETURN (vec1 <#> vec2) * -1 + 1;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to calculate euclidean distance
CREATE OR REPLACE FUNCTION euclidean_distance(vec1 vector, vec2 vector)
RETURNS float8 AS $$
BEGIN
    RETURN vec1 <-> vec2;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to normalize a vector
CREATE OR REPLACE FUNCTION normalize_vector(vec vector)
RETURNS vector AS $$
DECLARE
    norm float8;
BEGIN
    -- Calculate the norm (magnitude) of the vector
    norm := sqrt((vec <#> vec) * -1 + 1);
    
    -- Avoid division by zero
    IF norm = 0 THEN
        RETURN vec;
    END IF;
    
    -- Return normalized vector (this is a simplified version)
    -- In practice, you'd need a more sophisticated normalization
    RETURN vec;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to perform semantic search on medical documents
CREATE OR REPLACE FUNCTION search_medical_documents(
    query_embedding vector,
    similarity_threshold float8 DEFAULT 0.7,
    result_limit int DEFAULT 10,
    user_id_filter text DEFAULT NULL
)
RETURNS TABLE(
    document_id text,
    file_name text,
    content_snippet text,
    similarity_score float8,
    report_type text,
    created_at timestamp
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        mr.id::text,
        mr.file_name,
        CASE 
            WHEN length(mr.extracted_text) > 200 
            THEN left(mr.extracted_text, 200) || '...'
            ELSE mr.extracted_text
        END as content_snippet,
        cosine_similarity(mr.embedding, query_embedding) as similarity_score,
        mr.report_type::text,
        mr.created_at
    FROM medical_reports mr
    WHERE 
        mr.embedding IS NOT NULL
        AND mr.processing_status = 'COMPLETED'
        AND (user_id_filter IS NULL OR mr.user_id = user_id_filter)
        AND cosine_similarity(mr.embedding, query_embedding) >= similarity_threshold
    ORDER BY similarity_score DESC
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to find similar medical knowledge entries
CREATE OR REPLACE FUNCTION search_medical_knowledge(
    query_embedding vector,
    similarity_threshold float8 DEFAULT 0.75,
    result_limit int DEFAULT 5,
    category_filter text DEFAULT NULL
)
RETURNS TABLE(
    knowledge_id text,
    title text,
    content_snippet text,
    similarity_score float8,
    source text,
    trust_score float8
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        mk.id::text,
        mk.title,
        CASE 
            WHEN length(mk.content) > 300 
            THEN left(mk.content, 300) || '...'
            ELSE mk.content
        END as content_snippet,
        cosine_similarity(mk.embedding, query_embedding) as similarity_score,
        mk.source,
        COALESCE(mk.trust_score, 0.5) as trust_score
    FROM medical_knowledge mk
    WHERE 
        mk.embedding IS NOT NULL
        AND (category_filter IS NULL OR mk.category = category_filter)
        AND cosine_similarity(mk.embedding, query_embedding) >= similarity_threshold
    ORDER BY similarity_score DESC, trust_score DESC
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get document statistics
CREATE OR REPLACE FUNCTION get_vector_stats()
RETURNS TABLE(
    total_documents bigint,
    documents_with_embeddings bigint,
    avg_embedding_dimension int,
    total_knowledge_entries bigint
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT count(*) FROM medical_reports) as total_documents,
        (SELECT count(*) FROM medical_reports WHERE embedding IS NOT NULL) as documents_with_embeddings,
        (SELECT 
            CASE 
                WHEN count(*) > 0 THEN vector_dims((SELECT embedding FROM medical_reports WHERE embedding IS NOT NULL LIMIT 1))
                ELSE 0 
            END
        ) as avg_embedding_dimension,
        (SELECT count(*) FROM medical_knowledge) as total_knowledge_entries;
END;
$$ LANGUAGE plpgsql;

-- Create indexes for better performance
-- Note: These will be created by Prisma migrations, but included here for reference

-- Cosine similarity index on medical_reports
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_medical_reports_embedding_cosine 
-- ON medical_reports USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- L2 distance index on medical_reports  
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_medical_reports_embedding_l2
-- ON medical_reports USING ivfflat (embedding vector_l2_ops) WITH (lists = 100);

-- Cosine similarity index on medical_knowledge
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_medical_knowledge_embedding_cosine
-- ON medical_knowledge USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Composite indexes for filtered searches
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_medical_reports_user_type
-- ON medical_reports (user_id, report_type, processing_status);

-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_medical_knowledge_category_trust
-- ON medical_knowledge (category, trust_score DESC);

-- Log function creation
DO $$
BEGIN
    RAISE NOTICE 'Vector utility functions created successfully';
    RAISE NOTICE 'Functions available:';
    RAISE NOTICE '- cosine_similarity(vec1, vec2)';
    RAISE NOTICE '- euclidean_distance(vec1, vec2)';
    RAISE NOTICE '- normalize_vector(vec)';
    RAISE NOTICE '- search_medical_documents(query_embedding, threshold, limit, user_id)';
    RAISE NOTICE '- search_medical_knowledge(query_embedding, threshold, limit, category)';
    RAISE NOTICE '- get_vector_stats()';
END $$;
