#!/usr/bin/env python3
"""
Deterministic branch-name slugging for GitHub Actions preview deployments.

Reads BRANCH_NAME from environment, prints the path-safe slug to stdout.
Must produce identical output to toPreviewSlug() in scripts/deploy-utils.mjs.
"""

import os
import sys


def slugify_branch(branch_name: str) -> str:
    name = branch_name.strip().lower()
    encoded = []

    for char in name:
        if ("a" <= char <= "z") or ("0" <= char <= "9") or char == "-":
            encoded.append(char)
        else:
            encoded.append(f"_{ord(char):x}_")

    return "".join(encoded).strip("-")


def main() -> None:
    branch_name = os.environ.get("BRANCH_NAME", "")
    if not branch_name:
        print("BRANCH_NAME environment variable is not set.", file=sys.stderr)
        sys.exit(1)

    slug = slugify_branch(branch_name)
    if not slug:
        print(
            f"Failed to derive preview slug from branch '{branch_name}'.",
            file=sys.stderr,
        )
        sys.exit(1)

    print(slug)


if __name__ == "__main__":
    main()
