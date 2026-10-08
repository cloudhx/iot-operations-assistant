package authz.pending_actions_test

import rego.v1
import data.authz.pending_actions

valid_request := {
	"principal": {"id": "user-123"},
	"action": "approve_pending_action",
	"resource": {
		"type": "maintenance_work_order",
		"status": "PENDING_APPROVAL",
	},
}

test_allow_approve_pending_action if {
	pending_actions.allow == true with input as valid_request
}

test_allow_reject_pending_action if {
	request := object.union(valid_request, {"action": "reject_pending_action"})
	pending_actions.allow == true with input as request
}

test_deny_missing_principal if {
	request := object.remove(valid_request, {"principal"})
	pending_actions.allow == false with input as request
}

test_deny_missing_or_invalid_principal_identity if {
	every principal in [{}, {"id": ""}, {"id": " \t\n"}, {"id": null}, {"id": 123}, {"id": true}] {
		request := object.union(
			object.remove(valid_request, {"principal"}), 
			{"principal": principal}
		)
		pending_actions.allow == false with input as request
	}
}

test_deny_unsupported_action if {
	every action in ["execute_maintenance_work_order", "read_pending_action", "", null, 123] {
		request := object.union(valid_request, {"action": action})
		pending_actions.allow == false with input as request
	}
}

test_deny_wrong_resource_type if {
	every resource_type in ["device", "create_maintenance_work_order", null, 123] {
		resource := object.union(valid_request.resource, {"type": resource_type})
		request := object.union(valid_request, {"resource": resource})
		pending_actions.allow == false with input as request
	}
}

test_deny_wrong_resource_status if {
	every status in ["APPROVED", "COMPLETED", "REJECTED", "UNKNOWN", null, 123] {
		resource := object.union(valid_request.resource, {"status": status})
		request := object.union(valid_request, {"resource": resource})
		pending_actions.allow == false with input as request
	}
}

test_deny_incomplete_input if {
	requests := [
		null,
        {},
        {"principal": valid_request.principal},
        object.remove(valid_request, {"action"}),
        object.remove(valid_request, {"resource"}),
        object.union(
            object.remove(valid_request, {"resource"}),
            {"resource": object.remove(valid_request.resource, {"status"})},
        ),
        object.union(
            object.remove(valid_request, {"resource"}),
            {"resource": object.remove(valid_request.resource, {"type"})},
        ),
	]
	every request in requests {
		pending_actions.allow == false with input as request
	}
}
