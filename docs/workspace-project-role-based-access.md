# Workspace Projects and Tasking Manager Access

This document explains who can manage workspace projects and work on project
tasks.

## Roles

Access can come from three places:

- **Project-group POC** — manages projects in workspaces owned by that TDEI
  project group.
- **Workspace role** — `lead`, `validator`, or `contributor`.
- **Project role** — `lead`, `validator`, or `contributor` for one project.

## Effective project role

Task access is based on the user's effective project role:

1. A workspace `lead` is always treated as a `lead`.
2. Otherwise, the project role is used when one is assigned.
3. If there is no project role, the workspace role is used.
4. If neither role exists, the user has read-only access.

For example, assigning a project `validator` role to a workspace
`contributor` allows that user to validate tasks in that project.

## Project permissions

| Action | Project-group POC | Workspace lead | Project lead | Validator | Contributor |
| --- | --- | --- | --- | --- | --- |
| View projects | Yes | Yes | Yes | Yes | Yes |
| Create a project | Yes | Yes | No | No | No |
| Edit project details and settings | Yes | Yes | No | No | No |
| Activate, close, or reset a project | Yes | Yes | No | No | No |
| Delete a project | Yes | Yes | No | No | No |
| Manage project contributors | Only if also a lead | Yes | Yes | No | No |
| Map tasks | With a tasking role | Yes | Yes | Yes | Yes |
| Validate tasks | With a lead or validator role | Yes | Yes | Yes | No |

A POC who also has a workspace or project role receives the permissions from
both roles.

## Managing project contributors

A workspace lead or project lead can:

- add validators and contributors;
- change a user between validator and contributor; and
- remove validators and contributors.

The project lead cannot be changed or removed through the current contributor
management screen.

## Task permissions

| Task status | Lead | Validator | Contributor |
| --- | --- | --- | --- |
| Ready for mapping | Map | Map | Map |
| More mapping required | Map | Map | Map |
| Ready for validation | Validate | Validate | No action |
| Completed | View only | View only | View only |

The following rules also apply:

- The project must be active before task work can start.
- A user cannot validate their own mapping.
- A task is locked when a user starts working on it.
- Other users cannot work on a locked task.
- The user who owns the lock can unlock the task.

## Implementation

The main permission rules are in
`composables/useProjectRole.ts`. Project and task actions are guarded in
`pages/workspace/[id]/projects/[projectId]/index.vue`.
