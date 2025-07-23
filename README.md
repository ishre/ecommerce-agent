# Anarix AI – Ecommerce Chatbot

Anarix AI is an interactive AI-powered chatbot for querying your e-commerce data. Built with Next.js, React, and Google Gemini, it enables users to ask natural language questions about their sales, ad performance, and product eligibility, and get instant, conversational answers based on your database.

## Features

- **Conversational AI Chatbot**: Ask questions about your e-commerce data in plain English.
- **Live SQL Generation**: Uses Google Gemini to convert questions into SQL queries for your Postgres database.
- **Streaming Responses**: See the AI’s progress as it understands, queries, and explains.
- **Modern UI**: Beautiful, animated chat interface with Lottie and Tailwind CSS.
- **Data Privacy**: All queries run on your own database.

## Demo

Below are screenshots demonstrating the main features and UI of Anarix AI:

### Chatbot Interactions

<div align="center">
  <img src="screenshots/agent communicating with database question in normal text mode.png" alt="Agent communicating with database (text mode)" width="45%"/>
  <img src="screenshots/agent response for text format question in natural language.png" alt="Agent response in natural language" width="45%"/>
</div>

- **Left:** The chatbot is processing a user question, showing a streaming status ("Communicating with database..."). This demonstrates the real-time feedback as the AI understands and generates a response.
- **Right:** The chatbot provides a natural language answer to the user's question, making the data easy to understand.

<div align="center">
  <img src="screenshots/visualize mode agent response with graphs as demanded.png" alt="Visualize mode with graphs" width="45%"/>
  <img src="screenshots/chat popup default.png" alt="Chat popup default" width="45%"/>
</div>

- **Left:** When "Visualise" mode is enabled, the chatbot responds with a relevant chart or graph, making data insights more visual and interactive.
- **Right:** The default chat popup, showing the entry point for users to start a conversation with the AI assistant.

### Dashboard & Data Exploration

<img src="screenshots/dashboard default view.png" alt="Dashboard default view" width="100%"/>

- **Dashboard Default View:** The main dashboard displays key performance indicators (KPIs) such as Total Sales, Ad Sales, Ad Spend, ROAS, and Net Profit, along with time series and top product charts for a quick overview of business health.

<img src="screenshots/product drill down table with filter and search feature.png" alt="Product drill down table with filter and search" width="100%"/>

- **Product Drill-down Table:** Explore detailed product-level metrics with powerful filtering and search features. You can filter by low ROAS, eligibility, or search by Item ID, and navigate through paginated results.

### UI Details & Tooltips

<img src="screenshots/tooltip for hover on mode and model selectors.png" alt="Tooltip for mode and model selectors" width="100%"/>

- **Tooltip for Mode and Model Selectors:** Helpful tooltips appear when hovering over the "Visualise" and model selection buttons, explaining their purpose and helping users choose the right mode for their needs.

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
