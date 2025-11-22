import { query } from "@/lib/db";

export async function GET() {
  // Log the incoming request
  console.log("[API /api/dashboard-data] Incoming GET request");
  try {
    // KPIs - Total Users
    const totalUsersResult = await query("users", [
      { $count: "total" }
    ]);
    const totalUsers = totalUsersResult.rows[0]?.total || 0;

    // Total Interviews
    const totalInterviewsResult = await query("interviews", [
      { $count: "total" }
    ]);
    const totalInterviews = totalInterviewsResult.rows[0]?.total || 0;

    // Total Courses
    const totalCoursesResult = await query("courses", [
      { $match: { isPublished: true } },
      { $count: "total" }
    ]);
    const totalCourses = totalCoursesResult.rows[0]?.total || 0;

    // Total Practice Attempts
    const totalPracticeResult = await query("practicehistories", [
      { $count: "total" }
    ]);
    const totalPractice = totalPracticeResult.rows[0]?.total || 0;

    // Total Revenue (from orders)
    const revenueResult = await query("orders", [
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" }
        }
      }
    ]);
    const totalRevenue = revenueResult.rows[0]?.totalRevenue || 0;

    // Log KPIs
    console.log("[API /api/dashboard-data] KPIs:", {
      totalUsers,
      totalInterviews,
      totalCourses,
      totalPractice,
      totalRevenue,
    });

    // Users over time (monthly)
    const usersOverTime = await query("users", [
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1 }
      },
      {
        $project: {
          _id: 0,
          month: {
            $dateFromParts: {
              year: "$_id.year",
              month: "$_id.month",
              day: 1
            }
          },
          count: 1
        }
      }
    ]);

    // Interviews by status
    const interviewsByStatus = await query("interviews", [
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          status: "$_id",
          count: 1
        }
      }
    ]);

    // Top courses by enrollment (users with course in their course array)
    const topCourses = await query("users", [
      { $unwind: { path: "$course", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$course",
          enrollmentCount: { $sum: 1 }
        }
      },
      { $sort: { enrollmentCount: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "courses",
          localField: "_id",
          foreignField: "_id",
          as: "courseData"
        }
      },
      { $unwind: { path: "$courseData", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          courseId: "$_id",
          courseName: "$courseData.name",
          enrollmentCount: 1
        }
      }
    ]);

    // Practice performance (average scores)
    const practicePerformance = await query("practicehistories", [
      {
        $group: {
          _id: null,
          avgScore: { $avg: "$score" },
          totalAttempts: { $sum: 1 },
          avgCorrectAnswers: { $avg: "$correctAnswers" },
          avgIncorrectAnswers: { $avg: "$incorrectAnswers" }
        }
      }
    ]);

    // Recent activity (last 7 days)
    const recentActivity = await query("users", [
      {
        $match: {
          createdAt: {
            $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          date: "$_id",
          count: 1
        }
      }
    ]);

    // Drill-down: User details with course enrollment
    const drilldown = await query("users", [
      {
        $project: {
          _id: 1,
          name: 1,
          email: 1,
          role: 1,
          courseCount: { $size: { $ifNull: ["$course", []] } },
          createdAt: 1
        }
      },
      { $sort: { createdAt: -1 } },
      { $limit: 100 }
    ]);

    // Log the final response
    const responseObj = {
      kpis: {
        totalUsers,
        totalInterviews,
        totalCourses,
        totalPractice,
        totalRevenue,
      },
      usersOverTime: usersOverTime.rows,
      interviewsByStatus: interviewsByStatus.rows,
      topCourses: topCourses.rows,
      practicePerformance: practicePerformance.rows[0] || {},
      recentActivity: recentActivity.rows,
      drilldown: drilldown.rows,
    };
    console.log("[API /api/dashboard-data] Final response:", responseObj);
    return new Response(
      JSON.stringify(responseObj),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[API /api/dashboard-data] Internal server error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
