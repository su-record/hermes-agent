Feature: Private Cloudflare delivery

  Scenario: Proxy without browser secrets
    Given a server-side Tunnel credential
    When the browser requests an allowlisted read endpoint
    Then the Pages Function proxies it without exposing the credential

  Scenario: Reject mutation requests
    Given the read-only Pages proxy
    When a browser sends a mutation method
    Then the request is rejected before reaching Hermes

  Scenario: Deployment requires approval
    Given local verification has passed
    When no explicit deployment confirmation exists
    Then no Pages Access DNS or Tunnel mutation is performed
