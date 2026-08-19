from .models import StorageAccount

RATE_NVME_PER_GB = 0.048
RATE_SNAPSHOT_PER_GB = 0.024
RATE_BOOSTED_PER_GB = 0.072

DISCOUNT_THRESHOLD_GB = 5000.0
BULK_DISCOUNT_PERCENT = 0.10
ENTERPRISE_CREDIT_EUR = 5.0

def calculate_monthly_storage_cost(account: StorageAccount) -> float:
    """
    Calculates monthly storage cost based on volume allocations and discounts.
    """
    nvme_cost = account.nvme_gb * RATE_NVME_PER_GB
    snapshot_cost = account.snapshot_gb * RATE_SNAPSHOT_PER_GB
    boosted_cost = account.boosted_gb * RATE_BOOSTED_PER_GB

    subtotal = nvme_cost + snapshot_cost + boosted_cost

    # Apply bulk discount if total storage meets or exceeds threshold
    if account.primary_gb >= DISCOUNT_THRESHOLD_GB:
        subtotal *= (1.0 - BULK_DISCOUNT_PERCENT)

    # Apply enterprise credit
    if account.is_enterprise:
        subtotal -= ENTERPRISE_CREDIT_EUR

    return max(0.0, round(subtotal, 2))
