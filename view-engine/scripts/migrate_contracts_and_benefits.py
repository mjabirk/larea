import asyncio
import asyncpg
import uuid
import datetime

async def migrate():
    conn = await asyncpg.connect('postgresql://postgres:postgres@127.0.0.1:5432/enterprise_db')
    print("[*] Connected to enterprise_db...")

    # 1. attendance_logs table
    print("[*] Creating / updating attendance_logs...")
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

    # 2. salary_rules table
    print("[*] Creating salary_rules...")
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

    # 3. employee_contracts table
    print("[*] Creating employee_contracts...")
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

    # 4. contract_benefit_lines table
    print("[*] Creating contract_benefit_lines...")
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

    # 5. Seed baseline salary rules
    print("[*] Seeding baseline salary rules...")
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

    # 6. Seed sample contracts and benefit lines for existing employees if empty
    contract_count = await conn.fetchval("SELECT COUNT(*) FROM employee_contracts;")
    if contract_count == 0:
        print("[*] Seeding baseline contracts for employees...")
        emps = await conn.fetch("SELECT id, employee_number, full_name, base_salary, currency, hire_date, organization_id FROM employees ORDER BY employee_number;")
        for emp in emps:
            base_wage = float(emp["base_salary"] or 20000.00)
            if base_wage <= 0:
                base_wage = 22000.00
            
            c_id = uuid.uuid4()
            ref = f"CNT-2026-{emp['employee_number'].replace('EMP-', '')}"
            start_d = emp["hire_date"] or datetime.date(2025, 1, 1)
            
            await conn.execute("""
                INSERT INTO employee_contracts (
                    id, employee_id, contract_reference, title, start_date, end_date,
                    wage_base, currency, status, notice_period_days, trial_period_days,
                    working_hours_per_week, terms_notes, organization_id
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
                );
            """, c_id, emp["id"], ref, f"Expat Fixed-Term Agreement - {emp['full_name']}",
                start_d, datetime.date(2027, 12, 31), base_wage, emp["currency"] or "QAR",
                "active", 30, 90, 40.0, "Standard bilateral enterprise contract under Qatar Labour Law No. 14 of 2004.",
                emp["organization_id"])

            # Add benefit lines for this contract
            # 1. Housing (25%)
            housing_val = round(base_wage * 0.25, 2)
            await conn.execute("""
                INSERT INTO contract_benefit_lines (id, contract_id, rule_id, calculation_type, amount_value, computed_monthly_total)
                VALUES ($1, $2, $3, $4, $5, $6);
            """, uuid.uuid4(), c_id, "ALW_HOUSING", "percentage_of_base", 25.00, housing_val)

            # 2. Transport (1000 fixed)
            await conn.execute("""
                INSERT INTO contract_benefit_lines (id, contract_id, rule_id, calculation_type, amount_value, computed_monthly_total)
                VALUES ($1, $2, $3, $4, $5, $6);
            """, uuid.uuid4(), c_id, "ALW_TRANSPORT", "fixed_amount", 1000.00, 1000.00)

            # 3. Mobile (300 fixed)
            await conn.execute("""
                INSERT INTO contract_benefit_lines (id, contract_id, rule_id, calculation_type, amount_value, computed_monthly_total)
                VALUES ($1, $2, $3, $4, $5, $6);
            """, uuid.uuid4(), c_id, "ALW_PHONE", "fixed_amount", 300.00, 300.00)

            # 4. Pension Deduction (5%)
            pension_val = round(base_wage * 0.05, 2)
            await conn.execute("""
                INSERT INTO contract_benefit_lines (id, contract_id, rule_id, calculation_type, amount_value, computed_monthly_total)
                VALUES ($1, $2, $3, $4, $5, $6);
            """, uuid.uuid4(), c_id, "DED_PENSION", "percentage_of_base", 5.00, pension_val)

    # 7. Seed attendance_logs with real employee foreign keys if empty
    att_count = await conn.fetchval("SELECT COUNT(*) FROM attendance_logs;")
    if att_count == 0:
        print("[*] Seeding sample attendance_logs linked to employees...")
        emps = await conn.fetch("SELECT id, full_name, department_id, organization_id FROM employees ORDER BY employee_number;")
        for i, emp in enumerate(emps[:4]):
            att_id = uuid.uuid4()
            now = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=i)
            c_in = now.replace(hour=8, minute=0, second=0, microsecond=0)
            c_out = now.replace(hour=17, minute=0, second=0, microsecond=0)
            
            await conn.execute("""
                INSERT INTO attendance_logs (
                    id, code, employee_id, employee_name, department, terminal_id,
                    check_in, check_out, duration_hours, status, notes, machine_ip,
                    ingestion_source, last_modified_by, organization_id
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
                );
            """, att_id, f"ATT-2026-{1001 + i}", emp["id"], emp["full_name"],
                emp["department_id"] or "Operations", "Terminal #01 (Main Lobby Gate)",
                c_in, c_out, 9.0, "verified" if i % 2 == 0 else "draft",
                "Biometric check-in recorded successfully.", "192.168.1.101",
                "ZKTeco Biometric Terminal", "System Automated Sync", emp["organization_id"])

    await conn.close()
    print("[SUCCESS] Migration and seeding complete!")

if __name__ == "__main__":
    asyncio.run(migrate())
