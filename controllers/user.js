import Attendance from "../models/attendance.js";
import Grade from "../models/grade.js";
import User from "../models/user.js";
import cloudinary from "cloudinary";
import cron from "node-cron";
import dotenv from "dotenv";
import moment from "moment";
import Leave from "../models/leave.js";


dotenv.config();

// Mark Attendance
export const markAttendance = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(201).json({ error: "User ID is required" });
    }

    const nowUTC = moment.utc().local();
    const startOfTodayUTC = nowUTC.clone().startOf("day");
    const endOfTodayUTC = nowUTC.clone().endOf("day");


    const existingAttendance = await Attendance.findOne({
      userId,
      date: {
        $gte: startOfTodayUTC.toDate(),
        $lte: endOfTodayUTC.toDate(),
      },
    });

    if (existingAttendance) {
      return res
        .status(201)
        .json({ error: "Attendance already marked for today" });
    }

    const attendance = new Attendance({
      userId,
      date: nowUTC,
      status: "Present",
    });
    await attendance.save();

    res.status(200).json({ message: "Attendance marked successfully" });
  } catch (error) {
    console.error("Error marking attendance:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// View Attendance
export const viewAttendance = async (req, res) => {
  try {
    const { userId, limit } = req.query; // Extract userId and limit from request body

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const limitNumber = Number(limit);
    let options = { sort: { date: -1 } };

    if (limitNumber === 1) {
      const today = new Date();
      today.setHours(0, 0, 0, 0); 

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1); 

      const query = {
        userId,
        date: {
          $gte: today,
          $lt: tomorrow,
        },
      };

      const attendance = await Attendance.find(query).populate(
        "userId",
        "userName email profilePic"
      );
      return res.status(200).json(attendance);
    } else {
      options =
        limitNumber > 0
          ? { limit: limitNumber, sort: { date: -1 } }
          : { sort: { date: -1 } };
      const query = { userId };
      const attendance = await Attendance.find(query, null, options).populate(
        "userId",
        "userName email profilePic"
      );
      return res.status(200).json(attendance);
    }
  } catch (error) {
    console.error("Error fetching attendance:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Apply For Leave
export const applyForLeave = async (req, res) => {
  try {
    const { userId, fromDate, toDate, reason } = req.body;

    const startDate = new Date(fromDate);
    const endDate = new Date(toDate);
    console.log(startDate, endDate, "startDate");

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (isNaN(startDate) || isNaN(endDate)) {
      return res.status(201).json({ error: "Invalid date format" });
    }

    if (startDate < today || endDate < today) {
      return res
        .status(201)
        .json({ error: "Cannot apply for leave in the past" });
    }

    const overlappingLeave = await Leave.findOne({
      userId,
      $or: [
        { startDate: { $lte: endDate, $gte: startDate } },
        { endDate: { $lte: endDate, $gte: startDate } },
        { startDate: { $lt: startDate }, endDate: { $gt: endDate } },
      ],
    });

    if (overlappingLeave) {
      return res.status(201).json({
        error:
          "Leave request dates overlaps with an existing leave dates. Please update your existing leave request.",
      });
    }

    const dates = [];
    for (
      let d = new Date(startDate);
      d <= endDate;
      d.setDate(d.getDate() + 1)
    ) {
      dates.push(new Date(d));
    }

    console.log(dates);

    const monthStart = new Date(
      startDate.getFullYear(),
      startDate.getMonth(),
      1
    );
    const monthEnd = new Date(
      startDate.getFullYear(),
      startDate.getMonth() + 1,
      0
    );

    const leaveCount = await Attendance.countDocuments({
      userId,
      date: { $gte: monthStart, $lte: monthEnd },
      status: "Leave",
    });

    if (leaveCount + dates.length > 7) {
      return res
        .status(201)
        .json({ error: "Only 7 leaves are allowed in a month" });
    }

    const leaveRequest = new Leave({
      userId,
      startDate: fromDate,
      endDate: toDate,
      reason,
    });
    await leaveRequest.save();

    console.log(leaveRequest, "leaveRequest");

    const attendancePromises = dates.map((date) => {
      const attendance = new Attendance({
        userId,
        date,
        status: "Absent",
      });
      return attendance.save();
    });

    await Promise.all(attendancePromises);
    console.log(attendancePromises, "attendance");

    res
      .status(200)
      .json({ message: "Leave request submitted successfully", leaveRequest });
  } catch (error) {
    console.error("Error applying for leave:", error); // Log the error for debugging
    res
      .status(500)
      .json({ message: "Error applying for leave", error: error.message });
  }
};

export const getLeaves = async (req, res) => {
  try {
    const { userId } = req.params;

    const leaves = await Leave.find({ userId })
      .populate("userId", "userName email profilePic")
      .exec();

    if (!leaves || leaves.length === 0) {
      return res
        .status(201)
        .json({ error: "No leave records found for this user" });
    }

    res.status(200).json(leaves);
  } catch (error) {
    console.error("Error retrieving leave records:", error); // Log the error for debugging
    res.status(500).json({
      message: "Error retrieving leave records",
      error: error.message,
    });
  }
};

export const getSingleLeave = async (req, res) => {
  try {
    const { leaveId } = req.params;

    console.log(req.body, "req.params");

    const leave = await Leave.findById(leaveId).populate(
      "userId",
      "userName email profilePic"
    );

    if (!leave) {
      return res.status(201).json({ error: "Leave request not found" });
    }

    res.status(200).json(leave);
  } catch (error) {
    console.error("Error fetching leave request:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const updateLeave = async (req, res) => {
  try {
    const { leaveId, startDate, endDate, reason } = req.body;

    console.log(req.body, "req.body");

    const leave = await Leave.findById(leaveId);
    if (!leave) {
      return res.status(201).json({
        error:
          "Leave request not found or you do not have permission to update this leave.",
      });
    }

    const today = moment().startOf("day");
    const leaveStart = moment(leave.startDate).startOf("day");
    const leaveEnd = moment(leave.endDate).startOf("day");

    if (leave.status !== "Pending" && leaveStart.isBefore(today)) {
      return res.status(201).json({
        error:
          "You can only update pending leave requests or leave requests for today or later.",
      });
    }

    const isDateChanged =
      startDate !== leave.startDate || endDate !== leave.endDate;

    if (isDateChanged) {
      const previousDates = [];
      for (
        let d = new Date(leave.startDate);
        d <= new Date(leave.endDate);
        d.setDate(d.getDate() + 1)
      ) {
        previousDates.push(new Date(d).toISOString().split("T")[0]);
      }

      await Attendance.deleteMany({
        userId: leave.userId,
        date: { $in: previousDates },
      });
    }

    leave.startDate = startDate || leave.startDate;
    leave.endDate = endDate || leave.endDate;
    leave.reason = reason || leave.reason;

    await leave.save();

    const dates = [];
    for (
      let d = new Date(startDate);
      d <= new Date(endDate);
      d.setDate(d.getDate() + 1)
    ) {
      dates.push(new Date(d).toISOString().split("T")[0]);
    }

    const attendancePromises = dates.map((date) => {
      const attendance = new Attendance({
        userId: leave.userId,
        date: date,
        status: "Absent",
      });
      return attendance.save();
    });

    await Promise.all(attendancePromises);

    res
      .status(200)
      .json({ message: "Leave request updated successfully", leave });
  } catch (error) {
    console.error("Error updating leave request:", error);
    res
      .status(500)
      .json({ message: "Error updating leave request", error: error.message });
  }
};

export const deleteLeave = async (req, res) => {
  try {
    const { leaveId } = req.query;
    console.log(req.query, "req.body");

    const leave = await Leave.findById(leaveId);
    if (!leave) {
      return res.status(201).json({ error: "Leave request not found" });
    }

    const today = moment().startOf("day");
    const leaveStartDate = moment(leave.startDate).startOf("day");

    if (leaveStartDate.isBefore(today)) {
      return res.status(201).json({
        error:
          "You can only delete leave requests that start from today or later",
      });
    }

    await leave.deleteOne();

    const dates = [];
    for (
      let d = new Date(leave.startDate);
      d <= new Date(leave.endDate);
      d.setDate(d.getDate() + 1)
    ) {
      dates.push(new Date(d).toISOString().split("T")[0]);
    }

    await Attendance.deleteMany({
      userId: leave.userId,
      date: { $in: dates },
    });

    res.status(200).json({
      message: "Leave request and attendance records deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting leave request:", error);
    res
      .status(500)
      .json({ message: "Error deleting leave request", error: error.message });
  }
};
// Get Profile
export const getProfile = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId, { password: 0 });
    if (!user) {
      return res.status(201).json({ error: "User not found" });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Configure Cloudinary with your credentials
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
});

export const editProfilePicture = async (req, res) => {
  try {
    const { userId, profilePicture } = req.body;

    // console.log(req.body);
    const uploadedImage = await cloudinary.uploader.upload(profilePicture);

    // Update user's profile picture in the database
    const user = await User.findByIdAndUpdate(
      userId,
      { profilePic: uploadedImage.secure_url },
      { new: true }
    );

    console.log(user);
    if (!user) {
      return res.status(201).json({ error: "User not found" });
    }

    res.status(200).json({
      message: "Profile picture updated successfully",
    });
  } catch (error) {
    console.error("Error updating profile picture:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getNumbers = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(201).json({ message: "UserId is required" });
    }


    const attendanceRecords = await Attendance.find({ userId }).sort({
      date: 1,
    });

    let presentCount = 0;
    let absentCount = 0;
    let leaveCount = 0;

    attendanceRecords.forEach((record) => {
      switch (record.status) {
        case "Present":
          presentCount++;
          break;
        case "Absent":
          absentCount++;
          break;
        case "Leave":
          leaveCount++;
          break;
        default:
          break;
      }
    });

    const response = {
      present: presentCount,
      absent: absentCount,
      leave: leaveCount,
      data: attendanceRecords,
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching attendance statistics:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Schedule the task to run every day at 7 PM
cron.schedule("0 19 * * *", async () => {
  try {
    const users = await User.find();

    for (const user of users) {
      const existingAttendance = await Attendance.findOne({
        userId: user._id,
        createdAt: { $gte: new Date().setHours(0, 0, 0, 0) }, 
      });

      if (!existingAttendance) {
        await Attendance.create({
          userId: user._id,
          status: "Absent", 
        });
      }
    }

    console.log("Attendance records created successfully.");
  } catch (error) {
    console.error("Error creating attendance records:", error);
  }
});


