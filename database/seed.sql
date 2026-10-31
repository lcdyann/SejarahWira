-- ====================================================================
-- SEJARAHWIRA MASTER SEED SCRIPT (seed.sql)
-- Fully aligned with updated sejarahwira_db schema
-- Contains Complete Seed Data for Era 1 and Era 2
-- Safe to execute multiple times
-- ====================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ====================================================================
-- MODULE 0: CORE IDENTITY & USER AUTHENTICATION
-- ====================================================================

-- 1. Table: Avatar
INSERT INTO Avatar (avatarID, avatarName, asset) VALUES
(1, 'Pemuda Melayu', 'avatar_melayu_lelaki.png'),
(2, 'Gadis Berkebaya', 'avatar_melayu_kebaya.png'),
(3, 'Gadis Melayu Berhijab', 'avatar_melayu_hijab.png'),
(4, 'Pemuda Cina', 'avatar_cina_lelaki.png'),
(5, 'Gadis Cina', 'avatar_cina_perempuan.png'),
(6, 'Pemuda India', 'avatar_india_lelaki.png'),
(7, 'Gadis India', 'avatar_india_perempuan.png'),
(8, 'Gadis India Berhijab', 'avatar_india_hijab.png'),
(9, 'Pemuda Bajau', 'avatar_bajau_lelaki.png'),
(10, 'Gadis Iban', 'avatar_iban_perempuan.png'),
(11, 'Gadis Kadazan Berhijab', 'avatar_kadazan_hijab.png'),
(12, 'Gadis Murut', 'avatar_murut_perempuan.png'),
(13, 'Pemuda Pribumi', 'avatar_pribumi_lelaki.png'),
(14, 'Gadis Tenun Berhijab', 'avatar_tenun_hijab.png')
ON DUPLICATE KEY UPDATE avatarName = VALUES(avatarName), asset = VALUES(asset);

-- 2. Table: User
-- Buang akaun admin lama (nama berbeza huruf besar/kecil atau ID automatik) supaya tiada pertembungan
DELETE FROM User WHERE LOWER(username) = 'diyananadra' AND userID <> 3;
INSERT INTO User (userID, username, role, password) VALUES
(1, 'student', 'Student', '123456'),
(2, 'teacher', 'Teacher', '123456'),
-- Admin: kata laluan di bawah ialah cincang rawak yang TIDAK boleh digunakan untuk log masuk.
-- Tetapkan kata laluan sebenar kemudian:  node backend/scripts/set-password.js diyananadra "<kata laluan>"
-- Pastikan juga  ADMIN_USERNAMES=diyananadra  dalam backend/.env
(3, 'diyananadra', 'Teacher', 'scrypt$16384$EgnhECKWq9u9sZyjaOYcrQ$MFgjy2JKpoNdUeXlP8QRU5WrrxrsrBvItulmXU001q0')
ON DUPLICATE KEY UPDATE username = VALUES(username), role = VALUES(role), password = VALUES(password);

-- 3. Table: Teacher
INSERT INTO Teacher (teacherID, teacherName, userID) VALUES
('T1001', 'Agent Bakar', 2),
('T1002', 'Diyana Nadra', 3)
ON DUPLICATE KEY UPDATE teacherName = VALUES(teacherName);

-- 4. Table: Class
INSERT INTO Class (classID, className, batchYear, teacherID) VALUES
('C2026-1', '6 Apex', 2026, 'T1001')
ON DUPLICATE KEY UPDATE className = VALUES(className), batchYear = VALUES(batchYear);

-- 5. Table: Student
INSERT INTO Student (studentID, studentName, userID, classID, avatarID) VALUES
('S1001', 'Ali Ghazali', 1, 'C2026-1', 1)
ON DUPLICATE KEY UPDATE studentName = VALUES(studentName), classID = VALUES(classID), avatarID = VALUES(avatarID);

-- ====================================================================
-- MODULE 2: ERA & LEARNING PROGRESSION
-- ====================================================================

-- 6. Table: HistoricalEra
INSERT INTO HistoricalEra (eraID, eraName, description) VALUES
(1, 'Pembentukan Malaysia 1963', 'Gagasan penggabungan Persekutuan Tanah Melayu, Singapura, Sarawak, dan Sabah pada 16 September 1963.'),
(2, 'Negeri-negeri di Malaysia', 'Sejarah penubuhan, latar belakang, dan keunikan identiti setiap negeri di Malaysia.'),
(3, 'Rukun Negara', 'Deklarasi falsafah negara yang diisytiharkan pada 31 Ogos 1970 untuk mengukuhkan perpaduan.'),
(4, 'Kaum di Malaysia', 'Kepelbagaian etnik utama seperti Melayu, Cina, India, Kadazandusun, Iban, dan lain-lain.'),
(5, 'Agama dan Kepercayaan', 'Kebebasan beragama dan kepelbagaian kepercayaan di bawah Perlembagaan Persekutuan.'),
(6, 'Perayaan Masyarakat di Malaysia', 'Sambutan meriah seperti Hari Raya, Tahun Baru Cina, Deepavali, Gawai, dan Kaamatan.'),
(7, 'Pemimpin di Malaysia', 'Peranan tokoh-tokoh negarawan dan pemimpin ulung yang mencorak kemerdekaan negara.'),
(8, 'Kemajuan Ekonomi Malaysia', 'Transformasi ekonomi daripada asas pertanian kepada perindustrian moden dan teknologi.'),
(9, 'Sukan Kebanggaan Malaysia', 'Pencapaian atlet negara di arena sukan antarabangsa yang menyatukan rakyat.'),
(10, 'Malaysia dan Dunia', 'Peranan aktif Malaysia dalam hubungan antarabangsa dan pertubuhan serantau ASEAN.')
ON DUPLICATE KEY UPDATE eraName = VALUES(eraName), description = VALUES(description);

-- 7. Table: EraProgression
INSERT INTO EraProgression (progressionID, studentID, eraID, eraStatus, unlockCondition) VALUES
(1, 'S1001', 1, 'unlocked', 'START'),
(2, 'S1001', 2, 'locked', 'COMPLETE_ERA_1'),
(3, 'S1001', 3, 'locked', 'COMPLETE_ERA_2'),
(4, 'S1001', 4, 'locked', 'COMPLETE_ERA_3'),
(5, 'S1001', 5, 'locked', 'COMPLETE_ERA_4'),
(6, 'S1001', 6, 'locked', 'COMPLETE_ERA_5'),
(7, 'S1001', 7, 'locked', 'COMPLETE_ERA_6'),
(8, 'S1001', 8, 'locked', 'COMPLETE_ERA_7'),
(9, 'S1001', 9, 'locked', 'COMPLETE_ERA_8'),
(10,'S1001', 10, 'locked', 'COMPLETE_ERA_9')
ON DUPLICATE KEY UPDATE progressionID = progressionID;   -- jangan tetap semula kemajuan pelajar apabila seed dijalankan semula

-- 8. Table: LearningProgression
INSERT INTO LearningProgression (trackID, studentID, completionRate, erasCompleted, bestScore, badgesEarned, artifactsUnlocked) VALUES
(1, 'S1001', 0.00, 0, 0, 0, 0)
ON DUPLICATE KEY UPDATE trackID = trackID;   -- jangan tetap semula kemajuan pelajar

-- ====================================================================
-- MODULE 3: DUAL-MODE ASSESSMENT
-- ====================================================================

-- 15. Table: QuestionBank
INSERT INTO QuestionBank (bankID, eraID) VALUES
(1, 1),
(2, 2),
(3, 3),
(4, 4),
(5, 5),
(6, 6),
(7, 7),
(8, 8),
(9, 9),
(10, 10)
ON DUPLICATE KEY UPDATE eraID = VALUES(eraID);

-- 17. Table: Assessment
-- Satu bank soalan setiap era dikongsi oleh dua penilaian: Formative (Wira) dan Summative (The Great Siege).
-- Formative: tiada markah lulus. Summative: requiredScore = markah lulus, artifactScore = markah artifak.
INSERT INTO Assessment (assessmentID, eraID, assessmentType, requiredScore, formativeConfig, summativeConfig) VALUES
(1, 1, 'Formative', 0, '{"maxAttempts": 3, "feedbackInstant": true}', NULL),
(2, 1, 'Summative', 40, NULL, '{"timeLimitMinutes": 30, "shuffleQuestions": true, "artifactScore": 80, "artifactID": 1}'),
(3, 2, 'Formative', 0, '{"maxAttempts": 3, "feedbackInstant": true}', NULL),
(4, 2, 'Summative', 40, NULL, '{"timeLimitMinutes": 30, "shuffleQuestions": true, "artifactScore": 80, "artifactID": 2}'),
(5, 3, 'Formative', 0, '{"maxAttempts": 3, "feedbackInstant": true}', NULL),
(6, 3, 'Summative', 40, NULL, '{"timeLimitMinutes": 30, "shuffleQuestions": true, "artifactScore": 80, "artifactID": 3}'),
(7, 4, 'Formative', 0, '{"maxAttempts": 3, "feedbackInstant": true}', NULL),
(8, 4, 'Summative', 40, NULL, '{"timeLimitMinutes": 30, "shuffleQuestions": true, "artifactScore": 80, "artifactID": 4}'),
(9, 5, 'Formative', 0, '{"maxAttempts": 3, "feedbackInstant": true}', NULL),
(10, 5, 'Summative', 40, NULL, '{"timeLimitMinutes": 30, "shuffleQuestions": true, "artifactScore": 80, "artifactID": 5}'),
(11, 6, 'Formative', 0, '{"maxAttempts": 3, "feedbackInstant": true}', NULL),
(12, 6, 'Summative', 40, NULL, '{"timeLimitMinutes": 30, "shuffleQuestions": true, "artifactScore": 80, "artifactID": 6}'),
(13, 7, 'Formative', 0, '{"maxAttempts": 3, "feedbackInstant": true}', NULL),
(14, 7, 'Summative', 40, NULL, '{"timeLimitMinutes": 30, "shuffleQuestions": true, "artifactScore": 80, "artifactID": 7}'),
(15, 8, 'Formative', 0, '{"maxAttempts": 3, "feedbackInstant": true}', NULL),
(16, 8, 'Summative', 40, NULL, '{"timeLimitMinutes": 30, "shuffleQuestions": true, "artifactScore": 80, "artifactID": 8}'),
(17, 9, 'Formative', 0, '{"maxAttempts": 3, "feedbackInstant": true}', NULL),
(18, 9, 'Summative', 40, NULL, '{"timeLimitMinutes": 30, "shuffleQuestions": true, "artifactScore": 80, "artifactID": 9}'),
(19, 10, 'Formative', 0, '{"maxAttempts": 3, "feedbackInstant": true}', NULL),
(20, 10, 'Summative', 40, NULL, '{"timeLimitMinutes": 30, "shuffleQuestions": true, "artifactScore": 80, "artifactID": 10}')
ON DUPLICATE KEY UPDATE assessmentType = VALUES(assessmentType);
-- Dijalankan semula: markah lulus dan artifak yang guru tetapkan TIDAK ditimpa.

-- ====================================================================
-- MODULE 5: REWARDS & COLLECTION
-- ====================================================================

-- 18. Table: Badge
INSERT INTO Badge (badgeID, eraID, badgeName, asset) VALUES
(1, 1, 'Lambang Penyatuan', '../assets/gameAsset/badge/badge_era1.png'),
(2, 2, 'Medal Identiti Negeri', '../assets/gameAsset/badge/badge_era2.png'),
(3, 3, 'Bintang 5 Prinsip', '../assets/gameAsset/badge/badge_era3.png'),
(4, 4, 'Tenunan Keharmonian Budaya', '../assets/gameAsset/badge/badge_era4.png'),
(5, 5, 'Lambang Tempat Perlindungan', '../assets/gameAsset/badge/badge_era5.png'),
(6, 6, 'Cahaya Perayaan Yang Abadi', '../assets/gameAsset/badge/badge_era6.png'),
(7, 7, 'Jata Negarawan', '../assets/gameAsset/badge/badge_era7.png'),
(8, 8, 'Lambang Kemajuan Industri Ekonomi', '../assets/gameAsset/badge/badge_era8.png'),
(9, 9, 'Emas Penghargaan Kebanggaan Negara', '../assets/gameAsset/badge/badge_era9.png'),
(10, 10, 'Lambang Kedaulatan Global', '../assets/gameAsset/badge/badge_era10.png')
ON DUPLICATE KEY UPDATE badgeName = VALUES(badgeName), asset = VALUES(asset);

-- 19. Table: Artifact
INSERT INTO Artifact (artifactID, artifactName, moralLesson, asset) VALUES
(1, 'Dokumen Pemasyhuran Malaysia', 'Kedaulatan negara terbina dengan rundingan atas ikatan perjanjian yang sah dan ikhlas.', '../assets/gameAsset/artifact/artifact_era1.png'),
(2, 'Cop Mohor Diraja', 'Identiti Negeri bukan melambangkan kesetiaan dan kedaulatan negara kita tetapi sejarah budaya dan warisan setiap negeri itu tersendiri...Hargai warisan moyang kita', '../assets/gameAsset/artifact/artifact_era2.png'),
(3, 'Plak Ukiran Rukun Negara', 'Rukun Negara itu sendiri dibentuk untuk melahirkan masyarakat yang progresif, harmoni dan bernilai murni bersatu membentuk satu bangsa dan negara, sekaligus dapat mempertahankan keadilan dan keutuhan negara kita Malaysia', '../assets/gameAsset/artifact/artifact_era3.png'),
(4, 'Sape & Gasing Emas', 'Setiap kaum di Malaysia mempunyai keunikan seni tradisional yang tersendiri yang berbeza dengan negara luar, inilah warisan negara yang harus dipelihara agar geenrasi masa hadapan dapat mengenali siapa kita', '../assets/gameAsset/artifact/artifact_era4.png'),
(5, 'Bekas Upacara Ritual', 'Amalan beragama dan kepercayaan dalam kehidupan menjadi panduan membentuk masyarakat lebih maju dan berdisiplin, amalan ini memimpin masyarakat supaya mempunyai matlamat dalam kehidupan dan suasana yang harmoni dalam masyarakat dapat diwujudkan', '../assets/gameAsset/artifact/artifact_era5.png'),
(6, 'Kad Raya Antik', 'Warisan perayaan di Malaysia menunjukkan sikap mesra antara satu sama lain yang mengeratkan silaturrahim antara pelbagai kaum dan menzahirkan sikap kekitaan terhadap masyarakat. Selain itu, warisan ini melambangkan keistimewaan terhadap masyarakat dan mengenal asal usul diri kita yang menjadi kebanggan kita sebagai rakyat Malaysia', '../assets/gameAsset/artifact/artifact_era6.png'),
(7, 'Dasar Pembangunan Negara', 'Wawasan Nasional harus diwujudkan oleh pemimpin yang berwibawa iaitu pemimpin yang bukan sahaja mewujudkan negara yang membangun dengan memajukan sistem ekonomi negara dan menjamin keselamatan negara, tapi juga membentuk kerajaan yang tersusun yang memudahkan dasar-dasar pembangunan negara...jadi hormatilah pemimpin yang berwibawa untuk masa depan negara', '../assets/gameAsset/artifact/artifact_era7.png'),
(8, 'Set Sabit Emas dan Kaliper', 'Negara kita meningkatkan pengeluaran bahan makanan tempatan dan membangunkan industri sawit juga biodiesel sawit membantu menyediakan peluang pekerjaan kepada penduduk dan melahirkan usahawan menerusi industri membangun di negara kita yang serta menyumbang kepada pendapatan negara menerusi pasaran tempatan dan juga antarabangsa, ekonomi inilah yang dapat menyediakan biasiswa untuk melanjutkan pelajaran', '../assets/gameAsset/artifact/artifact_era8.png'),
(9, 'Buku Wira Sukan Negara', 'Wira Atlet kita berbakti mengharumkan nama negara di kejohanan sukan dan juga menggalakkan perpaduan kerana rakyat bersatu menyokong pasukan negara kita dalam masa yang sama selain menarik pelancong datang ke negara kita jika menjadi tuan rumah temasya sukan, sukan juga menjadikan rakyat sihat dan cergas melalui penyertaan dalam aktiviti temasya sukan', '../assets/gameAsset/artifact/artifact_era9.png'),
(10, 'Warkah Watikah Kebangsaan', 'Pengiktirafan negara luar kepada Malaysia penting bukan sahaja bagi menjamin kedaulatan negara dan keselamatan negara daripada ancaman luar, hubungan yang baik dengan negara luar dapat memajukan sektor ekonomi dan sektor pendidikan hasil daripada Universiti Islam Antarabangsa', '../assets/gameAsset/artifact/artifact_era10.png')
ON DUPLICATE KEY UPDATE artifactName = VALUES(artifactName), moralLesson = VALUES(moralLesson);

COMMIT;
SET FOREIGN_KEY_CHECKS = 1;