import { NextRequest } from "next/server";
import { askGemini } from "@/lib/gemini";
import { query } from "@/lib/db";

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const { question } = await req.json();
        if (!question) {
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

        // Stage 1: Understanding
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              stage: "understanding",
              message: "Understanding question…",
            }) + "\n"
          )
        );

        // Prompt Gemini to generate an SQL query for our schema
        const prompt = `You are an AI assistant. Given the following user question, generate a SQL query for a Postgres database with these tables:

1. ad_sales_metrics(date DATE, item_id INTEGER, ad_sales NUMERIC, impressions INTEGER, ad_spend NUMERIC, clicks INTEGER, units_sold INTEGER)
2. total_sales_metrics(date DATE, item_id INTEGER, total_sales NUMERIC, total_units_ordered INTEGER)
3. eligibility_table(eligibility_datetime_utc TIMESTAMP, item_id INTEGER, eligibility BOOLEAN, message TEXT)

User question: "${question}"

Respond ONLY with a valid SQL SELECT statement, and nothing else. Do not include explanations or formatting.`;

        // Stage 2: Generating SQL
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              stage: "generating",
              message: "Generating SQL…",
            }) + "\n"
          )
        );
        const geminiRes = await askGemini(prompt);
        let sql =
          geminiRes?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
        if (sql.startsWith("```")) {
          sql = sql
            .replace(/```[a-z]*\n?/i, "")
            .replace(/```$/, "")
            .trim();
        }
        if (!sql.toLowerCase().startsWith("select")) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                stage: "error",
                error: "Failed to generate SQL.",
              }) + "\n"
            )
          );
          controller.close();
          return;
        }

        // Run the SQL query
        const result = await query(sql);
        const rows = result.rows;

        // Stage 3: Explaining
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              stage: "explaining",
              message: "Writing answer…",
            }) + "\n"
          )
        );
        const explainPrompt = `You are an AI assistant. Given the user's question and the SQL result below, write a clear, conversational answer for the user. Be concise and friendly, answer in human tone. Make the sentence seamless and in context to the user input. Do not mention SQL or code.\n\nUser question: "${question}"\nSQL result: ${JSON.stringify(
          rows
        )}\n\nAnswer:`;
        const explainRes = await askGemini(explainPrompt);
        const answer =
          explainRes?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
          "Sorry, I could not generate an answer.";
        controller.enqueue(
          encoder.encode(JSON.stringify({ stage: "done", answer }) + "\n")
        );
        controller.close();
      } catch {
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
