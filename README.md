# Anarix AI – Ecommerce Chatbot

Anarix AI is an interactive AI-powered chatbot for querying your e-commerce data. Built with Next.js, React, and Google Gemini, it enables users to ask natural language questions about their sales, ad performance, and product eligibility, and get instant, conversational answers based on your database.

## Features

- **Conversational AI Chatbot**: Ask questions about your e-commerce data in plain English.
- **Live SQL Generation**: Uses Google Gemini to convert questions into SQL queries for your Postgres database.
- **Streaming Responses**: See the AI’s progress as it understands, queries, and explains.
- **Modern UI**: Beautiful, animated chat interface with Lottie and Tailwind CSS.
- **Data Privacy**: All queries run on your own database.

## Demo

![Chatbot Screenshot](public/next.svg) <!-- Replace with actual screenshot if available -->

## Getting Started

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd ecomchat
```

### 2. Install Dependencies

```bash
npm install
# or
yarn install
```

### 3. Environment Variables

Create a `.env.local` file in the root with the following:

```
DATABASE_URL=postgres://<user>:<password>@<host>:<port>/<db>
GEMINI_API_KEY=your_google_gemini_api_key
```

- `DATABASE_URL`: Your Postgres connection string.
- `GEMINI_API_KEY`: [Get your Gemini API key here](https://ai.google.dev/).

### 4. Database Setup

**Schema:**

The chatbot expects the following tables in your Postgres database:

```sql
CREATE TABLE ad_sales_metrics (
  date DATE,
  item_id INTEGER,
  ad_sales NUMERIC,
  impressions INTEGER,
  ad_spend NUMERIC,
  clicks INTEGER,
  units_sold INTEGER
);

CREATE TABLE total_sales_metrics (
  date DATE,
  item_id INTEGER,
  total_sales NUMERIC,
  total_units_ordered INTEGER
);

CREATE TABLE eligibility_table (
  eligibility_datetime_utc TIMESTAMP,
  item_id INTEGER,
  eligibility BOOLEAN,
  message TEXT
);
```

**Importing Data:**

Sample data is provided in the `instructions/data/` directory as CSV files. You can import them using the `\copy` command in `psql`:

```bash
psql $DATABASE_URL
# Then, for each table:
\copy ad_sales_metrics FROM 'instructions/data/Product-Level Ad Sales and Metrics (mapped) - Product-Level Ad Sales and Metrics (mapped).csv' DELIMITER ',' CSV HEADER;
\copy total_sales_metrics FROM 'instructions/data/Product-Level Total Sales and Metrics (mapped) - Product-Level Total Sales and Metrics (mapped).csv' DELIMITER ',' CSV HEADER;
\copy eligibility_table FROM 'instructions/data/Product-Level Eligibility Table (mapped) - Product-Level Eligibility Table (mapped).csv' DELIMITER ',' CSV HEADER;
```

### 5. Run the Development Server

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) to see the chatbot.

## Usage

- Click the floating “Chat with database” button.
- Ask questions like:
  - “What were my top selling items last month?”
  - “How much did I spend on ads last week?”
  - “Which products are currently ineligible?”

The AI will:
1. Understand your question.
2. Generate and run an SQL query.
3. Explain the results in plain English.

## Project Structure

- `app/` – Next.js app directory (API, pages, layout)
- `components/` – React UI components (Chatbot, UI primitives)
- `lib/` – Database and Gemini API utilities
- `instructions/data/` – Sample CSV and Excel data
- `public/` – Static assets (SVGs, Lottie animations)

## Tech Stack

- **Next.js** (App Router)
- **React 19**
- **Tailwind CSS**
- **PostgreSQL**
- **Google Gemini API**
- **Lottie** (for animations)
- **shadcn/ui** (for UI primitives)

## Customization

- Update the database schema or import your own data as needed.
- Modify the chatbot prompt in `app/api/ask/route.ts` to tune AI behavior.

## Deployment

Deploy easily on [Vercel](https://vercel.com/) or your preferred platform. Make sure to set the required environment variables.

## License

MIT

---

**Note:** If you need to automate the data import or want a script for it, let me know!
