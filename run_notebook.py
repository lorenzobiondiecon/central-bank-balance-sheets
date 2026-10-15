"""Execute all notebook cells in a fresh kernel and save successful outputs."""

import os
from pathlib import Path
import tempfile


def main():
    root = Path(__file__).resolve().parent
    os.environ.setdefault("MPLCONFIGDIR", str(root / ".mplconfig"))
    with tempfile.TemporaryDirectory(prefix="central-bank-notebook-") as runtime:
        os.environ["JUPYTER_RUNTIME_DIR"] = runtime
        os.environ["IPYTHONDIR"] = runtime
        import nbformat
        from nbclient import NotebookClient

        path = root / "central_bank_balance_sheets.ipynb"
        notebook = nbformat.read(path, as_version=4)
        NotebookClient(
            notebook, timeout=180, kernel_name="python3",
            resources={"metadata": {"path": str(root)}},
        ).execute()
        nbformat.validate(notebook)
        nbformat.write(notebook, path)
    print(f"Executed, validated and saved {path}")


if __name__ == "__main__":
    main()
