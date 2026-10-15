import React, { useState } from 'react';
import { X, Copy, Check, Code, FileJson } from 'lucide-react';
import {
  ATTENDANCE_MODEL,
  ATTENDANCE_LIST_VIEW,
  ATTENDANCE_FORM_VIEW,
} from '../../schema/attendanceSchema';
import { useModalEscape } from '../../hooks/useModalEscape';

export function SchemaViewerModal({ isOpen, onClose }) {
  useModalEscape(onClose, isOpen);

  const [format, setFormat] = useState('xml');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const xmlArch = `<?xml version="1.0" encoding="utf-8"?>
<odoo>
  <!-- hr.attendance List View Arch -->
  <record id="view_attendance_tree_management" model="ir.ui.view">
    <field name="name">hr.attendance.list</field>
    <field name="model">hr.attendance</field>
    <field name="arch" type="xml">
      <list string="Employee attendances" create="1">
        <field name="employee_id" widget="many2one_avatar_employee" readonly="1"/>
        <field name="check_in" readonly="0"/>
        <field name="check_out" readonly="0"/>
        <field name="break_duration" widget="float_time"/>
        <field name="worked_hours" widget="float_time" string="Worked Time" readonly="1"/>
        <field name="state" widget="badge"
               decoration-success="state == 'validated'"
               decoration-warning="state == 'draft'"
               decoration-danger="state == 'refused'"/>
        <button name="action_validate" string="Validate" type="object"
                icon="check" invisible="state != 'draft'"/>
        <button name="action_refuse" string="Refuse" type="object"
                icon="close" invisible="state not in ('draft', 'validated')"/>
        <button name="action_reset_to_draft" string="Reset to Draft" type="object"
                icon="undo" invisible="state != 'refused'"/>
      </list>
    </field>
  </record>

  <!-- hr.attendance Form View Arch -->
  <record id="hr_attendance_view_form" model="ir.ui.view">
    <field name="name">hr.attendance.form</field>
    <field name="model">hr.attendance</field>
    <field name="arch" type="xml">
      <form string="Employee attendances">
        <header>
          <button name="action_validate" string="Validate" type="object"
                  class="btn-primary" invisible="state != 'draft'"/>
          <button name="action_refuse" string="Refuse" type="object"
                  invisible="state not in ('draft', 'validated')"/>
          <button name="action_reset_to_draft" string="Reset to Draft"
                  type="object" invisible="state != 'refused'"/>
          <field name="state" widget="statusbar" statusbar_visible="draft,validated"/>
        </header>
        <sheet>
          <div invisible="not source_stale" class="alert alert-warning">
            Source attendance modified - this record may be outdated.
            <button name="action_mark_reviewed" type="object" string="Mark as Reviewed"/>
          </div>
          <group>
            <group name="group_employee" string="Employee &amp; Shift Information">
              <field name="employee_id" widget="many2one_avatar_employee" required="1"/>
              <field name="check_in" required="1"/>
              <field name="check_out"/>
              <field name="resource_calendar_id"/>
            </group>
            <group name="group_worked_hours" string="Worked Time &amp; Categorization">
              <field name="worked_hours" widget="float_time" readonly="1"/>
              <field name="break_duration" widget="float_time"/>
              <field name="work_entry_type_id"/>
            </group>
          </group>
          <notebook>
            <page name="logs" string="Device &amp; Biometric Logs">
              <group string="Check In">
                <field name="in_mode"/>
                <field name="in_ip_address" invisible="in_mode == 'manual'"/>
                <field name="in_browser" invisible="in_mode == 'manual'"/>
                <field name="in_location"/>
                <field name="in_latitude"/>
                <field name="in_longitude"/>
              </group>
              <group string="Check Out" invisible="not check_out">
                <field name="out_mode"/>
                <field name="out_ip_address" invisible="out_mode == 'manual'"/>
                <field name="out_browser" invisible="out_mode == 'manual'"/>
                <field name="out_location"/>
                <field name="out_latitude"/>
                <field name="out_longitude"/>
              </group>
            </page>
            <page name="notes" string="Audit &amp; Remarks">
              <field name="notes" placeholder="Managerial remarks..."/>
            </page>
          </notebook>
        </sheet>
        <chatter/>
      </form>
    </field>
  </record>
</odoo>`;

  const jsonArch = JSON.stringify(
    {
      model: ATTENDANCE_MODEL,
      list_view: ATTENDANCE_LIST_VIEW,
      form_view: ATTENDANCE_FORM_VIEW,
    },
    null,
    2
  );

  const displayCode = format === 'xml' ? xmlArch : jsonArch;

  const handleCopy = () => {
    navigator.clipboard.writeText(displayCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 text-slate-100 rounded-xl shadow-2xl border border-slate-700 w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-fadeIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded bg-[#714B67] text-white">
              <Code className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100">
                View Architecture & Schema
              </h3>
              <p className="text-xs text-slate-400">
                XML Layout Architecture and dynamic JSON Schema definition
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-700 bg-slate-800 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setFormat('xml')}
                className={`px-3 py-1 rounded transition cursor-pointer flex items-center gap-1.5 ${
                  format === 'xml'
                    ? 'bg-blue-600 text-white font-medium'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Code className="w-3.5 h-3.5" />
                <span>Layout XML</span>
              </button>
              <button
                type="button"
                onClick={() => setFormat('json')}
                className={`px-3 py-1 rounded transition cursor-pointer flex items-center gap-1.5 ${
                  format === 'json'
                    ? 'bg-[#714B67] text-white font-medium'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileJson className="w-3.5 h-3.5" />
                <span>Engine JSON Schema</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Copy to clipboard"
            >
              {copied ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer group"
              title="Close (Esc)"
              aria-label="Close dialog"
            >
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                Esc
              </span>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Code Body */}
        <div className="p-6 overflow-y-auto font-mono text-xs text-emerald-300 bg-slate-950 flex-1 leading-relaxed">
          <pre>{displayCode}</pre>
        </div>
      </div>
    </div>
  );
}
