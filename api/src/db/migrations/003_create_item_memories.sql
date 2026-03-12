CREATE TABLE IF NOT EXISTS item_memories (
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  normalized_item_name TEXT NOT NULL,
  location_description TEXT NOT NULL,
  category TEXT,
  source_message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, normalized_item_name)
);

CREATE INDEX IF NOT EXISTS item_memories_updated_at_idx
ON item_memories (updated_at DESC);
