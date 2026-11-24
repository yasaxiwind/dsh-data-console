# Example data

`regional-sales.csv` is a synthetic dataset used by the screenshots and for
manual testing:

- 240 rows, 8 columns: `order_date`, `region`, `channel`, `product`, `units`,
  `unit_price`, `revenue`, `satisfaction`
- dates across January–June 2026; regions North/South/East/West; channels
  Online/Retail/Partner; products Starter/Team/Enterprise
- generated with a fixed random seed — no real customer or company data

Open it with the panel's path field:

```
examples/regional-sales.csv
```

Useful queries for a demo:

```sql
-- the table filter
revenue > 900 and revenue < 1400

-- SQL tab
select region, sum(revenue) as revenue, avg(satisfaction) as satisfaction
from data
group by region
order by revenue desc
```
