import express from "express";
import {
  markAttendance,
  viewAttendance,
  applyForLeave,
  getProfile,
  editProfilePicture,
  getLeaves,
  updateLeave,
  getSingleLeave,
  deleteLeave,
  getNumbers,
} from "../controllers/user.js";
const router = express.Router();

// Mark Attendance
router.post("/user/attendance", markAttendance);

// View Attendance
router.get("/user/attendance", viewAttendance);

// Apply For Leave
router.post("/user/apply-leave/", applyForLeave);
router.get("/user/leaves/:userId", getLeaves);
router.get("/user/leave/:leaveId", getSingleLeave);
router.post("/user/leave/update", updateLeave);
router.delete("/leave", deleteLeave);

//get profile
router.get("/user/profile/:userId", getProfile);

// Edit Profile
router.post("/user/edit-profile-picture", editProfilePicture);

router.get("/user/statistics", getNumbers);

export default router;
