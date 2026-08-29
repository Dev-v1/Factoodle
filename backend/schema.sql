CREATE TABLE IF NOT EXISTS learner_progress (
  progress_code VARCHAR(13) PRIMARY KEY,
  progress JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_progress_code
    CHECK (progress_code ~ '^FCT-[A-Z2-9]{4}-[A-Z2-9]{4}$')
);

CREATE INDEX IF NOT EXISTS learner_progress_updated_at_idx
  ON learner_progress (updated_at DESC);
