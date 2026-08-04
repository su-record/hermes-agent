Feature: Command-center interface

  Scenario: Unified operational overview
    Given authenticated health Kanban and graph APIs
    When an operator opens the knowledge route
    Then agent status Kanban diagnostics and graph counts are visible

  Scenario: Explore a connected subgraph
    Given a graph with Hermes and Obsidian nodes
    When the operator selects a source and searches a title
    Then only the matching connected subgraph is shown

  Scenario: Isolate panel failures
    Given one dashboard API is unavailable
    When the page loads
    Then that panel shows an error and the other panels remain usable

  Scenario: Respect reduced motion
    Given the operator prefers reduced motion
    When the graph renders
    Then continuous graph animation is disabled
