export const VIEW_SCHEMA = {
  model: "hr.attendance",
  title: "Attendance & Rosters",
  fields: {
    id: { type: "integer", label: "ID", readonly: true },
    code: { type: "string", label: "Record Code", readonly: true },
    employee_name: { type: "string", label: "Employee", required: true },
    department: { type: "string", label: "Department" },
    terminal_id: { type: "string", label: "Biometric Terminal" },
    check_in: { type: "datetime", label: "Check In", required: true },
    check_out: { type: "datetime", label: "Check Out" },
    duration_hours: { type: "float", label: "Hours Worked" },
    status: {
      type: "selection",
      label: "Status",
      options: [
        { value: "draft", label: "Draft" },
        { value: "pending_approval", label: "Pending Approval" },
        { value: "verified", label: "Verified / Approved" },
        { value: "synced", label: "Synced to Payroll" },
        { value: "rejected", label: "Rejected" }
      ]
    },
    approval_status: {
      type: "selection",
      label: "Approval Status",
      readonly: true,
      options: [
        { value: "draft", label: "Draft" },
        { value: "pending_approval", label: "Pending Approval" },
        { value: "verified", label: "Approved / Verified" },
        { value: "rejected", label: "Rejected" }
      ]
    },
    created_by: { type: "integer", label: "Created By (Maker)", readonly: true },
    submitted_by: { type: "integer", label: "Submitted By", readonly: true },
    approved_by: { type: "integer", label: "Approved By (Checker)", readonly: true },
    approved_at: { type: "datetime", label: "Approved At", readonly: true },
    notes: { type: "text", label: "Notes & Exceptions" },
    machine_ip: { type: "string", label: "Machine IP", readonly: true },
    ingestion_source: { type: "string", label: "Ingestion Source", readonly: true },
    ingestion_time: { type: "datetime", label: "Ingestion Time", readonly: true },
    last_modified_by: { type: "string", label: "Last Modified By", readonly: true }
  },
  views: {
    list: {
      columns: ["id", "employee_name", "department", "check_in", "duration_hours", "status", "approved_by"]
    },
    form: {
      statusbar: {
        field: "status",
        buttons: [
          { id: "btn_submit", label: "Submit for Approval", action: "submit", target: "pending_approval", style: "warning" },
          { id: "btn_verify", label: "Approve Record", action: "approve", target: "verified", style: "primary" },
          { id: "btn_reject", label: "Reject", action: "reject", target: "rejected", style: "danger" },
          { id: "btn_sync", label: "Push to Payroll", action: "sync", target: "synced", style: "success" }
        ]
      }
    },
    graph: {
      default_chart: "bar",
      dimension: "department",
      measure: "duration_hours",
      aggregator: "sum"
    },
    calendar: {
      date_start: "check_in",
      date_stop: "check_out",
      event_title: "employee_name",
      color_field: "status"
    },
    pivot: {
      row_groupby: ["department"],
      col_groupby: ["status"],
      measures: ["duration_hours"]
    },
    gantt: {
      date_start: "check_in",
      date_stop: "check_out",
      title: "employee_name",
      group_by: "department"
    }
  }
};

// Clean production state (demo attendance records purged)
export const MOCK_RECORDS = [];
