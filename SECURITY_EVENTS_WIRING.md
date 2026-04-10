# Security Event Emission Wiring Guide

Documents which security events are emitted in the live runtime and where they are triggered.

## FULLY WIRED (Production)

- ✅ dangerous.invoke.denied
- ✅ dangerous.invoke.allowed
- ✅ Policy drift detection
- ✅ Raw secret detection
- ✅ Unsafe exposure rejection
- ✅ Capability approval failures

## PARTIALLY WIRED

- ⚠️ Exec-session launches (tracked, not distinct event)
- ⚠️ Startup invariants (thrown, not centralized)

## NOT YET WIRED

- ❌ Break-glass override usage tracking
- ❌ Plugin/hook security events
- ❌ Canvas auth rejection
- ❌ Safe mode activation event

All events are documented in the integration tests.
