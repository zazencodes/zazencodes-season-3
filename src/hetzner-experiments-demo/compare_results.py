import sys
from pathlib import Path

def main():
    results_dir = Path("results")
    ground_truth_file = Path("data/ground_truth_cut.txt")

    if not results_dir.exists():
        print("No results directory found. Run 3_long_context.py for one or more models first.")
        return

    result_files = sorted(results_dir.glob("*_completion.txt"))
    if not result_files:
        print("No model completion results found in results/.")
        return

    print("=" * 80)
    print(" " * 24 + "LONG CONTEXT BENCHMARK COMPARISON")
    print("=" * 80)

    if ground_truth_file.exists():
        print("\n[GROUND TRUTH EXCISED PARAGRAPH]:")
        print("-" * 80)
        print(ground_truth_file.read_text().strip())
        print("-" * 80 + "\n")

    for f in result_files:
        content = f.read_text()
        print("=" * 80)
        print(f"FILE: {f.name}")
        print("=" * 80)
        print(content)
        print("\n")

if __name__ == "__main__":
    main()
