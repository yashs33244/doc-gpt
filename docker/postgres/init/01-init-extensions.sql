-- Initialize PostgreSQL extensions for Doctor GPT
-- This script runs when the container starts for the first time

-- Enable pgvector extension for vector operations
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable other useful extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For text search optimization
CREATE EXTENSION IF NOT EXISTS "btree_gin"; -- For composite indexes
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements"; -- For query performance monitoring

-- Create a function to check extension status
CREATE OR REPLACE FUNCTION check_extensions()
RETURNS TABLE(extension_name text, installed boolean) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ext.extname::text as extension_name,
        true as installed
    FROM pg_extension ext
    WHERE ext.extname IN ('vector', 'uuid-ossp', 'pg_trgm', 'btree_gin', 'pg_stat_statements');
END;
$$ LANGUAGE plpgsql;

-- Log extension installation status
DO $$
DECLARE
    ext_record RECORD;
BEGIN
    RAISE NOTICE 'Doctor GPT Database Initialization Started';
    RAISE NOTICE '===============================================';
    
    FOR ext_record IN SELECT * FROM check_extensions()
    LOOP
        RAISE NOTICE 'Extension % is installed', ext_record.extension_name;
    END LOOP;
    
    RAISE NOTICE '===============================================';
    RAISE NOTICE 'Database initialization completed successfully';
END $$;
