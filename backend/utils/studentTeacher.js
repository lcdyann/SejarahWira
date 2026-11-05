import db from '../config/db.js';
import { PUBLIC_CLASS_ID } from '../models/Class.js';

/**
 * Guru kelas seorang pelajar (Student -> Class -> teacherID), atau null untuk pelajar awam (kelas PUBLIC).
 * Dipakai untuk menentukan kandungan tambahan guru (naratif, soalan) yang boleh dilihat pelajar itu.
 * Satu guru boleh mengajar banyak kelas, jadi kandungan guru itu dilihat oleh semua kelasnya.
 */
export const teacherOfStudent = async (studentID) => {
  const [rows] = await db.query(
    `SELECT c.teacherID FROM Student st JOIN Class c ON c.classID = st.classID
     WHERE st.studentID = ? AND c.classID <> ? LIMIT 1`, [studentID, PUBLIC_CLASS_ID]);
  return rows[0] ? rows[0].teacherID : null;
};
