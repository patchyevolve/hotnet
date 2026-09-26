-- Initialize Criminal Network Analysis Database
-- This script runs when the PostgreSQL container starts for the first time

-- Enable pgvector extension for face embeddings and semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable uuid-ossp for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Verify extensions
SELECT extname, extversion FROM pg_extension WHERE extname IN ('vector', 'uuid-ossp');