const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export async function askGemini(prompt: string, model: 'flash' | 'pro' = 'flash') {
  const modelName = model === 'pro' ? 'gemini-2.5-pro' : 'gemini-2.0-flash-lite';
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );
  const data = await response.json();
  return data;
} 