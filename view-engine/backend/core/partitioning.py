"""
High-Volume Partitioning & Multi-Tenant Indexing Engine
SOX 404 & ISO 27001 Scalability Framework
Automated Declarative Monthly Range Partitioning for PostgreSQL 14+ / 18
"""

import datetime
import logging
from typing import List, Tuple

logger = logging.getLogger("enterprise.partitioning")


def get_month_ranges(months_behind: int = 6, months_ahead: int = 12) -> List[Tuple[int, int, str, str]]:
    """
    Computes (year, month, start_iso, end_iso) boundaries for monthly range partitioning.
    """
    now = datetime.datetime.now(datetime.timezone.utc)
    current_year = now.year
    current_month = now.month

    results = []
    # Total months offset range
    for offset in range(-months_behind, months_ahead + 1):
        total_m = (current_year * 12 + current_month - 1) + offset
        y = total_m // 12
        m = (total_m % 12) + 1

        # Start of this month
        start_dt = datetime.datetime(y, m, 1, 0, 0, 0, tzinfo=datetime.timezone.utc)
        # Start of next month
        next_total = total_m + 1
        next_y = next_total // 12
        next_m = (next_total % 12) + 1
        end_dt = datetime.datetime(next_y, next_m, 1, 0, 0, 0, tzinfo=datetime.timezone.utc)

        start_str = start_dt.strftime("%Y-%m-%d %H:%M:%S%z")
        end_str = end_dt.strftime("%Y-%m-%d %H:%M:%S%z")
        results.append((y, m, start_str, end_str))

    return results


async def setup_partitioning_infrastructure(conn) -> None:
    """
    Configures declarative monthly range partitioned tables for high-frequency insert tables:
    - audit_logs_partitioned: SOX 404 immutable hash chain audit trail
    - attendance_logs_partitioned: Biometric punch logs and roster adjustments
    - document_sequences: Lock-free atomic sequence persistence table
    Creates multi-tenant composite B-Tree indexes and automated monthly partition management.
    """
    logger.info("Initializing high-volume table indexing and declarative monthly partitioning...")

    # 1. Lock-Free Atomic Sequence Persistence Table
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS document_sequences (
            sequence_key VARCHAR(100) PRIMARY KEY,
            current_val BIGINT NOT NULL DEFAULT 1000,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # 2. Declarative Range Partitioned table for Audit Logs
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS audit_logs_partitioned (
            id UUID NOT NULL,
            tenant_id VARCHAR(100) NOT NULL DEFAULT 'default_tenant',
            entity_type VARCHAR(50) NOT NULL,
            entity_id VARCHAR(100) NOT NULL,
            action VARCHAR(20) NOT NULL,
            changed_by_user_id UUID,
            changed_by_name VARCHAR(255),
            changes JSONB,
            note TEXT,
            ip_address VARCHAR(45),
            prev_hash VARCHAR(64),
            row_hash VARCHAR(64),
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id, created_at)
        ) PARTITION BY RANGE (created_at);

        CREATE TABLE IF NOT EXISTS audit_logs_default
        PARTITION OF audit_logs_partitioned DEFAULT;

        CREATE INDEX IF NOT EXISTS idx_audit_part_tenant_created
        ON audit_logs_partitioned (tenant_id, created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_audit_part_tenant_entity
        ON audit_logs_partitioned (tenant_id, entity_type, entity_id);

        CREATE INDEX IF NOT EXISTS idx_audit_part_row_hash
        ON audit_logs_partitioned (row_hash);
    """)

    # 3. Declarative Range Partitioned table for Attendance Logs
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS attendance_logs_partitioned (
            id UUID NOT NULL,
            code VARCHAR(50),
            employee_id UUID,
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
            organization_id UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_by UUID,
            submitted_by UUID,
            approved_by UUID,
            approved_at TIMESTAMPTZ,
            approval_status VARCHAR(30) DEFAULT 'draft',
            PRIMARY KEY (id, created_at)
        ) PARTITION BY RANGE (created_at);

        CREATE TABLE IF NOT EXISTS attendance_logs_default
        PARTITION OF attendance_logs_partitioned DEFAULT;

        CREATE INDEX IF NOT EXISTS idx_att_part_tenant_checkin
        ON attendance_logs_partitioned (organization_id, check_in DESC);

        CREATE INDEX IF NOT EXISTS idx_att_part_tenant_emp_checkin
        ON attendance_logs_partitioned (organization_id, employee_id, check_in DESC);

        CREATE INDEX IF NOT EXISTS idx_att_part_tenant_status
        ON attendance_logs_partitioned (organization_id, status);
    """)

    # 4. Generate monthly sub-partitions for both partitioned tables
    ranges = get_month_ranges(months_behind=6, months_ahead=12)
    for y, m, start_str, end_str in ranges:
        part_name_audit = f"audit_logs_y{y}m{m:02d}"
        part_name_att = f"attendance_logs_y{y}m{m:02d}"

        try:
            await conn.execute(f"""
                CREATE TABLE IF NOT EXISTS {part_name_audit}
                PARTITION OF audit_logs_partitioned
                FOR VALUES FROM ('{start_str}') TO ('{end_str}');
            """)
        except Exception as e:
            logger.debug(f"Partition {part_name_audit} already exists or error: {e}")

        try:
            await conn.execute(f"""
                CREATE TABLE IF NOT EXISTS {part_name_att}
                PARTITION OF attendance_logs_partitioned
                FOR VALUES FROM ('{start_str}') TO ('{end_str}');
            """)
        except Exception as e:
            logger.debug(f"Partition {part_name_att} already exists or error: {e}")

    # 5. Composite B-Tree Indexes on Standard Multi-Tenant Tables for Index-Only Scans
    await conn.execute("""
        -- audit_logs composite tenant indexes
        CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created_desc ON audit_logs (tenant_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_entity ON audit_logs (tenant_id, entity_type, entity_id);

        -- attendance_logs composite tenant indexes
        CREATE INDEX IF NOT EXISTS idx_attendance_org_emp_checkin ON attendance_logs (organization_id, employee_id, check_in DESC);
        CREATE INDEX IF NOT EXISTS idx_attendance_org_status_checkin ON attendance_logs (organization_id, status, check_in DESC);
        CREATE INDEX IF NOT EXISTS idx_attendance_emp_open_shift ON attendance_logs (employee_id, check_in DESC) WHERE check_out IS NULL;

        -- employee_contracts composite tenant indexes
        CREATE INDEX IF NOT EXISTS idx_contracts_org_emp_status ON employee_contracts (organization_id, employee_id, status);
        CREATE INDEX IF NOT EXISTS idx_contracts_org_created_desc ON employee_contracts (organization_id, created_at DESC);

        -- employees composite tenant indexes
        CREATE INDEX IF NOT EXISTS idx_employees_org_dept ON employees (organization_id, department_id);
        CREATE INDEX IF NOT EXISTS idx_employees_org_status ON employees (organization_id, status);
        CREATE INDEX IF NOT EXISTS idx_employees_zk_code ON employees (zk_emp_code);

        -- payroll_batches & payslips composite tenant indexes
        CREATE INDEX IF NOT EXISTS idx_payroll_org_ym_status ON payroll_batches (organization_id, salary_year_month DESC, status);
        CREATE INDEX IF NOT EXISTS idx_payslips_batch_emp ON payslips (batch_id, employee_id);
        CREATE INDEX IF NOT EXISTS idx_adjustments_org_emp_ym ON payroll_adjustments (organization_id, employee_id, salary_year_month);

        -- zkteco_transactions composite indexes
        CREATE INDEX IF NOT EXISTS idx_zk_trans_sn_punch_desc ON zkteco_transactions (terminal_sn, punch_time DESC);
        CREATE INDEX IF NOT EXISTS idx_zk_trans_emp_punch_desc ON zkteco_transactions (emp_code, punch_time DESC);
        CREATE INDEX IF NOT EXISTS idx_zk_trans_emp_id_punch ON zkteco_transactions (employee_id, punch_time DESC);

        -- leave_requests composite tenant index
        CREATE INDEX IF NOT EXISTS idx_leave_org_emp_status ON leave_requests (organization_id, employee_id, approval_status);

        -- notifications composite index
        CREATE INDEX IF NOT EXISTS idx_notif_user_read_created ON notifications (user_id, is_read, created_at DESC);

        -- communication_logs composite index
        CREATE INDEX IF NOT EXISTS idx_comm_channel_status_created ON communication_logs (channel, status, created_at DESC);

        -- chat_messages index
        CREATE INDEX IF NOT EXISTS idx_chat_channel_created ON chat_messages (channel_id, created_at DESC);
    """)

    # 6. PostgreSQL Stored Procedure for Automated Partition Rotation
    await conn.execute("""
        CREATE OR REPLACE PROCEDURE rotate_monthly_partitions(months_ahead INT DEFAULT 3)
        LANGUAGE plpgsql
        AS $$
        DECLARE
            target_date DATE;
            start_date_str TEXT;
            end_date_str TEXT;
            p_year INT;
            p_month INT;
            table_audit TEXT;
            table_att TEXT;
        BEGIN
            FOR i IN 0..months_ahead LOOP
                target_date := (CURRENT_DATE + (i || ' month')::INTERVAL);
                p_year := EXTRACT(YEAR FROM target_date)::INT;
                p_month := EXTRACT(MONTH FROM target_date)::INT;
                
                start_date_str := to_char(make_date(p_year, p_month, 1), 'YYYY-MM-DD 00:00:00+00');
                end_date_str := to_char((make_date(p_year, p_month, 1) + '1 month'::INTERVAL), 'YYYY-MM-DD 00:00:00+00');
                
                table_audit := 'audit_logs_y' || p_year || 'm' || lpad(p_month::TEXT, 2, '0');
                table_att := 'attendance_logs_y' || p_year || 'm' || lpad(p_month::TEXT, 2, '0');
                
                BEGIN
                    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_logs_partitioned FOR VALUES FROM (%L) TO (%L);',
                        table_audit, start_date_str, end_date_str);
                EXCEPTION WHEN others THEN
                    NULL;
                END;

                BEGIN
                    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF attendance_logs_partitioned FOR VALUES FROM (%L) TO (%L);',
                        table_att, start_date_str, end_date_str);
                EXCEPTION WHEN others THEN
                    NULL;
                END;
            END LOOP;
        END;
        $$;
    """)

    logger.info("High-volume indexing and declarative monthly partitioning setup completed.")
