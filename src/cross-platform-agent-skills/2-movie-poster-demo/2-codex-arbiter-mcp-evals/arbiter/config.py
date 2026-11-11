"""Configuration models for Arbiter evaluations."""

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class ToolUseEvalItem(BaseModel):
    """Evaluation item where tool use is expected and graded."""

    id: Optional[str] = Field(
        default=None, description="Optional identifier for this evaluation item"
    )
    query: str = Field(..., description="The query/prompt to send to the model")
    answer: str = Field(..., description="Ground truth answer for evaluation")
    judge_mode: Literal["llm", "contains"] = Field(
        ...,
        description="Judging mode: 'llm' for LLM-as-judge, 'contains' for substring check",
    )


class AbstentionEvalItem(BaseModel):
    """Evaluation item where the model is expected to abstain from using tools."""

    id: Optional[str] = Field(
        default=None, description="Optional identifier for this evaluation item"
    )
    query: str = Field(..., description="The query/prompt to send to the model")


class MCPServerConfig(BaseModel):
    """Configuration for an MCP server."""

    command: str = Field(..., description="Command to start the MCP server")
    args: List[str] = Field(
        default_factory=list, description="Arguments for the MCP server command"
    )
    transport: str = Field(default="stdio", description="Transport type (stdio, sse, etc.)")
    env: Optional[Dict[str, str]] = Field(
        default=None, description="Environment variables for the server"
    )


class JudgeConfig(BaseModel):
    """Configuration for the LLM judge."""

    # Require provider-prefixed model id, e.g., "anthropic:claude-3-5-haiku-latest"
    model: str = Field(
        default="anthropic:claude-3-5-haiku-latest",
        description="Provider-prefixed model id for judging (e.g. 'anthropic:claude-3-5-haiku-latest')",
    )
    max_tokens: Optional[int] = Field(
        default=None, description="Maximum tokens for judge responses"
    )
    temperature: Optional[float] = Field(
        default=None, description="Temperature for judge responses"
    )
    system_prompt: Optional[str] = Field(
        default=None, description="Custom system prompt for the judge"
    )
    prompt_template: Optional[str] = Field(
        default=None, description="Custom prompt template for evaluation"
    )


class EvalConfig(BaseModel):
    """Complete configuration for an evaluation suite."""

    name: str = Field(..., description="Name of the evaluation suite")
    models: List[str] = Field(..., description="List of models to evaluate")
    judge: JudgeConfig = Field(default_factory=JudgeConfig, description="Judge configuration")
    repeats: int = Field(..., description="Number of times to repeat each evaluation")
    mcp_servers: Dict[str, MCPServerConfig] = Field(
        ..., description="MCP server configurations (must contain exactly one server)"
    )
    tool_use_evals: List[ToolUseEvalItem] = Field(
        default_factory=list, description="Evaluation items where tool use is expected"
    )
    abstention_evals: List[AbstentionEvalItem] = Field(
        default_factory=list,
        description="Evaluation items where tool use is not expected",
    )
    output_dir: Optional[str] = Field(
        default=None, description="Output directory (defaults to config file directory)"
    )

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "EvalConfig":
        """Create an EvalConfig from a dictionary."""

        # Convert MCP server configs to proper format and validate single server
        servers = {}
        for name, config in data.get("mcp_servers", {}).items():
            if isinstance(config, dict):
                servers[name] = MCPServerConfig(**config)
            else:
                servers[name] = config

        if len(servers) != 1:
            raise ValueError(f"Exactly one MCP server must be configured, got {len(servers)}")

        data["mcp_servers"] = servers

        tool_use_items: List[ToolUseEvalItem] = []
        abstention_items: List[AbstentionEvalItem] = []

        if "tool_use_evals" in data:
            tool_use_items.extend(
                [ToolUseEvalItem(**i) if isinstance(i, dict) else i for i in data["tool_use_evals"]]
            )
        if "abstention_evals" in data:
            abstention_items.extend(
                [
                    AbstentionEvalItem(**i) if isinstance(i, dict) else i
                    for i in data["abstention_evals"]
                ]
            )

        data["tool_use_evals"] = tool_use_items
        data["abstention_evals"] = abstention_items

        return cls(**data)
