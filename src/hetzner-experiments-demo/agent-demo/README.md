# Agent Demo — Hetzner Cloud Storage Pricing

Monthly cost calculator for Hetzner cloud block storage accounts.

## Storage Rates (monthly, per GB)

| Storage Type | Price |
|---|---|
| Standard Block NVMe | €0.048 |
| High-Performance IOPS Boosted | €0.072 |
| Snapshot (cold backup) | €0.024 |

## Discounts & Credits

- **Bulk discount (10%)** — triggers when primary storage (NVMe + IOPS Boosted) reaches 5,000 GB. Snapshot storage does not count toward this threshold.
- **Enterprise credit (€5/month)** — applied after discounts for enterprise-tier accounts. Final bill is clamped at €0.00.

## Usage

```python
from src.storage_pricing import calculate_monthly_storage_cost
from src.models import StorageAccount

account = StorageAccount(
    tenant_id="demo-1",
    nvme_gb=1000,
    snapshot_gb=2000,
    boosted_gb=500,
    is_enterprise=True,
)

cost = calculate_monthly_storage_cost(account)
print(cost)  # €127.0
```

## Structure

```
src/
├── models.py         # StorageAccount dataclass
└── storage_pricing.py # Cost calculation logic
docs/pricing_spec.md  # Full pricing specification
```