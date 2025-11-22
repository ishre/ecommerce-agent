import { NextRequest } from "next/server";
import { askGemini } from "@/lib/gemini";
import { query } from "@/lib/db";
import { Document, Filter, ObjectId } from "mongodb";

// -------------- Types --------------------

type IntentType =
  | "student-profile"
  | "student-performance"
  | "interview-history"
  | "course-progress"
  | "leaderboard"
  | "candidate-recommendation"
  | "generic";

interface ClassifiedIntent {
  intent: IntentType;
  candidateName?: string;
  candidateEmailOrPhone?: string;
  jobDescription?: string;
  topK?: number;
}


// -------------- Helpers ------------------

// Remove Mongo-specific and heavy fields before sending to LLM
function cleanForLLM(data: unknown): unknown {
  return JSON.parse(
    JSON.stringify(data, (key, value) => {
      // Strip Mongo/BSON ObjectIds
      if (value && typeof value === "object" && "_bsontype" in value && (value as { _bsontype?: string })._bsontype === "ObjectID") {
        return undefined;
      }
      // Strip heavy / irrelevant fields
      if (["html", "css", "video", "pdfLink", "otherFile", "body", "resumeFileUrl"].includes(key)) {
        return undefined;
      }
      return value;
    })
  );
}

// Limit large arrays so we don't overwhelm the model
function limitForLLM(data: unknown, maxItems = 50): unknown {
  if (Array.isArray(data)) return data.slice(0, maxItems);
  return data;
}

// Safe JSON parse for Gemini responses that might include extra text or ``` blocks
function safeJSONParse<T = unknown>(text: string): T | null {
  try {
    let cleaned = text.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/```[a-z]*\n?/i, "").replace(/```$/, "").trim();
    }
    cleaned = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

// Build a Mongo $match filter for users based on name/email/phone
function buildUserMatchFilter(ci: ClassifiedIntent): Filter<Document> {
  const or: Filter<Document>[] = [];
  if (ci.candidateEmailOrPhone) {
    or.push({ email: ci.candidateEmailOrPhone });
    or.push({ phoneNumber: ci.candidateEmailOrPhone });
  }
  if (ci.candidateName) {
    const rx = new RegExp(ci.candidateName, "i");
    or.push({ name: rx });
    or.push({ firstname: rx });
    or.push({ lastname: rx });
  }
  if (or.length === 0) return {}; // no specific user; handled as "all" where needed
  return { $or: or };
}

// -------------- LLM: Intent Classification ------------------

async function classifyQuestion(
  question: string,
  model: string | undefined
): Promise<ClassifiedIntent> {
  const prompt = `
You are an AI assistant that classifies admin questions about students and candidates.

Given the user's question, output a JSON object with:
- "intent": one of [
  "student-profile",
  "student-performance",
  "interview-history",
  "course-progress",
  "leaderboard",
  "candidate-recommendation",
  "generic"
]
- "candidateName": (optional) student's name if mentioned, otherwise null
- "candidateEmailOrPhone": (optional) if clearly mentioned as email or phone, otherwise null
- "jobDescription": (optional) job description text if the question is about best/suitable candidate for a role (copy it from the question), otherwise null
- "topK": (optional) number of top candidates requested (default 5 if not specified)

Rules:
- If the question asks "who is best", "most suitable", "which student is best", or clearly includes a job description → intent = "candidate-recommendation".
- If the question clearly refers to one specific student and mentions performance, score, strengths, weaknesses, aptitude, or interviews → intent = "student-performance".
- If it is about interview history/details → intent = "interview-history".
- If it is about aptitude or practice performance → intent = "student-performance".
- If it is about top scorers, highest score, leaderboard → intent = "leaderboard".
- If it is about course completion or learning progress → intent = "course-progress".
- If it is about general info of a student without explicit performance → intent = "student-profile".
- Otherwise → intent = "generic".

Respond with ONLY the JSON object. No explanation, no markdown.

User question: "${question}"
`;

  const res = await askGemini(prompt, model as "flash" | "pro");
  const text =
    res?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "{}";

  const parsed = safeJSONParse<ClassifiedIntent>(text);
  if (!parsed || !parsed.intent) {
    return { intent: "generic" };
  }

  return {
    intent: parsed.intent,
    candidateName: parsed.candidateName || undefined,
    candidateEmailOrPhone: parsed.candidateEmailOrPhone || undefined,
    jobDescription: parsed.jobDescription || undefined,
    topK: parsed.topK || 5,
  };
}

// -------------- DB Fetchers (READ-ONLY) ------------------

// Full student intelligence object for specific student(s)
async function fetchStudentIntelligence(ci: ClassifiedIntent) {
  const matchFilter = buildUserMatchFilter(ci);

  const pipeline: Document[] = [];
  if (Object.keys(matchFilter).length > 0) {
    pipeline.push({ $match: matchFilter });
  }

  pipeline.push(
    // JRS attempts
    {
      $lookup: {
        from: "jrsattempts",
        localField: "_id",
        foreignField: "user",
        as: "jrsAttempts",
      },
    },
    // Interview results for this candidate
    {
      $lookup: {
        from: "interview_results",
        localField: "_id",
        foreignField: "attemptedby_id",
        as: "interviewResults",
      },
    },
    // Applied interviews + interview docs
    {
      $lookup: {
        from: "appliedcandidates",
        localField: "_id",
        foreignField: "interviewee",
        as: "applications",
      },
    },
    {
      $lookup: {
        from: "interviews",
        localField: "applications.interviewId",
        foreignField: "_id",
        as: "interviews",
      },
    },
    // Aptitude / practice histories
    {
      $lookup: {
        from: "practicehistories",
        localField: "_id",
        foreignField: "user",
        as: "practiceHistories",
      },
    },
    // Formal exam histories
    {
      $lookup: {
        from: "examhistories",
        localField: "_id",
        foreignField: "userId",
        as: "examHistories",
      },
    },
    // Latest AI resume (if any)
    {
      $lookup: {
        from: "resumewithais",
        let: { uid: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$user", "$$uid"] } } },
          { $sort: { updatedAt: -1 } },
          { $limit: 1 },
        ],
        as: "resumeAI",
      },
    },
    // Latest trailresume (main resume store)
    {
      $lookup: {
        from: "trailresumes",
        let: { uid: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$user", "$$uid"] } } },
          { $sort: { updatedAt: -1 } },
          { $limit: 1 },
        ],
        as: "resumeTrail",
      },
    },
    // Course progress
    {
      $lookup: {
        from: "progresstracks",
        localField: "_id",
        foreignField: "userId",
        as: "progressTracks",
      },
    },
    {
      $lookup: {
        from: "courses",
        localField: "course",
        foreignField: "_id",
        as: "coursesDetail",
      },
    },
    // Skills metadata
    {
      $lookup: {
        from: "skills",
        localField: "_id",
        foreignField: "creatorid",
        as: "skillsMeta",
      },
    },
    {
      $project: {
        password: 0,
      },
    }
  );

  const result = await query("users", pipeline);
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows))
    return result.rows;
  return [];
}

// Leaderboard by JRS + aptitude + resume score
async function fetchLeaderboard(topK: number) {
  const pipeline: Document[] = [
    {
      $lookup: {
        from: "jrsattempts",
        localField: "_id",
        foreignField: "user",
        as: "jrsAttempts",
      },
    },
    {
      $lookup: {
        from: "practicehistories",
        localField: "_id",
        foreignField: "user",
        as: "practiceHistories",
      },
    },
    {
      $lookup: {
        from: "resumewithais",
        localField: "_id",
        foreignField: "user",
        as: "resumesAI",
      },
    },
    {
      $addFields: {
        avgJrsScore: { $avg: "$jrsAttempts.scores.overall" },
        avgAptitudeScore: { $avg: "$practiceHistories.score" },
        bestResumeScore: { $max: "$resumesAI.atsCompliance" },
      },
    },
    {
      $addFields: {
        rankingScore: {
          $add: [
            { $multiply: ["$avgJrsScore", 0.4] },
            { $multiply: ["$avgAptitudeScore", 0.3] },
            { $multiply: ["$bestResumeScore", 0.3] },
          ],
        },
      },
    },
    { $sort: { rankingScore: -1 } },
    { $limit: topK },
    {
      $project: {
        name: 1,
        email: 1,
        phoneNumber: 1,
        avgJrsScore: 1,
        avgAptitudeScore: 1,
        bestResumeScore: 1,
        rankingScore: 1,
      },
    },
  ];

  const result = await query("users", pipeline);
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows))
    return result.rows;
  return [];
}

// Candidate pool for job recommendation (Mode B: selective)
async function fetchCandidatePoolForJob(topK: number) {
  const pipeline: Document[] = [
    {
      $lookup: {
        from: "skills",
        localField: "_id",
        foreignField: "creatorid",
        as: "skillsMeta",
      },
    },
    {
      $lookup: {
        from: "resumewithais",
        localField: "_id",
        foreignField: "user",
        as: "resumesAI",
      },
    },
    {
      $lookup: {
        from: "trailresumes",
        localField: "_id",
        foreignField: "user",
        as: "resumesTrail",
      },
    },
    {
      $lookup: {
        from: "jrsattempts",
        localField: "_id",
        foreignField: "user",
        as: "jrsAttempts",
      },
    },
    {
      $lookup: {
        from: "practicehistories",
        localField: "_id",
        foreignField: "user",
        as: "practiceHistories",
      },
    },
    {
      $project: {
        name: 1,
        email: 1,
        phoneNumber: 1,
        skills: 1,
        workExperience: 1,
        education: 1,
        linkedin: 1,
        skillsMeta: 1,
        resumesAI: {
          name: 1,
          jobProfile: 1,
          summary: 1,
          skills: 1,
          atsCompliance: 1,
          completeness: 1,
        },
        resumesTrail: 1,
        jrsAttempts: {
          scores: 1,
          aptitudeFeedback: 1,
          technicalFeedback: 1,
          softSkillsFeedback: 1,
        },
        practiceHistories: {
          score: 1,
          totalQuestions: 1,
          correctAnswers: 1,
        },
      },
    },
    { $limit: Math.max(topK * 5, 50) },
  ];

  const result = await query("users", pipeline);
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows))
    return result.rows;
  return [];
}

// Hydrate interview question IDs → actual question text from "interviewquestions"
async function hydrateInterviewQuestionsForProfiles(profiles: Document[]): Promise<Document[]> {
  const questionIds: Set<unknown> = new Set();

  for (const profile of profiles) {
    const interviews = profile.interviews || [];
    for (const iv of interviews) {
      const qArr = iv.interviewquestions || [];
      if (Array.isArray(qArr)) {
        for (const q of qArr) {
          if (!q) continue;
          if (typeof q === "string" || typeof q === "number") {
            questionIds.add(q);
          } else if (q._id) {
            questionIds.add(q._id);
          } else if (q.questionId) {
            questionIds.add(q.questionId);
          }
        }
      }
    }
  }

  if (questionIds.size === 0) return profiles;

  const idsArray = Array.from(questionIds);
  const objectIds = idsArray.filter((v): v is ObjectId => v instanceof ObjectId);
  const stringIds = idsArray.filter((v): v is string => typeof v === "string");

  const orConditions: Filter<Document>[] = [];
  if (objectIds.length > 0) {
    orConditions.push({ _id: { $in: objectIds } });
  }
  if (stringIds.length > 0) {
    orConditions.push({ questionId: { $in: stringIds } });
  }

  const pipeline: Document[] = [
    {
      $match: {
        ...(orConditions.length > 0 ? { $or: orConditions } : {}),
      },
    },
    {
      $project: {
        question: 1,
        suggestedAnswer: 1,
        questiontype: 1,
        questionId: 1,
      },
    },
  ];

  const result = await query("interviewquestions", pipeline);
  const questions =
    Array.isArray(result) ? result : (result && typeof result === "object" && "rows" in result ? result.rows : []) || [];

  const byId = new Map<string, Document>();
  for (const q of questions) {
    const key1 = q._id ? String(q._id) : null;
    const key2 = q.questionId ? String(q.questionId) : null;
    if (key1) byId.set(key1, q);
    if (key2) byId.set(key2, q);
  }

  // Attach resolved question details back into profiles
  for (const profile of profiles) {
    const interviews = profile.interviews || [];
    for (const iv of interviews) {
      const qArr = iv.interviewquestions || [];
      const enriched: Document[] = [];
      for (const q of qArr || []) {
        let lookupKey: string | null = null;
        if (typeof q === "string" || typeof q === "number") {
          lookupKey = String(q);
        } else if (q && q._id) {
          lookupKey = String(q._id);
        } else if (q && q.questionId) {
          lookupKey = String(q.questionId);
        }
        if (lookupKey) {
          const questionDoc = byId.get(lookupKey);
          if (questionDoc) {
            enriched.push(questionDoc);
          }
        }
      }
      iv.interviewQuestionDetails = enriched;
    }
  }

  return profiles;
}

// -------------- Main Endpoint (READ-ONLY) ------------------

export async function POST(req: NextRequest) {
  console.log("[API /api/ask] Incoming POST request");

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let body: { question?: string; visualMode?: boolean; model?: string } | null = null;
        try {
          body = await req.clone().json();
          console.log("[API /api/ask] Body:", body);
        } catch {
          body = {};
        }

        if (!body || !body.question || typeof body.question !== "string") {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                stage: "error",
                error: "No question provided.",
              }) + "\n"
            )
          );
          controller.close();
          return;
        }

        const { question, visualMode, model } = body;

        // Stage: understanding / intent classification
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              stage: "understanding",
              message: "Understanding your question…",
            }) + "\n"
          )
        );

        const classified = await classifyQuestion(question, model);
        console.log("[API /api/ask] Classified intent:", classified);

        // Stage: fetching data (READ-ONLY aggregations)
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              stage: "fetching",
              message: "Fetching relevant data…",
            }) + "\n"
          )
        );

        let rawData: Document[] | { note: string } | null = null;

        if (
          classified.intent === "student-profile" ||
          classified.intent === "student-performance" ||
          classified.intent === "interview-history" ||
          classified.intent === "course-progress"
        ) {
          rawData = await fetchStudentIntelligence(classified);
        } else if (classified.intent === "leaderboard") {
          rawData = await fetchLeaderboard(classified.topK || 5);
        } else if (classified.intent === "candidate-recommendation") {
          // If specific candidate mentioned + JD → evaluate that candidate
          if (classified.candidateName || classified.candidateEmailOrPhone) {
            rawData = await fetchStudentIntelligence(classified);
          } else {
            // Otherwise recommend among pool
            rawData = await fetchCandidatePoolForJob(classified.topK || 5);
          }
        } else {
          rawData = { note: "No specific intent detected. No data queried." };
        }

        // Hydrate interview question IDs for student-related intents
        if (
          Array.isArray(rawData) &&
          rawData.length > 0 &&
          (classified.intent === "student-profile" ||
            classified.intent === "student-performance" ||
            classified.intent === "interview-history" ||
            classified.intent === "candidate-recommendation")
        ) {
          rawData = await hydrateInterviewQuestionsForProfiles(rawData);
        }

        console.log(
          "[API /api/ask] Raw data type:",
          Array.isArray(rawData)
            ? `array(${rawData.length})`
            : typeof rawData
        );

        // Stage: explaining
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              stage: "explaining",
              message: "Analyzing and writing answer…",
            }) + "\n"
          )
        );

        const cleaned = cleanForLLM(rawData);
        const limited = limitForLLM(cleaned, 50);

        const explainPrompt = `
You are an AI assistant helping college admins and placement officers.

You are given:
1) The user's question.
2) An intent classification.
3) Structured data from the platform (students, resumes, JRS scores, aptitude, interviews, interview questions, etc).

Your job:
- Analyze ONLY the provided data.
- Answer the question clearly and accurately.
- Keep the answer SHORT: usually 2–4 sentences, unless the user explicitly asks for detailed explanation.
- Do NOT mention databases, collections, JSON, MongoDB, or technical details.

Guidance by intent:
- If the intent is "student-performance" or "interview-history":
  - Use interview results, JRS attempts, aptitude/practice scores, and feedback fields to describe how the student has performed.
  - Identify clear strengths and weaknesses (e.g., strong communication, solid problem-solving, needs improvement in time management).
- If the question is like "Is Ajay a good fit for this job profile based on his resume":
  - Read the student's resume data (summary, jobProfile, skills, projects, experiences, education) in the structured data.
  - Compare it against the job description.
  - Decide if they are a strong fit, partial fit, or poor fit.
  - Give a brief justification referencing skills, years of experience, and domain relevance.
- If the intent is "leaderboard":
  - Briefly describe the top candidates and what makes them stand out.
- If the intent is "candidate-recommendation" without a specific name:
  - Use the job description and candidate pool to pick and rank the best candidates.
  - Keep explanation short and focused.

If some information is missing in the data, say so politely instead of guessing.

User question: "${question}"

Intent (for your reference, not to be repeated verbatim):
${JSON.stringify(classified)}

Job description (if any, may be null):
${classified.jobDescription || "null"}

Structured data (for your reasoning):
${JSON.stringify(limited)}

Now write the best possible short natural-language answer for the admin:
`;

        const explainRes = await askGemini(explainPrompt, (model as "flash" | "pro") || "flash");
        const answer =
          explainRes?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
          "Sorry, I could not generate an answer based on the available data.";

        console.log("[API /api/ask] Final answer:", answer);

        // Optional visualization
        let vizSpec: Record<string, unknown> | null = null;
        if (visualMode) {
          const vizPrompt = `
You are an AI data visualization assistant.

Given the user's question, the intent, and the structured data below, generate a JSON spec for a chart that best visualizes the data.

Rules:
1. Respond ONLY with a valid JSON object. No explanation, no markdown, no code fences.
2. If you cannot create a meaningful chart, respond with {}.
3. The spec should include:
   - "type": one of "bar", "line", "pie", "scatter", "table"
   - "x": field name for x-axis (if applicable)
   - "y": field name for y-axis (if applicable)
   - "title": short chart title
   - "description": one sentence describing the chart
   - "data": an array of simple objects ready to plot.

User question: "${question}"
Intent: ${JSON.stringify(classified)}
Data: ${JSON.stringify(limited)}

Visualization spec:
`;
          const vizRes = await askGemini(vizPrompt, (model as "flash" | "pro") || "flash");
          let rawViz =
            vizRes?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
          try {
            if (rawViz.startsWith("```")) {
              rawViz = rawViz
                .replace(/```[a-z]*\n?/i, "")
                .replace(/```$/, "")
                .trim();
            }
            vizSpec = JSON.parse(rawViz);
          } catch {
            vizSpec = null;
          }
          console.log("[API /api/ask] Visualization spec:", vizSpec);
        }

        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              stage: "done",
              answer,
              vizSpec,
            }) + "\n"
          )
        );
        controller.close();
      } catch (err) {
        console.error("[API /api/ask] Internal server error:", err);
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              stage: "error",
              error: "Internal server error.",
            }) + "\n"
          )
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
