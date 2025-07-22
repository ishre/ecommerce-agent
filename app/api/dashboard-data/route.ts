import { query } from "@/lib/db";

export async function GET() {
  // KPIs
  const kpiSales = await query(`SELECT SUM(total_sales) as total_sales FROM total_sales_metrics`);
  const kpiAdSales = await query(`SELECT SUM(ad_sales) as total_ad_sales FROM ad_sales_metrics`);
  const kpiAdSpend = await query(`SELECT SUM(ad_spend) as total_ad_spend FROM ad_sales_metrics`);
  const roas = Number(kpiAdSales.rows[0]?.total_ad_sales || 0) / (Number(kpiAdSpend.rows[0]?.total_ad_spend || 1));
  const netProfit = Number(kpiSales.rows[0]?.total_sales || 0) - Number(kpiAdSpend.rows[0]?.total_ad_spend || 0);

  // Weekly time series
  const salesAdTime = await query(
    `SELECT DATE_TRUNC('week', COALESCE(a.date, b.date)) as week,
      SUM(a.total_sales) as total_sales,
      SUM(b.ad_sales) as ad_sales,
      SUM(b.ad_spend) as ad_spend
    FROM total_sales_metrics a
    FULL OUTER JOIN ad_sales_metrics b ON a.date = b.date AND a.item_id = b.item_id
    GROUP BY week ORDER BY week ASC`
  );

  // Top 10 products by ROAS (ROAS = ad_sales/ad_spend)
  const topProductsByROAS = await query(
    `SELECT b.item_id,
      SUM(b.ad_sales) as ad_sales,
      SUM(b.ad_spend) as ad_spend,
      CASE WHEN SUM(b.ad_spend) > 0 THEN SUM(b.ad_sales)/SUM(b.ad_spend) ELSE 0 END as roas,
      SUM(a.total_sales) as total_sales
    FROM ad_sales_metrics b
    LEFT JOIN total_sales_metrics a ON a.item_id = b.item_id
    GROUP BY b.item_id
    HAVING SUM(b.ad_spend) > 0
    ORDER BY roas DESC
    LIMIT 10`
  );
  // Top 10 by total sales
  const topProductsBySales = await query(
    `SELECT item_id, SUM(total_sales) as total_sales
     FROM total_sales_metrics GROUP BY item_id ORDER BY SUM(total_sales) DESC LIMIT 10`
  );
  // Bottom 10 by ROAS (loss-makers)
  const bottomProductsByROAS = await query(
    `SELECT b.item_id,
      SUM(b.ad_sales) as ad_sales,
      SUM(b.ad_spend) as ad_spend,
      CASE WHEN SUM(b.ad_spend) > 0 THEN SUM(b.ad_sales)/SUM(b.ad_spend) ELSE 0 END as roas,
      SUM(a.total_sales) as total_sales
    FROM ad_sales_metrics b
    LEFT JOIN total_sales_metrics a ON a.item_id = b.item_id
    GROUP BY b.item_id
    HAVING SUM(b.ad_spend) > 0
    ORDER BY roas ASC
    LIMIT 10`
  );

  // Eligibility breakdown
  const eligibilityCounts = await query(
    `SELECT eligibility, COUNT(*) as count FROM eligibility_table GROUP BY eligibility`
  );
  const ineligibilityMessages = await query(
    `SELECT message, COUNT(*) as count FROM eligibility_table WHERE NOT eligibility GROUP BY message ORDER BY count DESC LIMIT 1`
  );

  // Ad performance by week (CTR, Conversion)
  const adPerfByWeek = await query(
    `SELECT DATE_TRUNC('week', date) as week,
      SUM(clicks) as clicks,
      SUM(impressions) as impressions,
      SUM(units_sold) as units_sold,
      CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::float/SUM(impressions) ELSE 0 END as ctr,
      CASE WHEN SUM(clicks) > 0 THEN SUM(units_sold)::float/SUM(clicks) ELSE 0 END as conversion
    FROM ad_sales_metrics
    GROUP BY week ORDER BY week ASC`
  );

  // Drill-down table (all relevant columns, top 100 for perf)
  const drilldown = await query(
    `SELECT b.item_id, SUM(b.ad_spend) as ad_spend, SUM(b.ad_sales) as ad_sales, SUM(b.impressions) as impressions, SUM(b.clicks) as clicks, SUM(b.units_sold) as units_sold,
      CASE WHEN SUM(b.ad_spend) > 0 THEN SUM(b.ad_sales)/SUM(b.ad_spend) ELSE 0 END as roas,
      BOOL_OR(e.eligibility) as eligibility
    FROM ad_sales_metrics b
    LEFT JOIN eligibility_table e ON e.item_id = b.item_id
    GROUP BY b.item_id
    ORDER BY SUM(b.ad_spend) DESC
    LIMIT 100`
  );

  return new Response(
    JSON.stringify({
      kpis: {
        totalSales: kpiSales.rows[0]?.total_sales || 0,
        totalAdSales: kpiAdSales.rows[0]?.total_ad_sales || 0,
        totalAdSpend: kpiAdSpend.rows[0]?.total_ad_spend || 0,
        roas: roas || 0,
        netProfit: netProfit || 0,
      },
      salesAdTime: salesAdTime.rows,
      topProductsByROAS: topProductsByROAS.rows,
      topProductsBySales: topProductsBySales.rows,
      bottomProductsByROAS: bottomProductsByROAS.rows,
      eligibility: {
        counts: eligibilityCounts.rows,
        topMessage: ineligibilityMessages.rows[0]?.message || null,
      },
      adPerfByWeek: adPerfByWeek.rows,
      drilldown: drilldown.rows,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
} 