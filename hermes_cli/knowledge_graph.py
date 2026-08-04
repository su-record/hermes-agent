"""Sanitized, read-only Hermes and Obsidian knowledge graph assembly."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
import hashlib
import os
from pathlib import Path
import re
import stat
from typing import Any

import yaml


DEFAULT_MAX_FILES = 2_000
DEFAULT_MAX_FILE_BYTES = 1_048_576
DEFAULT_MAX_LINKS = 20_000
DEFAULT_MAX_TOTAL_BYTES = 16_777_216
_BACKUP_SUFFIXES = (".bak", ".backup", ".orig", ".tmp", "~")
_WIKILINK_RE = re.compile(r"\[\[([^\]\n]+)\]\]")


@dataclass(frozen=True)
class ParsedVault:
    nodes: list[dict[str, Any]]
    edges: list[dict[str, str]]
    diagnostics: list[dict[str, Any]]


def default_vault_root() -> Path:
    """Return the local Sutory wiki default without exposing it in responses."""
    return Path.home() / "sutory" / "wiki"


def configured_vault_root(config: dict[str, Any]) -> Path:
    section = config.get("knowledge_graph", {}) if isinstance(config, dict) else {}
    configured = section.get("vault_path") if isinstance(section, dict) else None
    return Path(configured).expanduser() if isinstance(configured, str) and configured.strip() else default_vault_root()


def _stable_id(source: str, value: str) -> str:
    normalized = value.replace("\\", "/").strip().casefold()
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:24]
    return f"{source}:{digest}"


def _diagnostic(code: str, count: int, message: str) -> dict[str, Any]:
    return {"code": code, "severity": "warning", "count": count, "message": message}


def _frontmatter(text: str) -> tuple[dict[str, Any], str]:
    if not text.startswith("---\n"):
        return {}, text
    marker = text.find("\n---", 4)
    if marker < 0:
        return {}, text
    try:
        parsed = yaml.safe_load(text[4:marker]) or {}
    except yaml.YAMLError:
        return {}, text[marker + 4 :]
    return (parsed if isinstance(parsed, dict) else {}), text[marker + 4 :]


def _tags(value: Any) -> list[str]:
    values = value if isinstance(value, list) else str(value or "").split(",")
    return [str(item).strip()[:80] for item in values
            if str(item).strip() and "://" not in str(item)][:50]


def _safe_text(value: Any, limit: int) -> str | None:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if not isinstance(value, (str, int, float)):
        return None
    text = str(value).strip().replace("\x00", "")
    if "://" in text:
        return None
    return text[:limit] if text else None


def _note_node(relative: Path, metadata: dict[str, Any], modified: int) -> dict[str, Any]:
    node: dict[str, Any] = {
        "id": _stable_id("obsidian", relative.as_posix()),
        "label": _safe_text(metadata.get("title"), 200) or relative.stem[:200],
        "source": "obsidian",
        "type": _safe_text(metadata.get("type"), 80) or "note",
        "tags": _tags(metadata.get("tags")),
        "timestamp": _safe_text(metadata.get("timestamp"), 80) or datetime.fromtimestamp(
            modified, timezone.utc
        ).isoformat(),
    }
    description = _safe_text(metadata.get("description"), 500)
    if description:
        node["description"] = description
    return node


def _iter_candidates(root: Path) -> tuple[list[Path], dict[str, int]]:
    paths: list[Path] = []
    excluded = {"excluded_hidden": 0, "excluded_backup": 0, "excluded_symlink": 0}
    if not root.is_dir():
        return paths, excluded
    for current, dirs, files in os.walk(root, followlinks=False):
        current_path = Path(current)
        kept_dirs = []
        for name in dirs:
            child = current_path / name
            code = "excluded_hidden" if name.startswith(".") else "excluded_symlink" if child.is_symlink() else None
            if code:
                excluded[code] += 1
            else:
                kept_dirs.append(name)
        dirs[:] = kept_dirs
        for name in files:
            path = current_path / name
            code = "excluded_hidden" if name.startswith(".") else "excluded_symlink" if path.is_symlink() else None
            if code:
                excluded[code] += 1
            elif name.lower().endswith(_BACKUP_SUFFIXES):
                excluded["excluded_backup"] += 1
            elif path.suffix.lower() == ".md":
                paths.append(path)
    return sorted(paths), excluded


def _read_note(path: Path, root: Path, max_file_bytes: int):
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(path, flags)
    try:
        info = os.fstat(descriptor)
        opened_path = Path(f"/proc/self/fd/{descriptor}").resolve()
        if not stat.S_ISREG(info.st_mode) or not opened_path.is_relative_to(root):
            raise OSError("unsafe vault entry")
        if info.st_size > max_file_bytes:
            return None, info.st_size, int(info.st_mtime)
        with os.fdopen(descriptor, encoding="utf-8") as handle:
            descriptor = -1
            return _frontmatter(handle.read()), info.st_size, int(info.st_mtime)
    finally:
        if descriptor >= 0:
            os.close(descriptor)


def _read_notes(root: Path, max_files: int, max_file_bytes: int,
                max_total_bytes: int):
    candidates, excluded = _iter_candidates(root)
    records: list[tuple[Path, dict[str, Any], str, int]] = []
    excluded["excluded_oversized"] = 0
    excluded["total_byte_limit_reached"] = 0
    excluded["file_limit_reached"] = max(0, len(candidates) - max_files)
    total_bytes = 0
    for path in candidates[:max_files]:
        try:
            parsed, size, modified = _read_note(path, root, max_file_bytes)
            if parsed is None:
                excluded["excluded_oversized"] += 1
                continue
            if total_bytes + size > max_total_bytes:
                excluded["total_byte_limit_reached"] += 1
                continue
            total_bytes += size
            metadata, body = parsed
            records.append((path.relative_to(root), metadata, body, modified))
        except (OSError, UnicodeError):
            excluded["unreadable_notes"] = excluded.get("unreadable_notes", 0) + 1
    return records, excluded


def _link_target(raw: str) -> str:
    target = raw.split("|", 1)[0].split("#", 1)[0].strip().replace("\\", "/")
    return target[:-3] if target.casefold().endswith(".md") else target


def _build_obsidian_edges(records, node_by_path: dict[str, str], max_links: int):
    by_name: dict[str, str] = {}
    for path, node_id in node_by_path.items():
        by_name.setdefault(Path(path).stem.casefold(), node_id)
    edges: list[dict[str, str]] = []
    unresolved = 0
    seen_links = 0
    for relative, _, body, _ in records:
        for match in _WIKILINK_RE.finditer(body):
            if seen_links >= max_links:
                return edges, unresolved, 1
            seen_links += 1
            target = _link_target(match.group(1))
            target_id = node_by_path.get(f"{target}.md".casefold()) or by_name.get(Path(target).name.casefold())
            if target_id:
                edges.append({"source": node_by_path[relative.as_posix().casefold()], "target": target_id, "kind": "wikilink"})
            else:
                unresolved += 1
    return edges, unresolved, 0


def parse_obsidian_vault(root: Path, *, max_files: int = DEFAULT_MAX_FILES,
                         max_file_bytes: int = DEFAULT_MAX_FILE_BYTES,
                         max_links: int = DEFAULT_MAX_LINKS,
                         max_total_bytes: int = DEFAULT_MAX_TOTAL_BYTES) -> ParsedVault:
    expanded_root = root.expanduser()
    if expanded_root.is_symlink():
        return ParsedVault([], [], [_diagnostic(
            "excluded_symlink", 1, "Symlinks or out-of-root entries were excluded."
        )])
    resolved_root = expanded_root.resolve()
    records, counts = _read_notes(
        resolved_root, max_files, max_file_bytes, max_total_bytes
    )
    nodes = [_note_node(path, metadata, modified) for path, metadata, _, modified in records]
    node_by_path = {path.as_posix().casefold(): node["id"] for (path, *_), node in zip(records, nodes)}
    edges, unresolved, link_limit = _build_obsidian_edges(records, node_by_path, max_links)
    counts.update({"unresolved_wikilinks": unresolved, "link_limit_reached": link_limit})
    messages = {
        "excluded_hidden": "Hidden vault entries were excluded.", "excluded_backup": "Backup files were excluded.",
        "excluded_symlink": "Symlinks or out-of-root entries were excluded.", "excluded_oversized": "Oversized notes were excluded.",
        "file_limit_reached": "The vault file limit was reached.", "link_limit_reached": "The wikilink limit was reached.",
        "total_byte_limit_reached": "The vault byte limit was reached.",
        "unresolved_wikilinks": "Some wikilinks did not resolve.", "unreadable_notes": "Unreadable notes were excluded.",
    }
    diagnostics = [_diagnostic(code, count, messages[code]) for code, count in counts.items() if count]
    return ParsedVault(nodes, edges, diagnostics)


def _hermes_graph(graph: dict[str, Any]):
    id_map = {str(node.get("id")): _stable_id("hermes", str(node.get("id"))) for node in graph.get("nodes", [])}
    nodes = []
    for raw in graph.get("nodes", []):
        original_id = str(raw.get("id"))
        nodes.append({"id": id_map[original_id], "label": _safe_text(raw.get("label"), 200) or "Untitled",
                      "source": "hermes", "type": _safe_text(raw.get("kind"), 80) or "unknown",
                      "tags": _tags(raw.get("category")), "timestamp": _safe_text(raw.get("timestamp"), 80)})
    edges = [{"source": id_map[edge["source"]], "target": id_map[edge["target"]], "kind": "related"}
             for edge in graph.get("edges", []) if edge.get("source") in id_map and edge.get("target") in id_map]
    return nodes, edges


def build_knowledge_graph(hermes_graph: dict[str, Any], vault_root: Path) -> dict[str, Any]:
    hermes_nodes, hermes_edges = _hermes_graph(hermes_graph)
    obsidian = parse_obsidian_vault(vault_root)
    edges = hermes_edges + obsidian.edges
    return {"version": 1, "generatedAt": datetime.now(timezone.utc).isoformat(),
            "nodes": hermes_nodes + obsidian.nodes, "edges": edges,
            "counts": {"hermes": len(hermes_nodes), "obsidian": len(obsidian.nodes), "edges": len(edges)},
            "diagnostics": obsidian.diagnostics}
