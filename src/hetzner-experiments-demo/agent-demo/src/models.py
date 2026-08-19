from dataclasses import dataclass

@dataclass
class StorageAccount:
    tenant_id: str
    nvme_gb: float
    snapshot_gb: float
    boosted_gb: float
    is_enterprise: bool = False

    @property
    def total_gb(self) -> float:
        return self.nvme_gb + self.snapshot_gb + self.boosted_gb

    @property
    def primary_gb(self) -> float:
        return self.nvme_gb + self.boosted_gb
