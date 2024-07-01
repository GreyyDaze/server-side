import Attendance from "../models/attendance.js";
import Leave from "../models/leave.js";
import User from "../models/user.js";
import Admin from "../models/admin.js";
import cloudinary from "cloudinary";
import PDFDocument from "pdfkit";
import moment from "moment";
import mongoose from "mongoose";

// Get all attendance records
export const getAllAttendance = async (req, res) => {
  try {
    const attendanceRecords = await Attendance.find()
      .populate("userId", "userName email profilePic")
      .sort({ date: -1 });
    res.status(200).json(attendanceRecords);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error retrieving attendance records", error });
  }
};

// Get a single attendance record by ID
export const getSingleAttendance = async (req, res) => {
  const { id } = req.params;
  try {
    const attendanceRecord = await Attendance.findById(id).populate(
      "userId",
      "userName email profilePic"
    );
    if (!attendanceRecord) {
      return res.status(404).json({ message: "Attendance record not found" });
    }

    res.status(200).json(attendanceRecord);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error retrieving attendance record", error });
  }
};

// Edit specific attendance record
export const editAttendance = async (req, res) => {
  const { id } = req.params;
  const { date, status } = req.body;

  try {
    const updatedAttendance = await Attendance.findByIdAndUpdate(
      id,
      { date, status },
      { new: true, runValidators: true }
    );

    if (!updatedAttendance) {
      return res.status(404).json({ message: "Attendance record not found" });
    }

    res.status(200).json(updatedAttendance);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error updating attendance record", error });
  }
};

// Delete specific attendance record
export const deleteAttendance = async (req, res) => {
  const { id } = req.params;
  try {
    const deletedAttendance = await Attendance.findByIdAndDelete(id);

    if (!deletedAttendance) {
      return res.status(404).json({ message: "Attendance record not found" });
    }

    res.status(200).json({ message: "Attendance record deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error deleting attendance record", error });
  }
};


// Generate a PDF report for a specific users' attendance
export const generateUsersReport = async (req, res) => {
  const { userIds, startDate, endDate } = req.query;

  try {
    if (!userIds || userIds.length === 0) {
      return res.status(400).json({ message: "User IDs are required" });
    }

    let start, end;
    if (startDate && endDate) {
      start = moment(startDate).startOf("day").toDate();
      end = moment(endDate).add(1, "day").startOf("day").toDate();
    } else {
      start = moment().startOf("month").toDate();
      end = moment().endOf("month").add(1, "day").toDate();
    }

    const users = await User.find({ _id: { $in: userIds } }).select("userName email");

    const userAttendanceAggregates = await Attendance.aggregate([
      { $match: { userId: { $in: users.map(id => new mongoose.Types.ObjectId(id)) }, date: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: "$userId",
          attendanceRecords: { $push: { date: "$date", status: "$status" } },
        },
      },
    ]);

    console.log(userAttendanceAggregates)

    const userAttendanceMap = userAttendanceAggregates.reduce((acc, item) => {
      acc[item._id.toString()] = item.attendanceRecords;
      return acc;
    }, {});

    const doc = new PDFDocument();
    const chunks = [];

    doc.on("data", chunks.push.bind(chunks));
    doc.on("end", () => {
      const pdfData = Buffer.concat(chunks);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=attendance.pdf");
      res.send(pdfData);
    });

    doc.fontSize(20).text("Attendance Report", { align: "center" });
    doc.moveDown();

    for (let user of users) {
      doc.fontSize(16).text(`User: ${user.userName} (${user.email})`, { underline: true });
      doc.moveDown();

      const attendanceRecords = userAttendanceMap[user._id.toString()] || [];

      attendanceRecords.forEach((record) => {
        doc.fontSize(14).text(`Date: ${moment(record.date).format("YYYY-MM-DD")}`);
        doc.fontSize(14).text(`Status: ${record.status}`);
        doc.moveDown();
      });

      doc.moveDown();
    }

    doc.end();
  } catch (error) {
    console.error("Error generating attendance PDF:", error);
    res.status(500).json({ message: "Failed to generate attendance PDF", error });
  }
};

// Generate a system-wide attendance report
export const generateSystemReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let matchStage = {};

    if (startDate && endDate) {
      const start = moment(startDate).startOf("day").toDate();
      const end = moment(endDate).add(1, "day").startOf("day").toDate();

      matchStage = {
        $match: { date: { $gte: start, $lte: end } },
      };
    } else {
      const currentMonth = moment().startOf("month").toDate();
      const nextMonth = moment().endOf("month").add(1, "day").startOf("day").toDate();

      matchStage = {
        $match: { date: { $gte: currentMonth, $lte: nextMonth } },
      };
    }

    const attendanceRecords = await Attendance.aggregate([
      matchStage,
      { $sort: { date: -1 } },
      { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
      { $unwind: "$user" },
    ]);

    const doc = new PDFDocument();
    const chunks = [];

    doc.on("data", chunks.push.bind(chunks));
    doc.on("end", () => {
      const pdfData = Buffer.concat(chunks);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=attendance.pdf");
      res.send(pdfData);
    });

    doc.fontSize(20).text("Attendance Report", { align: "center" });
    doc.moveDown();

    attendanceRecords.forEach((record) => {
      const { user, status, date } = record;
      doc.fontSize(14).text(`Name: ${user.userName}`);
      doc.fontSize(14).text(`Email: ${user.email}`);
      doc.fontSize(14).text(`Status: ${status}`);
      doc.fontSize(14).text(`Date: ${moment(date).format("YYYY-MM-DD")}`);
      doc.moveDown();
    });

    doc.end();
  } catch (error) {
    res.status(500).json({ message: "An error occurred while generating the PDF", error });
  }
};

// Approve or reject a leave request
export const approveLeave = async (req, res) => {
  try {
    const { leaveId, status } = req.body;

    const leave = await Leave.findByIdAndUpdate(
      leaveId,
      { status },
      { new: true }
    );

    if (!leave) {
      return res.status(404).json({ message: "Leave request not found" });
    }

    if (status === "Approved") {
      const { userId, startDate, endDate } = leave;

      const attendanceRecords = await Attendance.find({
        userId,
        date: { $gte: new Date(startDate), $lte: new Date(endDate) },
      });

      const updatePromises = attendanceRecords.map((record) =>
        Attendance.findByIdAndUpdate(
          record._id,
          { status: "Leave" },
          { new: true }
        )
      );

      await Promise.all(updatePromises);
    }

    res.status(200).json(leave);
  } catch (error) {
    console.error("Error approving leave:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getAllLeaves = async (req, res) => {
  try {
    const leaves = await Leave.find().populate(
      "userId",
      "userName email profilePic"
    );

    res.status(200).json(leaves);
  } catch (error) {
    console.error("Error fetching leaves:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getAttendanceSummary = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0); 

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const presentCount = await Attendance.countDocuments({
      status: "Present",
      date: {
        $gte: today,
        $lt: tomorrow,
      },
    });

    const absentCount = await Attendance.countDocuments({
      status: "Absent",
      date: {
        $gte: today,
        $lt: tomorrow,
      },
    });

    const pendingLeaveCount = await Leave.countDocuments({
      status: "Pending",
    });

    const todayAttendance = await Attendance.find({
      date: {
        $gte: today,
        $lt: tomorrow,
      },
    }).populate("userId", "userName email profilePic");

    res.status(200).json({
      presentCount,
      absentCount,
      pendingLeaveCount,
      todayAttendance,
    });
  } catch (error) {
    console.error("Error fetching attendance summary:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getAdminProfile = async (req, res) => {
  try {
    const { adminId } = req.params;

    const admin = await Admin.findById(adminId, { password: 0 });
    if (!admin) {
      return res.status(201).json({ error: "Admin not found" });
    }

    res.status(200).json(admin);
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
});

export const editAdminProfilePic = async (req, res) => {
  try {
    const { adminId, profilePicture } = req.body;

    // console.log(req.body);
    const uploadedImage = await cloudinary.uploader.upload(profilePicture);

    const admin = await Admin.findByIdAndUpdate(
      adminId,
      { profilePic: uploadedImage.secure_url },
      { new: true }
    );

    console.log(admin);
    if (!admin) {
      return res.status(201).json({ error: "Admin not found" });
    }

    res.status(200).json({
      message: "Profile picture updated successfully",
    });
  } catch (error) {
    console.error("Error updating profile picture:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getAllUsers = async (req, res) => {
  try {

    const users = await User.find();

    if (!users || users.length === 0) {
      return res.status(201).json({ error: "No users found" });
    }

    res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Failed to fetch users", error });
  }
};

// Controller function to create user attendance
export const createAttendance = async (req, res) => {
  const { userId, status, date } = req.body;

  try {
    const existingAttendance = await Attendance.findOne({ userId, date });

    if (existingAttendance) {
      return res.status(201).json({
        error: "Attendance already recorded for this user on this date.",
      });
    }

    const newAttendance = new Attendance({
      userId,
      status,
      date,
    });

    await newAttendance.save();

    res
      .status(200)
      .json({ message: "Attendance successfully created", newAttendance });
  } catch (error) {
    console.error("Error creating attendance:", error);
    res.status(500).json({ error: "Failed to create attendance." });
  }
};
