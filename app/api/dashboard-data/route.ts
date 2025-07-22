import { NextRequest } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  // Sales by week
  const salesByWeek = await query(
    `SELECT DATE_TRUNC('week', date) as week, SUM(total_sales) as total_sales, SUM(total_units_ordered) as total_units
     FROM total_sales_metrics GROUP BY week ORDER BY week ASC`
  );
  // Top 5 products by total sales
  const topProducts = await query(
    `SELECT item_id, SUM(total_sales) as total_sales, SUM(total_units_ordered) as total_units
     FROM total_sales_metrics GROUP BY item_id ORDER BY SUM(total_sales) DESC LIMIT 5`
  );
  // Ad performance by week
  const adByWeek = await query(
    `SELECT DATE_TRUNC('week', date) as week, SUM(ad_sales) as ad_sales, SUM(ad_spend) as ad_spend, SUM(impressions) as impressions, SUM(clicks) as clicks
     FROM ad_sales_metrics GROUP BY week ORDER BY week ASC`
  );
  // Top 5 products by ad sales
  const topAdProducts = await query(
    `SELECT item_id, SUM(ad_sales) as ad_sales, SUM(ad_spend) as ad_spend, SUM(impressions) as impressions, SUM(clicks) as clicks
     FROM ad_sales_metrics GROUP BY item_id ORDER BY SUM(ad_sales) DESC LIMIT 5`
  );
  // Eligibility by week
  const eligibilityByWeek = await query(
    `SELECT DATE_TRUNC('week', eligibility_datetime_utc) as week, COUNT(*) FILTER (WHERE eligibility) as eligible, COUNT(*) FILTER (WHERE NOT eligibility) as ineligible
     FROM eligibility_table GROUP BY week ORDER BY week ASC`
  );
  // KPIs
  const kpiSales = await query(`SELECT SUM(total_sales) as total_sales FROM total_sales_metrics`);
  const kpiAdSpend = await query(`SELECT SUM(ad_spend) as total_ad_spend FROM ad_sales_metrics`);
  const kpiEligibility = await query(`SELECT AVG(CASE WHEN eligibility THEN 1 ELSE 0 END) as avg_eligibility FROM eligibility_table`);

  return new Response(
    JSON.stringify({
      salesByWeek: salesByWeek.rows,
      topProducts: topProducts.rows,
      adByWeek: adByWeek.rows,
      topAdProducts: topAdProducts.rows,
      eligibilityByWeek: eligibilityByWeek.rows,
      kpis: {
        totalSales: kpiSales.rows[0]?.total_sales || 0,
        totalAdSpend: kpiAdSpend.rows[0]?.total_ad_spend || 0,
        avgEligibility: kpiEligibility.rows[0]?.avg_eligibility || 0,
      },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
} 