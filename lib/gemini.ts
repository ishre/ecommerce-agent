const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export async function askGemini(prompt: string) {
  const response = await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash-lite:generateContent?key=' + GEMINI_API_KEY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  const data = await response.json();
  return data;
} 