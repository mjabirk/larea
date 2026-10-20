// Declarative Schema for hr.attendance model (GDPR Data-Minimized)

export const EMPLOYEES = [];


export const ATTENDANCE_MODEL = {
  name: 'hr.attendance',
  string: 'Employee Attendance',
  description: 'Tracks employee check-in, check-out, worked time, and biometric verification logs',
  fields: {
    id: { type: 'integer', string: 'ID', readonly: true },
    employee_id: {
      type: 'many2one',
      string: 'Employee',
      relation: 'hr.employee',
      required: true,
      widget: 'many2one_avatar_employee',
    },
    check_in: {
      type: 'datetime',
      string: 'Check In',
      required: true,
      widget: 'datetime',
    },
    check_out: {
      type: 'datetime',
      string: 'Check Out',
      widget: 'datetime',
    },
    worked_hours: {
      type: 'float',
      string: 'Worked Time',
      widget: 'float_time',
      readonly: true,
      compute: true,
    },
    break_duration: {
      type: 'float',
      string: 'Break Duration',
      widget: 'float_time',
      default: 0.5,
    },
    state: {
      type: 'selection',
      string: 'Status',
      selection: [
        { value: 'draft', label: 'Draft' },
        { value: 'pending_approval', label: 'To Approve' },
        { value: 'validated', label: 'Validated' },
        { value: 'refused', label: 'Refused' },
      ],
      default: 'draft',
      widget: 'badge',
    },
    approval_status: {
      type: 'selection',
      string: 'Approval Status',
      selection: [
        { value: 'draft', label: 'Draft' },
        { value: 'pending_approval', label: 'Pending Approval' },
        { value: 'verified', label: 'Approved' },
        { value: 'rejected', label: 'Rejected' },
      ],
      readonly: true,
      default: 'draft',
    },
    created_by: { type: 'integer', string: 'Created By (Maker)', readonly: true },
    submitted_by: { type: 'integer', string: 'Submitted By', readonly: true },
    approved_by: { type: 'integer', string: 'Approved By (Checker)', readonly: true },
    approved_at: { type: 'datetime', string: 'Approved At', readonly: true },
    work_entry_type_id: {
      type: 'selection',
      string: 'Time Type',
      selection: [
        { value: 'standard', label: 'Standard Attendance' },
        { value: 'overtime', label: 'Overtime 1.5x' },
        { value: 'night', label: 'Night Shift' },
        { value: 'weekend', label: 'Weekend Duty' },
      ],
      default: 'standard',
    },
    resource_calendar_id: {
      type: 'selection',
      string: 'Working Schedule',
      selection: [
        { value: 'std40', label: 'Standard 40 Hours/Week (08:00 - 17:00)' },
        { value: 'shift8', label: 'Rotational 8h Shifts' },
        { value: 'flex', label: 'Flexible Core Hours' },
      ],
      default: 'std40',
    },
    in_mode: {
      type: 'selection',
      string: 'Check-In Mode',
      selection: [
        { value: 'adms', label: 'Biometric ADMS Terminal' },
        { value: 'kiosk', label: 'Web Kiosk Mode' },
        { value: 'systray', label: 'Systray Quick-bar' },
        { value: 'manual', label: 'Manual Admin Entry' },
      ],
      default: 'adms',
    },
    in_ip_address: { type: 'char', string: 'Check-In IP' },
    in_browser: { type: 'char', string: 'Check-In Device/Client' },
    in_location: { type: 'char', string: 'Check-In Location' },
    in_latitude: { type: 'float', string: 'Check-In Latitude' },
    in_longitude: { type: 'float', string: 'Check-In Longitude' },
    out_mode: {
      type: 'selection',
      string: 'Check-Out Mode',
      selection: [
        { value: 'adms', label: 'Biometric ADMS Terminal' },
        { value: 'kiosk', label: 'Web Kiosk Mode' },
        { value: 'systray', label: 'Systray Quick-bar' },
        { value: 'manual', label: 'Manual Admin Entry' },
      ],
      default: 'adms',
    },
    out_ip_address: { type: 'char', string: 'Check-Out IP' },
    out_browser: { type: 'char', string: 'Check-Out Device/Client' },
    out_location: { type: 'char', string: 'Check-Out Location' },
    out_latitude: { type: 'float', string: 'Check-Out Latitude' },
    out_longitude: { type: 'float', string: 'Check-Out Longitude' },
    source_stale: { type: 'boolean', string: 'Source Outdated', default: false },
    notes: { type: 'text', string: 'Audit & Approval Remarks' },
  },
};

export const ATTENDANCE_LIST_VIEW = {
  id: 'view_attendance_tree_management',
  type: 'list',
  name: 'hr.attendance.list',
  string: 'Employee Attendances',
  arch: {
    columns: [
      {
        field: 'employee_id',
        string: 'Employee',
        widget: 'many2one_avatar_employee',
        sortable: true,
      },
      {
        field: 'check_in',
        string: 'Check In',
        widget: 'datetime',
        sortable: true,
      },
      {
        field: 'check_out',
        string: 'Check Out',
        widget: 'datetime',
        sortable: true,
      },
      {
        field: 'break_duration',
        string: 'Break',
        widget: 'float_time',
      },
      {
        field: 'worked_hours',
        string: 'Worked Time',
        widget: 'float_time',
        bold: true,
        sortable: true,
      },
      {
        field: 'state',
        string: 'Status',
        widget: 'badge',
        decorations: {
          success: "record.state === 'validated'",
          warning: "record.state === 'draft'",
          danger: "record.state === 'refused'",
        },
      },
    ],
    actions: [
      {
        name: 'action_validate',
        string: 'Validate',
        type: 'object',
        icon: 'Check',
        class: 'text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 border-emerald-300',
        invisible: "record.state !== 'draft'",
        title: 'Approve Attendance',
      },
      {
        name: 'action_refuse',
        string: 'Refuse',
        type: 'object',
        icon: 'X',
        class: 'text-rose-700 hover:bg-rose-50 hover:text-rose-800 border-rose-300',
        invisible: "!['draft', 'validated'].includes(record.state)",
        title: 'Refuse Attendance',
      },
      {
        name: 'action_reset_to_draft',
        string: 'Reset',
        type: 'object',
        icon: 'RotateCcw',
        class: 'text-slate-600 hover:bg-slate-100 hover:text-slate-800 border-slate-300',
        invisible: "record.state !== 'refused'",
        title: 'Reset to Draft',
      },
    ],
    filters: [
      { id: 'to_approve', string: 'To Approve', condition: (r) => r.state === 'draft' },
      { id: 'validated', string: 'Validated', condition: (r) => r.state === 'validated' },
      { id: 'refused', string: 'Refused', condition: (r) => r.state === 'refused' },
      { id: 'active_checkin', string: 'Currently Checked In', condition: (r) => !r.check_out },
    ],
    groupBy: [
      { id: 'employee', string: 'Employee', field: 'employee_id' },
      { id: 'state', string: 'Status', field: 'state' },
      { id: 'work_entry_type', string: 'Time Type', field: 'work_entry_type_id' },
    ],
  },
};

export const ATTENDANCE_FORM_VIEW = {
  id: 'hr_attendance_view_form',
  type: 'form',
  name: 'hr.attendance.form',
  string: 'Employee Attendances',
  arch: {
    header: {
      buttons: [
        {
          name: 'action_submit',
          string: 'Submit for Approval',
          type: 'warning',
          icon: 'Send',
          invisible: "record.state !== 'draft'",
        },
        {
          name: 'action_validate',
          string: 'Approve Record',
          type: 'primary',
          icon: 'Check',
          invisible: "record.state !== 'pending_approval'",
        },
        {
          name: 'action_refuse',
          string: 'Refuse',
          type: 'secondary',
          icon: 'X',
          invisible: "!['pending_approval', 'validated'].includes(record.state)",
        },
        {
          name: 'action_reset_to_draft',
          string: 'Reset to Draft',
          type: 'secondary',
          icon: 'RotateCcw',
          invisible: "record.state !== 'refused'",
        },
      ],
      statusbar: {
        field: 'state',
        visible: ['draft', 'pending_approval', 'validated', 'refused'],
      },
    },
    sheet: {
      alert: {
        invisible: '!record.source_stale',
        title: 'Source attendance modified - this record may be outdated and should be reviewed.',
        action: 'action_mark_reviewed',
        actionString: 'Mark as Reviewed',
      },
      groups: [
        {
          name: 'group_employee',
          title: 'Employee & Shift Information',
          fields: [
            { field: 'employee_id', widget: 'many2one_avatar_employee', required: true },
            { field: 'check_in', widget: 'datetime', required: true },
            { field: 'check_out', widget: 'datetime' },
            { field: 'resource_calendar_id', widget: 'selection' },
          ],
        },
        {
          name: 'group_worked_hours',
          title: 'Worked Time & Categorization',
          fields: [
            { field: 'worked_hours', widget: 'float_time', readonly: true, highlight: true },
            { field: 'break_duration', widget: 'float_time' },
            { field: 'work_entry_type_id', widget: 'selection' },
          ],
        },
      ],
      notebook: [
        {
          name: 'logs',
          string: 'Device & Biometric Logs',
          icon: 'Terminal',
          sections: [
            {
              title: 'Check-In Verification',
              icon: 'LogIn',
              fields: [
                { field: 'in_mode', widget: 'selection' },
                { field: 'in_ip_address', widget: 'char', invisible: "record.in_mode === 'manual'" },
                { field: 'in_browser', widget: 'char', invisible: "record.in_mode === 'manual'" },
                { field: 'in_location', widget: 'char' },
                { field: 'in_latitude', widget: 'gps', longitudeField: 'in_longitude' },
              ],
            },
            {
              title: 'Check-Out Verification',
              icon: 'LogOut',
              invisible: '!record.check_out',
              fields: [
                { field: 'out_mode', widget: 'selection' },
                { field: 'out_ip_address', widget: 'char', invisible: "record.out_mode === 'manual'" },
                { field: 'out_browser', widget: 'char', invisible: "record.out_mode === 'manual'" },
                { field: 'out_location', widget: 'char' },
                { field: 'out_latitude', widget: 'gps', longitudeField: 'out_longitude' },
              ],
            },
          ],
        },
        {
          name: 'notes',
          string: 'Audit & Approval Remarks',
          icon: 'FileText',
          fields: [
            {
              field: 'notes',
              widget: 'text',
              placeholder: 'Add managerial observations, overtime justification or manual adjustment log...',
            },
          ],
        },
      ],
    },
    chatter: {
      enabled: true,
    },
  },
};

export const INITIAL_ATTENDANCE_DATA = [];

