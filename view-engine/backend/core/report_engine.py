"""
Larea ERP - Vector PDF Report Generation Engine
================================================
Generates publication-grade, true vector A4 PDF reports for Qatar WPS payroll,
supporting both:
  1. Blank Paper Mode: Complete vector header with corporate identity,
     bilingual credentials, and statutory confidentiality footer.
  2. Letterhead Mode: Suppresses headers/footers with dynamic margins calibrated
     specifically for pre-printed corporate stationery (40mm top, 25mm bottom).

Compliant with Qatar Labour Law (No. 14 of 2004) & Qatar Central Bank Wage Protection System (WPS).
"""

import io
import os
import datetime
import logging
from typing import List, Dict, Any, Optional

from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Table,
    TableStyle,
    Spacer,
    PageBreak,
    KeepTogether,
    Image as RLImage,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Group
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

logger = logging.getLogger("enterprise.report_engine")

# ----------------------------------------------------------------------
# TrueType Font & Arabic Typography Registration
# ----------------------------------------------------------------------
ARABIC_AVAILABLE = False
DEJAVU_FONT_NAME = "DejaVuSans"
DEJAVU_BOLD_NAME = "DejaVuSans-Bold"

try:
    dejavu_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    dejavu_bold_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    if os.path.exists(dejavu_path):
        pdfmetrics.registerFont(TTFont(DEJAVU_FONT_NAME, dejavu_path))
        if os.path.exists(dejavu_bold_path):
            pdfmetrics.registerFont(TTFont(DEJAVU_BOLD_NAME, dejavu_bold_path))
        else:
            pdfmetrics.registerFont(TTFont(DEJAVU_BOLD_NAME, dejavu_path))
        ARABIC_AVAILABLE = True
except Exception as exc:
    logger.warning("Could not register TrueType DejaVuSans fonts: %s", exc)

try:
    import arabic_reshaper
    from bidi.algorithm import get_display
    BIDI_SUPPORTED = True
except ImportError:
    BIDI_SUPPORTED = False


def format_bilingual_text(text: Optional[str]) -> str:
    """Shapes Arabic glyphs and handles bidirectional reordering if Arabic text is detected."""
    if not text:
        return ""
    text_str = str(text)
    has_arabic = any(
        '\u0600' <= char <= '\u06ff' or
        '\u0750' <= char <= '\u077f' or
        '\u08a0' <= char <= '\u08ff' or
        '\ufb50' <= char <= '\ufdff' or
        '\ufe70' <= char <= '\ufeff'
        for char in text_str
    )
    if has_arabic and BIDI_SUPPORTED and ARABIC_AVAILABLE:
        try:
            reshaped = arabic_reshaper.reshape(text_str)
            bidi_text = get_display(reshaped)
            return f'<font name="{DEJAVU_FONT_NAME}">{bidi_text}</font>'
        except Exception:
            return text_str
    return text_str


def format_qar(val: Any) -> str:
    """Formats numeric value to standard QAR currency string with thousands separators."""
    try:
        if val is None:
            return "0.00"
        return f"{float(val):,.2f}"
    except (ValueError, TypeError):
        return "0.00"


# ----------------------------------------------------------------------
# Two-Pass Dynamic Numbered Canvas
# ----------------------------------------------------------------------
class NumberedCanvas(canvas.Canvas):
    """
    Two-pass ReportLab canvas that calculates the exact total page count (Y)
    and conditionally draws the statutory footer when mode == 'blank'.
    In mode == 'letterhead', headers and footers are suppressed to preserve
    pre-printed company stationery.
    """
    mode: str = "blank"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            if getattr(self, "mode", "blank") == "blank":
                self.draw_statutory_footer(num_pages)
            super().showPage()
        super().save()

    def draw_statutory_footer(self, total_pages: int):
        self.saveState()
        font_name = DEJAVU_FONT_NAME if ARABIC_AVAILABLE else "Helvetica"
        self.setFont(font_name, 7.5)
        self.setFillColor(colors.HexColor("#64748B"))  # Slate-500
        w, h = self._pagesize
        margin_x = 42

        # Fine hairline rule above footer
        self.setStrokeColor(colors.HexColor("#CBD5E1"))  # Slate-300
        self.setLineWidth(0.5)
        self.line(margin_x, 26, w - margin_x, 26)

        # Left confidential notice
        self.drawString(margin_x, 15, "Confidential • Generated via Larea ERP")

        # Right page counter
        page_str = f"Page {self._pageNumber} of {total_pages}"
        self.drawRightString(w - margin_x, 15, page_str)

        self.restoreState()


def get_numbered_canvas_class(mode: str = "blank"):
    """Returns a NumberedCanvas subclass configured with the requested mode."""
    mode_clean = (mode or "blank").strip().lower()

    class ConfiguredNumberedCanvas(NumberedCanvas):
        mode = mode_clean

    return ConfiguredNumberedCanvas


# ----------------------------------------------------------------------
# Vector Logo Generator
# ----------------------------------------------------------------------
def create_vector_logo(width: float = 40, height: float = 40) -> Drawing:
    """Generates a crisp true vector emblem when no raster logo file is supplied."""
    d = Drawing(width, height)
    # Slate container
    d.add(Rect(0, 0, width, height, rx=5, ry=5,
               fillColor=colors.HexColor("#0F172A"),
               strokeColor=colors.HexColor("#1E293B"),
               strokeWidth=0.8))
    # Geometric cyan accent stripe
    d.add(Rect(width * 0.18, height * 0.2, width * 0.14, height * 0.6,
               fillColor=colors.HexColor("#0284C7"), strokeColor=None))
    d.add(Rect(width * 0.18, height * 0.2, width * 0.52, height * 0.14,
               fillColor=colors.HexColor("#38BDF8"), strokeColor=None))
    return d


# ----------------------------------------------------------------------
# 1. Payslip PDF Generator
# ----------------------------------------------------------------------
def generate_payslip_pdf(
    payslips: List[Dict[str, Any]],
    org_info: Dict[str, Any],
    paper_format: Dict[str, Any],
    mode: str = "blank"
) -> bytes:
    """
    Generates high-fidelity vector A4 payslip PDFs for Qatar WPS payroll.

    Parameters:
      payslips: List of employee payslip dictionaries.
      org_info: Organization identity details (names, CR, WPS ID, address, logo).
      paper_format: Margin and layout settings.
      mode: 'blank' (draws full header and footer) or 'letterhead' (suppresses header/footer).

    Returns:
      Raw PDF bytes.
    """
    mode = (mode or "blank").strip().lower()
    if mode not in ("blank", "letterhead"):
        mode = "blank"

    # Margin calculations conforming to user specifications
    if mode == "letterhead":
        top_margin = float(paper_format.get("letterhead_top_margin_pt", 114))    # 40mm
        bottom_margin = float(paper_format.get("letterhead_bottom_margin_pt", 70)) # 25mm
    else:
        top_margin = float(paper_format.get("top_margin_pt", 42))                 # 15mm
        bottom_margin = float(paper_format.get("bottom_margin_pt", 42))           # 15mm

    left_margin = float(paper_format.get("left_margin_pt", 42))                   # 15mm
    right_margin = float(paper_format.get("right_margin_pt", 42))                 # 15mm

    # Usable printable width
    content_width = A4[0] - left_margin - right_margin  # 595.27 - 84 = 511.27 pt

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=left_margin,
        rightMargin=right_margin,
        topMargin=top_margin,
        bottomMargin=bottom_margin,
    )

    # Styles
    base_styles = getSampleStyleSheet()
    style_normal = base_styles["Normal"]

    company_en = org_info.get("company_name") or org_info.get("legal_entity_name") or "Larea Industrial & Contracting W.L.L."
    company_ar = org_info.get("company_name_ar") or org_info.get("legal_entity_name_ar") or "شركة لاريا للصناعة والمقاولات ذ.م.م"
    cr_number = org_info.get("cr_number") or "QA-3849102-CR"
    wps_est_id = org_info.get("wps_establishment_id") or org_info.get("moi_establishment_id") or "10293847"
    tax_id = org_info.get("tax_id") or "VAT-100293848"
    logo_path = org_info.get("logo_path")

    story = []
    total_slips = len(payslips)

    for idx, slip in enumerate(payslips):
        slip_elements = []

        # -------------------------------------------------------------
        # A. Header Section (Mode == 'blank' only)
        # -------------------------------------------------------------
        if mode == "blank":
            logo_element = None
            if logo_path and os.path.exists(str(logo_path)):
                try:
                    logo_element = RLImage(logo_path, width=42, height=42)
                except Exception:
                    logo_element = create_vector_logo(42, 42)
            else:
                logo_element = create_vector_logo(42, 42)

            comp_title_text = (
                f"<font size='10.5'><b>{company_en}</b></font><br/>"
                f"<font size='8.5'>{format_bilingual_text(company_ar)}</font><br/>"
                f"<font size='6.5' color='#64748B'>Doha, Qatar</font>"
            )
            title_p = Paragraph(comp_title_text, ParagraphStyle("CompTitle", parent=style_normal, leading=11))

            meta_text = (
                f"<font size='7' color='#475569'>"
                f"<b>C.R. Number:</b> {cr_number}<br/>"
                f"<b>Company ID:</b> {wps_est_id}<br/>"
                f"<b>Tax ID:</b> {tax_id}"
                f"</font>"
            )
            meta_p = Paragraph(meta_text, ParagraphStyle("CompMeta", parent=style_normal, alignment=2, leading=10))

            header_table = Table(
                [[logo_element, title_p, meta_p]],
                colWidths=[48, content_width - 198, 150]
            )
            header_table.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]))
            slip_elements.append(header_table)

            # Hairline divider
            line_table = Table([[""]], colWidths=[content_width], rowHeights=[1])
            line_table.setStyle(TableStyle([
                ("LINEBELOW", (0, 0), (-1, -1), 0.75, colors.HexColor("#E2E8F0")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
            ]))
            slip_elements.append(line_table)
            slip_elements.append(Spacer(1, 6))

        # -------------------------------------------------------------
        # B. Payslip Title Banner
        # -------------------------------------------------------------
        batch_month = slip.get("salary_year_month") or slip.get("batch_month") or "CURRENT"
        wps_status = str(slip.get("wps_status") or "READY").upper()
        emp_num = slip.get("employee_number") or "EMP-0000"

        banner_left = (
            f"<font size='8.5' color='#FFFFFF'><b>EMPLOYEE SALARY SLIP</b></font><br/>"
            f"<font size='6.5' color='#94A3B8'>Monthly Payroll Statement</font>"
        )
        banner_right = (
            f"<font size='7' color='#FFFFFF'>"
            f"<b>PERIOD:</b> {batch_month} &nbsp;|&nbsp; <b>STATUS:</b> {wps_status}"
            f"</font>"
        )

        banner_p_left = Paragraph(banner_left, ParagraphStyle("BLeft", parent=style_normal, leading=10))
        banner_p_right = Paragraph(banner_right, ParagraphStyle("BRight", parent=style_normal, alignment=2, leading=10))

        banner_table = Table(
            [[banner_p_left, banner_p_right]],
            colWidths=[content_width - 150, 150]
        )
        banner_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#0F172A")),  # Dark Navy Slate
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        slip_elements.append(banner_table)
        slip_elements.append(Spacer(1, 6))

        # -------------------------------------------------------------
        # C. Employee Metadata Box (QID, IBAN, Department, Days Worked)
        # -------------------------------------------------------------
        emp_name = slip.get("employee_name") or "Employee"
        qid = slip.get("national_id_number") or slip.get("visa_number") or "N/A"
        dept = slip.get("department") or "General"
        job_title = slip.get("job_title") or "Staff"
        bank_name = slip.get("bank_name") or "Direct Bank Credit"
        iban = slip.get("bank_iban") or "N/A"
        working_days = slip.get("working_days") or 30
        attendance_hrs = slip.get("verified_attendance_hours") or 0.0

        meta_grid = [
            [
                Paragraph("<font size='7' color='#475569'><b>Employee Name:</b></font>", style_normal),
                Paragraph(f"<font size='7.5' color='#0F172A'><b>{emp_name}</b></font>", style_normal),
                Paragraph("<font size='7' color='#475569'><b>Employee ID:</b></font>", style_normal),
                Paragraph(f"<font size='7.5' color='#0F172A'><b>{emp_num}</b></font>", style_normal),
            ],
            [
                Paragraph("<font size='7' color='#475569'><b>Qatar ID (QID):</b></font>", style_normal),
                Paragraph(f"<font size='7.5' color='#0F172A'><b>{qid}</b></font>", style_normal),
                Paragraph("<font size='7' color='#475569'><b>Department:</b></font>", style_normal),
                Paragraph(f"<font size='7.5' color='#0F172A'>{dept}</font>", style_normal),
            ],
            [
                Paragraph("<font size='7' color='#475569'><b>Designation:</b></font>", style_normal),
                Paragraph(f"<font size='7.5' color='#0F172A'>{job_title}</font>", style_normal),
                Paragraph("<font size='7' color='#475569'><b>Days Worked:</b></font>", style_normal),
                Paragraph(f"<font size='7.5' color='#0F172A'><b>{working_days}</b> days ({attendance_hrs} hrs)</font>", style_normal),
            ],
            [
                Paragraph("<font size='7' color='#475569'><b>Bank Name:</b></font>", style_normal),
                Paragraph(f"<font size='7.5' color='#0F172A'>{bank_name}</font>", style_normal),
                Paragraph("<font size='7' color='#475569'><b>IBAN:</b></font>", style_normal),
                Paragraph(f"<font size='7' color='#0F172A'><b>{iban}</b></font>", style_normal),
            ],
        ]

        # Col widths summing to content_width (511 pt): [80, 175, 80, 176]
        w_l1, w_v1 = 80, 175
        w_l2 = 80
        w_v2 = content_width - (w_l1 + w_v1 + w_l2)
        meta_table = Table(meta_grid, colWidths=[w_l1, w_v1, w_l2, w_v2])
        meta_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        slip_elements.append(meta_table)
        slip_elements.append(Spacer(1, 7))

        # -------------------------------------------------------------
        # D. Earnings and Deductions Table
        # -------------------------------------------------------------
        base_salary = float(slip.get("base_salary") or 0.0)
        housing = float(slip.get("housing_allowance") or 0.0)
        transport = float(slip.get("transport_allowance") or 0.0)
        other_alw = float(slip.get("other_allowances") or 0.0)
        overtime_pay = float(slip.get("overtime_pay") or 0.0)
        bonus_pay = float(slip.get("bonus_pay") or 0.0)
        task_pay = float(slip.get("task_benefit_pay") or 0.0)
        gross_earnings = base_salary + housing + transport + other_alw + overtime_pay + bonus_pay + task_pay

        penalty_ded = float(slip.get("penalty_deduction") or 0.0)
        loan_ded = float(slip.get("loan_deduction") or 0.0)
        other_ded = float(slip.get("other_deductions") or 0.0)
        explicit_total_ded = slip.get("deductions")
        if explicit_total_ded is not None and float(explicit_total_ded) > 0:
            total_ded = float(explicit_total_ded)
            # If sub-deductions are zero, populate other_ded
            if (penalty_ded + loan_ded + other_ded) == 0:
                other_ded = total_ded
        else:
            total_ded = penalty_ded + loan_ded + other_ded

        net_salary = float(slip.get("net_salary") or (gross_earnings - total_ded))

        # Construct balanced side-by-side rows
        # Widths: [160, 95, 160, 96] = 511
        w_ed1, w_ed2 = 160, 95
        w_ed3 = 160
        w_ed4 = content_width - (w_ed1 + w_ed2 + w_ed3)

        ed_rows = [
            [
                Paragraph("<font size='7.5' color='#0F172A'><b>EARNINGS SPECIFICATION</b></font>", style_normal),
                Paragraph("<font size='7.5' color='#0F172A'><b>AMOUNT (QAR)</b></font>", ParagraphStyle("ERight", parent=style_normal, alignment=2)),
                Paragraph("<font size='7.5' color='#0F172A'><b>DEDUCTIONS SPECIFICATION</b></font>", style_normal),
                Paragraph("<font size='7.5' color='#0F172A'><b>AMOUNT (QAR)</b></font>", ParagraphStyle("DRight", parent=style_normal, alignment=2)),
            ],
            [
                Paragraph("<font size='7' color='#334155'>Basic Salary</font>", style_normal),
                Paragraph(f"<font size='7' color='#0F172A'>{format_qar(base_salary)}</font>", ParagraphStyle("R1", parent=style_normal, alignment=2)),
                Paragraph("<font size='7' color='#334155'>Absence & Penalty Deductions</font>", style_normal),
                Paragraph(f"<font size='7' color='#0F172A'>{format_qar(penalty_ded)}</font>", ParagraphStyle("R2", parent=style_normal, alignment=2)),
            ],
            [
                Paragraph("<font size='7' color='#334155'>Housing Allowance</font>", style_normal),
                Paragraph(f"<font size='7' color='#0F172A'>{format_qar(housing)}</font>", ParagraphStyle("R3", parent=style_normal, alignment=2)),
                Paragraph("<font size='7' color='#334155'>Salary Advances / Loan Recovery</font>", style_normal),
                Paragraph(f"<font size='7' color='#0F172A'>{format_qar(loan_ded)}</font>", ParagraphStyle("R4", parent=style_normal, alignment=2)),
            ],
            [
                Paragraph("<font size='7' color='#334155'>Transport Allowance</font>", style_normal),
                Paragraph(f"<font size='7' color='#0F172A'>{format_qar(transport)}</font>", ParagraphStyle("R5", parent=style_normal, alignment=2)),
                Paragraph("<font size='7' color='#334155'>Other Deductions</font>", style_normal),
                Paragraph(f"<font size='7' color='#0F172A'>{format_qar(other_ded)}</font>", ParagraphStyle("R6", parent=style_normal, alignment=2)),
            ],
            [
                Paragraph("<font size='7' color='#334155'>Other Special Allowances</font>", style_normal),
                Paragraph(f"<font size='7' color='#0F172A'>{format_qar(other_alw)}</font>", ParagraphStyle("R7", parent=style_normal, alignment=2)),
                Paragraph("<font size='7' color='#94A3B8'>—</font>", style_normal),
                Paragraph("<font size='7' color='#94A3B8'>—</font>", ParagraphStyle("R8", parent=style_normal, alignment=2)),
            ],
            [
                Paragraph(f"<font size='7' color='#334155'>Overtime Pay ({slip.get('overtime_hours', 0)} hrs)</font>", style_normal),
                Paragraph(f"<font size='7' color='#0F172A'>{format_qar(overtime_pay)}</font>", ParagraphStyle("R9", parent=style_normal, alignment=2)),
                Paragraph("<font size='7' color='#94A3B8'>—</font>", style_normal),
                Paragraph("<font size='7' color='#94A3B8'>—</font>", ParagraphStyle("R10", parent=style_normal, alignment=2)),
            ],
        ]

        if (bonus_pay + task_pay) > 0:
            ed_rows.append([
                Paragraph("<font size='7' color='#334155'>Bonus & Performance Benefits</font>", style_normal),
                Paragraph(f"<font size='7' color='#0F172A'>{format_qar(bonus_pay + task_pay)}</font>", ParagraphStyle("R11", parent=style_normal, alignment=2)),
                Paragraph("<font size='7' color='#94A3B8'>—</font>", style_normal),
                Paragraph("<font size='7' color='#94A3B8'>—</font>", ParagraphStyle("R12", parent=style_normal, alignment=2)),
            ])

        # Grand Sub-totals Row
        ed_rows.append([
            Paragraph("<font size='7.5' color='#0F172A'><b>TOTAL GROSS EARNINGS</b></font>", style_normal),
            Paragraph(f"<font size='7.5' color='#0F172A'><b>QAR {format_qar(gross_earnings)}</b></font>", ParagraphStyle("RT1", parent=style_normal, alignment=2)),
            Paragraph("<font size='7.5' color='#0F172A'><b>TOTAL DEDUCTIONS</b></font>", style_normal),
            Paragraph(f"<font size='7.5' color='#DC2626'><b>QAR {format_qar(total_ded)}</b></font>", ParagraphStyle("RT2", parent=style_normal, alignment=2)),
        ])

        ed_table = Table(ed_rows, colWidths=[w_ed1, w_ed2, w_ed3, w_ed4])
        ed_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F1F5F9")),
            ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#F8FAFC")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
            ("LINEBELOW", (0, 0), (-1, 0), 1, colors.HexColor("#94A3B8")),
            ("LINEABOVE", (0, -1), (-1, -1), 1, colors.HexColor("#94A3B8")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        slip_elements.append(ed_table)
        slip_elements.append(Spacer(1, 7))

        # -------------------------------------------------------------
        # E. Net Amount Payable Highlight Box
        # -------------------------------------------------------------
        net_title_ar = format_bilingual_text("صافي الراتب المستحق")
        net_text_left = (
            f"<font size='8' color='#065F46'><b>NET AMOUNT PAYABLE / {net_title_ar}</b></font><br/>"
            f"<font size='6.5' color='#047857'>Direct Bank Transfer • Ref: {emp_num}-{batch_month}</font>"
        )
        net_text_right = f"<font size='12' color='#065F46'><b>QAR {format_qar(net_salary)}</b></font>"

        net_p_left = Paragraph(net_text_left, ParagraphStyle("NetL", parent=style_normal, leading=10))
        net_p_right = Paragraph(net_text_right, ParagraphStyle("NetR", parent=style_normal, alignment=2, leading=14))

        net_table = Table([[net_p_left, net_p_right]], colWidths=[content_width - 160, 160])
        net_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#ECFDF5")),  # Soft Emerald 50
            ("BOX", (0, 0), (-1, -1), 1.2, colors.HexColor("#10B981")),     # Emerald 500
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        slip_elements.append(net_table)
        slip_elements.append(Spacer(1, 9))

        # -------------------------------------------------------------
        # F. Signature Blocks
        # -------------------------------------------------------------
        col_sig = (content_width - 20) / 2.0
        sig_left = (
            f"<font size='7.5' color='#0F172A'><b>Prepared & Authorized By</b></font><br/><br/><br/>"
            f"____________________________________________<br/>"
            f"<font size='7' color='#334155'><b>HR & Payroll Administration</b></font><br/>"
            f"<font size='6.5' color='#64748B'>Authorized Signatory</font>"
        )
        sig_right = (
            f"<font size='7.5' color='#0F172A'><b>Employee Acknowledgment</b></font><br/><br/><br/>"
            f"____________________________________________<br/>"
            f"<font size='7' color='#334155'><b>Employee Signature: {emp_name}</b></font><br/>"
            f"<font size='6.5' color='#64748B'>I hereby acknowledge receipt of the stated net salary & entitlements.</font>"
        )

        sig_p_left = Paragraph(sig_left, ParagraphStyle("SigL", parent=style_normal, leading=10))
        sig_p_right = Paragraph(sig_right, ParagraphStyle("SigR", parent=style_normal, leading=10))

        sig_table = Table([[sig_p_left, "", sig_p_right]], colWidths=[col_sig, 20, col_sig])
        sig_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
        slip_elements.append(sig_table)

        # Wrap in KeepTogether so each slip is firmly bound
        story.append(KeepTogether(slip_elements))

        # Insert PageBreak between payslips (omit for the final payslip)
        if idx < total_slips - 1:
            story.append(PageBreak())

    # Build document with custom NumberedCanvas
    canvas_class = get_numbered_canvas_class(mode)
    doc.build(story, canvasmaker=canvas_class)

    return buf.getvalue()


# ----------------------------------------------------------------------
# 2. Salary Register PDF Generator
# ----------------------------------------------------------------------
def generate_salary_register_pdf(
    batch_data: Dict[str, Any],
    payslips: List[Dict[str, Any]],
    org_info: Dict[str, Any],
    paper_format: Dict[str, Any],
    mode: str = "blank"
) -> bytes:
    """
    Generates a publication-grade A4 Landscape Salary Register and Payroll Journal.

    Parameters:
      batch_data: Payroll batch metadata (code, title, month, totals).
      payslips: List of individual employee payslip dictionaries.
      org_info: Organization identity details.
      paper_format: Margin settings.
      mode: 'blank' or 'letterhead'.

    Returns:
      Raw PDF bytes.
    """
    mode = (mode or "blank").strip().lower()
    if mode not in ("blank", "letterhead"):
        mode = "blank"

    # Margins for Landscape A4 (841.89 x 595.27)
    if mode == "letterhead":
        top_margin = float(paper_format.get("letterhead_top_margin_pt", 114))
        bottom_margin = float(paper_format.get("letterhead_bottom_margin_pt", 70))
    else:
        top_margin = float(paper_format.get("top_margin_pt", 42))
        bottom_margin = float(paper_format.get("bottom_margin_pt", 42))

    left_margin = float(paper_format.get("left_margin_pt", 30))
    right_margin = float(paper_format.get("right_margin_pt", 30))

    page_w, page_h = landscape(A4)
    content_width = page_w - left_margin - right_margin  # 841.89 - 60 = 781.89 pt

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(A4),
        leftMargin=left_margin,
        rightMargin=right_margin,
        topMargin=top_margin,
        bottomMargin=bottom_margin,
    )

    base_styles = getSampleStyleSheet()
    style_normal = base_styles["Normal"]

    company_en = org_info.get("company_name") or org_info.get("legal_entity_name") or "Larea Industrial & Contracting W.L.L."
    company_ar = org_info.get("company_name_ar") or org_info.get("legal_entity_name_ar") or "شركة لاريا للصناعة والمقاولات ذ.م.م"
    cr_number = org_info.get("cr_number") or "QA-3849102-CR"
    wps_est_id = org_info.get("wps_establishment_id") or org_info.get("moi_establishment_id") or "10293847"

    batch_code = batch_data.get("batch_code") or "BATCH-001"
    salary_ym = batch_data.get("salary_year_month") or "CURRENT"
    batch_status = str(batch_data.get("status") or "draft").upper()

    story = []

    # -------------------------------------------------------------
    # 1. Header Section
    # -------------------------------------------------------------
    if mode == "blank":
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M UTC")
        header_left = (
            f"<font size='10'><b>{company_en}</b></font><br/>"
            f"<font size='8'>{format_bilingual_text(company_ar)}</font><br/>"
            f"<font size='6.5' color='#64748B'>CR: {cr_number} &nbsp;|&nbsp; Company ID: {wps_est_id}</font>"
        )
        header_center = (
            f"<font size='11' color='#0F172A'><b>SALARY REGISTER & DISBURSEMENT JOURNAL</b></font><br/>"
            f"<font size='8' color='#334155'><b>Batch:</b> {batch_code} &nbsp;|&nbsp; <b>Payroll Period:</b> {salary_ym}</font><br/>"
            f"<font size='6.5' color='#64748B'>Payroll Salary Register</font>"
        )
        header_right = (
            f"<font size='7' color='#475569'>"
            f"<b>Batch Status:</b> {batch_status}<br/>"
            f"<b>Employees Count:</b> {len(payslips)}<br/>"
            f"<b>Currency:</b> QAR<br/>"
            f"<b>Generated:</b> {now_str}"
            f"</font>"
        )

        p_hl = Paragraph(header_left, ParagraphStyle("RHL", parent=style_normal, leading=11))
        p_hc = Paragraph(header_center, ParagraphStyle("RHC", parent=style_normal, alignment=1, leading=12))
        p_hr = Paragraph(header_right, ParagraphStyle("RHR", parent=style_normal, alignment=2, leading=10))

        head_table = Table([[p_hl, p_hc, p_hr]], colWidths=[240, content_width - 440, 200])
        head_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(head_table)

        # Hairline divider
        line_t = Table([[""]], colWidths=[content_width], rowHeights=[1])
        line_t.setStyle(TableStyle([
            ("LINEBELOW", (0, 0), (-1, -1), 0.75, colors.HexColor("#CBD5E1")),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
        ]))
        story.append(line_t)
        story.append(Spacer(1, 8))
    else:
        # Letterhead compact title
        title_lh = (
            f"<font size='9' color='#0F172A'><b>SALARY REGISTER & DISBURSEMENT JOURNAL &nbsp;•&nbsp; "
            f"PERIOD: {salary_ym} &nbsp;•&nbsp; BATCH: {batch_code} &nbsp;•&nbsp; STATUS: {batch_status}</b></font>"
        )
        p_lh = Paragraph(title_lh, ParagraphStyle("LHTitle", parent=style_normal, alignment=1, leading=11))
        story.append(p_lh)
        story.append(Spacer(1, 8))

    # -------------------------------------------------------------
    # 2. Main Salary Register Table (12 Required Columns)
    # -------------------------------------------------------------
    # Columns:
    # 1. Employee ID
    # 2. Full Name
    # 3. QID
    # 4. Department
    # 5. Basic Salary
    # 6. Housing
    # 7. Transport
    # 8. Other Allowances
    # 9. Overtime
    # 10. Gross
    # 11. Total Deductions
    # 12. Net Payable (QAR)

    # Total width = content_width (approx 781.89 pt)
    # Proportions:
    # 52 + 105 + 75 + 72 + 58 + 52 + 52 + 55 + 52 + 66 + 66 + 76 = 781 pt
    c_widths = [52, 105, 75, 72, 58, 52, 52, 55, 52, 66, 66, content_width - (52 + 105 + 75 + 72 + 58 + 52 + 52 + 55 + 52 + 66 + 66)]

    headers = [
        "Emp ID", "Full Name", "QID", "Department",
        "Basic", "Housing", "Transport", "Other Alw",
        "Overtime", "Gross", "Deductions", "Net Payable (QAR)"
    ]

    header_cells = [
        Paragraph(f"<font size='7' color='#FFFFFF'><b>{h}</b></font>",
                  ParagraphStyle("TH", parent=style_normal, alignment=1 if idx < 4 else 2, leading=9))
        for idx, h in enumerate(headers)
    ]

    table_data = [header_cells]

    # Totals accumulators
    tot_basic = 0.0
    tot_housing = 0.0
    tot_transport = 0.0
    tot_other = 0.0
    tot_overtime = 0.0
    tot_gross = 0.0
    tot_deductions = 0.0
    tot_net = 0.0

    for slip in payslips:
        emp_id = slip.get("employee_number") or ""
        emp_name = slip.get("employee_name") or ""
        emp_qid = slip.get("national_id_number") or slip.get("visa_number") or ""
        emp_dept = slip.get("department") or ""

        b_sal = float(slip.get("base_salary") or 0.0)
        h_alw = float(slip.get("housing_allowance") or 0.0)
        t_alw = float(slip.get("transport_allowance") or 0.0)
        o_alw = float(slip.get("other_allowances") or 0.0) + float(slip.get("bonus_pay") or 0.0) + float(slip.get("task_benefit_pay") or 0.0)
        ot_pay = float(slip.get("overtime_pay") or 0.0)
        gross = b_sal + h_alw + t_alw + o_alw + ot_pay

        ded = float(slip.get("deductions") or (
            float(slip.get("penalty_deduction") or 0.0) +
            float(slip.get("loan_deduction") or 0.0) +
            float(slip.get("other_deductions") or 0.0)
        ))
        net = float(slip.get("net_salary") or (gross - ded))

        tot_basic += b_sal
        tot_housing += h_alw
        tot_transport += t_alw
        tot_other += o_alw
        tot_overtime += ot_pay
        tot_gross += gross
        tot_deductions += ded
        tot_net += net

        row_cells = [
            Paragraph(f"<font size='6.5' color='#0F172A'><b>{emp_id}</b></font>", style_normal),
            Paragraph(f"<font size='6.5' color='#0F172A'>{emp_name}</font>", style_normal),
            Paragraph(f"<font size='6.5' color='#475569'>{emp_qid}</font>", style_normal),
            Paragraph(f"<font size='6.5' color='#475569'>{emp_dept}</font>", style_normal),
            Paragraph(f"<font size='6.5' color='#0F172A'>{format_qar(b_sal)}</font>", ParagraphStyle("R_BS", parent=style_normal, alignment=2)),
            Paragraph(f"<font size='6.5' color='#0F172A'>{format_qar(h_alw)}</font>", ParagraphStyle("R_HA", parent=style_normal, alignment=2)),
            Paragraph(f"<font size='6.5' color='#0F172A'>{format_qar(t_alw)}</font>", ParagraphStyle("R_TA", parent=style_normal, alignment=2)),
            Paragraph(f"<font size='6.5' color='#0F172A'>{format_qar(o_alw)}</font>", ParagraphStyle("R_OA", parent=style_normal, alignment=2)),
            Paragraph(f"<font size='6.5' color='#0F172A'>{format_qar(ot_pay)}</font>", ParagraphStyle("R_OT", parent=style_normal, alignment=2)),
            Paragraph(f"<font size='6.5' color='#0F172A'><b>{format_qar(gross)}</b></font>", ParagraphStyle("R_GR", parent=style_normal, alignment=2)),
            Paragraph(f"<font size='6.5' color='#DC2626'>{format_qar(ded)}</font>", ParagraphStyle("R_DD", parent=style_normal, alignment=2)),
            Paragraph(f"<font size='6.5' color='#047857'><b>{format_qar(net)}</b></font>", ParagraphStyle("R_NT", parent=style_normal, alignment=2)),
        ]
        table_data.append(row_cells)

    # Grand Totals Row
    grand_totals_row = [
        Paragraph("<font size='7' color='#FFFFFF'><b>GRAND TOTAL (QAR)</b></font>", ParagraphStyle("GTL", parent=style_normal, alignment=2)),
        "", "", "",  # Spanned
        Paragraph(f"<font size='7' color='#FFFFFF'><b>{format_qar(tot_basic)}</b></font>", ParagraphStyle("GT1", parent=style_normal, alignment=2)),
        Paragraph(f"<font size='7' color='#FFFFFF'><b>{format_qar(tot_housing)}</b></font>", ParagraphStyle("GT2", parent=style_normal, alignment=2)),
        Paragraph(f"<font size='7' color='#FFFFFF'><b>{format_qar(tot_transport)}</b></font>", ParagraphStyle("GT3", parent=style_normal, alignment=2)),
        Paragraph(f"<font size='7' color='#FFFFFF'><b>{format_qar(tot_other)}</b></font>", ParagraphStyle("GT4", parent=style_normal, alignment=2)),
        Paragraph(f"<font size='7' color='#FFFFFF'><b>{format_qar(tot_overtime)}</b></font>", ParagraphStyle("GT5", parent=style_normal, alignment=2)),
        Paragraph(f"<font size='7' color='#FFFFFF'><b>{format_qar(tot_gross)}</b></font>", ParagraphStyle("GT6", parent=style_normal, alignment=2)),
        Paragraph(f"<font size='7' color='#FCA5A5'><b>{format_qar(tot_deductions)}</b></font>", ParagraphStyle("GT7", parent=style_normal, alignment=2)),
        Paragraph(f"<font size='7.5' color='#6EE7B7'><b>{format_qar(tot_net)}</b></font>", ParagraphStyle("GT8", parent=style_normal, alignment=2)),
    ]
    table_data.append(grand_totals_row)

    reg_table = Table(table_data, colWidths=c_widths, repeatRows=1)
    reg_table.setStyle(TableStyle([
        # Header style
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F172A")),  # Dark Navy Slate
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ("INNERGRID", (0, 0), (-1, -2), 0.5, colors.HexColor("#E2E8F0")),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        # Grand Totals row formatting
        ("SPAN", (0, -1), (3, -1)),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#1E293B")),
        ("LINEABOVE", (0, -1), (-1, -1), 1.2, colors.HexColor("#0F172A")),
    ]))
    story.append(reg_table)
    story.append(Spacer(1, 10))

    # Sign-off block
    signoff_left = (
        "<font size='6.5' color='#475569'>"
        "<b>Prepared By:</b> Payroll Specialist &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; "
        "<b>Reviewed By:</b> Financial Controller &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; "
        "<b>Approved By:</b> Managing Director / Chief Executive"
        "</font>"
    )
    story.append(Paragraph(signoff_left, style_normal))

    canvas_class = get_numbered_canvas_class(mode)
    doc.build(story, canvasmaker=canvas_class)

    return buf.getvalue()


# ----------------------------------------------------------------------
# 3. Letterhead Physical Alignment & Grid Calibration Sheet
# ----------------------------------------------------------------------
def generate_alignment_test_pdf(paper_format: Dict[str, Any]) -> bytes:
    """
    Generates a true vector A4 physical calibration grid sheet with:
      - 10mm minor grid markers and 50mm major grid lines
      - Top and side millimeter rulers
      - Exact letterhead top and bottom margin boundaries
      - 4-corner optical registration crosshairs
      - Alignment testing instructions for pre-printed corporate stationery
    """
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4  # 595.275 x 841.889 pt
    mm_pt = 72.0 / 25.4  # ~2.83465 pt/mm

    # Extract margins
    lh_top_mm = float(paper_format.get("letterhead_top_margin_mm", 40))
    lh_bottom_mm = float(paper_format.get("letterhead_bottom_margin_mm", 25))
    lh_top_pt = float(paper_format.get("letterhead_top_margin_pt", lh_top_mm * mm_pt))
    lh_bottom_pt = float(paper_format.get("letterhead_bottom_margin_pt", lh_bottom_mm * mm_pt))

    top_boundary_y = h - lh_top_pt
    bottom_boundary_y = lh_bottom_pt

    # 1. Background 10mm Minor Grid
    c.setLineWidth(0.3)
    c.setStrokeColor(colors.HexColor("#E2E8F0"))
    max_x_mm = int(w / mm_pt)
    max_y_mm = int(h / mm_pt)

    for x_mm in range(0, max_x_mm + 1, 10):
        x_pt = x_mm * mm_pt
        c.line(x_pt, 0, x_pt, h)

    for y_mm in range(0, max_y_mm + 1, 10):
        y_pt = y_mm * mm_pt
        c.line(0, y_pt, w, y_pt)

    # 2. 50mm Major Grid Lines
    c.setLineWidth(0.6)
    c.setStrokeColor(colors.HexColor("#CBD5E1"))
    for x_mm in range(0, max_x_mm + 1, 50):
        x_pt = x_mm * mm_pt
        c.line(x_pt, 0, x_pt, h)

    for y_mm in range(0, max_y_mm + 1, 50):
        y_pt = y_mm * mm_pt
        c.line(0, y_pt, w, y_pt)

    # 3. Millimeter Tick Marks & Labels along Top and Left
    c.setFont("Helvetica", 6)
    c.setFillColor(colors.HexColor("#64748B"))
    for x_mm in range(10, max_x_mm, 10):
        x_pt = x_mm * mm_pt
        c.drawString(x_pt + 2, h - 10, f"{x_mm}")

    for y_mm in range(10, max_y_mm, 10):
        # measured from top downwards
        y_from_top_mm = y_mm
        y_pt = h - (y_from_top_mm * mm_pt)
        c.drawString(4, y_pt + 2, f"{y_from_top_mm}")

    # 4. Top Stationery Margin Boundary (Header Zone)
    # Shaded top zone
    c.setFillColor(colors.HexColor("#FEF2F2"))  # Red-50
    c.rect(0, top_boundary_y, w, h - top_boundary_y, fill=1, stroke=0)

    # Boundary line
    c.setStrokeColor(colors.HexColor("#DC2626"))  # Red-600
    c.setLineWidth(1.5)
    c.setDash(4, 2)
    c.line(0, top_boundary_y, w, top_boundary_y)
    c.setDash([])  # Reset dash

    # Top zone banner text
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(colors.HexColor("#991B1B"))
    c.drawString(40, top_boundary_y + 12, f"▲ PRE-PRINTED LETTERHEAD HEADER ZONE: 0 to {lh_top_mm:.0f} mm ({lh_top_pt:.0f} pt)")
    c.setFont("Helvetica", 7)
    c.drawString(40, top_boundary_y + 3, "Company stationery header artwork must remain inside this upper region. ERP text starts below.")

    # 5. Bottom Stationery Margin Boundary (Footer Zone)
    # Shaded bottom zone
    c.setFillColor(colors.HexColor("#FFFBEB"))  # Amber-50
    c.rect(0, 0, w, bottom_boundary_y, fill=1, stroke=0)

    # Boundary line
    c.setStrokeColor(colors.HexColor("#D97706"))  # Amber-600
    c.setLineWidth(1.5)
    c.setDash(4, 2)
    c.line(0, bottom_boundary_y, w, bottom_boundary_y)
    c.setDash([])

    # Bottom zone banner text
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(colors.HexColor("#92400E"))
    c.drawString(40, bottom_boundary_y - 12, f"▼ PRE-PRINTED LETTERHEAD FOOTER ZONE: Bottom {lh_bottom_mm:.0f} mm ({lh_bottom_pt:.0f} pt)")
    c.setFont("Helvetica", 7)
    c.drawString(40, bottom_boundary_y - 20, "Company stationery footer text/legal details must remain inside this lower region.")

    # 6. Optical Crosshairs in 4 Corners (10mm inset)
    crosshair_inset = 10 * mm_pt
    ch_len = 6 * mm_pt
    c.setStrokeColor(colors.HexColor("#0F172A"))
    c.setLineWidth(0.8)

    corners = [
        (crosshair_inset, crosshair_inset),
        (w - crosshair_inset, crosshair_inset),
        (crosshair_inset, h - crosshair_inset),
        (w - crosshair_inset, h - crosshair_inset),
    ]
    for cx, cy in corners:
        c.line(cx - ch_len, cy, cx + ch_len, cy)
        c.line(cx, cy - ch_len, cx, cy + ch_len)
        c.circle(cx, cy, 2 * mm_pt, stroke=1, fill=0)

    # 7. Center Instructions & Verification Card
    card_w = 420
    card_h = 160
    card_x = (w - card_w) / 2.0
    card_y = (h - card_h) / 2.0

    c.setFillColor(colors.HexColor("#FFFFFF"))
    c.setStrokeColor(colors.HexColor("#0F172A"))
    c.setLineWidth(1)
    c.roundRect(card_x, card_y, card_w, card_h, 6, fill=1, stroke=1)

    # Card header bar
    c.setFillColor(colors.HexColor("#0F172A"))
    c.roundRect(card_x, card_y + card_h - 26, card_w, 26, 6, fill=1, stroke=0)
    c.rect(card_x, card_y + card_h - 26, card_w, 10, fill=1, stroke=0)

    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(colors.HexColor("#FFFFFF"))
    c.drawCentredString(w / 2.0, card_y + card_h - 17, "LAREA ERP • PHYSICAL LETTERHEAD ALIGNMENT CALIBRATION")

    # Instructions text
    c.setFillColor(colors.HexColor("#1E293B"))
    lines = [
        "1. PRINT AT 100% SCALE: Ensure your PDF viewer has scaling set to 'Actual Size' (100%).",
        "2. BACKLIGHT TEST: Place this printed sheet over your physical company letterhead against a light source.",
        f"3. HEADER CHECK: Confirm pre-printed stationery logo/title fits entirely ABOVE the Red Line ({lh_top_mm:.0f} mm).",
        f"4. FOOTER CHECK: Confirm pre-printed stationery footer fits entirely BELOW the Amber Line ({lh_bottom_mm:.0f} mm).",
        "5. FINE-TUNING: If stationery overlaps, adjust Spacing in Settings -> Paper & Document Layout.",
    ]
    curr_y = card_y + card_h - 44
    c.setFont("Helvetica", 7.5)
    for line in lines:
        c.drawString(card_x + 16, curr_y, line)
        curr_y -= 16

    # Generated timestamp
    c.setFont("Helvetica", 6.5)
    c.setFillColor(colors.HexColor("#64748B"))
    c.drawCentredString(w / 2.0, card_y + 10, f"Calibrated for Page Size: A4 (210 × 297 mm) • Generated on {datetime.datetime.now().strftime('%Y-%m-%d %H:%M UTC')}")

    c.showPage()
    c.save()
    return buf.getvalue()

