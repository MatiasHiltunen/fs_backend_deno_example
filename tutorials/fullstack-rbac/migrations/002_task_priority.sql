-- Uusi vaatimus tarkoittaa uutta migraatiota. Vanhoja tehtäviä ei poisteta.
ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'
  CHECK (priority IN ('low', 'normal', 'high'));

-- Oletusarvo antaa myös version 1 riveille kelvollisen prioriteetin.
CREATE INDEX tasks_priority ON tasks(priority);
