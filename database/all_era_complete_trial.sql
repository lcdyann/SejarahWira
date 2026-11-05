-- ====================================================================
-- UJI EPILOG: tandakan pelajar sebagai SUDAH SELESAI SEMUA ERA
-- Tampal dalam phpMyAdmin (tab SQL) pada pangkalan data sejarahwira_db.
-- Tukar 'S1001' kepada ID pelajar yang mahu diuji.
-- Selepas ini log masuk semula sebagai pelajar itu: Prolog tidak main, butang 'Ulang Epilog' muncul di hab,
-- dan Epilog main sendiri apabila pelajar menamatkan era terakhir.
-- ====================================================================
USE `sejarahwira_db`;
SET @sid = CONVERT('S1001' USING utf8mb4) COLLATE utf8mb4_general_ci;   -- COLLATE perlu supaya sepadan dengan lajur jadual

-- 1. semua era selesai
UPDATE `eraprogression` SET `eraStatus` = 'completed' WHERE `studentID` = @sid;

-- 2. semua misi selesai
DELETE FROM `questcompletion` WHERE `studentID` = @sid;
INSERT INTO `questcompletion` (`studentID`, `questID`) SELECT @sid, `questID` FROM `quest`;

-- 3. semua lencana dan artifak diperoleh
DELETE FROM `studentbadge` WHERE `studentID` = @sid;
INSERT INTO `studentbadge` (`studentID`, `badgeID`) SELECT @sid, `badgeID` FROM `badge`;
DELETE FROM `studentartifact` WHERE `studentID` = @sid;
INSERT INTO `studentartifact` (`studentID`, `artifactID`) SELECT @sid, `artifactID` FROM `artifact`;

-- 4. ringkasan kemajuan
UPDATE `learningprogression`
   SET `completionRate` = 100,
       `erasCompleted` = (SELECT COUNT(*) FROM `historicalera`),
       `bestScore` = 100,
       `badgesEarned` = (SELECT COUNT(*) FROM `badge`),
       `artifactsUnlocked` = (SELECT COUNT(*) FROM `artifact`)
 WHERE `studentID` = @sid;

-- ====================================================================
-- KEMBALIKAN KE ASAL (jalankan bahagian ini sahaja bila selesai menguji)
-- ====================================================================
-- UPDATE `eraprogression` SET `eraStatus` = IF(`eraID` = 1, 'unlocked', 'locked') WHERE `studentID` = @sid;
-- DELETE FROM `questcompletion` WHERE `studentID` = @sid;
-- DELETE FROM `studentbadge` WHERE `studentID` = @sid;
-- DELETE FROM `studentartifact` WHERE `studentID` = @sid;
-- UPDATE `learningprogression` SET `completionRate` = 0, `erasCompleted` = 0, `bestScore` = 0, `badgesEarned` = 0, `artifactsUnlocked` = 0 WHERE `studentID` = @sid;