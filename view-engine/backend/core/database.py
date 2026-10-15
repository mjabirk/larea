import json
import logging
import datetime
import uuid
from typing import Optional, Dict, Any, List
import asyncpg
import bcrypt
from backend.core.config import settings

logger = logging.getLogger("enterprise.db")

db_pool: Optional[asyncpg.Pool] = None

def clean_dsn(url: str) -> str:
    """Normalize asyncpg connection string."""
    if url.startswith("postgresql+asyncpg://"):
        return "postgresql://" + url[len("postgresql+asyncpg://"):]
    return url

async def init_db_pool() -> asyncpg.Pool:
    """Initialize asyncpg connection pool and verify schema."""
    global db_pool
    dsn = clean_dsn(settings.DATABASE_URL)
    try:
        db_pool = await asyncpg.create_pool(
            dsn,
            min_size=1,
            max_size=10,
            command_timeout=60,
        )
        logger.info("PostgreSQL database pool initialized successfully.")
        await init_schema()
        return db_pool
    except Exception as e:
        logger.error(f"Failed to initialize PostgreSQL pool: {e}")
        raise

async def close_db_pool():
    """Close asyncpg connection pool."""
    global db_pool
    if db_pool:
        await db_pool.close()
        db_pool = None
        logger.info("PostgreSQL database pool closed.")

def get_db_pool() -> asyncpg.Pool:
    """Retrieve active connection pool."""
    if not db_pool:
        raise RuntimeError("Database connection pool is not initialized.")
    return db_pool

def hash_password(password: str) -> str:
    """Generate bcrypt password hash with 72-byte safe truncation (Bcrypt DoS mitigation)."""
    pwd_bytes = (password or "").encode("utf-8")[:72]
    return bcrypt.hashpw(pwd_bytes, bcrypt.gensalt()).decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify plain password against bcrypt hash with 72-byte safe truncation."""
    try:
        if not plain_password or not hashed_password:
            return False
        pwd_bytes = plain_password.encode("utf-8")[:72]
        return bcrypt.checkpw(pwd_bytes, hashed_password.encode("utf-8"))
    except Exception:
        return False

# ==============================================================================
# SCHEMA INITIALIZATION & SYSTEM SEEDING
# ==============================================================================
async def init_schema():
    """Ensure required tables, constraints, and default roles exist."""
    pool = get_db_pool()
    async with pool.acquire() as conn:
        # 1. System Metadata table (centralized initialization state)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS system_metadata (
                key VARCHAR(100) PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # 2. Roles & Permissions table
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS roles (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                code VARCHAR(50),
                description TEXT,
                badge_color VARCHAR(50) DEFAULT 'slate',
                is_system BOOLEAN DEFAULT false,
                permissions JSONB DEFAULT '{}'::jsonb,
                menu_access JSONB DEFAULT '[]'::jsonb,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # 3. Organizations table
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS organizations (
                id UUID PRIMARY KEY,
                legal_name VARCHAR(255) NOT NULL,
                tax_id VARCHAR(100),
                base_currency VARCHAR(10) DEFAULT 'USD',
                default_timezone VARCHAR(50) DEFAULT 'UTC',
                default_locale VARCHAR(10) DEFAULT 'en',
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # 4. Branches table
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS branches (
                id UUID PRIMARY KEY,
                organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                code VARCHAR(50),
                city VARCHAR(100),
                ip_allowlist JSONB DEFAULT '["127.0.0.1/32"]'::jsonb,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # 5. Users table
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                full_name VARCHAR(255) NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                status VARCHAR(20) DEFAULT 'active',
                is_superadmin BOOLEAN DEFAULT false,
                organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
                branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
                role_id VARCHAR(50) REFERENCES roles(id) ON DELETE SET NULL,
                department VARCHAR(100) DEFAULT 'General',
                allowed_cidrs VARCHAR(255) DEFAULT '0.0.0.0/0',
                date_of_birth VARCHAR(50),
                age INT,
                guardian_name VARCHAR(255),
                guardian_email VARCHAR(255),
                totp_secret VARCHAR(64),
                is_2fa_enabled BOOLEAN DEFAULT false,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_users_email ON users(LOWER(email));
            ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(64);
            ALTER TABLE users ADD COLUMN IF NOT EXISTS is_2fa_enabled BOOLEAN DEFAULT false;
        """)

        # 6. Persistent API Keys table (headless biometrics & daemon authentication)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS api_keys (
                id VARCHAR(50) PRIMARY KEY,
                key_hash VARCHAR(64) UNIQUE NOT NULL,
                owner VARCHAR(255) NOT NULL,
                role VARCHAR(50) DEFAULT 'service_daemon',
                allowed_cidrs JSONB DEFAULT '[]'::jsonb,
                scopes JSONB DEFAULT '["attendance:sync"]'::jsonb,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
        """)

        # 6b. Employee Grades table (Corporate hierarchy & Grade-based allowance matrix)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS employee_grades (
                id VARCHAR(50) PRIMARY KEY,
                code VARCHAR(30) NOT NULL,
                name VARCHAR(120) NOT NULL,
                rank_order INT DEFAULT 1,
                description TEXT,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # 7. Employees table (International workforce, immigration & statutory WPS banking)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS employees (
                id UUID PRIMARY KEY,
                employee_number VARCHAR(50) UNIQUE NOT NULL,
                first_name VARCHAR(100) NOT NULL,
                last_name VARCHAR(100) NOT NULL,
                full_name VARCHAR(255) NOT NULL,
                display_name_local VARCHAR(255),
                gender VARCHAR(20),
                date_of_birth DATE,
                marital_status VARCHAR(50),
                nationality VARCHAR(100),
                
                job_title VARCHAR(150),
                department_id VARCHAR(100) DEFAULT 'Operations',
                branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
                manager_id UUID REFERENCES employees(id) ON DELETE SET NULL,
                employment_type VARCHAR(50) DEFAULT 'Full-Time',
                hire_date DATE,
                probation_end_date DATE,
                contract_end_date DATE,
                status VARCHAR(50) DEFAULT 'Active',
                
                national_id_number VARCHAR(100),
                national_id_expiry DATE,
                passport_number VARCHAR(100),
                passport_expiry DATE,
                visa_number VARCHAR(100),
                visa_expiry DATE,
                work_permit_status VARCHAR(50) DEFAULT 'Valid',
                
                work_email VARCHAR(255),
                personal_email VARCHAR(255),
                phone_country_code VARCHAR(10) DEFAULT '+974',
                phone_number VARCHAR(50),
                emergency_contact_name VARCHAR(255),
                emergency_contact_phone VARCHAR(50),
                emergency_contact_relation VARCHAR(100),
                
                base_salary NUMERIC(15,2) DEFAULT 0,
                currency VARCHAR(10) DEFAULT 'QAR',
                payment_method VARCHAR(50) DEFAULT 'Bank Transfer / WPS',
                bank_name VARCHAR(150),
                bank_iban VARCHAR(100),
                bank_swift VARCHAR(50),
                
                organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
                grade_id VARCHAR(50) REFERENCES employee_grades(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_employees_number ON employees(employee_number);
            CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
            ALTER TABLE employees ADD COLUMN IF NOT EXISTS grade_id VARCHAR(50) REFERENCES employee_grades(id) ON DELETE SET NULL;
            CREATE INDEX IF NOT EXISTS idx_employees_grade ON employees(grade_id);
            ALTER TABLE employees ADD COLUMN IF NOT EXISTS zk_emp_code VARCHAR(50);
            ALTER TABLE employees ADD COLUMN IF NOT EXISTS zk_pin VARCHAR(20);
            ALTER TABLE employees ADD COLUMN IF NOT EXISTS zk_card_no VARCHAR(50);
            ALTER TABLE employees ADD COLUMN IF NOT EXISTS zk_is_admin BOOLEAN DEFAULT false;
            ALTER TABLE employees ADD COLUMN IF NOT EXISTS zk_access_enabled BOOLEAN DEFAULT true;
            ALTER TABLE employees ADD COLUMN IF NOT EXISTS zk_has_face BOOLEAN DEFAULT false;
            ALTER TABLE employees ADD COLUMN IF NOT EXISTS zk_finger_count INT DEFAULT 0;
            ALTER TABLE employees ADD COLUMN IF NOT EXISTS zk_palm_count INT DEFAULT 0;
            UPDATE employees SET zk_emp_code = REPLACE(employee_number, 'EMP-', '') WHERE zk_emp_code IS NULL;
            CREATE INDEX IF NOT EXISTS idx_employees_zk_code ON employees(zk_emp_code);
        """)

        # 8. Encrypted Employee Document Vault table (Physical filesystem storage)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS employee_documents (
                id UUID PRIMARY KEY,
                employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
                document_type VARCHAR(50) NOT NULL,
                original_filename VARCHAR(255) NOT NULL,
                file_size_bytes BIGINT NOT NULL,
                mime_type VARCHAR(100) NOT NULL,
                sha256_checksum VARCHAR(64) NOT NULL,
                storage_path TEXT NOT NULL,
                is_encrypted BOOLEAN DEFAULT true,
                uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_employee_docs_emp ON employee_documents(employee_id);
        """)

        # 9. Audit Logs & Record Chatter table (Field-level tracking & notes)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                id UUID PRIMARY KEY,
                entity_type VARCHAR(50) NOT NULL,
                entity_id VARCHAR(100) NOT NULL,
                action VARCHAR(20) NOT NULL,
                changed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                changed_by_name VARCHAR(255),
                changes JSONB,
                note TEXT,
                ip_address VARCHAR(45),
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
            CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
        """)

        # 10. Attendance Logs table (Relational employee foreign key & inherited department)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS attendance_logs (
                id UUID PRIMARY KEY,
                code VARCHAR(50) UNIQUE,
                employee_id UUID REFERENCES employees(id) ON DELETE RESTRICT,
                employee_name VARCHAR(255) NOT NULL,
                department VARCHAR(100),
                terminal_id VARCHAR(100),
                check_in TIMESTAMPTZ NOT NULL,
                check_out TIMESTAMPTZ,
                duration_hours NUMERIC(5, 2) DEFAULT 0,
                status VARCHAR(30) DEFAULT 'draft',
                notes TEXT,
                machine_ip VARCHAR(50),
                ingestion_source VARCHAR(100) DEFAULT 'Manual HR Entry',
                ingestion_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                last_modified_by VARCHAR(255),
                organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_attendance_logs_emp ON attendance_logs(employee_id);
            CREATE INDEX IF NOT EXISTS idx_attendance_logs_check_in ON attendance_logs(check_in DESC);
            ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employees(id) ON DELETE RESTRICT;
            ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS department VARCHAR(100);
        """)

        # 10b. ZKTeco ADMS Biometric Hardware & Access Control tables
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS zkteco_access_groups (
                id UUID PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                description TEXT,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS zkteco_terminals (
                id UUID PRIMARY KEY,
                sn VARCHAR(100) UNIQUE NOT NULL,
                alias VARCHAR(150) NOT NULL,
                group_id UUID REFERENCES zkteco_access_groups(id) ON DELETE SET NULL,
                branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
                state VARCHAR(20) DEFAULT 'active',
                is_enrollment_terminal BOOLEAN DEFAULT false,
                time_offset_hours NUMERIC(4,2) DEFAULT 0.0,
                last_activity TIMESTAMPTZ,
                ip_address VARCHAR(50),
                lan_ip_address VARCHAR(50),
                attlog_stamp VARCHAR(50) DEFAULT '0',
                operlog_stamp VARCHAR(50) DEFAULT '0',
                biotemplate_stamp VARCHAR(50) DEFAULT '0',
                user_count INT DEFAULT 0,
                finger_count INT DEFAULT 0,
                face_count INT DEFAULT 0,
                palm_count INT DEFAULT 0,
                fp_algo VARCHAR(30) DEFAULT '10',
                face_algo VARCHAR(30) DEFAULT 'unknown',
                palm_algo VARCHAR(30) DEFAULT 'unknown',
                operlog TEXT DEFAULT '',
                track_power_events BOOLEAN DEFAULT true,
                track_verify_failures BOOLEAN DEFAULT true,
                track_menu_settings BOOLEAN DEFAULT true,
                track_enrollments BOOLEAN DEFAULT true,
                track_deletions BOOLEAN DEFAULT true,
                track_unlocked_door BOOLEAN DEFAULT true,
                track_alarm_tamper BOOLEAN DEFAULT true,
                track_alarm_door BOOLEAN DEFAULT true,
                track_alarm_other BOOLEAN DEFAULT true,
                organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_zk_terminals_sn ON zkteco_terminals(sn);

            CREATE TABLE IF NOT EXISTS zkteco_biometric_templates (
                id UUID PRIMARY KEY,
                emp_code VARCHAR(50) NOT NULL,
                fid VARCHAR(30) NOT NULL,
                template_type VARCHAR(10) NOT NULL,
                major_ver VARCHAR(20) DEFAULT '10',
                minor_ver VARCHAR(20) DEFAULT '0',
                template_data TEXT NOT NULL,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (emp_code, fid, template_type, major_ver)
            );
            CREATE INDEX IF NOT EXISTS idx_zk_bio_emp ON zkteco_biometric_templates(emp_code);

            CREATE TABLE IF NOT EXISTS zkteco_command_queue (
                id SERIAL PRIMARY KEY,
                terminal_sn VARCHAR(100) NOT NULL,
                command_text TEXT NOT NULL,
                status VARCHAR(20) DEFAULT 'pending',
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_zk_cmd_sn_status ON zkteco_command_queue(terminal_sn, status);

            CREATE TABLE IF NOT EXISTS zkteco_transactions (
                id UUID PRIMARY KEY,
                emp_code VARCHAR(50) NOT NULL,
                employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
                employee_name VARCHAR(255),
                punch_time TIMESTAMPTZ NOT NULL,
                punch_state VARCHAR(60),
                terminal_sn VARCHAR(100),
                verify_method VARCHAR(50),
                processed BOOLEAN DEFAULT false,
                attendance_log_id UUID REFERENCES attendance_logs(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_zk_trans_time ON zkteco_transactions(punch_time DESC);
            CREATE INDEX IF NOT EXISTS idx_zk_trans_emp ON zkteco_transactions(emp_code);
        """)

        # 11. Salary Rules table (Declarative enterprise compensation & deduction engine)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS salary_rules (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                category VARCHAR(30) NOT NULL,
                calculation_type VARCHAR(20) NOT NULL,
                default_amount NUMERIC(10, 2) DEFAULT 0.00,
                percentage_rate NUMERIC(5, 2) DEFAULT 0.00,
                is_taxable BOOLEAN DEFAULT false,
                wps_code VARCHAR(20),
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # 11b. Salary Rule Grade Rates table (Grade-based allowance/deduction matrix)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS salary_rule_grade_rates (
                rule_id VARCHAR(50) NOT NULL REFERENCES salary_rules(id) ON DELETE CASCADE,
                grade_id VARCHAR(50) NOT NULL REFERENCES employee_grades(id) ON DELETE CASCADE,
                amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
                PRIMARY KEY (rule_id, grade_id)
            );
        """)

        # 12. Employee Contracts table (Successive multi-contract lifecycle)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS employee_contracts (
                id UUID PRIMARY KEY,
                employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
                contract_reference VARCHAR(50) NOT NULL,
                title VARCHAR(100) NOT NULL,
                start_date DATE NOT NULL,
                end_date DATE,
                wage_base NUMERIC(12, 2) NOT NULL,
                currency VARCHAR(10) DEFAULT 'QAR',
                status VARCHAR(20) DEFAULT 'draft',
                notice_period_days INT DEFAULT 30,
                trial_period_days INT DEFAULT 90,
                working_hours_per_week NUMERIC(4, 1) DEFAULT 40.0,
                terms_notes TEXT,
                organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_contracts_emp ON employee_contracts(employee_id);
            CREATE INDEX IF NOT EXISTS idx_contracts_status ON employee_contracts(status);
        """)

        # 13. Contract Benefit Lines table (Dynamic package breakdown per contract)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS contract_benefit_lines (
                id UUID PRIMARY KEY,
                contract_id UUID NOT NULL REFERENCES employee_contracts(id) ON DELETE CASCADE,
                rule_id VARCHAR(50) NOT NULL REFERENCES salary_rules(id) ON DELETE RESTRICT,
                calculation_type VARCHAR(20) NOT NULL,
                amount_value NUMERIC(10, 2) NOT NULL,
                computed_monthly_total NUMERIC(10, 2) NOT NULL,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_benefit_lines_contract ON contract_benefit_lines(contract_id);
        """)

        # 14. Payroll Batches table
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS payroll_batches (
                id UUID PRIMARY KEY,
                batch_code VARCHAR(50) UNIQUE NOT NULL,
                title VARCHAR(150) NOT NULL,
                salary_year_month VARCHAR(7) NOT NULL,
                status VARCHAR(20) DEFAULT 'draft',
                total_employees INT DEFAULT 0,
                total_base_salary NUMERIC(15, 2) DEFAULT 0,
                total_allowances NUMERIC(15, 2) DEFAULT 0,
                total_deductions NUMERIC(15, 2) DEFAULT 0,
                total_overtime_pay NUMERIC(15, 2) DEFAULT 0,
                total_net_salary NUMERIC(15, 2) DEFAULT 0,
                currency VARCHAR(10) DEFAULT 'QAR',
                organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
                created_by_name VARCHAR(255),
                locked_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_payroll_batches_ym ON payroll_batches(salary_year_month DESC);
            CREATE INDEX IF NOT EXISTS idx_payroll_batches_status ON payroll_batches(status);
        """)

        # 15. Payslips table (Individual employee computation & Qatar WPS audit)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS payslips (
                id UUID PRIMARY KEY,
                batch_id UUID NOT NULL REFERENCES payroll_batches(id) ON DELETE CASCADE,
                employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
                employee_number VARCHAR(50),
                employee_name VARCHAR(255) NOT NULL,
                department VARCHAR(100),
                job_title VARCHAR(150),
                national_id_number VARCHAR(100),
                visa_number VARCHAR(100),
                bank_name VARCHAR(150),
                bank_swift VARCHAR(50),
                bank_iban VARCHAR(100),
                working_days INT DEFAULT 30,
                verified_attendance_hours NUMERIC(6, 2) DEFAULT 0,
                overtime_hours NUMERIC(6, 2) DEFAULT 0,
                base_salary NUMERIC(12, 2) DEFAULT 0,
                housing_allowance NUMERIC(12, 2) DEFAULT 0,
                transport_allowance NUMERIC(12, 2) DEFAULT 0,
                other_allowances NUMERIC(12, 2) DEFAULT 0,
                overtime_pay NUMERIC(12, 2) DEFAULT 0,
                deductions NUMERIC(12, 2) DEFAULT 0,
                net_salary NUMERIC(12, 2) DEFAULT 0,
                bonus_pay NUMERIC(12, 2) DEFAULT 0,
                task_benefit_pay NUMERIC(12, 2) DEFAULT 0,
                loan_deduction NUMERIC(12, 2) DEFAULT 0,
                penalty_deduction NUMERIC(12, 2) DEFAULT 0,
                other_deductions NUMERIC(12, 2) DEFAULT 0,
                adjustments_breakdown JSONB DEFAULT '[]'::jsonb,
                wps_status VARCHAR(30) DEFAULT 'ready',
                notes TEXT,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            ALTER TABLE payslips ADD COLUMN IF NOT EXISTS bonus_pay NUMERIC(12, 2) DEFAULT 0;
            ALTER TABLE payslips ADD COLUMN IF NOT EXISTS task_benefit_pay NUMERIC(12, 2) DEFAULT 0;
            ALTER TABLE payslips ADD COLUMN IF NOT EXISTS loan_deduction NUMERIC(12, 2) DEFAULT 0;
            ALTER TABLE payslips ADD COLUMN IF NOT EXISTS penalty_deduction NUMERIC(12, 2) DEFAULT 0;
            ALTER TABLE payslips ADD COLUMN IF NOT EXISTS other_deductions NUMERIC(12, 2) DEFAULT 0;
            ALTER TABLE payslips ADD COLUMN IF NOT EXISTS adjustments_breakdown JSONB DEFAULT '[]'::jsonb;
            CREATE INDEX IF NOT EXISTS idx_payslips_batch ON payslips(batch_id);
            CREATE INDEX IF NOT EXISTS idx_payslips_emp ON payslips(employee_id);
        """)

        # 16. Piece-rate task & overtime preset catalog
        # 16. Piece-rate task & overtime preset catalog
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS task_rate_rules (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(120) NOT NULL,
                entry_type VARCHAR(30) NOT NULL,
                unit_label VARCHAR(30) DEFAULT 'Units',
                default_unit_rate NUMERIC(10, 2) DEFAULT 0.00,
                ot_calculation_basis VARCHAR(30) DEFAULT 'basic_only',
                ot_multiplier_pct NUMERIC(6, 2) DEFAULT 125.00,
                calculation_mode VARCHAR(30) DEFAULT 'hourly_multiplier',
                included_benefit_rules JSONB DEFAULT '[]'::jsonb,
                subtype VARCHAR(50) DEFAULT 'general',
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            ALTER TABLE task_rate_rules ADD COLUMN IF NOT EXISTS calculation_mode VARCHAR(30) DEFAULT 'hourly_multiplier';
            ALTER TABLE task_rate_rules ADD COLUMN IF NOT EXISTS included_benefit_rules JSONB DEFAULT '[]'::jsonb;
            ALTER TABLE task_rate_rules ADD COLUMN IF NOT EXISTS subtype VARCHAR(50) DEFAULT 'general';
        """)

        seed_task_rules = [
            # Overtime presets
            ("OT_BASIC_120", "Overtime 120% (Basic Only)", "overtime", "Hours", 0.00, "basic_only", 120.00, "hourly_multiplier", "[]", "overtime_basic", True),
            ("OT_BASIC_HOUSING_120", "Overtime 120% (Basic + Housing)", "overtime", "Hours", 0.00, "basic_plus_housing", 120.00, "hourly_multiplier", '["ALW_HOUSING"]', "overtime_basic_housing", True),
            ("OT_QATAR_DAY_125", "Statutory Daytime Overtime 125% (Basic)", "overtime", "Hours", 0.00, "basic_only", 125.00, "hourly_multiplier", "[]", "overtime_basic", True),
            ("OT_QATAR_HOLIDAY_150", "Night / Friday / Holiday Overtime 150% (Basic)", "overtime", "Hours", 0.00, "basic_only", 150.00, "hourly_multiplier", "[]", "overtime_basic", True),
            # Task / Trips presets
            ("TASK_TRIP_STD", "Standard Delivery / Transport Trip", "task_benefit", "Trips", 50.00, "basic_only", 100.00, "piece_rate", "[]", "trip_completion", True),
            ("TASK_TRIP_LONG", "Long-Haul Industrial / Ras Laffan Trip", "task_benefit", "Trips", 120.00, "basic_only", 100.00, "piece_rate", "[]", "trip_completion", True),
            ("TASK_SITE_INSP", "Field Site Inspection / Job Completion", "task_benefit", "Tasks", 75.00, "basic_only", 100.00, "piece_rate", "[]", "task_completion", True),
            # Bonus presets
            ("BON_PERFORMANCE", "Monthly Performance Bonus", "bonus", "Bonus", 500.00, "basic_only", 100.00, "fixed_amount", "[]", "performance_bonus", True),
            ("BON_SAFETY", "Zero-Incident Safety Award", "bonus", "Award", 500.00, "basic_only", 100.00, "piece_rate", "[]", "safety_incentive", True),
            ("BON_EID", "Eid / Festival Bonus (10% of Basic)", "bonus", "Bonus", 0.00, "basic_only", 10.00, "percentage_of_basis", "[]", "festival_bonus", True),
            ("BON_ARREARS", "Previous Month Salary Arrears", "bonus", "Arrears", 0.00, "basic_only", 100.00, "fixed_amount", "[]", "arrears_addition", True),
            # Deduction presets
            ("DED_DISCIPLINARY_DAYS", "Disciplinary Absence / Fine (Days of Basic Salary)", "deduction", "Days", 0.00, "basic_only", 100.00, "daily_rate", "[]", "disciplinary_fine", True),
            ("DED_LOAN_INST", "Company Loan / Advance Installment", "deduction", "Installment", 0.00, "basic_only", 100.00, "fixed_amount", "[]", "loan_installment", True),
            ("DED_OVERPAYMENT", "Previous Month Overpayment Recovery", "deduction", "Recovery", 0.00, "basic_only", 100.00, "fixed_amount", "[]", "overpayment_recovery", True),
            ("DED_PENALTY_FIXED", "Disciplinary Damage / Fine (Fixed QAR)", "deduction", "Fine", 0.00, "basic_only", 100.00, "fixed_amount", "[]", "disciplinary_fine", True),
        ]
        for tr_id, tr_name, tr_type, tr_unit, tr_rate, tr_basis, tr_mult, tr_mode, tr_inc, tr_sub, tr_active in seed_task_rules:
            await conn.execute("""
                INSERT INTO task_rate_rules (
                    id, name, entry_type, unit_label, default_unit_rate,
                    ot_calculation_basis, ot_multiplier_pct, calculation_mode,
                    included_benefit_rules, subtype, is_active
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    entry_type = EXCLUDED.entry_type,
                    unit_label = EXCLUDED.unit_label,
                    default_unit_rate = EXCLUDED.default_unit_rate,
                    ot_calculation_basis = EXCLUDED.ot_calculation_basis,
                    ot_multiplier_pct = EXCLUDED.ot_multiplier_pct,
                    calculation_mode = EXCLUDED.calculation_mode,
                    included_benefit_rules = EXCLUDED.included_benefit_rules,
                    subtype = EXCLUDED.subtype,
                    is_active = EXCLUDED.is_active;
            """, tr_id, tr_name, tr_type, tr_unit, tr_rate, tr_basis, tr_mult, tr_mode, tr_inc, tr_sub, tr_active)

        # 17. Multi-level approved variable benefits, overtime, task piece-rates & deductions
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS payroll_adjustments (
                id UUID PRIMARY KEY,
                code VARCHAR(50) UNIQUE NOT NULL,
                employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
                employee_number VARCHAR(50),
                employee_name VARCHAR(255) NOT NULL,
                department VARCHAR(100),
                salary_year_month VARCHAR(7) NOT NULL,
                rule_id VARCHAR(50),
                adjustment_type VARCHAR(30) NOT NULL,
                category_subtype VARCHAR(50) NOT NULL,
                title VARCHAR(150) NOT NULL,
                calculation_basis VARCHAR(40) DEFAULT 'fixed_amount',
                multiplier_pct NUMERIC(6, 2) DEFAULT 100.00,
                quantity NUMERIC(10, 2) DEFAULT 1.00,
                unit_label VARCHAR(30) DEFAULT 'Units',
                unit_rate NUMERIC(12, 2) DEFAULT 0.00,
                computed_amount NUMERIC(12, 2) NOT NULL,
                approval_status VARCHAR(30) DEFAULT 'pending_supervisor',
                submitted_by_name VARCHAR(255),
                level1_approved_by VARCHAR(255),
                level1_approved_at TIMESTAMPTZ,
                level2_approved_by VARCHAR(255),
                level2_approved_at TIMESTAMPTZ,
                rejection_reason TEXT,
                notes TEXT,
                organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            ALTER TABLE payroll_adjustments ADD COLUMN IF NOT EXISTS rule_id VARCHAR(50);
            CREATE INDEX IF NOT EXISTS idx_payroll_adj_ym_emp ON payroll_adjustments(salary_year_month, employee_id);
            CREATE INDEX IF NOT EXISTS idx_payroll_adj_status ON payroll_adjustments(approval_status);

            CREATE TABLE IF NOT EXISTS leave_types (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(120) NOT NULL,
                max_days_per_year INT DEFAULT 21,
                pay_percentage NUMERIC(5, 2) DEFAULT 100.00,
                deduction_basis_rules JSONB DEFAULT '[]'::jsonb,
                requires_attachment BOOLEAN DEFAULT false,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS leave_requests (
                id UUID PRIMARY KEY,
                code VARCHAR(50) UNIQUE NOT NULL,
                employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
                employee_number VARCHAR(50),
                employee_name VARCHAR(255) NOT NULL,
                department VARCHAR(100),
                leave_type_id VARCHAR(50) NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
                leave_type_name VARCHAR(120) NOT NULL,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                total_days INT NOT NULL,
                pay_percentage NUMERIC(5, 2) DEFAULT 100.00,
                daily_deduction_rate NUMERIC(12, 2) DEFAULT 0.00,
                computed_deduction_qar NUMERIC(12, 2) DEFAULT 0.00,
                approval_status VARCHAR(30) DEFAULT 'pending_supervisor',
                reason TEXT,
                submitted_by_name VARCHAR(255),
                level1_approved_by VARCHAR(255),
                level1_approved_at TIMESTAMPTZ,
                level2_approved_by VARCHAR(255),
                level2_approved_at TIMESTAMPTZ,
                rejection_reason TEXT,
                organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_leave_requests_emp_date ON leave_requests(employee_id, start_date);
            CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(approval_status);
        """)

        # Seed default Qatar Labour Law leave_types
        seed_leave_types = [
            ("LEAVE_ANNUAL", "Annual Paid Leave (Qatar Art. 79)", 21, 100.00, "[]", False, True),
            ("LEAVE_SICK_FULL", "Sick Leave - Tier 1 Full Pay (1-14 Days, Art. 82)", 14, 100.00, "[]", True, True),
            ("LEAVE_SICK_HALF", "Sick Leave - Tier 2 Half Pay (15-42 Days, Art. 82)", 28, 50.00, "[]", True, True),
            ("LEAVE_UNPAID", "Authorized Unpaid Leave / Absence", 30, 0.00, '["ALW_HOUSING", "ALW_TRANSPORT"]', False, True),
            ("LEAVE_MATERNITY", "Statutory Maternity Leave (50 Days, Art. 96)", 50, 100.00, "[]", True, True),
            ("LEAVE_HAJJ", "Hajj Pilgrimage Special Leave (Art. 83)", 20, 0.00, "[]", False, True),
        ]
        for lt_id, lt_name, lt_max, lt_pct, lt_ded, lt_att, lt_act in seed_leave_types:
            await conn.execute("""
                INSERT INTO leave_types (id, name, max_days_per_year, pay_percentage, deduction_basis_rules, requires_attachment, is_active)
                VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    max_days_per_year = EXCLUDED.max_days_per_year,
                    pay_percentage = EXCLUDED.pay_percentage,
                    deduction_basis_rules = EXCLUDED.deduction_basis_rules,
                    requires_attachment = EXCLUDED.requires_attachment,
                    is_active = EXCLUDED.is_active;
            """, lt_id, lt_name, lt_max, lt_pct, lt_ded, lt_att, lt_act)

        # Seed baseline salary rules if not present
        seed_rules = [
            ("ALW_HOUSING", "Housing Allowance", "allowance", "percentage_of_base", 0.00, 25.00, False, "HOUSING", True),
            ("ALW_TRANSPORT", "Transport Allowance", "allowance", "fixed_amount", 1000.00, 0.00, False, "TRANSPORT", True),
            ("ALW_PHONE", "Mobile & Telecom Utility", "allowance", "fixed_amount", 300.00, 0.00, False, "TELECOM", True),
            ("ALW_FOOD", "Food & Subsistence Allowance", "allowance", "fixed_amount", 500.00, 0.00, False, "FOOD", True),
            ("DED_PENSION", "Statutory Pension / Social Insurance", "deduction", "percentage_of_base", 0.00, 5.00, False, "GOSI", True),
        ]
        for r_id, r_name, r_cat, r_calc, r_def, r_pct, r_tax, r_wps, r_act in seed_rules:
            await conn.execute("""
                INSERT INTO salary_rules (id, name, category, calculation_type, default_amount, percentage_rate, is_taxable, wps_code, is_active)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    category = EXCLUDED.category,
                    calculation_type = EXCLUDED.calculation_type,
                    default_amount = EXCLUDED.default_amount,
                    percentage_rate = EXCLUDED.percentage_rate,
                    is_taxable = EXCLUDED.is_taxable,
                    wps_code = EXCLUDED.wps_code,
                    is_active = EXCLUDED.is_active;
            """, r_id, r_name, r_cat, r_calc, r_def, r_pct, r_tax, r_wps, r_act)

        # Seed employee grades
        seed_employee_grades = [
            ("GRADE_1", "G1", "Grade 1 — Executive & Senior Specialist", 1, "Senior management, lead engineers, and department heads", True),
            ("GRADE_2", "G2", "Grade 2 — Managerial & Senior Technical", 2, "Project managers, senior officers, and supervisors", True),
            ("GRADE_3", "G3", "Grade 3 — Operational & Technical Staff", 3, "Engineers, coordinators, and administrative specialists", True),
            ("GRADE_4", "G4", "Grade 4 — General Workforce & Support", 4, "Technicians, drivers, and field operators", True),
        ]
        for g_id, g_code, g_name, g_rank, g_desc, g_act in seed_employee_grades:
            await conn.execute("""
                INSERT INTO employee_grades (id, code, name, rank_order, description, is_active)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (id) DO UPDATE SET
                    code = EXCLUDED.code,
                    name = EXCLUDED.name,
                    rank_order = EXCLUDED.rank_order,
                    description = EXCLUDED.description,
                    is_active = EXCLUDED.is_active;
            """, g_id, g_code, g_name, g_rank, g_desc, g_act)

        # Update existing seeded employees where grade_id IS NULL
        await conn.execute("""
            UPDATE employees SET grade_id = 'GRADE_1' WHERE employee_number IN ('EMP-1001', 'EMP-1003') AND grade_id IS NULL;
            UPDATE employees SET grade_id = 'GRADE_2' WHERE employee_number = 'EMP-1002' AND grade_id IS NULL;
        """)

        # Seed baseline grade rates in salary_rule_grade_rates
        seed_grade_rates = [
            ("ALW_PHONE", "GRADE_1", 600.00),
            ("ALW_PHONE", "GRADE_2", 400.00),
            ("ALW_PHONE", "GRADE_3", 300.00),
            ("ALW_PHONE", "GRADE_4", 150.00),
            ("ALW_TRANSPORT", "GRADE_1", 2000.00),
            ("ALW_TRANSPORT", "GRADE_2", 1500.00),
            ("ALW_TRANSPORT", "GRADE_3", 1000.00),
            ("ALW_TRANSPORT", "GRADE_4", 600.00),
            ("ALW_FOOD", "GRADE_1", 800.00),
            ("ALW_FOOD", "GRADE_2", 600.00),
            ("ALW_FOOD", "GRADE_3", 500.00),
            ("ALW_FOOD", "GRADE_4", 400.00),
        ]
        for r_id, g_id, amt in seed_grade_rates:
            await conn.execute("""
                INSERT INTO salary_rule_grade_rates (rule_id, grade_id, amount)
                VALUES ($1, $2, $3)
                ON CONFLICT (rule_id, grade_id) DO UPDATE SET amount = EXCLUDED.amount;
            """, r_id, g_id, amt)

        await conn.execute("UPDATE salary_rules SET calculation_type = 'grade_based' WHERE id = 'ALW_PHONE';")

        # Seed default ZKTeco access group
        await conn.execute("""
            INSERT INTO zkteco_access_groups (id, name, description)
            VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'Doha HQ Standard Access', 'Standard corporate biometric barrier access across Qatar headquarters.')
            ON CONFLICT (name) DO NOTHING;
        """)

        # Seed initial ZKTeco terminals if empty
        term_cnt = await conn.fetchval("SELECT COUNT(*) FROM zkteco_terminals;")
        if term_cnt == 0:
            seed_terminals = [
                (
                    uuid.uuid4(),
                    "ZK-QAT-HQ01",
                    "Terminal #01 (Doha HQ Main Gate)",
                    "192.168.10.104",
                    True,
                    "10",
                    "39",
                    "12"
                ),
                (
                    uuid.uuid4(),
                    "ZK-QAT-RL02",
                    "Terminal #02 (Ras Laffan Site Gate)",
                    "172.16.80.22",
                    False,
                    "10",
                    "39",
                    "unknown"
                ),
                (
                    uuid.uuid4(),
                    "ZK-QAT-WH03",
                    "Terminal #03 (Industrial Area Warehouse)",
                    "10.0.4.12",
                    False,
                    "10",
                    "39",
                    "unknown"
                ),
            ]
            for t_id, t_sn, t_alias, t_lan_ip, t_enroll, t_fp, t_face, t_palm in seed_terminals:
                await conn.execute("""
                    INSERT INTO zkteco_terminals (
                        id, sn, alias, lan_ip_address, is_enrollment_terminal, fp_algo, face_algo, palm_algo, group_id, state
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, '00000000-0000-0000-0000-000000000001'::uuid, 'active'
                    ) ON CONFLICT (sn) DO NOTHING;
                """, t_id, t_sn, t_alias, t_lan_ip, t_enroll, t_fp, t_face, t_palm)

        # 14. Seed Baseline System Roles if not already present
        default_roles = [
            (
                "role_superadmin",
                "Superadmin",
                "SUPERADMIN",
                "Unrestricted platform authority across all tenant organizations, system policies, and security configurations.",
                "violet",
                True,
                json.dumps({
                    "attendance_logs": {"create": True, "read": True, "update": True, "delete": True},
                    "organizations": {"create": True, "read": True, "update": True, "delete": True},
                    "users": {"create": True, "read": True, "update": True, "delete": True},
                    "employees": {"create": True, "read": True, "update": True, "delete": True},
                    "employee_contracts": {"create": True, "read": True, "update": True, "delete": True},
                    "hr.contracts_read": True,
                    "hr.contracts_manage": True,
                    "hr.salary_read": True,
                    "hr.salary_manage": True,
                }),
                json.dumps(["employees", "contracts", "new_employee", "attendances", "rosters", "leaves", "hr_config", "batches", "payroll_adjustments", "eosb", "salary_rules", "wps_config", "terminals", "api_keys", "users", "roles", "orgs", "compliance_alerts"])
            ),
            (
                "role_ops_lead",
                "Operations Lead",
                "OPS_LEAD",
                "Regional operations oversight with full operational CRUD rights, attendance verification, and branch reporting.",
                "blue",
                True,
                json.dumps({
                    "attendance_logs": {"create": True, "read": True, "update": True, "delete": True},
                    "organizations": {"create": False, "read": True, "update": True, "delete": False},
                    "users": {"create": True, "read": True, "update": True, "delete": False},
                    "employees": {"create": True, "read": True, "update": True, "delete": True},
                    "employee_contracts": {"create": True, "read": True, "update": True, "delete": False},
                    "hr.contracts_read": True,
                    "hr.contracts_manage": True,
                    "hr.salary_read": False,
                    "hr.salary_manage": False,
                }),
                json.dumps(["employees", "contracts", "new_employee", "attendances", "rosters", "leaves", "batches", "payroll_adjustments", "eosb", "terminals"])
            ),
            (
                "role_supervisor",
                "Supervisor",
                "SUPERVISOR",
                "Shift supervisor with departmental attendance verification, roster scheduling, and read-only directory access.",
                "emerald",
                True,
                json.dumps({
                    "attendance_logs": {"create": True, "read": True, "update": True, "delete": False},
                    "organizations": {"create": False, "read": True, "update": False, "delete": False},
                    "users": {"create": False, "read": True, "update": False, "delete": False},
                    "employees": {"create": False, "read": True, "update": True, "delete": False},
                    "employee_contracts": {"create": False, "read": True, "update": False, "delete": False},
                    "hr.contracts_read": True,
                    "hr.contracts_manage": False,
                    "hr.salary_read": False,
                    "hr.salary_manage": False,
                }),
                json.dumps(["employees", "contracts", "attendances", "rosters", "leaves", "payroll_adjustments"])
            ),
            (
                "role_standard",
                "Standard User",
                "STANDARD_USER",
                "Base workforce member with personal self-service check-in logging and self-profile visibility.",
                "slate",
                True,
                json.dumps({
                    "attendance_logs": {"create": True, "read": True, "update": False, "delete": False},
                    "organizations": {"create": False, "read": False, "update": False, "delete": False},
                    "users": {"create": False, "read": True, "update": False, "delete": False},
                    "employees": {"create": False, "read": True, "update": False, "delete": False},
                    "employee_contracts": {"create": False, "read": False, "update": False, "delete": False},
                    "hr.contracts_read": False,
                    "hr.contracts_manage": False,
                    "hr.salary_read": False,
                    "hr.salary_manage": False,
                }),
                json.dumps(["employees", "attendances", "leaves"])
            )
        ]

        for r_id, r_name, r_code, r_desc, r_badge, r_sys, r_perms, r_menu in default_roles:
            await conn.execute("""
                INSERT INTO roles (id, name, code, description, badge_color, is_system, permissions, menu_access)
                VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    code = EXCLUDED.code,
                    description = EXCLUDED.description,
                    badge_color = EXCLUDED.badge_color,
                    is_system = EXCLUDED.is_system,
                    permissions = EXCLUDED.permissions,
                    menu_access = EXCLUDED.menu_access;
            """, r_id, r_name, r_code, r_desc, r_badge, r_sys, r_perms, r_menu)

        # 11. Seed Baseline International Employees if table is empty
        emp_count = await conn.fetchval("SELECT COUNT(*) FROM employees;")
        if emp_count == 0:
            branch_id = await conn.fetchval("SELECT id FROM branches LIMIT 1;")
            org_id = await conn.fetchval("SELECT id FROM organizations LIMIT 1;")
            admin_user_id = await conn.fetchval("SELECT id FROM users WHERE is_superadmin = true LIMIT 1;")
            
            # Sample date math relative to now (October 2026)
            seed_emps = [
                {
                    "id": "e1111111-1111-1111-1111-111111111111",
                    "employee_number": "EMP-1001",
                    "first_name": "Tariq",
                    "last_name": "Al-Mansoor",
                    "full_name": "Tariq Al-Mansoor",
                    "display_name_local": "طَارِق المَنْصُور",
                    "gender": "Male",
                    "date_of_birth": "1988-06-14",
                    "marital_status": "Married",
                    "nationality": "Qatar",
                    "job_title": "Senior Petroleum Ops Engineer",
                    "department_id": "Operations",
                    "employment_type": "Full-Time",
                    "hire_date": "2021-03-01",
                    "probation_end_date": "2021-06-01",
                    "contract_end_date": "2027-03-01",
                    "status": "Active",
                    "national_id_number": "28863401923",
                    "national_id_expiry": "2026-10-30", # Expiring in 18 days!
                    "passport_number": "P-908234A",
                    "passport_expiry": "2029-08-15",
                    "visa_number": "V-998234",
                    "visa_expiry": "2026-11-05", # Expiring in 24 days!
                    "work_permit_status": "Valid",
                    "work_email": "tariq.mansoor@company.local",
                    "personal_email": "tariq.mansoor@gmail.com",
                    "phone_country_code": "+974",
                    "phone_number": "55123456",
                    "emergency_contact_name": "Nouf Al-Mansoor",
                    "emergency_contact_phone": "+974 55998877",
                    "emergency_contact_relation": "Spouse",
                    "base_salary": 28500.00,
                    "currency": "QAR",
                    "payment_method": "Bank Transfer / WPS",
                    "bank_name": "Qatar National Bank (QNB)",
                    "bank_iban": "QA55QNBA000000001234567890123",
                    "bank_swift": "QNBAQAQA",
                },
                {
                    "id": "e2222222-2222-2222-2222-222222222222",
                    "employee_number": "EMP-1002",
                    "first_name": "Fatima",
                    "last_name": "Al-Kuwari",
                    "full_name": "Fatima Al-Kuwari",
                    "display_name_local": "فَاطِمَة الكُواري",
                    "gender": "Female",
                    "date_of_birth": "1992-11-20",
                    "marital_status": "Single",
                    "nationality": "Qatar",
                    "job_title": "HR Compliance & Immigration Lead",
                    "department_id": "Human Resources",
                    "employment_type": "Full-Time",
                    "hire_date": "2022-08-15",
                    "probation_end_date": "2022-11-15",
                    "contract_end_date": "2028-08-15",
                    "status": "Active",
                    "national_id_number": "29263409182",
                    "national_id_expiry": "2028-04-12",
                    "passport_number": "P-661209B",
                    "passport_expiry": "2031-01-20",
                    "visa_number": "V-554109",
                    "visa_expiry": "2028-04-12",
                    "work_permit_status": "Valid",
                    "work_email": "fatima.kuwari@company.local",
                    "personal_email": "fatima.k@outlook.com",
                    "phone_country_code": "+974",
                    "phone_number": "66432109",
                    "emergency_contact_name": "Khalid Al-Kuwari",
                    "emergency_contact_phone": "+974 66112233",
                    "emergency_contact_relation": "Brother",
                    "base_salary": 24000.00,
                    "currency": "QAR",
                    "payment_method": "Bank Transfer / WPS",
                    "bank_name": "Commercial Bank of Qatar (CBQ)",
                    "bank_iban": "QA12CBQA000000009876543210987",
                    "bank_swift": "CBQAQAQA",
                },
                {
                    "id": "e3333333-3333-3333-3333-333333333333",
                    "employee_number": "EMP-1003",
                    "first_name": "Johnathan",
                    "last_name": "Vance",
                    "full_name": "Johnathan Vance",
                    "display_name_local": "جُونَاثَان فَانْس",
                    "gender": "Male",
                    "date_of_birth": "1985-04-03",
                    "marital_status": "Married",
                    "nationality": "United Kingdom",
                    "job_title": "Biometrics Infrastructure Architect",
                    "department_id": "Operations",
                    "employment_type": "Contractor",
                    "hire_date": "2023-01-10",
                    "probation_end_date": "2023-04-10",
                    "contract_end_date": "2026-12-31",
                    "status": "Active",
                    "national_id_number": "28582601293",
                    "national_id_expiry": "2026-10-24", # Expiring in 12 days!
                    "passport_number": "GB-90812739",
                    "passport_expiry": "2030-05-18",
                    "visa_number": "V-110293",
                    "visa_expiry": "2026-10-24", # Expiring in 12 days!
                    "work_permit_status": "Renewal Pending",
                    "work_email": "johnathan.vance@company.local",
                    "personal_email": "jvance.eng@gmail.com",
                    "phone_country_code": "+974",
                    "phone_number": "33987654",
                    "emergency_contact_name": "Claire Vance",
                    "emergency_contact_phone": "+44 7700 900123",
                    "emergency_contact_relation": "Spouse",
                    "base_salary": 32000.00,
                    "currency": "QAR",
                    "payment_method": "Bank Transfer / WPS",
                    "bank_name": "HSBC Middle East",
                    "bank_iban": "QA78BBME000000004561237890456",
                    "bank_swift": "BBMEQAQA",
                }
            ]

            _parse_d = lambda s: datetime.date.fromisoformat(s) if s else None
            for e in seed_emps:
                await conn.execute("""
                    INSERT INTO employees (
                        id, employee_number, first_name, last_name, full_name, display_name_local,
                        gender, date_of_birth, marital_status, nationality, job_title, department_id,
                        branch_id, employment_type, hire_date, probation_end_date, contract_end_date, status,
                        national_id_number, national_id_expiry, passport_number, passport_expiry,
                        visa_number, visa_expiry, work_permit_status, work_email, personal_email,
                        phone_country_code, phone_number, emergency_contact_name, emergency_contact_phone,
                        emergency_contact_relation, base_salary, currency, payment_method, bank_name,
                        bank_iban, bank_swift, organization_id
                    ) VALUES (
                        $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                        $13::uuid, $14, $15, $16, $17, $18, $19, $20,
                        $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31,
                        $32, $33, $34, $35, $36, $37, $38, $39::uuid
                    ) ON CONFLICT (employee_number) DO NOTHING;
                """,
                    e["id"], e["employee_number"], e["first_name"], e["last_name"], e["full_name"],
                    e["display_name_local"], e["gender"], _parse_d(e["date_of_birth"]), e["marital_status"],
                    e["nationality"], e["job_title"], e["department_id"], branch_id, e["employment_type"],
                    _parse_d(e["hire_date"]), _parse_d(e["probation_end_date"]), _parse_d(e["contract_end_date"]), e["status"],
                    e["national_id_number"], _parse_d(e["national_id_expiry"]), e["passport_number"], _parse_d(e["passport_expiry"]),
                    e["visa_number"], _parse_d(e["visa_expiry"]), e["work_permit_status"], e["work_email"],
                    e["personal_email"], e["phone_country_code"], e["phone_number"], e["emergency_contact_name"],
                    e["emergency_contact_phone"], e["emergency_contact_relation"], e["base_salary"],
                    e["currency"], e["payment_method"], e["bank_name"], e["bank_iban"], e["bank_swift"], org_id
                )

                # Seed initial audit log for each employee
                await conn.execute("""
                    INSERT INTO audit_logs (
                        id, entity_type, entity_id, action, changed_by_name, note, ip_address
                    ) VALUES (
                        $1::uuid, 'employees', $2, 'CREATE', 'System Provisioner',
                        'Initial employee master record imported into International HR directory.', '127.0.0.1'
                    );
                """, str(uuid.uuid4()), e["id"])

        logger.info("PostgreSQL schema initialization and role/employee seeding completed.")
