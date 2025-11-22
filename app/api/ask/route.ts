import { NextRequest } from "next/server";
import { askGemini } from "@/lib/gemini";
import { query } from "@/lib/db";
import { Document, Filter, ObjectId } from "mongodb";

/* ----------------------- Types ----------------------- */
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

/* ----------------------- Helpers ---------------------- */

// Safe parse for LLM JSON responses (strip ``` and trailing text)
function safeJSONParse<T = unknown>(text: string): T | null {
  try {
    let cleaned = (text || "").trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/```[a-z]*\n?/i, "").replace(/```$/, "").trim();
    }
    // Try to find first { ... } block
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first !== -1 && last !== -1 && last > first) {
      cleaned = cleaned.slice(first, last + 1);
    }
    cleaned = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

// Clean heavy fields and ObjectId-like objects before sending to LLM
function cleanForLLM(obj: unknown): unknown {
  return JSON.parse(
    JSON.stringify(obj, (k, v) => {
      if (!v) return v;
      // Remove password
      if (k === "password" || k === "passwordResetToken") return undefined;
      // Remove binary/large fields
      if (["html", "css", "video", "pdfLink", "otherFile", "body", "resumeFileUrl", "profileImage"].includes(k)) return undefined;
      // Convert ObjectId containers to string
      if (typeof v === "object" && v !== null) {
        const vObj = v as Record<string, unknown>;
        // e.g. { "$oid": "..." } or BSON ObjectID
        if ("$oid" in vObj && typeof vObj["$oid"] === "string") {
          return vObj["$oid"];
        }
        if ("_bsontype" in vObj && vObj._bsontype === "ObjectID") {
          try {
            const objId = vObj as { toHexString?: () => string };
            return String(objId.toHexString ? objId.toHexString() : v);
          } catch {
            return undefined;
          }
        }
      }
      return v;
    })
  );
}

// Limit large arrays (top N) for LLM payload
function limitPayload(obj: unknown, maxItems = 40): unknown {
  if (Array.isArray(obj)) return obj.slice(0, maxItems);
  if (obj && typeof obj === "object") {
    const copy: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (Array.isArray(v)) copy[k] = v.slice(0, maxItems);
      else copy[k] = v;
    }
    return copy;
  }
  return obj;
}

/* -------------------- Intent Classifier -------------------- */
async function classifyQuestion(question: string, model?: string): Promise<ClassifiedIntent> {
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
- "jobDescription": (optional) job description text if the question is asking to find best candidate for a role, otherwise null
- "topK": (optional) number of top candidates requested (default 5 if not specified)

Rules:
- If the question asks about "best", "most suitable", includes a job description -> intent = candidate-recommendation.
- If it mentions a named student and asks about performance/score/strengths -> student-performance.
- If it's about interview logs or past interview details -> interview-history.
- If it's about course completion or learning progress -> course-progress.
- If it's about top scorers / highest score -> leaderboard.
- If it's about general student info (who is X?) -> student-profile.
- Otherwise -> generic.

Respond with ONLY the JSON object. No extra text.
User question: "${question}"
`;

  const res = await askGemini(prompt, (model as "flash" | "pro") || "flash");
  const raw = res?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  const parsed = safeJSONParse<ClassifiedIntent>(raw) || null;
  if (!parsed || !parsed.intent) return { intent: "generic" };
  return {
    intent: parsed.intent,
    candidateName: parsed.candidateName || undefined,
    candidateEmailOrPhone: parsed.candidateEmailOrPhone || undefined,
    jobDescription: parsed.jobDescription || undefined,
    topK: parsed.topK || 5,
  };
}

/* -------------------- User Resolver -------------------- */
/**
 * Try to find candidate users robustly:
 * - by exact email/phone if provided
 * - by exact/regex matching name/firstname/lastname
 * - fallback: search trailresumes contact.email/contact.firstName/contact.lastName
 */
async function resolveUsers(ci: ClassifiedIntent, maxHits = 10): Promise<Document[]> {
  const matchClauses: Filter<Document>[] = [];

  if (ci.candidateEmailOrPhone) {
    matchClauses.push({ email: ci.candidateEmailOrPhone });
    matchClauses.push({ phoneNumber: ci.candidateEmailOrPhone });
  }

  if (ci.candidateName) {
    const rx = new RegExp(ci.candidateName.replace(/[.*+?^${}()|[\]\\]/g, ""), "i");
    matchClauses.push({ name: rx });
    matchClauses.push({ firstname: rx });
    matchClauses.push({ lastname: rx });
  }

  // If we have match clauses, lookup in users collection
  if (matchClauses.length > 0) {
    const pipeline: Document[] = [
      { $match: { $or: matchClauses } },
      { $limit: maxHits },
      { $project: { password: 0 } },
    ];
    const res = await query("users", pipeline);
    const rows = Array.isArray(res) ? res : res?.rows || [];
    if (Array.isArray(rows) && rows.length > 0) return rows as Document[];
  }

  // Fallback: try to find resumes that contain the name or email (trailresumes)
  if (ci.candidateName || ci.candidateEmailOrPhone) {
    const or2: Filter<Document>[] = [];
    if (ci.candidateName) {
      const rx = new RegExp(ci.candidateName.replace(/[.*+?^${}()|[\]\\]/g, ""), "i");
      or2.push({ "contact.firstName": rx });
      or2.push({ "contact.lastName": rx });
      or2.push({ name: rx });
    }
    if (ci.candidateEmailOrPhone) {
      or2.push({ "contact.email": ci.candidateEmailOrPhone });
      or2.push({ "contact.number": ci.candidateEmailOrPhone });
    }
    if (or2.length > 0) {
      const pipeline = [
        { $match: { $or: or2 } },
        { $limit: 20 },
        { $project: { user: 1, "contact.email": 1, "contact.firstName": 1, "contact.lastName": 1 } },
      ];
      const r = await query("trailresumes", pipeline);
      const rows = Array.isArray(r) ? r : r?.rows || [];
      const ids = (rows || []).map((d: Document) => {
        const u = d.user;
        if (!u) return null;
        if (typeof u === "string") return u;
        if (u && typeof u === "object" && "$oid" in u) {
          const uObj = u as { $oid?: string };
          return uObj.$oid || null;
        }
        return String(u);
      }).filter((id): id is string => id !== null) as string[];

      if (ids.length > 0) {
        // fetch users by those ids (either ObjectId or string)
        const orIds: Filter<Document>[] = [];
        const objectIds = ids.filter(id => ObjectId.isValid(id)).map(id => new ObjectId(id));
        if (objectIds.length) orIds.push({ _id: { $in: objectIds } });
        // Also try string matching for IDs stored as strings
        const stringIds = ids.filter(id => !ObjectId.isValid(id));
        if (stringIds.length) {
          // For string IDs, we need to match them as strings, not ObjectIds
          orIds.push({ _id: { $in: stringIds as unknown as ObjectId[] } });
        }
        const pipeline2: Document[] = [
          { $match: { $or: orIds } },
          { $limit: maxHits },
          { $project: { password: 0 } },
        ];
        const rr = await query("users", pipeline2);
        const rows2 = Array.isArray(rr) ? rr : rr?.rows || [];
        if (rows2.length) return rows2;
      }
    }
  }

  // Last resort: no specific candidate matched → return empty (caller may request pool)
  return [];
}

/* -------------------- Fetch intelligence for users -------------------- */
/**
 * For each resolved user, fetch:
 * - trailresumes or resumewithais (either user: ObjectId or string or contact.email)
 * - jrsattempts (user field can be ObjectId/string)
 * - interview_results (attemptedby_id)
 * - appliedcandidates & interviews
 * - practicehistories, examhistories, progresstracks
 */
async function fetchFullProfileForUsers(users: Document[]): Promise<Document[]> {
  if (!Array.isArray(users) || users.length === 0) return [];

  // We'll fetch per-user related documents with flexible matching (ObjectId or string id or email)
  const out: Document[] = [];

  for (const u of users) {
    const uidStr = u._id ? String(u._id).replace(/ObjectId\((.*)\)/, "$1").replace(/"/g, "") : null;
    const userEmail = (u.email as string) || (u?.resume && typeof u.resume === "string" ? undefined : undefined);

    // Helper: build $or for matching fields that might be ObjectId or string
    const userOrFilters = [];
    if (uidStr && ObjectId.isValid(uidStr)) userOrFilters.push({ user: new ObjectId(uidStr) }, { user: uidStr });
    else if (uidStr) userOrFilters.push({ user: uidStr });

    // Also allow matching by contact.email or email fields
    if (userEmail) {
      userOrFilters.push({ "contact.email": userEmail });
      userOrFilters.push({ email: userEmail });
    }

    // RESUMES: trailresumes + resumewithais
    const resumeMatches: Filter<Document>[] = [];
    if (uidStr && ObjectId.isValid(uidStr)) {
      resumeMatches.push({ user: new ObjectId(uidStr) }, { user: uidStr });
    }
    if (userEmail) resumeMatches.push({ "contact.email": userEmail }, { userEmail: userEmail }, { email: userEmail });

    const resumesPipeline = [
      { $match: resumeMatches.length ? { $or: resumeMatches } : {} },
      { $sort: { updatedAt: -1, createdAt: -1 } },
      { $limit: 5 },
    ];

    const trailResRaw = await query("trailresumes", resumesPipeline);
    const trailRes = Array.isArray(trailResRaw) ? trailResRaw : trailResRaw?.rows || [];

    const resumeAiRaw = await query("resumewithais", resumesPipeline);
    const resumeAi = Array.isArray(resumeAiRaw) ? resumeAiRaw : resumeAiRaw?.rows || [];

    // JRS attempts
    const jrsPipeline: Document[] = [
      {
        $match: {
          $or: [
            ...(uidStr && ObjectId.isValid(uidStr) ? [{ user: new ObjectId(uidStr) }] : []),
            ...(uidStr ? [{ user: uidStr }] : []),
          ],
        },
      },
      { $sort: { createdAt: -1 } },
      { $limit: 20 },
    ];
    const jrsRaw = await query("jrsattempts", jrsPipeline);
    const jrsAttempts = Array.isArray(jrsRaw) ? jrsRaw : jrsRaw?.rows || [];

    // interview_results: attemptedby_id may be ObjectId or string
    const irPipeline: Document[] = [
      {
        $match: {
          $or: [
            ...(uidStr && ObjectId.isValid(uidStr) ? [{ attemptedby_id: new ObjectId(uidStr) }] : []),
            ...(uidStr ? [{ attemptedby_id: uidStr }] : []),
          ],
        },
      },
      { $sort: { createdAt: -1 } },
      { $limit: 50 },
    ];
    const interviewResultsRaw = await query("interview_results", irPipeline);
    const interviewResults = Array.isArray(interviewResultsRaw) ? interviewResultsRaw : interviewResultsRaw?.rows || [];

    // appliedcandidates where interviewee === user
    const appliedPipeline: Document[] = [
      {
        $match: {
          $or: [
            ...(uidStr && ObjectId.isValid(uidStr) ? [{ interviewee: new ObjectId(uidStr) }] : []),
            ...(uidStr ? [{ interviewee: uidStr }] : []),
          ],
        },
      },
      { $limit: 50 },
    ];
    const appliedRaw = await query("appliedcandidates", appliedPipeline);
    const applications = Array.isArray(appliedRaw) ? appliedRaw : appliedRaw?.rows || [];

    // Now fetch interviews for those application.interviewId (handle ObjectId/string)
    const interviewIds = new Set<string>();
    for (const a of applications) {
      if (a.interviewId) {
        if (typeof a.interviewId === "object" && "$oid" in a.interviewId) {
          const idObj = a.interviewId as { $oid?: string };
          if (idObj.$oid) interviewIds.add(idObj.$oid);
        } else {
          interviewIds.add(String(a.interviewId));
        }
      }
    }
    const interviewMatch: Filter<Document>[] = [];
    const ivObjIds = Array.from(interviewIds).filter(id => ObjectId.isValid(id)).map(id => new ObjectId(id));
    if (ivObjIds.length) interviewMatch.push({ _id: { $in: ivObjIds } });
    const ivStringIds = Array.from(interviewIds).filter(id => !ObjectId.isValid(id));
    if (ivStringIds.length) {
      // For string IDs, cast to match MongoDB's flexible typing
      interviewMatch.push({ _id: { $in: ivStringIds as unknown as ObjectId[] } });
      interviewMatch.push({ interview_id: { $in: ivStringIds } });
    }

    const interviewsPipeline: Document[] = [
      { $match: interviewMatch.length ? { $or: interviewMatch } : {} },
      { $limit: 50 },
    ];
    const interviewsRaw = await query("interviews", interviewsPipeline);
    const interviews = Array.isArray(interviewsRaw) ? interviewsRaw : interviewsRaw?.rows || [];

    // practicehistories & examhistories & progresstracks
    const practiceRaw = await query("practicehistories", [
      {
        $match: {
          $or: [
            ...(uidStr && ObjectId.isValid(uidStr) ? [{ user: new ObjectId(uidStr) }] : []),
            ...(uidStr ? [{ user: uidStr }] : []),
          ],
        },
      },
      { $limit: 20 },
    ]);
    const practiceHistories = Array.isArray(practiceRaw) ? practiceRaw : practiceRaw?.rows || [];

    const examRaw = await query("examhistories", [
      {
        $match: {
          $or: [
            ...(uidStr && ObjectId.isValid(uidStr) ? [{ userId: new ObjectId(uidStr) }] : []),
            ...(uidStr ? [{ userId: uidStr }] : []),
          ],
        },
      },
      { $limit: 20 },
    ]);
    const examHistories = Array.isArray(examRaw) ? examRaw : examRaw?.rows || [];

    const progressRaw = await query("progresstracks", [
      {
        $match: {
          $or: [
            ...(uidStr && ObjectId.isValid(uidStr) ? [{ userId: new ObjectId(uidStr) }] : []),
            ...(uidStr ? [{ userId: uidStr }] : []),
          ],
        },
      },
      { $limit: 50 },
    ]);
    const progressTracks = Array.isArray(progressRaw) ? progressRaw : progressRaw?.rows || [];

    // collect interview question ids for hydration later
    const profile: Document = {
      user: u,
      resumes: { trail: trailRes || [], ai: resumeAi || [] },
      jrsAttempts,
      interviewResults,
      applications,
      interviews,
      practiceHistories,
      examHistories,
      progressTracks,
    };

    out.push(profile);
  }

  // Hydrate interview questions for all profiles at once
  return await hydrateInterviewQuestionsForProfiles(out);
}

/* -------------------- Hydrate interview questions -------------------- */
async function hydrateInterviewQuestionsForProfiles(profiles: Document[]): Promise<Document[]> {
  const questionIds = new Set<string>();

  for (const p of profiles) {
    const interviews = (p.interviews || []) as Document[];
    interviews.forEach((iv: Document) => {
      const qArr = (iv.interviewquestions || []) as unknown[];
      for (const q of qArr || []) {
        if (!q) continue;
        if (typeof q === "string") questionIds.add(q);
        else if (typeof q === "object" && q !== null) {
          const qObj = q as Record<string, unknown>;
          if (qObj._id) questionIds.add(String(qObj._id));
          else if (qObj.questionId) questionIds.add(String(qObj.questionId));
          else if (qObj.id) questionIds.add(String(qObj.id));
        }
      }
    });

    // also check interviewResults that may contain question ids inside results array
    const interviewResults = (p.interviewResults || []) as Document[];
    interviewResults.forEach((ir: Document) => {
      const results = (ir.results || []) as Document[];
      for (const r of results || []) {
        if (r.questionId) questionIds.add(String(r.questionId));
      }
    });
  }

  if (questionIds.size === 0) return profiles;

  const objectIds = Array.from(questionIds).filter(id => ObjectId.isValid(id)).map(id => new ObjectId(id));
  const stringIds = Array.from(questionIds).filter(id => !ObjectId.isValid(id));

  const match: Filter<Document> = {};
  if (objectIds.length) {
    match._id = { $in: objectIds };
  }
  if (stringIds.length) {
    const orConditions = [
      { questionId: { $in: stringIds } },
      { _id: { $in: stringIds as unknown as ObjectId[] } }
    ];
    match.$or = (match.$or as Filter<Document>[] || []).concat(orConditions);
  }

  const pipeline: Document[] = [
    { $match: Object.keys(match).length ? match : {} },
    { $project: { question: 1, suggestedAnswer: 1, questiontype: 1, questionId: 1 } },
  ];
  const res = await query("interviewquestions", pipeline);
  const questions = Array.isArray(res) ? res : res?.rows || [];

  const byKey = new Map<string, Document>();
  for (const q of questions) {
    if (q._id) byKey.set(String(q._id), q);
    if (q.questionId) byKey.set(String(q.questionId), q);
  }

  for (const p of profiles) {
    const interviews = (p.interviews || []) as Document[];
    interviews.forEach((iv: Document) => {
      const enriched: Document[] = [];
      const questions = (iv.interviewquestions || []) as unknown[];
      questions.forEach((q: unknown) => {
        let key: string | null = null;
        if (typeof q === "string") key = q;
        else if (q && typeof q === "object" && q !== null) {
          const qObj = q as Record<string, unknown>;
          if (qObj._id) key = String(qObj._id);
          else if (qObj.questionId) key = String(qObj.questionId);
        }
        if (key && byKey.has(key)) {
          const questionDoc = byKey.get(key);
          if (questionDoc) enriched.push(questionDoc);
        }
      });
      iv.interviewQuestionDetails = enriched;
    });
    // attach resolved details to interviewResults as well if they reference question ids inside results
    const interviewResults = (p.interviewResults || []) as Document[];
    interviewResults.forEach((ir: Document) => {
      if (!ir.results) return;
      const results = (ir.results || []) as Document[];
      ir.resolvedResults = results.map((r: Document) => {
        const qid = r.questionId ? String(r.questionId) : null;
        return { ...r, questionDoc: qid && byKey.has(qid) ? byKey.get(qid) : null };
      });
    });
  }

  return profiles;
}

/* -------------------- Leaderboard (already in your design) -------------------- */
async function fetchLeaderboard(topK = 5) {
  // Simpler approach: compute average JRS, average practice score, best resume completeness
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
        from: "trailresumes",
        let: { uid: "$_id" },
        pipeline: [
          { $match: { $expr: { $or: [{ $eq: ["$user", "$$uid"] }, { $eq: ["$user", { $toString: "$$uid" }] }] } } },
          { $sort: { updatedAt: -1 } },
          { $limit: 3 },
        ],
        as: "trailResumes",
      },
    },
    {
      $addFields: {
        avgJrsScore: { $avg: "$jrsAttempts.scores.overall" },
        avgPracticeScore: { $avg: "$practiceHistories.score" },
        bestResumeCompleteness: { $max: "$trailResumes.completeness" },
      },
    },
    {
      $addFields: {
        rankingScore: {
          $add: [
            { $multiply: [{ $ifNull: ["$avgJrsScore", 0] }, 0.45] },
            { $multiply: [{ $ifNull: ["$avgPracticeScore", 0] }, 0.35] },
            { $multiply: [{ $ifNull: ["$bestResumeCompleteness", 0] }, 0.2] },
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
        avgPracticeScore: 1,
        bestResumeCompleteness: 1,
        rankingScore: 1,
      },
    },
  ];

  const res = await query("users", pipeline);
  const rows = Array.isArray(res) ? res : res?.rows || [];
  return rows;
}

/* -------------------- Main Endpoint -------------------- */
export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        let body: { question?: string; visualMode?: boolean; model?: string } = {};
        try {
          body = await req.json();
          console.log("[API /api/ask] Body:", body);
        } catch (e) {
          console.warn("[API /api/ask] Failed to parse body", e);
        }

        const question = body?.question;
        const visualMode = Boolean(body?.visualMode);
        const model = body?.model || "flash";

        if (!question || typeof question !== "string") {
          controller.enqueue(encoder.encode(JSON.stringify({ stage: "error", error: "No question provided." }) + "\n"));
          controller.close();
          return;
        }

        controller.enqueue(encoder.encode(JSON.stringify({ stage: "understanding", message: "Classifying intent..." }) + "\n"));

        const classified = await classifyQuestion(question, model);
        console.log("[API /api/ask] Classified intent:", classified);

        controller.enqueue(encoder.encode(JSON.stringify({ stage: "fetching", message: "Resolving users and fetching data..." }) + "\n"));

        // Resolve relevant users
        let users: Document[] = [];
        if (classified.candidateName || classified.candidateEmailOrPhone) {
          users = await resolveUsers(classified, 10);
        }

        // If no users found and intent is student-profile/performance/interview-history, try fuzzy name substring
        if (users.length === 0 && (classified.intent === "student-profile" || classified.intent === "student-performance" || classified.intent === "interview-history")) {
          // fallback: search by simple substring on name
          const name = classified.candidateName || "";
          if (name && name.trim().length > 1) {
            const rx = new RegExp(name.split(" ").slice(0, 2).join(" "), "i");
            const res = await query("users", [{ $match: { name: rx } }, { $limit: 10 }, { $project: { password: 0 } }]);
            const rows = Array.isArray(res) ? res : res?.rows || [];
            users = rows;
          }
        }

        // If still no users and intent is candidate-recommendation without candidate specified, we'll fetch candidate pool later
        controller.enqueue(encoder.encode(JSON.stringify({ stage: "fetching", message: `Found ${users.length} users (resolved)` }) + "\n"));

        // Fetch full profile(s) or leaderboard/pool
        let rawData: Document[] | { note: string } | null = null;
        if (["student-profile", "student-performance", "interview-history", "course-progress", "candidate-recommendation"].includes(classified.intent)) {
          if (users.length > 0) {
            rawData = await fetchFullProfileForUsers(users);
          } else {
            // if candidate-recommendation without name -> fetch pool
            if (classified.intent === "candidate-recommendation") {
              rawData = await fetchCandidatePoolForJob(classified.topK || 5);
            } else {
              rawData = [];
            }
          }
        } else if (classified.intent === "leaderboard") {
          rawData = await fetchLeaderboard(classified.topK || 5);
        } else {
          rawData = { note: "No specific intent or data to fetch." };
        }

        controller.enqueue(encoder.encode(JSON.stringify({ stage: "fetched", message: `Fetched raw data type: ${Array.isArray(rawData) ? `array(${rawData.length})` : typeof rawData}` }) + "\n"));

        // Clean and limit payload for LLM
        const cleaned = cleanForLLM(rawData);
        const limited = limitPayload(cleaned, 50);

        controller.enqueue(encoder.encode(JSON.stringify({ stage: "explaining", message: "Asking LLM to generate a concise answer..." }) + "\n"));

        // Build the LLM explain prompt - more explicit, instruct to use resume content and other fields
        const explainPrompt = `
You are an assistant for college admins and placement officers. You will receive:
1) The user's question.
2) A short intent classification.
3) Structured data about candidates (users, resumes, JRS attempts, interview results, practice/exam histories, interview question text).

Rules:
- Use ONLY the provided structured data; do NOT invent facts.
- If resume data is present: consult jobProfile, skills, experiences, education, completeness, atsCompliance, summary, projects.
- If JRS / jrsAttempts is present: use overall scores and feedback fields.
- If interviewResults exists: use result summaries and per-question feedback to identify strengths/weaknesses.
- Always prefer direct evidence (years of experience, matching skills) when deciding job-fit.
- Output a short answer (2-4 sentences) for admins. If asked for deeper analysis, give 1 short paragraph + bullet points (max 5).
- If data is missing, say exactly which data is missing (e.g., "No resume found", "No JRS attempts", "No interview results") — don't guess.

User question: "${question}"

Intent metadata:
${JSON.stringify(classified)}

Structured data (trimmed & sanitized):
${JSON.stringify(limited)}

Now write a short, actionable answer for the admin. Be concise, human, and avoid technical jargon.
`;

        const explainRes = await askGemini(explainPrompt, (model as "flash" | "pro") || "flash");
        const rawAnswer = explainRes?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;

        const answer = rawAnswer || "Sorry, I could not generate a useful answer from the available data.";

        console.log("[API /api/ask] Final answer:", answer);

        // Optional visualization (same approach as before)
        let vizSpec: Record<string, unknown> | null = null;
        if (visualMode) {
          const vizPrompt = `
You are an assistant that outputs a JSON chart spec (no extra text). 
Given the question and data below, return a JSON object with fields:
{ "type": "bar|line|pie|table", "x": "field", "y": "field", "title": "string", "description": "string", "data": [ ... ] }
If no meaningful chart, return {}.

Question: "${question}"
Intent: ${JSON.stringify(classified)}
Data: ${JSON.stringify(limited)}
`;
          const vizRes = await askGemini(vizPrompt, (model as "flash" | "pro") || "flash");
          let rawViz = vizRes?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
          try {
            if (rawViz.startsWith("```")) rawViz = rawViz.replace(/```[a-z]*\n?/i, "").replace(/```$/, "").trim();
            vizSpec = rawViz ? JSON.parse(rawViz) : {};
          } catch {
            vizSpec = null;
          }
        }

        // Done - stream final NDJSON
        controller.enqueue(encoder.encode(JSON.stringify({ stage: "done", answer, vizSpec }) + "\n"));
        controller.close();
      } catch (err) {
        console.error("[API /api/ask] Error:", err);
        controller.enqueue(encoder.encode(JSON.stringify({ stage: "error", error: "Internal server error" }) + "\n"));
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

/* -------------------- Extra: helper used earlier for candidate pool (kept for completeness) -------------------- */
async function fetchCandidatePoolForJob(topK = 5) {
  // Fetch a reasonably-sized candidate pool (candidates with resumes or jrs attempts)
  const pipeline: Document[] = [
    {
      $lookup: {
        from: "trailresumes",
        let: { uid: "$_id" },
        pipeline: [
          { $match: { $expr: { $or: [{ $eq: ["$user", "$$uid"] }, { $eq: ["$user", { $toString: "$$uid" }] }] } } },
          { $sort: { updatedAt: -1 } },
          { $limit: 1 },
        ],
        as: "trailRes",
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
      $addFields: {
        hasResume: { $gt: [{ $size: "$trailRes" }, 0] },
        avgJrs: { $avg: "$jrsAttempts.scores.overall" },
      },
    },
    { $sort: { hasResume: -1, avgJrs: -1 } },
    { $limit: Math.max(topK, 50) },
    {
      $project: {
        name: 1,
        email: 1,
        phoneNumber: 1,
        hasResume: 1,
        avgJrs: 1,
      },
    },
  ];

  const res = await query("users", pipeline);
  const rows = Array.isArray(res) ? res : res?.rows || [];
  return rows;
}
