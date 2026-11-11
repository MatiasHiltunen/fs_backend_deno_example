-- Migraatio 1 luo rakenteen. Tätä tiedostoa ei muuteta käytön jälkeen.
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor', 'admin')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
) STRICT;

-- Selain saa raakatunnisteen. Tietokantaan tallennetaan vain sen tiiviste.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
) STRICT;

-- Kaikki tehtävät kuuluvat tässä esimerkissä samaan yhteiseen tiimiin.
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
) STRICT;
