/**
 * This acts as a placeholder for a future visual React/Vite interface
 * that will statically display the Policy Gate and Capability constraints
 * allowed for the current workspace.
 */
export class CapabilityGraphViewStub {
  public static renderTerminalView() {
    console.log(`
=========================================
      POLICY CAPABILITY GRAPH (STUB)
=========================================

ALLOWED CAPABILITIES:
 - filesystem.read      [Scope: /workspace/*]
 - filesystem.write     [Scope: /workspace/*]
 - shell.run            [Blocked flags: rm -rf, mkfs, chmod -R]
 - network.http_get     [Allowed hosts: api.github.com, registry.npmjs.org]

BLOCKED CAPABILITIES:
 - filesystem.*         [Scope: /etc/*, /root/*, ~/.ssh/*]
 - shell.run            [Sudo access, privilege escalation]

[Use 'openclaw explain' to trace a specific action block.]
=========================================
        `);
  }
}
