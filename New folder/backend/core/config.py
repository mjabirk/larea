import os
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import model_validator

DEFAULT_INSECURE_FILE_KEY: str = "enterprise-master-sec-key-2026-aes256gcm"

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True
    )

    PROJECT_NAME: str = "Enterprise View Engine Core"
    API_V1_STR: str = "/api/v1"
    APP_ENV: str = os.getenv("APP_ENV", "development")
    
    # DragonflyDB / Redis Configuration
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")
    
    # Session Policies
    SESSION_IDLE_TIMEOUT_SECONDS: int = 30 * 60  # 30 Minutes Rolling
    SESSION_ABSOLUTE_MAX_SECONDS: int = 8 * 60 * 60  # 8 Hours Hard Cap
    
    # CIDR Network Restrictions (Internal RFC1918 & Localhost Subnets)
    ALLOWED_CIDR_NETWORKS: List[str] = [
        "127.0.0.1/32",
        "::1/128",
        "10.0.0.0/8",
        "172.16.0.0/12",
        "192.168.0.0/16",
    ]
    
    # Trusted Reverse Proxies for X-Forwarded-For evaluation
    TRUSTED_PROXIES: List[str] = [
        "127.0.0.1",
        "::1",
    ]
    
    # LDAP / Active Directory Settings
    LDAP_ENABLED: bool = os.getenv("LDAP_ENABLED", "false").lower() == "true"
    LDAP_SERVER: str = os.getenv("LDAP_SERVER", "ldap://ad.company.local:389")
    LDAP_BASE_DN: str = os.getenv("LDAP_BASE_DN", "DC=company,DC=local")
    LDAP_DOMAIN: str = os.getenv("LDAP_DOMAIN", "COMPANY")

    # Web-Based Windows SSO (Microsoft Entra ID OIDC/OAuth2 & HTTP SPNEGO/Kerberos)
    SSO_ENTRA_ENABLED: bool = os.getenv("SSO_ENTRA_ENABLED", "false").lower() == "true"
    SSO_ENTRA_TENANT_ID: str = os.getenv("SSO_ENTRA_TENANT_ID", "common")
    SSO_ENTRA_CLIENT_ID: str = os.getenv("SSO_ENTRA_CLIENT_ID", "")
    SSO_ENTRA_CLIENT_SECRET: str = os.getenv("SSO_ENTRA_CLIENT_SECRET", "")
    SSO_ENTRA_REDIRECT_URI: str = os.getenv("SSO_ENTRA_REDIRECT_URI", "http://localhost:5173")

    SSO_KERBEROS_ENABLED: bool = os.getenv("SSO_KERBEROS_ENABLED", "false").lower() == "true"
    SSO_KERBEROS_SERVICE_PRINCIPAL: str = os.getenv("SSO_KERBEROS_SERVICE_PRINCIPAL", "HTTP@erp.company.local")
    SSO_TRUST_REMOTE_USER_HEADER: bool = os.getenv("SSO_TRUST_REMOTE_USER_HEADER", "false").lower() == "true"

    SSO_AUTO_PROVISION: bool = os.getenv("SSO_AUTO_PROVISION", "true").lower() == "true"
    SSO_DEFAULT_ROLE_ID: str = os.getenv("SSO_DEFAULT_ROLE_ID", "role_user")
    SSO_AUTO_LOGIN_DEFAULT: bool = os.getenv("SSO_AUTO_LOGIN_DEFAULT", "false").lower() == "true"
    
    # PostgreSQL Configuration for Row-Level Security (RLS) & Identity
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:5432/enterprise_db")

    # Master key for AES-256-GCM file encryption at rest
    FILE_ENCRYPTION_KEY: str = os.getenv("FILE_ENCRYPTION_KEY", DEFAULT_INSECURE_FILE_KEY)

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        env = (self.APP_ENV or "").strip().lower()
        if env != "development":
            if not self.FILE_ENCRYPTION_KEY or self.FILE_ENCRYPTION_KEY == DEFAULT_INSECURE_FILE_KEY:
                raise RuntimeError(
                    f"CRITICAL SECURITY CONFIGURATION ERROR: Insecure FILE_ENCRYPTION_KEY detected in '{self.APP_ENV}' environment. "
                    "Production and non-development environments must configure a strong, unique FILE_ENCRYPTION_KEY via environment variables or .env."
                )
        return self

settings = Settings()
