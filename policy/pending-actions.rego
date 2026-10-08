package authz.pending_actions

import rego.v1

# Identity must be supplied by a trusted caller after authentication.
default allow := false

allow if {
	is_string(input.principal.id)
	trim_space(input.principal.id) != ""
	input.action in {"approve_pending_action", "reject_pending_action"}
	input.resource.type == "maintenance_work_order"
	input.resource.status == "PENDING_APPROVAL"
}
