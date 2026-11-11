# Storage Pricing Calculation Specification

## Base Monthly Rates
- **Standard Block NVMe Storage**: €0.048 per GB / month
- **Snapshot Storage**: €0.024 per GB / month
- **High-Performance Volume (IOPS Boosted)**: €0.072 per GB / month

## Discount Tiers & Allowances
1. **Bulk Storage Discount**:
   - Qualification: Tenants with **primary active storage** (Standard NVMe + IOPS Boosted) reaching or exceeding **5,000 GB** qualify for a volume discount.
   - Benefit: A **10% discount** is applied to the total gross storage bill.
   - *Note: Snapshot storage is cold backup capacity and does not count toward the 5,000 GB qualification threshold.*

2. **Enterprise SLA Credit**:
   - Enterprise tier accounts (`is_enterprise = True`) receive a flat **€5.00 loyalty credit** deducted from their monthly bill after any volume discounts are applied.
   - The final total monthly charge cannot be negative (clamped at €0.00).

## Calculation Summary
- `gross_subtotal = (nvme_gb * 0.048) + (snapshot_gb * 0.024) + (boosted_gb * 0.072)`
- If `primary_storage >= 5000.0`: `subtotal = gross_subtotal * 0.90` else `subtotal = gross_subtotal`
- If `is_enterprise`: `final_total = max(0.0, subtotal - 5.0)` else `final_total = max(0.0, subtotal)`
