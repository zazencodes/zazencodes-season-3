"""Main evaluation engine for Arbiter evaluations."""

import asyncio
import json
import logging
import time
from collections import deque
from datetime import datetime
from typing import Any, Dict, List, Tuple

from langchain.callbacks.base import BaseCallbackHandler
from langchain_anthropic import ChatAnthropic
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_mcp_adapters.tools import load_mcp_tools
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
from rich import box
from rich.console import Console, Group
from rich.live import Live
from rich.panel import Panel
from rich.progress import BarColumn, Progress, SpinnerColumn, TextColumn
from rich.table import Table
from rich.text import Text

from .config import EvalConfig
from .costs import CostCache
from .judge import Judge
from .utils import ensure_output_dir, extract_text_from_agent_result


class ToolUseTracker(BaseCallbackHandler):
    """Callback handler to track tool usage during agent execution."""

    def __init__(self):
        self.used: bool = False
        self.calls: List[str] = []

    def reset(self) -> None:
        """Reset the tracker state."""
        self.used = False
        self.calls.clear()

    def on_tool_start(self, serialized: Dict[str, Any], input_str: str, **kwargs: Any) -> None:
        """Called when a tool starts execution."""
        self.used = True
        name = None
        try:
            name = serialized.get("name") or serialized.get("id")
        except Exception:
            pass
        if name:
            self.calls.append(str(name))


class TokenUsageTracker(BaseCallbackHandler):
    """Aggregate token usage from LLM calls during an agent run."""

    def __init__(self):
        self.input_tokens = 0
        self.output_tokens = 0

    def on_llm_end(self, response, **kwargs: Any) -> None:
        try:
            from .costs import extract_usage_from_llm_result

            inp, out = extract_usage_from_llm_result(response)
            self.input_tokens += int(inp)
            self.output_tokens += int(out)
        except Exception:
            pass


class MCPEvaluator:
    """Main evaluator class for running MCP-based LLM evaluations."""

    def __init__(
        self,
        config: EvalConfig,
        verbose: bool = False,
        logger: logging.Logger | None = None,
        run_timestamp: str | None = None,
    ):
        self.config = config
        self.console = Console(highlight=False)
        self.verbose = verbose
        self.logger = logger
        self.run_timestamp = run_timestamp

        # Initialize judge (instantiates its own Console internally)
        self.judge = Judge(config.judge)

        # Initialize MCP client for single server
        if len(config.mcp_servers) != 1:
            raise ValueError(
                f"Exactly one MCP server must be configured, got {len(config.mcp_servers)}"
            )

        self.server_name, server_config = next(iter(config.mcp_servers.items()))
        servers_config = {
            self.server_name: {
                "command": server_config.command,
                "args": server_config.args,
                "transport": server_config.transport,
            }
        }
        if server_config.env:
            servers_config[self.server_name]["env"] = server_config.env

        self.mcp_client = MultiServerMCPClient(servers_config)
        self.tools = None
        self.session = None
        self.session_manager = None
        self.cost_cache = CostCache()

        # Share cost cache with judge so it can reuse rates without re-warning
        try:
            if hasattr(self.judge, "set_cost_cache"):
                self.judge.set_cost_cache(self.cost_cache)  # type: ignore[attr-defined]
        except Exception:
            pass

    def _build_chat_model(self, model_id: str):
        """Construct a LangChain chat model from provider:model syntax.

        Supports providers: anthropic, openai, google.
        """
        if ":" in model_id:
            provider, model_name = model_id.split(":", 1)
        else:
            provider, model_name = "anthropic", model_id

        provider = provider.strip().lower()

        if provider == "anthropic":
            return ChatAnthropic(model=model_name)
        if provider == "openai":
            return ChatOpenAI(model=model_name)
        if provider == "google":
            return ChatGoogleGenerativeAI(model=model_name)

        raise ValueError(f"Unsupported model provider: {provider}")

    def _truncate_text(self, text: str, max_length: int = 80) -> str:
        """Truncate text for display, adding ellipsis if needed."""
        if len(text) <= max_length:
            return text
        return text[: max_length - 3] + "..."

    async def initialize(self) -> None:
        """Initialize MCP server session and load tools."""
        self.console.print(f"Starting MCP server '{self.server_name}' and loading tools...")
        if self.logger:
            self.logger.info(f"Starting MCP server '{self.server_name}' and loading tools...")
        # Preflight pricing once for all models + judge and print chosen rates
        try:
            models_to_check = list(self.config.models)
            if self.config.judge and getattr(self.config.judge, "model", None):
                models_to_check.append(self.config.judge.model)
            # Skip if already preflighted (e.g., CLI did it for confirmation)
            if not self.cost_cache.has_rates_for(models_to_check):
                self.console.print("Preflighting model pricing with LiteLLM...")
                if self.logger:
                    self.logger.info("Preflighting model pricing with LiteLLM...")
                self.cost_cache.preflight_models(
                    models_to_check,
                    warn=lambda m: self.console.print(f"[yellow]{m}[/yellow]"),
                )
                for mid in models_to_check:
                    inp, out = self.cost_cache.describe_rates(mid)
                    inp_str = f"${inp:.6f}/1k" if inp is not None else "unknown"
                    out_str = f"${out:.6f}/1k" if out is not None else "unknown"
                    self.console.print(
                        f"[dim]Pricing for {mid}: input={inp_str}, output={out_str}[/dim]"
                    )
                    if self.logger:
                        self.logger.info(f"Pricing for {mid}: input={inp_str}, output={out_str}")
        except Exception:
            # Non-fatal
            pass
        session_manager = self.mcp_client.session(self.server_name)
        self.session = await session_manager.__aenter__()
        self.session_manager = session_manager  # Store for cleanup
        self.tools = await load_mcp_tools(self.session)
        self.console.print(f"Loaded {len(self.tools)} tool(s) from MCP server.")
        if self.logger:
            self.logger.info(f"Loaded {len(self.tools)} tool(s) from MCP server.")

    async def run_once(
        self, agent: Any, query: str
    ) -> Tuple[str, List[str], float, Dict[str, int]]:
        """
        Run a single evaluation with the given agent and query.

        Args:
            agent: The LangGraph agent
            query: The query to evaluate

        Returns:
            Tuple of (answer_text, tool_calls, latency_seconds, token_usage)
        """
        tool_tracker = ToolUseTracker()
        tok_tracker = TokenUsageTracker()
        start = time.time()

        try:
            result = await agent.ainvoke(
                {"messages": [{"role": "user", "content": query}]},
                config={"callbacks": [tool_tracker, tok_tracker]},
            )
        except Exception as e:
            latency = time.time() - start
            return (
                f"__ERROR__: {e}",
                [],
                latency,
                {"input_tokens": 0, "output_tokens": 0},
            )

        latency = time.time() - start
        answer_text = extract_text_from_agent_result(result)

        return (
            answer_text,
            tool_tracker.calls,
            latency,
            {
                "input_tokens": tok_tracker.input_tokens,
                "output_tokens": tok_tracker.output_tokens,
            },
        )

    async def evaluate_model(
        self,
        model: str,
        *,
        models_progress=None,
        model_task=None,
        log=None,
    ) -> Dict[str, Any]:
        """
        Evaluate a single model against the configured dataset.

        Args:
            model: The model identifier to evaluate

        Returns:
            Dictionary containing evaluation results and summary
        """
        # Build agent for this model (tools loaded once during initialize)
        if self.tools is None:
            raise RuntimeError("Tools not initialized. Call initialize() first.")
        chat_model = self._build_chat_model(model)
        agent = create_react_agent(chat_model, self.tools)

        runs: List[Dict[str, Any]] = []

        # We no longer create per-prompt tasks; progress is at model level only

        # Process tool-use evals (judged)
        for idx, item in enumerate(self.config.tool_use_evals):
            for k in range(self.config.repeats):
                res = await self.run_once(agent, item.query)
                if isinstance(res, tuple) and len(res) == 4:
                    answer_text, tool_calls, latency, usage = res
                else:
                    # Back-compat with tests that monkeypatch run_once to 3-tuple
                    answer_text, tool_calls, latency = res  # type: ignore[misc]
                    usage = {"input_tokens": 0, "output_tokens": 0}

                verdict = self.judge.grade(
                    answer_text,
                    item.answer,
                    item.judge_mode,
                )
                # Capture raw judge response if available
                try:
                    judge_raw = getattr(self.judge, "get_last_raw_response")()
                except Exception:
                    judge_raw = None

                tool_used = len(tool_calls) > 0

                run_cost = self.cost_cache.cost(
                    model,
                    usage["input_tokens"],
                    usage["output_tokens"],
                )
                run_record = {
                    "iteration": k + 1,
                    "query": item.query,
                    "ground_truth": item.answer,
                    "model_raw_response": answer_text,
                    "grade": verdict,
                    "judge_mode": item.judge_mode,
                    "judge_raw_response": judge_raw,
                    "tool_expected": True,
                    "tool_used": tool_used,
                    "tool_calls": tool_calls,
                    "latency_s": round(latency, 3),
                    "tokens": {
                        "input": usage["input_tokens"],
                        "output": usage["output_tokens"],
                        "total": usage["input_tokens"] + usage["output_tokens"],
                    },
                    "cost_usd": round(run_cost, 6),
                }
                runs.append(run_record)

                # Advance the model-level progress if provided
                if models_progress is not None and model_task is not None:
                    models_progress.advance(model_task)

                status = "✅" if verdict == "pass" else "❌"
                tools_str = ",".join(tool_calls) if tool_calls else "-"

                if log is not None:
                    if self.verbose:
                        truncated_query = self._truncate_text(item.query, 60)
                        truncated_answer = self._truncate_text(answer_text, 60)
                        log(
                            f"{status} [{model}] {truncated_query} | "
                            f"Answer: {truncated_answer} | "
                            f"Grade: {verdict} | Tools: {tool_used} ({tools_str}) | "
                            f"tokens in/out={usage['input_tokens']}/{usage['output_tokens']} | "
                            f"{latency:.2f}s | ${run_cost:.4f}"
                        )
                    else:
                        log(
                            f"{status} [{model}] {item.query} #{k + 1}/{self.config.repeats} | "
                            f"tools={tool_used} ({tools_str}) | tokens={usage['input_tokens'] + usage['output_tokens']} | "
                            f"{latency:.2f}s | ${run_cost:.4f}"
                        )
                else:
                    if self.verbose:
                        truncated_query = self._truncate_text(item.query, 60)
                        truncated_answer = self._truncate_text(answer_text, 60)
                        self.console.print(
                            f"  {status} [{model}] {truncated_query} | "
                            f"Answer: {truncated_answer} | "
                            f"Grade: {verdict} | Tools: {tool_used} ({tools_str}) | "
                            f"tokens in/out={usage['input_tokens']}/{usage['output_tokens']} | "
                            f"{latency:.2f}s | ${run_cost:.4f}"
                        )
                    else:
                        self.console.print(
                            f"  {status} [{model}] {item.query} #{k + 1}/{self.config.repeats} | "
                            f"tools={tool_used} ({tools_str}) | tokens={usage['input_tokens'] + usage['output_tokens']} | "
                            f"{latency:.2f}s | ${run_cost:.4f}",
                            style="dim",
                            markup=False,
                        )

        # Process abstention evals (unjudged, tool_expected=False)
        for idx, item in enumerate(self.config.abstention_evals):
            for k in range(self.config.repeats):
                res = await self.run_once(agent, item.query)
                if isinstance(res, tuple) and len(res) == 4:
                    answer_text, tool_calls, latency, usage = res
                else:
                    answer_text, tool_calls, latency = res  # type: ignore[misc]
                    usage = {"input_tokens": 0, "output_tokens": 0}

                tool_used = len(tool_calls) > 0

                run_cost = self.cost_cache.cost(
                    model,
                    usage["input_tokens"],
                    usage["output_tokens"],
                )
                run_record = {
                    "iteration": k + 1,
                    "query": item.query,
                    "ground_truth": None,
                    "model_raw_response": answer_text,
                    "grade": None,
                    "judge_mode": "abstention",
                    "judge_raw_response": None,
                    "tool_expected": False,
                    "tool_used": tool_used,
                    "tool_calls": tool_calls,
                    "latency_s": round(latency, 3),
                    "tokens": {
                        "input": usage["input_tokens"],
                        "output": usage["output_tokens"],
                        "total": usage["input_tokens"] + usage["output_tokens"],
                    },
                    "cost_usd": round(run_cost, 6),
                }
                runs.append(run_record)

                # Advance the model-level progress if provided
                if models_progress is not None and model_task is not None:
                    models_progress.advance(model_task)

                status = "✅" if not tool_used else "❌"
                tools_str = ",".join(tool_calls) if tool_calls else "-"

                if log is not None:
                    if self.verbose:
                        truncated_query = self._truncate_text(item.query, 60)
                        truncated_answer = self._truncate_text(answer_text, 60)
                        log(
                            f"{status} [{model}] {truncated_query} | "
                            f"Answer: {truncated_answer} | "
                            f"Grade: N/A | Tools: {tool_used} ({tools_str}) | "
                            f"tokens in/out={usage['input_tokens']}/{usage['output_tokens']} | "
                            f"{latency:.2f}s | ${run_cost:.4f}"
                        )
                    else:
                        log(
                            f"{status} [{model}] {item.query} #{k + 1}/{self.config.repeats} | "
                            f"tools={tool_used} ({tools_str}) | tokens={usage['input_tokens'] + usage['output_tokens']} | "
                            f"{latency:.2f}s | ${run_cost:.4f}"
                        )
                else:
                    self.console.print(
                        f"  {status} [{model}] {item.query} #{k + 1}/{self.config.repeats} | "
                        f"tools={tool_used} ({tools_str}) | tokens={usage['input_tokens'] + usage['output_tokens']} | "
                        f"{latency:.2f}s | ${run_cost:.4f}",
                        style="dim",
                        markup=False,
                    )

        # Calculate summary statistics
        summary = self._calculate_summary(runs)
        return {"model": model, "runs": runs, "summary": summary}

    def _calculate_summary(self, runs: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Calculate summary statistics for evaluation runs."""
        total = len(runs)
        # Judged runs are those where tools are expected (tool-use evals)
        judged_runs = [r for r in runs if r.get("tool_expected")]
        judged_total = len(judged_runs)
        pass_count = sum(1 for r in judged_runs if r.get("grade") == "pass")
        pass_rate = pass_count / judged_total if judged_total else 0.0

        expected_total = sum(1 for r in runs if r["tool_expected"])  # judged items
        used_when_expected = sum(1 for r in runs if r["tool_expected"] and r["tool_used"])
        not_expected_total = sum(1 for r in runs if not r["tool_expected"])  # abstention items
        used_when_not_expected = sum(1 for r in runs if (not r["tool_expected"]) and r["tool_used"])

        total_used = sum(1 for r in runs if r["tool_used"])
        precision = (used_when_expected / total_used) if total_used else 1.0
        recall = (used_when_expected / expected_total) if expected_total else 1.0
        fpr = (used_when_not_expected / not_expected_total) if not_expected_total else 0.0

        in_tokens = sum(int(r.get("tokens", {}).get("input", 0)) for r in runs)
        out_tokens = sum(int(r.get("tokens", {}).get("output", 0)) for r in runs)
        total_tokens = in_tokens + out_tokens
        total_cost = round(sum(float(r.get("cost_usd", 0.0)) for r in runs), 6)

        return {
            "total_runs": total,
            "judged_runs": judged_total,
            "pass_count": pass_count,
            "pass_rate": round(pass_rate, 4),
            "tool_use": {
                "expected_total": expected_total,
                "used_when_expected": used_when_expected,
                "recall": round(recall, 4),
                "total_used": total_used,
                "used_when_not_expected": used_when_not_expected,
                "precision": round(precision, 4),
                "false_positive_rate": round(fpr, 4),
            },
            "avg_latency_s": round(sum(r["latency_s"] for r in runs) / total, 3) if total else None,
            "tokens": {
                "input": in_tokens,
                "output": out_tokens,
                "total": total_tokens,
            },
            "cost_usd": total_cost,
        }

    def _compute_overall_totals(self, per_model_summary: Dict[str, Any]) -> Dict[str, Any]:
        """Compute overall aggregated summary metrics across models.

        per_model_summary is a mapping of model_id -> summary dict as returned by _calculate_summary.
        """
        summaries = list(per_model_summary.values())
        if not summaries:
            return {
                "total_runs": 0,
                "judged_runs": 0,
                "pass_count": 0,
                "pass_rate": 0.0,
                "tool_use": {
                    "expected_total": 0,
                    "used_when_expected": 0,
                    "recall": 1.0,
                    "total_used": 0,
                    "used_when_not_expected": 0,
                    "precision": 1.0,
                    "false_positive_rate": 0.0,
                },
                "avg_latency_s": None,
                "tokens": {"input": 0, "output": 0, "total": 0},
                "cost_usd": 0.0,
            }

        total_runs_sum = sum(s.get("total_runs", 0) for s in summaries)
        judged_runs_sum = sum(s.get("judged_runs", 0) for s in summaries)
        pass_count_sum = sum(s.get("pass_count", 0) for s in summaries)

        expected_total_sum = sum(s.get("tool_use", {}).get("expected_total", 0) for s in summaries)
        used_when_expected_sum = sum(
            s.get("tool_use", {}).get("used_when_expected", 0) for s in summaries
        )
        total_used_sum = sum(s.get("tool_use", {}).get("total_used", 0) for s in summaries)
        used_when_not_expected_sum = sum(
            s.get("tool_use", {}).get("used_when_not_expected", 0) for s in summaries
        )

        not_expected_total_sum = total_runs_sum - expected_total_sum

        weighted_latency_sum = sum(
            (s.get("avg_latency_s") or 0) * s.get("total_runs", 0) for s in summaries
        )
        overall_avg_latency = (
            round(weighted_latency_sum / total_runs_sum, 3) if total_runs_sum else None
        )

        overall_pass_rate = round(pass_count_sum / judged_runs_sum, 4) if judged_runs_sum else 0.0
        overall_precision = (
            round(used_when_expected_sum / total_used_sum, 4) if total_used_sum else 1.0
        )
        overall_recall = (
            round(used_when_expected_sum / expected_total_sum, 4) if expected_total_sum else 1.0
        )
        overall_fpr = (
            round(used_when_not_expected_sum / not_expected_total_sum, 4)
            if not_expected_total_sum
            else 0.0
        )

        in_tokens_sum = sum(int(s.get("tokens", {}).get("input", 0)) for s in summaries)
        out_tokens_sum = sum(int(s.get("tokens", {}).get("output", 0)) for s in summaries)
        total_tokens_sum = in_tokens_sum + out_tokens_sum

        total_cost_sum = round(sum(float(s.get("cost_usd", 0.0)) for s in summaries), 6)

        return {
            "total_runs": total_runs_sum,
            "judged_runs": judged_runs_sum,
            "pass_count": pass_count_sum,
            "pass_rate": overall_pass_rate,
            "tool_use": {
                "expected_total": expected_total_sum,
                "used_when_expected": used_when_expected_sum,
                "recall": overall_recall,
                "total_used": total_used_sum,
                "used_when_not_expected": used_when_not_expected_sum,
                "precision": overall_precision,
                "false_positive_rate": overall_fpr,
            },
            "avg_latency_s": overall_avg_latency,
            "tokens": {
                "input": in_tokens_sum,
                "output": out_tokens_sum,
                "total": total_tokens_sum,
            },
            "cost_usd": total_cost_sum,
        }

    async def run_evaluation(self) -> str:
        """
        Run the complete evaluation suite.

        Returns:
            Path to the output file
        """
        try:
            await self.initialize()

            # Single progress with a task per model; plus a logs panel on the right
            models_progress = Progress(
                "{task.description}",
                SpinnerColumn(),
                BarColumn(),
                TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
            )
            log_lines = deque(maxlen=200)

            def render_logs():
                if log_lines:
                    return Panel(
                        Group(*list(log_lines)),
                        title="Logs",
                        border_style="blue",
                        padding=(1, 2),
                    )
                return Panel(Text(""), title="Logs", border_style="blue", padding=(1, 2))

            # Create one task per model; total equals number of runs for that model
            per_model_total = (
                len(self.config.tool_use_evals) + len(self.config.abstention_evals)
            ) * self.config.repeats
            model_task_ids: Dict[str, int] = {
                m: models_progress.add_task(f"[b]{m}", total=per_model_total)
                for m in self.config.models
            }

            # Stacked layout builder: Logs on top, Models progress at bottom
            def build_layout():
                t = Table.grid(expand=True)
                t.add_column(ratio=1)
                progress_panel = Panel.fit(
                    models_progress, title="Models", border_style="red", padding=(1, 2)
                )
                # Logs first (top), then progress (bottom)
                t.add_row(render_logs())
                t.add_row(progress_panel)
                return t

            # Inject judge logger so judge output also lands in the Logs panel
            try:
                if hasattr(self.judge, "set_logger"):

                    def _judge_log(m: str):
                        log_lines.append(Text(m))
                        if self.logger:
                            try:
                                self.logger.info(m)
                            except Exception:
                                pass

                    self.judge.set_logger(_judge_log)  # type: ignore[attr-defined]
            except Exception:
                pass

            with Live(
                build_layout(),
                refresh_per_second=12,
                transient=True,
                console=self.console,
            ) as live:

                def log_fn(message: str):
                    log_lines.append(Text(message))
                    if self.logger:
                        try:
                            self.logger.info(message)
                        except Exception:
                            pass
                    live.update(build_layout(), refresh=True)

                tasks = [
                    self.evaluate_model(
                        m,
                        models_progress=models_progress,
                        model_task=model_task_ids[m],
                        log=log_fn,
                    )
                    for m in self.config.models
                ]
                results = await asyncio.gather(*tasks)
                all_results = {m: r for m, r in zip(self.config.models, results)}
        finally:
            await self.cleanup()

        # Determine output directory
        output_dir = self.config.output_dir or "."
        output_path = ensure_output_dir(output_dir, timestamp=self.run_timestamp)

        # Build pretty overall summary table across models (rows=metrics, cols=models + totals)
        table, summary_markdown = self._build_overall_summary_table(all_results)

        self.console.print("\n=== Overall Summary (All Models) ===")
        if self.logger:
            self.logger.info("=== Overall Summary (All Models) ===")
        self.console.print(table)

        # Build per-model summaries and overall totals JSON
        per_model_summary = {
            m: all_results[m]["summary"] for m in self.config.models if m in all_results
        }

        overall_totals = self._compute_overall_totals(per_model_summary)

        judge_cost = getattr(self.judge, "get_cost_summary", lambda: {})()

        # Create comprehensive output
        payload = {
            "created_at": datetime.now().isoformat(),
            "config": {
                "name": self.config.name,
                "models": self.config.models,
                "judge_model": self.config.judge.model,
                "repeats": self.config.repeats,
                "mcp_servers": {
                    name: {
                        "command": server.command,
                        "args": server.args,
                        "transport": server.transport,
                    }
                    for name, server in self.config.mcp_servers.items()
                },
            },
            "tool_use_evals": [
                item.model_dump(exclude_none=True) for item in self.config.tool_use_evals
            ],
            "abstention_evals": [
                item.model_dump(exclude_none=True) for item in self.config.abstention_evals
            ],
            "results": all_results,
            "summary": {
                "table_markdown": summary_markdown,
                "judge_cost": judge_cost,
                "overall": overall_totals,
                "per_model": per_model_summary,
            },
        }

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)

        return output_path

    async def cleanup(self) -> None:
        """Clean up MCP session resources."""
        if self.session_manager:
            await self.session_manager.__aexit__(None, None, None)

    def _build_overall_summary_table(self, all_results: Dict[str, Any]) -> Tuple[Table, str]:
        """Build a Rich table and a Markdown table summarizing metrics across all models.

        Rows are metrics, columns are each model plus a final "totals" column.
        """
        # Preserve configured model order
        model_ids = list(self.config.models)
        summaries = {m: all_results[m]["summary"] for m in model_ids if m in all_results}

        # Precompute sums needed for totals/aggregates
        total_runs_sum = sum(s.get("total_runs", 0) for s in summaries.values())
        judged_runs_sum = sum(s.get("judged_runs", 0) for s in summaries.values())
        pass_count_sum = sum(s.get("pass_count", 0) for s in summaries.values())

        tool_expected_sum = sum(
            s.get("tool_use", {}).get("expected_total", 0) for s in summaries.values()
        )
        used_when_expected_sum = sum(
            s.get("tool_use", {}).get("used_when_expected", 0) for s in summaries.values()
        )
        total_used_sum = sum(s.get("tool_use", {}).get("total_used", 0) for s in summaries.values())
        used_when_not_expected_sum = sum(
            s.get("tool_use", {}).get("used_when_not_expected", 0) for s in summaries.values()
        )
        # not_expected_total isn't stored, but equals total_runs - expected_total per model
        not_expected_total_sum = total_runs_sum - tool_expected_sum

        # Weighted average latency across all runs
        weighted_latency_sum = sum(
            (s.get("avg_latency_s") or 0) * s.get("total_runs", 0) for s in summaries.values()
        )
        overall_avg_latency = (
            round(weighted_latency_sum / total_runs_sum, 3) if total_runs_sum else None
        )

        # Aggregated rates (compute from sums)
        overall_pass_rate = round(pass_count_sum / judged_runs_sum, 4) if judged_runs_sum else 0.0
        overall_precision = (
            round(used_when_expected_sum / total_used_sum, 4) if total_used_sum else 1.0
        )
        overall_recall = (
            round(used_when_expected_sum / tool_expected_sum, 4) if tool_expected_sum else 1.0
        )
        overall_fpr = (
            round(used_when_not_expected_sum / not_expected_total_sum, 4)
            if not_expected_total_sum
            else 0.0
        )

        # Metric definitions: (row_label, extractor for model summary, totals_value)
        def get(d, path, default=None):
            cur = d
            for part in path.split("."):
                if not isinstance(cur, dict) or part not in cur:
                    return default
                cur = cur[part]
            return cur

        metrics: List[Tuple[str, str, Any]] = [
            ("total_runs", "total_runs", total_runs_sum),
            ("judged_runs", "judged_runs", judged_runs_sum),
            ("pass_count", "pass_count", pass_count_sum),
            ("pass_rate", "pass_rate", overall_pass_rate),
            ("tool_use.expected_total", "tool_use.expected_total", tool_expected_sum),
            (
                "tool_use.used_when_expected",
                "tool_use.used_when_expected",
                used_when_expected_sum,
            ),
            ("tool_use.recall", "tool_use.recall", overall_recall),
            ("tool_use.total_used", "tool_use.total_used", total_used_sum),
            (
                "tool_use.used_when_not_expected",
                "tool_use.used_when_not_expected",
                used_when_not_expected_sum,
            ),
            ("tool_use.precision", "tool_use.precision", overall_precision),
            (
                "tool_use.false_positive_rate",
                "tool_use.false_positive_rate",
                overall_fpr,
            ),
            ("avg_latency_s", "avg_latency_s", overall_avg_latency),
            (
                "tokens.input",
                "tokens.input",
                sum(get(s, "tokens.input", 0) for s in summaries.values()),
            ),
            (
                "tokens.output",
                "tokens.output",
                sum(get(s, "tokens.output", 0) for s in summaries.values()),
            ),
            (
                "tokens.total",
                "tokens.total",
                sum(get(s, "tokens.total", 0) for s in summaries.values()),
            ),
            (
                "cost_usd",
                "cost_usd",
                round(sum(get(s, "cost_usd", 0.0) for s in summaries.values()), 6),
            ),
        ]

        def fmt_value(label: str, value: Any) -> str:
            if value is None:
                return "-"
            if label == "cost_usd":
                try:
                    return f"{float(value):.4f}"
                except Exception:
                    return str(value)
            if any(k in label for k in ["rate", "precision", "recall", "false_positive_rate"]):
                try:
                    return f"{float(value):.4f}"
                except Exception:
                    return str(value)
            if label == "avg_latency_s":
                try:
                    return f"{float(value):.3f}"
                except Exception:
                    return str(value)
            return (
                str(int(value))
                if isinstance(value, (int, float)) and float(value).is_integer()
                else str(value)
            )

        def is_bad_metric(
            label: str,
            value: Any,
            model_summary: Dict[str, Any],
            *,
            totals: bool = False,
        ) -> bool:
            try:
                if value is None:
                    return False
                # pass_rate or pass_count issues
                if label == "pass_rate":
                    judged = judged_runs_sum if totals else model_summary.get("judged_runs", 0)
                    return judged > 0 and float(value) < 1.0
                if label == "pass_count":
                    judged = judged_runs_sum if totals else model_summary.get("judged_runs", 0)
                    return judged > 0 and int(value) < int(judged)

                # Tool use metrics
                if label == "tool_use.recall":
                    expected = (
                        tool_expected_sum
                        if totals
                        else model_summary.get("tool_use", {}).get("expected_total", 0)
                    )
                    return expected > 0 and float(value) < 1.0
                if label == "tool_use.precision":
                    total_used = (
                        total_used_sum
                        if totals
                        else model_summary.get("tool_use", {}).get("total_used", 0)
                    )
                    return total_used > 0 and float(value) < 1.0
                if label == "tool_use.false_positive_rate":
                    return float(value) > 0.0
                if label == "tool_use.used_when_not_expected":
                    return int(value) > 0
                if label == "tool_use.used_when_expected":
                    expected = (
                        tool_expected_sum
                        if totals
                        else model_summary.get("tool_use", {}).get("expected_total", 0)
                    )
                    return expected > 0 and int(value) < int(expected)

                # Generally do not flag latency or counts without context
                return False
            except Exception:
                return False

        # Build Rich table
        table = Table(title="Overall Summary by Model", box=box.SIMPLE_HEAVY)
        table.add_column("metric", style="bold")
        for m in model_ids:
            table.add_column(m)
        table.add_column("totals", style="bold")

        # Also construct Markdown
        header_cells = ["metric"] + model_ids + ["totals"]
        md_lines = [
            "| " + " | ".join(header_cells) + " |",
            "| " + " | ".join(["---"] * len(header_cells)) + " |",
        ]

        for label, path, totals_val in metrics:
            display_cells = [label]
            md_cells = [label]
            for m in model_ids:
                s = summaries.get(m, {})
                val = get(s, path)
                formatted = fmt_value(label, val)
                if is_bad_metric(label, val, s, totals=False):
                    display_cells.append(f"[bold][red]{formatted}[/red][/bold]")
                else:
                    display_cells.append(formatted)
                md_cells.append(formatted)

            totals_formatted = fmt_value(label, totals_val)
            if is_bad_metric(label, totals_val, {}, totals=True):
                display_cells.append(f"[bold][red]{totals_formatted}[/red][/bold]")
            else:
                display_cells.append(totals_formatted)

            table.add_row(*display_cells)
            md_lines.append("| " + " | ".join(md_cells + [totals_formatted]) + " |")

        markdown = "\n".join(md_lines)
        return table, markdown
        # Preserve configured model order
        model_ids = list(self.config.models)
        summaries = {m: all_results[m]["summary"] for m in model_ids if m in all_results}

        # Precompute sums needed for totals/aggregates
        total_runs_sum = sum(s.get("total_runs", 0) for s in summaries.values())
        judged_runs_sum = sum(s.get("judged_runs", 0) for s in summaries.values())
        pass_count_sum = sum(s.get("pass_count", 0) for s in summaries.values())

        tool_expected_sum = sum(
            s.get("tool_use", {}).get("expected_total", 0) for s in summaries.values()
        )
        used_when_expected_sum = sum(
            s.get("tool_use", {}).get("used_when_expected", 0) for s in summaries.values()
        )
        total_used_sum = sum(s.get("tool_use", {}).get("total_used", 0) for s in summaries.values())
        used_when_not_expected_sum = sum(
            s.get("tool_use", {}).get("used_when_not_expected", 0) for s in summaries.values()
        )
        # not_expected_total isn't stored, but equals total_runs - expected_total per model
        not_expected_total_sum = total_runs_sum - tool_expected_sum

        # Weighted average latency across all runs
        weighted_latency_sum = sum(
            (s.get("avg_latency_s") or 0) * s.get("total_runs", 0) for s in summaries.values()
        )
        overall_avg_latency = (
            round(weighted_latency_sum / total_runs_sum, 3) if total_runs_sum else None
        )

        # Aggregated rates (compute from sums)
        overall_pass_rate = round(pass_count_sum / judged_runs_sum, 4) if judged_runs_sum else 0.0
        overall_precision = (
            round(used_when_expected_sum / total_used_sum, 4) if total_used_sum else 1.0
        )
        overall_recall = (
            round(used_when_expected_sum / tool_expected_sum, 4) if tool_expected_sum else 1.0
        )
        overall_fpr = (
            round(used_when_not_expected_sum / not_expected_total_sum, 4)
            if not_expected_total_sum
            else 0.0
        )

        # Metric definitions: (row_label, extractor for model summary, totals_value)
        def get(d, path, default=None):
            cur = d
            for part in path.split("."):
                if not isinstance(cur, dict) or part not in cur:
                    return default
                cur = cur[part]
            return cur

        metrics: List[Tuple[str, str, Any]] = [
            ("total_runs", "total_runs", total_runs_sum),
            ("judged_runs", "judged_runs", judged_runs_sum),
            ("pass_count", "pass_count", pass_count_sum),
            ("pass_rate", "pass_rate", overall_pass_rate),
            ("tool_use.expected_total", "tool_use.expected_total", tool_expected_sum),
            (
                "tool_use.used_when_expected",
                "tool_use.used_when_expected",
                used_when_expected_sum,
            ),
            ("tool_use.recall", "tool_use.recall", overall_recall),
            ("tool_use.total_used", "tool_use.total_used", total_used_sum),
            (
                "tool_use.used_when_not_expected",
                "tool_use.used_when_not_expected",
                used_when_not_expected_sum,
            ),
            ("tool_use.precision", "tool_use.precision", overall_precision),
            (
                "tool_use.false_positive_rate",
                "tool_use.false_positive_rate",
                overall_fpr,
            ),
            ("avg_latency_s", "avg_latency_s", overall_avg_latency),
            (
                "tokens.input",
                "tokens.input",
                sum(get(s, "tokens.input", 0) for s in summaries.values()),
            ),
            (
                "tokens.output",
                "tokens.output",
                sum(get(s, "tokens.output", 0) for s in summaries.values()),
            ),
            (
                "tokens.total",
                "tokens.total",
                sum(get(s, "tokens.total", 0) for s in summaries.values()),
            ),
            (
                "cost_usd",
                "cost_usd",
                round(sum(get(s, "cost_usd", 0.0) for s in summaries.values()), 6),
            ),
        ]

        def fmt_value(label: str, value: Any) -> str:
            if value is None:
                return "-"
            if label == "cost_usd":
                try:
                    return f"{float(value):.4f}"
                except Exception:
                    return str(value)
            if any(k in label for k in ["rate", "precision", "recall", "false_positive_rate"]):
                try:
                    return f"{float(value):.4f}"
                except Exception:
                    return str(value)
            if label == "avg_latency_s":
                try:
                    return f"{float(value):.3f}"
                except Exception:
                    return str(value)
            return (
                str(int(value))
                if isinstance(value, (int, float)) and float(value).is_integer()
                else str(value)
            )

        def is_bad_metric(
            label: str,
            value: Any,
            model_summary: Dict[str, Any],
            *,
            totals: bool = False,
        ) -> bool:
            try:
                if value is None:
                    return False
                # pass_rate or pass_count issues
                if label == "pass_rate":
                    judged = judged_runs_sum if totals else model_summary.get("judged_runs", 0)
                    return judged > 0 and float(value) < 1.0
                if label == "pass_count":
                    judged = judged_runs_sum if totals else model_summary.get("judged_runs", 0)
                    return judged > 0 and int(value) < int(judged)

                # Tool use metrics
                if label == "tool_use.recall":
                    expected = (
                        tool_expected_sum
                        if totals
                        else model_summary.get("tool_use", {}).get("expected_total", 0)
                    )
                    return expected > 0 and float(value) < 1.0
                if label == "tool_use.precision":
                    total_used = (
                        total_used_sum
                        if totals
                        else model_summary.get("tool_use", {}).get("total_used", 0)
                    )
                    return total_used > 0 and float(value) < 1.0
                if label == "tool_use.false_positive_rate":
                    return float(value) > 0.0
                if label == "tool_use.used_when_not_expected":
                    return int(value) > 0
                if label == "tool_use.used_when_expected":
                    expected = (
                        tool_expected_sum
                        if totals
                        else model_summary.get("tool_use", {}).get("expected_total", 0)
                    )
                    return expected > 0 and int(value) < int(expected)

                # Generally do not flag latency or counts without context
                return False
            except Exception:
                return False

        # Build Rich table
        table = Table(title="Overall Summary by Model", box=box.SIMPLE_HEAVY)
        table.add_column("metric", style="bold")
        for m in model_ids:
            table.add_column(m)
        table.add_column("totals", style="bold")

        # Also construct Markdown
        header_cells = ["metric"] + model_ids + ["totals"]
        md_lines = [
            "| " + " | ".join(header_cells) + " |",
            "| " + " | ".join(["---"] * len(header_cells)) + " |",
        ]

        for label, path, totals_val in metrics:
            display_cells = [label]
            md_cells = [label]
            for m in model_ids:
                s = summaries.get(m, {})
                val = get(s, path)
                formatted = fmt_value(label, val)
                if is_bad_metric(label, val, s, totals=False):
                    display_cells.append(f"[bold][red]{formatted}[/red][/bold]")
                else:
                    display_cells.append(formatted)
                md_cells.append(formatted)

            totals_formatted = fmt_value(label, totals_val)
            if is_bad_metric(label, totals_val, {}, totals=True):
                display_cells.append(f"[bold][red]{totals_formatted}[/red][/bold]")
            else:
                display_cells.append(totals_formatted)

            table.add_row(*display_cells)
            md_lines.append("| " + " | ".join(md_cells + [totals_formatted]) + " |")

        markdown = "\n".join(md_lines)
        return table, markdown
