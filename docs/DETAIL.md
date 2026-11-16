# Taskflow

A DeepSeek Harness plugin (0.1.0) for persistent task trees, selective nested
sessions and direct-parent completion notifications.

## Requirements

DSH **>=0.2.1-rc.3 <1.0.0-0**, Node.js **>=24.9.0**, and enabled host services for tools,
agents, sessions, systemPrompt and subagents, with a `spawn` provider.
The client requires the conversation, workspace and right-sidebar services.
Full `engines.dsh` declaration: `>=0.2.1-rc.3 <1.0.0-0 || >=0.2.2-0 <1.0.0-0 || >=0.2.3-0 <1.0.0-0 || >=0.3.0-0 <1.0.0-0`.
The declared range is separate from the versions exercised in the acceptance record.

## Workflow

Describe a goal in the main session. The model creates a task plan independently
of `todo_write`. Simple tasks stay in their owner session; independent complex
tasks can spawn a child session and, within configured limits, grandchildren.
A valid completion immediately checks the task and notifies only its direct
parent. No review or parent approval step is added.

Later messages update the same ledger rather than replacing it. Additions attach
to the current task unless the main session explicitly names a parent ID or
unique full title. Editing requirements increments the version; stale execution
results are rejected. Adding children to a completed task reopens its ancestors
and retains the old report.

The right panel displays the hierarchy. Use the detail menu to add or edit a task;
these actions prefill the conversation and take effect after sending. Cancellation
and sibling reordering are direct interface actions.

## Data and tools

The ledger defaults to `${DSH_HOME}/taskflow` or `~/.dsh/taskflow`. One active writer
is allowed per directory. Back up the directory while the host is stopped, and
also back up native DSH sessions for a complete migration. Interrupted work pauses
on recovery; it is not automatically rerun.

Tools remain host-owned. Taskflow displays actual URLs or text to the left of the
conversation on demand. The default browser surface is a restricted iframe, not
a browser automation engine. Embedded pages may fail due to CSP, authentication
or cross-origin restrictions. Other plugins may register dedicated renderers.

## Validation status

Core, client and real DSH AgentLoop integration are tested using a deterministic
model adapter. Screenshots are from the labelled local acceptance shell. Full
profile installation, production model planning and third-party tool integration
still require acceptance. See the repository's acceptance record for details.

Original code: Apache-2.0. Imported UI portions: MIT; see NOTICE and licenses/.
