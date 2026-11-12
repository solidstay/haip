-- Installation-wide UI preferences; no accommodation or permission changes.
CREATE TABLE dashboard_settings (
  id varchar(30) PRIMARY KEY CHECK (id = 'navigation'),
  enabled jsonb NOT NULL CHECK (jsonb_typeof(enabled) = 'array'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
