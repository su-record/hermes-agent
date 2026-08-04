from pathlib import Path
from contextlib import contextmanager

from fastapi.testclient import TestClient
import pytest

from hermes_cli.knowledge_graph import build_knowledge_graph, parse_obsidian_vault


def _write_note(vault: Path, name: str, text: str) -> Path:
    path = vault / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


@pytest.fixture
def vault(tmp_path):
    path = tmp_path / "vault"
    path.mkdir()
    return path


def test_parser_returns_allowlisted_metadata_edges_and_diagnostics(vault):
    _write_note(
        vault,
        "Alpha.md",
        "---\ntitle: Alpha title\ntype: concept\ntags: [one, two]\n"
        "timestamp: 2026-08-04\ndescription: Safe summary\nresource: https://secret.test\n"
        "private: never-return\n---\nSecret body [[Beta|label]] [[Missing]]",
    )
    _write_note(vault, "Beta.md", "---\ntags: three\n---\nOther secret")

    graph = parse_obsidian_vault(vault)

    assert len(graph.nodes) == 2
    alpha = next(node for node in graph.nodes if node["label"] == "Alpha title")
    assert alpha == {
        "id": alpha["id"],
        "label": "Alpha title",
        "source": "obsidian",
        "type": "concept",
        "tags": ["one", "two"],
        "timestamp": "2026-08-04",
        "description": "Safe summary",
    }
    assert graph.edges == [{"source": alpha["id"], "target": next(
        node["id"] for node in graph.nodes if node["label"] == "Beta"
    ), "kind": "wikilink"}]
    payload_text = repr(graph.nodes)
    assert "Secret body" not in payload_text
    assert "secret.test" not in payload_text
    assert "never-return" not in payload_text
    assert next(d for d in graph.diagnostics if d["code"] == "unresolved_wikilinks")["count"] == 1


def test_parser_rejects_unsafe_and_limited_vault_content(vault):
    _write_note(vault, "Visible.md", "[[TooLarge]]")
    _write_note(vault, ".hidden/Hidden.md", "hidden")
    _write_note(vault, "draft.md.bak", "backup")
    _write_note(vault, "TooLarge.md", "x" * 80)
    outside = _write_note(vault.parent, "Outside.md", "outside")
    (vault / "linked.md").symlink_to(outside)

    graph = parse_obsidian_vault(vault, max_file_bytes=64, max_files=10)

    assert [node["label"] for node in graph.nodes] == ["Visible"]
    assert all(str(vault) not in repr(value) for value in (graph.nodes, graph.diagnostics))
    codes = {item["code"]: item["count"] for item in graph.diagnostics}
    assert codes["excluded_hidden"] == 1
    assert codes["excluded_backup"] == 1
    assert codes["excluded_oversized"] == 1
    assert codes["excluded_symlink"] == 1

    linked_root = vault.parent / "linked-vault"
    linked_root.symlink_to(vault, target_is_directory=True)
    rejected_root = parse_obsidian_vault(linked_root)
    assert rejected_root.nodes == []
    assert rejected_root.diagnostics[0]["code"] == "excluded_symlink"


def test_parser_rejects_entry_swapped_to_symlink(monkeypatch, vault):
    note = _write_note(vault, "Race.md", "safe")
    outside = _write_note(vault.parent, "Outside-race.md", "secret")
    real_open = __import__("os").open

    def swap_then_open(path, flags):
        note.unlink()
        note.symlink_to(outside)
        return real_open(path, flags)

    monkeypatch.setattr("hermes_cli.knowledge_graph.os.open", swap_then_open)

    graph = parse_obsidian_vault(vault)

    assert graph.nodes == []
    assert next(d for d in graph.diagnostics if d["code"] == "unreadable_notes")


def test_parser_caps_aggregate_vault_bytes(vault):
    _write_note(vault, "One.md", "12345678")
    _write_note(vault, "Two.md", "12345678")

    graph = parse_obsidian_vault(vault, max_total_bytes=8)

    assert len(graph.nodes) == 1
    assert next(
        d for d in graph.diagnostics if d["code"] == "total_byte_limit_reached"
    )["count"] == 1


def test_merge_normalizes_hermes_ids_and_preserves_provenance(vault):
    _write_note(vault, "Alpha.md", "")
    hermes = {
        "nodes": [{"id": "skill/a", "label": "A", "kind": "skill", "timestamp": 10}],
        "edges": [],
    }

    first = build_knowledge_graph(hermes, vault)
    second = build_knowledge_graph(hermes, vault)

    assert first["nodes"] == second["nodes"]
    assert {node["source"] for node in first["nodes"]} == {"hermes", "obsidian"}
    assert first["counts"] == {"hermes": 1, "obsidian": 1, "edges": 0}


def test_endpoint_is_authenticated_and_matches_contract(monkeypatch, vault):
    from hermes_cli import web_server

    monkeypatch.setattr(web_server, "_knowledge_vault_root", lambda: vault)
    monkeypatch.setattr(
        "agent.learning_graph.build_learning_graph",
        lambda: {"nodes": [], "edges": []},
    )
    unauthenticated = TestClient(web_server.app)
    assert unauthenticated.get("/api/knowledge/graph").status_code == 401

    authenticated = TestClient(web_server.app)
    authenticated.headers[web_server._SESSION_HEADER_NAME] = web_server._SESSION_TOKEN
    response = authenticated.get("/api/knowledge/graph")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"
    assert set(response.json()) == {
        "version", "generatedAt", "nodes", "edges", "counts", "diagnostics"
    }
    assert response.json()["version"] == 1


def test_endpoint_resolves_vault_inside_selected_profile(monkeypatch):
    from hermes_cli import web_server

    active_profiles = []

    @contextmanager
    def profile_scope(profile):
        active_profiles.append(profile)
        try:
            yield
        finally:
            active_profiles.pop()

    monkeypatch.setattr(web_server, "_profile_scope", profile_scope)
    monkeypatch.setattr(
        web_server,
        "_knowledge_vault_root",
        lambda: Path(active_profiles[-1]),
    )
    monkeypatch.setattr(
        "agent.learning_graph.build_learning_graph",
        lambda: {"nodes": [], "edges": []},
    )
    monkeypatch.setattr(
        "hermes_cli.knowledge_graph.build_knowledge_graph",
        lambda _graph, vault: {"selected_vault": str(vault)},
    )
    client = TestClient(web_server.app)
    client.headers[web_server._SESSION_HEADER_NAME] = web_server._SESSION_TOKEN

    response = client.get("/api/knowledge/graph?profile=research")

    assert response.status_code == 200
    assert response.json() == {"selected_vault": "research"}
