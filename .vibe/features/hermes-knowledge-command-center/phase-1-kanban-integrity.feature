Feature: Kanban integrity

  Scenario: Human approval is not a dispatcher failure
    Given a ready task with no assignee and approval provenance
    When the command center normalizes the board
    Then it labels the task as awaiting human approval

  Scenario: Missing workspace is actionable
    Given a worktree task without a workspace path
    When diagnostics are rendered
    Then the task is marked workspace missing with remediation guidance

  Scenario: Kanban read failures remain visible
    Given the Kanban backend cannot return tasks
    When Sutory and the command center request the board
    Then they show a structured error instead of an empty board
