-- Create function for vector similarity search using pgvector
-- This function finds the most similar feature vectors to a query vector

CREATE OR REPLACE FUNCTION search_similar_vectors(
  query_embedding vector(512),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  detection_id uuid,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fv.detection_id,
    1 - (fv.features <=> query_embedding) as similarity
  FROM feature_vectors fv
  WHERE 1 - (fv.features <=> query_embedding) > match_threshold
  ORDER BY fv.features <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create index for faster vector similarity search
CREATE INDEX IF NOT EXISTS idx_feature_vectors_cosine 
ON feature_vectors 
USING ivfflat (features vector_cosine_ops)
WITH (lists = 100);

-- Add comment
COMMENT ON FUNCTION search_similar_vectors IS 'Searches for similar feature vectors using cosine similarity';
