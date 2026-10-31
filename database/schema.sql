-- ====================================================================
-- SEJARAHWIRA COMPLETE DATABASE SCHEMA
-- Database: sejarahwira_db
-- ====================================================================
-- Disable foreign key checks for clean table drops
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS StudentArtifact;
DROP TABLE IF EXISTS StudentBadge;
DROP TABLE IF EXISTS QuestCompletion;
DROP TABLE IF EXISTS MonitorAnalytics;
DROP TABLE IF EXISTS MediaAsset;
DROP TABLE IF EXISTS ContentManager;
DROP TABLE IF EXISTS Artifact;
DROP TABLE IF EXISTS Badge;
DROP TABLE IF EXISTS Question;
DROP TABLE IF EXISTS QuestionBank;
DROP TABLE IF EXISTS AssessmentAttempt;
DROP TABLE IF EXISTS Assessment;
DROP TABLE IF EXISTS LearningSupport;
DROP TABLE IF EXISTS Quest;
DROP TABLE IF EXISTS DialogueLine;
DROP TABLE IF EXISTS Scene;
DROP TABLE IF EXISTS Narrative;
DROP TABLE IF EXISTS NPC;
DROP TABLE IF EXISTS LearningProgression;
DROP TABLE IF EXISTS EraProgression;
DROP TABLE IF EXISTS HistoricalEra;
DROP TABLE IF EXISTS Student;
DROP TABLE IF EXISTS Avatar;
DROP TABLE IF EXISTS Class;
DROP TABLE IF EXISTS Teacher;
DROP TABLE IF EXISTS User;

SET FOREIGN_KEY_CHECKS = 1;

-- ====================================================================
-- MODULE 0: CORE IDENTITY & USER AUTHENTICATION
-- ====================================================================

-- Table 4.5.1: User
CREATE TABLE User (
  userID BIGINT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  role ENUM('Teacher', 'Student') NOT NULL,
  password VARCHAR(255) NOT NULL
);

-- Table 4.5.2: Teacher
CREATE TABLE Teacher (
  teacherID VARCHAR(20) PRIMARY KEY,
  teacherName VARCHAR(100) NOT NULL,
  userID BIGINT NOT NULL,
  FOREIGN KEY (userID) REFERENCES User(userID) ON DELETE CASCADE
);

-- Table 4.5.3: Class
CREATE TABLE Class (
  classID VARCHAR(20) PRIMARY KEY,
  className VARCHAR(20) NOT NULL,
  batchYear INT NOT NULL,
  teacherID VARCHAR(20) NOT NULL,
  FOREIGN KEY (teacherID) REFERENCES Teacher(teacherID) ON DELETE CASCADE
);

-- Table 4.5.4: Avatar
CREATE TABLE Avatar (
  avatarID BIGINT AUTO_INCREMENT PRIMARY KEY,
  avatarName VARCHAR(100) NOT NULL,
  asset VARCHAR(255) NOT NULL
);

-- Table 4.5.5: Student
CREATE TABLE Student (
  studentID VARCHAR(20) PRIMARY KEY,
  studentName VARCHAR(100) NOT NULL,
  userID BIGINT NOT NULL,
  classID VARCHAR(20) NOT NULL,
  avatarID BIGINT NULL,
  FOREIGN KEY (userID) REFERENCES User(userID) ON DELETE CASCADE,
  FOREIGN KEY (classID) REFERENCES Class(classID) ON DELETE CASCADE,
  FOREIGN KEY (avatarID) REFERENCES Avatar(avatarID) ON DELETE SET NULL
);

-- ====================================================================
-- MODULE 2: ERA & LEARNING PROGRESSION
-- ====================================================================

-- Table 4.5.6: HistoricalEra
CREATE TABLE HistoricalEra (
  eraID BIGINT PRIMARY KEY,
  eraName VARCHAR(255) NOT NULL,
  description TEXT NOT NULL
);

-- Table 4.5.7: EraProgression
CREATE TABLE EraProgression (
  progressionID BIGINT AUTO_INCREMENT PRIMARY KEY,
  studentID VARCHAR(20) NOT NULL,
  eraID BIGINT NOT NULL,
  eraStatus ENUM('locked', 'unlocked', 'in progress', 'completed') NOT NULL DEFAULT 'locked',
  unlockCondition VARCHAR(255) NOT NULL,
  UNIQUE KEY uq_student_era (studentID, eraID),
  FOREIGN KEY (studentID) REFERENCES Student(studentID) ON DELETE CASCADE,
  FOREIGN KEY (eraID) REFERENCES HistoricalEra(eraID) ON DELETE CASCADE
);

-- Table 4.5.8: LearningProgression
CREATE TABLE LearningProgression (
  trackID BIGINT AUTO_INCREMENT PRIMARY KEY,
  studentID VARCHAR(20) NOT NULL UNIQUE,
  completionRate DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  erasCompleted INT NOT NULL DEFAULT 0,
  bestScore INT NOT NULL DEFAULT 0,
  badgesEarned INT NOT NULL DEFAULT 0,
  artifactsUnlocked INT NOT NULL DEFAULT 0,
  FOREIGN KEY (studentID) REFERENCES Student(studentID) ON DELETE CASCADE
);

-- ====================================================================
-- MODULE 1: NARRATIVE-DRIVEN LEARNING ACTIVITY
-- ====================================================================

-- Table 4.5.9: NPC
CREATE TABLE NPC (
  npcID BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  biography TEXT NULL,
  contribution TEXT NULL,
  asset VARCHAR(255) NOT NULL
);

-- Table 4.5.10: Narrative
CREATE TABLE Narrative (
  narrativeID BIGINT PRIMARY KEY AUTO_INCREMENT,
  narrativeTitle VARCHAR(100) NOT NULL,
  eraID BIGINT NOT NULL,
  summary TEXT NOT NULL,
  FOREIGN KEY (eraID) REFERENCES HistoricalEra(eraID) ON DELETE CASCADE
);

-- Table 4.5.11: Scene
CREATE TABLE Scene (
  sceneID VARCHAR(100) PRIMARY KEY,
  sceneStoryline TEXT NOT NULL,
  sceneOrder INT NOT NULL,
  narrativeID BIGINT NOT NULL,
  asset VARCHAR(255) NOT NULL,
  FOREIGN KEY (narrativeID) REFERENCES Narrative(narrativeID) ON DELETE CASCADE
);

-- Table 4.5.12: DialogueLine
CREATE TABLE DialogueLine (
  dialogueID BIGINT PRIMARY KEY AUTO_INCREMENT,
  npcID BIGINT NULL,
  narrativeID BIGINT NULL,
  sceneID VARCHAR(100) NULL,
  dialogueLine VARCHAR(255) NOT NULL,
  sequenceOrder INT NOT NULL,
  FOREIGN KEY (npcID) REFERENCES NPC(npcID) ON DELETE SET NULL,
  FOREIGN KEY (narrativeID) REFERENCES Narrative(narrativeID) ON DELETE CASCADE,
  FOREIGN KEY (sceneID) REFERENCES Scene(sceneID) ON DELETE CASCADE
);

-- Table 4.5.13: Quest
CREATE TABLE Quest (
  questID BIGINT PRIMARY KEY AUTO_INCREMENT,
  sceneID VARCHAR(100) NOT NULL,
  questName VARCHAR(255) NOT NULL,
  instruction TEXT NOT NULL,
  questType VARCHAR(50) NULL,
  description TEXT NULL,
  questContent JSON NULL,
  FOREIGN KEY (sceneID) REFERENCES Scene(sceneID) ON DELETE CASCADE
);

-- Table 4.5.23: QuestCompletion
CREATE TABLE QuestCompletion (
  studentID VARCHAR(20) NOT NULL,
  questID BIGINT NOT NULL,
  completedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (studentID, questID),
  FOREIGN KEY (studentID) REFERENCES Student(studentID) ON DELETE CASCADE,
  FOREIGN KEY (questID) REFERENCES Quest(questID) ON DELETE CASCADE
);

-- ====================================================================
-- MODULE 4: FEEDBACK & ADAPTIVE HINT
-- ====================================================================

-- Table 4.5.14: LearningSupport
CREATE TABLE LearningSupport (
  supportID BIGINT PRIMARY KEY AUTO_INCREMENT,
  questID BIGINT NULL,
  sceneID VARCHAR(100) NULL,
  supportType ENUM('hint', 'explanation', 'feedback') NOT NULL,
  hint VARCHAR(255) NULL,
  explanation TEXT NULL,
  feedback TEXT NULL,
  FOREIGN KEY (questID) REFERENCES Quest(questID) ON DELETE CASCADE,
  FOREIGN KEY (sceneID) REFERENCES Scene(sceneID) ON DELETE CASCADE
);

-- ====================================================================
-- MODULE 3: DUAL-MODE ASSESSMENT MODULE
-- ====================================================================

-- Table 4.5.15: Assessment
CREATE TABLE Assessment (
  assessmentID BIGINT AUTO_INCREMENT PRIMARY KEY,
  eraID BIGINT NOT NULL,
  assessmentType ENUM('Formative', 'Summative') NOT NULL,
  requiredScore INT NOT NULL DEFAULT 80,
  formativeConfig JSON NULL,
  summativeConfig JSON NULL,
  FOREIGN KEY (eraID) REFERENCES HistoricalEra(eraID) ON DELETE CASCADE
);
-- Data-only update for an EXISTING database (no schema change). Safe to run once.
-- Formative: no pass mark. Summative: pass 40, artifact 80 for every era
-- (teachers can change the one pair on the Monitor / Analytics page).
UPDATE Assessment SET requiredScore = 0 WHERE assessmentType = 'Formative';
UPDATE Assessment
   SET requiredScore = 40,
       summativeConfig = JSON_SET(COALESCE(summativeConfig, JSON_OBJECT()), '$.artifactScore', 80)
 WHERE assessmentType = 'Summative';

-- Table 4.5.16: AssessmentAttempt
CREATE TABLE AssessmentAttempt (
  attemptID BIGINT AUTO_INCREMENT PRIMARY KEY,
  studentID VARCHAR(20) NOT NULL,
  assessmentID BIGINT NOT NULL,
  Score INT NOT NULL,
  attemptDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT 0,
  FOREIGN KEY (studentID) REFERENCES Student(studentID) ON DELETE CASCADE,
  FOREIGN KEY (assessmentID) REFERENCES Assessment(assessmentID) ON DELETE CASCADE
);

-- Table 4.5.17: QuestionBank
CREATE TABLE QuestionBank (
  bankID BIGINT PRIMARY KEY AUTO_INCREMENT,
  eraID BIGINT NOT NULL,
  UNIQUE KEY uq_bank_era (eraID),
  FOREIGN KEY (eraID) REFERENCES HistoricalEra(eraID) ON DELETE CASCADE
);

-- Table 4.5.18: Question
CREATE TABLE Question (
  questionID BIGINT AUTO_INCREMENT PRIMARY KEY,
  bankID BIGINT NOT NULL,
  questionText TEXT NOT NULL,
  option_a VARCHAR(255) NOT NULL,
  option_b VARCHAR(255) NOT NULL,
  option_c VARCHAR(255) NOT NULL,
  option_d VARCHAR(255) NOT NULL,
  correctAnswer CHAR(1) NOT NULL,
  hint VARCHAR(255) NULL,
  explanation TEXT NULL,
  FOREIGN KEY (bankID) REFERENCES QuestionBank(bankID) ON DELETE CASCADE
);

-- ====================================================================
-- MODULE 5: REWARDS & COLLECTION
-- ====================================================================

-- Table 4.5.19: Badge
CREATE TABLE Badge (
  badgeID BIGINT PRIMARY KEY AUTO_INCREMENT,
  eraID BIGINT NOT NULL,
  badgeName VARCHAR(100) NOT NULL,
  asset VARCHAR(255) NOT NULL,
  FOREIGN KEY (eraID) REFERENCES HistoricalEra(eraID) ON DELETE CASCADE
);

-- Table 4.5.20: Artifact
CREATE TABLE Artifact (
  artifactID BIGINT PRIMARY KEY AUTO_INCREMENT,
  artifactName VARCHAR(50) NOT NULL,
  moralLesson TEXT NOT NULL,
  asset VARCHAR(255) NOT NULL
);

-- Table 4.5.24: StudentBadge
CREATE TABLE StudentBadge (
  studentID VARCHAR(20) NOT NULL,
  badgeID BIGINT NOT NULL,
  earnedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (studentID, badgeID),
  FOREIGN KEY (studentID) REFERENCES Student(studentID) ON DELETE CASCADE,
  FOREIGN KEY (badgeID) REFERENCES Badge(badgeID) ON DELETE CASCADE
);

-- Table 4.5.25: StudentArtifact
CREATE TABLE StudentArtifact (
  studentID VARCHAR(20) NOT NULL,
  artifactID BIGINT NOT NULL,
  unlockedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (studentID, artifactID),
  FOREIGN KEY (studentID) REFERENCES Student(studentID) ON DELETE CASCADE,
  FOREIGN KEY (artifactID) REFERENCES Artifact(artifactID) ON DELETE CASCADE
);

-- ====================================================================
-- MODULE 6 & 7: ANALYTICS & CONTENT MANAGEMENT
-- ====================================================================

-- Table 4.5.21: ContentManager  (change log: who added / edited what, and when)
CREATE TABLE ContentManager (
  changesID BIGINT AUTO_INCREMENT PRIMARY KEY,
  changesName VARCHAR(255) NOT NULL,
  teacherID VARCHAR(20) NULL,
  eraID BIGINT NULL,
  changesDescription TEXT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NULL,
  FOREIGN KEY (teacherID) REFERENCES Teacher(teacherID) ON DELETE SET NULL,
  FOREIGN KEY (eraID) REFERENCES HistoricalEra(eraID) ON DELETE SET NULL
);

-- Table 4.5.26: MediaAsset  (named image library: teachers see displayName + preview,
-- the database stores filePath, e.g. 'village.jpg' inside gameAsset/background/)
CREATE TABLE MediaAsset (
  assetID BIGINT AUTO_INCREMENT PRIMARY KEY,
  assetType ENUM('background', 'npc') NOT NULL,
  displayName VARCHAR(100) NOT NULL,
  filePath VARCHAR(255) NOT NULL,
  uploadedBy VARCHAR(20) NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  UNIQUE KEY uq_asset_file (assetType, filePath),
  FOREIGN KEY (uploadedBy) REFERENCES Teacher(teacherID) ON DELETE SET NULL
);

-- Table 4.5.22: MonitorAnalytics
CREATE TABLE MonitorAnalytics (
  monitorID BIGINT AUTO_INCREMENT PRIMARY KEY,
  classID VARCHAR(20) NOT NULL,
  eraID BIGINT NOT NULL,
  weakEra VARCHAR(255) NULL,
  classAverage DECIMAL(5,2) NOT NULL,
  FOREIGN KEY (classID) REFERENCES Class(classID) ON DELETE CASCADE,
  FOREIGN KEY (eraID) REFERENCES HistoricalEra(eraID) ON DELETE CASCADE
);