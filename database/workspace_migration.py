import sqlalchemy as sa
from sqlalchemy import inspect, text
from alembic.migration import MigrationContext
from alembic.operations import Operations

from database.models import Base


WORKSPACE_TABLES = (
    "payment_category_groups",
    "payment_categories",
    "payments",
    "employment_relations",
    "assignments",
    "tasks",
)


def upgrade_workspace_schema(connection):
    inspector = inspect(connection)
    original_tables = set(inspector.get_table_names())
    legacy_schema = "workspaces" not in original_tables

    new_tables = [
        Base.metadata.tables[table_name]
        for table_name in (
            "workspaces",
            "workspace_members",
            "workspace_invites",
            "email_verifications",
            "workspace_settings",
        )
    ]
    Base.metadata.create_all(bind=connection, tables=new_tables)

    user_columns = {column["name"] for column in inspect(connection).get_columns("users")}
    if "email_verified" not in user_columns:
        connection.execute(text(
            "ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE"
        ))

    missing_columns = set()
    for table_name in WORKSPACE_TABLES:
        columns = {column["name"] for column in inspect(connection).get_columns(table_name)}
        if "workspace_id" not in columns:
            connection.execute(text(
                f"ALTER TABLE {table_name} ADD COLUMN workspace_id INTEGER REFERENCES workspaces(id)"
            ))
            missing_columns.add(table_name)

    if legacy_schema or _needs_legacy_backfill(connection):
        _migrate_legacy_data(connection)

    if missing_columns:
        _make_workspace_columns_required(connection, missing_columns)

    connection.execute(text(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_users_verified_email "
        "ON users (lower(email)) "
        "WHERE email IS NOT NULL AND email != '' AND email_verified = 1"
    ))
    for table_name in (*WORKSPACE_TABLES, "workspace_settings"):
        connection.execute(text(
            f"CREATE INDEX IF NOT EXISTS ix_{table_name}_workspace_id "
            f"ON {table_name} (workspace_id)"
        ))


def _needs_legacy_backfill(connection):
    user_count = connection.execute(text("SELECT COUNT(*) FROM users")).scalar_one()
    member_count = connection.execute(text("SELECT COUNT(*) FROM workspace_members")).scalar_one()
    unassigned_tenant_rows = sum(
        connection.execute(
            text(f"SELECT COUNT(*) FROM {table_name} WHERE workspace_id IS NULL")
        ).scalar_one()
        for table_name in WORKSPACE_TABLES
    )
    return unassigned_tenant_rows > 0 or (user_count > 0 and member_count == 0)


def _migrate_legacy_data(connection):
    user_count = connection.execute(text("SELECT COUNT(*) FROM users")).scalar_one()
    tenant_rows = sum(
        connection.execute(text(f"SELECT COUNT(*) FROM {table_name}")).scalar_one()
        for table_name in WORKSPACE_TABLES
    )
    if not user_count and not tenant_rows:
        return

    owner_id = connection.execute(text(
        """
        SELECT users.id
        FROM users
        LEFT JOIN user_roles ON user_roles.user_id = users.id
        LEFT JOIN roles ON roles.id = user_roles.role_id
        ORDER BY CASE WHEN roles.name = 'admin' THEN 0 ELSE 1 END, users.id
        LIMIT 1
        """
    )).scalar_one_or_none()

    workspace_id = connection.execute(text(
        "SELECT id FROM workspaces WHERE name = 'Legacy workspace' ORDER BY id LIMIT 1"
    )).scalar_one_or_none()
    if workspace_id is None:
        result = connection.execute(text(
            "INSERT INTO workspaces (name, owner_id, default_currency) "
            "VALUES ('Legacy workspace', :owner_id, 'UAH')"
        ), {"owner_id": owner_id})
        workspace_id = result.lastrowid
    elif owner_id is not None:
        connection.execute(text(
            "UPDATE workspaces SET owner_id = COALESCE(owner_id, :owner_id) WHERE id = :workspace_id"
        ), {"owner_id": owner_id, "workspace_id": workspace_id})

    for table_name in WORKSPACE_TABLES:
        connection.execute(text(
            f"UPDATE {table_name} SET workspace_id = :workspace_id WHERE workspace_id IS NULL"
        ), {"workspace_id": workspace_id})

    if owner_id is not None:
        connection.execute(text(
            """
            INSERT INTO workspace_members (workspace_id, user_id, role)
            SELECT :workspace_id, users.id,
                   CASE WHEN EXISTS (
                       SELECT 1 FROM user_roles
                       JOIN roles ON roles.id = user_roles.role_id
                       WHERE user_roles.user_id = users.id AND roles.name = 'admin'
                   ) THEN 'admin' ELSE 'worker' END
            FROM users
            WHERE NOT EXISTS (
                SELECT 1 FROM workspace_members
                WHERE workspace_members.workspace_id = :workspace_id
                  AND workspace_members.user_id = users.id
            )
            """
        ), {"workspace_id": workspace_id})


def _make_workspace_columns_required(connection, table_names):
    operations = Operations(MigrationContext.configure(connection))

    for table_name in sorted(table_names):
        reflect_args = []
        if table_name == "payment_category_groups":
            reflect_args = [
                sa.Column("name", sa.String(100), nullable=False, unique=False),
                sa.Column("code", sa.String(20), nullable=True, unique=False),
            ]
        elif table_name == "payment_categories":
            reflect_args = [sa.Column("name", sa.String(100), nullable=False, unique=False)]

        with operations.batch_alter_table(table_name, reflect_args=reflect_args) as batch:
            batch.alter_column(
                "workspace_id",
                existing_type=sa.Integer(),
                nullable=False,
            )
            if table_name == "payment_category_groups":
                batch.create_unique_constraint(
                    "uq_payment_group_workspace_name", ["workspace_id", "name"]
                )
                batch.create_unique_constraint(
                    "uq_payment_group_workspace_code", ["workspace_id", "code"]
                )
            elif table_name == "payment_categories":
                batch.create_unique_constraint(
                    "uq_payment_category_workspace_name", ["workspace_id", "name"]
                )
