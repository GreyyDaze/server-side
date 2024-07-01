import express from "express";
import {
  getAttendanceSummary,
  getAdminProfile,
  editAdminProfilePic,
  getAllLeaves,
  approveLeave,
  getAllAttendance,
  getSingleAttendance,
  editAttendance,
  deleteAttendance,
  generateSystemReport,
  generateUsersReport,
  getAllUsers,
  createAttendance,
} from "../controllers/admin.js";

const router = express.Router();

// Get Student Attendance Summary
router.get("/attendance/summary", getAttendanceSummary);

// get admin profile
router.get("/admin/profile/:adminId", getAdminProfile);

// Edit admin Profile
router.post("/admin/edit-profile-picture", editAdminProfilePic);

// Get All Leaves
router.get("/leaves", getAllLeaves);

// Leave Approval
router.post("/admin/approve-leave", approveLeave);

// Get All Attendance
router.get("/attendance", getAllAttendance);

// Get Single Attendance
router.get("/attendance/:id", getSingleAttendance);

// Edit Single Attendance
router.post("/attendance/:id", editAttendance);

// Delete Attendance
router.delete("/attendance/:id", deleteAttendance);

// Specific Users Report
router.get("/users-report", generateUsersReport);

// System Report
router.get("/system-report", generateSystemReport);

// Get All Users
router.get("/users", getAllUsers);

// Create user attendance
router.post('/attendance', createAttendance);

export default router;
