Feature: Sanitized knowledge graph

  Scenario: Merge graph sources with provenance
    Given Hermes learning nodes and publishable Obsidian metadata
    When the knowledge graph endpoint is requested
    Then every node has a stable ID and an explicit source

  Scenario: Reject unsafe vault content
    Given hidden files symlinks backups resource URLs and oversized notes
    When the vault is parsed
    Then none of those values appear in the response

  Scenario: Preserve valid data when links are broken
    Given a note with valid and unresolved wikilinks
    When the graph is generated
    Then valid edges are returned and unresolved links appear only in diagnostics
