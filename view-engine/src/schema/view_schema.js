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
        { value: "verified", label: "Verified" },
        { value: "synced", label: "Synced to Payroll" }
      ]
    },
    notes: { type: "text", label: "Notes & Exceptions" },
    machine_ip: { type: "string", label: "Machine IP", readonly: true },
    ingestion_source: { type: "string", label: "Ingestion Source", readonly: true },
    ingestion_time: { type: "datetime", label: "Ingestion Time", readonly: true },
    last_modified_by: { type: "string", label: "Last Modified By", readonly: true }
  },
  views: {
    list: {
      columns: ["id", "employee_name", "department", "check_in", "duration_hours", "status"]
    },
    form: {
      statusbar: {
        field: "status",
        buttons: [
          { id: "btn_verify", label: "Verify Record", target: "verified", style: "primary" },
          { id: "btn_sync", label: "Push to Payroll", target: "synced", style: "success" }
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
