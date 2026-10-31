-- Data-only update for an EXISTING database (no schema change). Safe to run once.
-- Formative: no pass mark. Summative: pass 40, artifact 80 for every era
-- (teachers can change the one pair on the Monitor / Analytics page).
UPDATE Assessment SET requiredScore = 0 WHERE assessmentType = 'Formative';
UPDATE Assessment
   SET requiredScore = 40,
       summativeConfig = JSON_SET(COALESCE(summativeConfig, JSON_OBJECT()), '$.artifactScore', 80)
 WHERE assessmentType = 'Summative';
