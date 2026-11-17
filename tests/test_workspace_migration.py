import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

from database.models import Base
from database.workspace_migration import upgrade_workspace_schema


def test_legacy_data_moves_into_admin_owned_workspace_and_names_become_scoped():
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TABLE users (
                id INTEGER PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                email VARCHAR(100),
                full_name VARCHAR(100) NOT NULL,
                status VARCHAR(20) NOT NULL,
                force_password_change BOOLEAN NOT NULL DEFAULT 0,
                profile_setup_pending BOOLEAN NOT NULL DEFAULT 0,
                failed_login_attempts INTEGER NOT NULL DEFAULT 0,
                last_failed_login VARCHAR,
                created_at DATETIME,
                updated_at VARCHAR
            )
        """))
        connection.execute(text("CREATE TABLE roles (id INTEGER PRIMARY KEY, name VARCHAR(50))"))
        connection.execute(text("""
            CREATE TABLE user_roles (
                user_id INTEGER NOT NULL,
                role_id INTEGER NOT NULL,
                PRIMARY KEY (user_id, role_id)
            )
        """))
        connection.execute(text("""
            CREATE TABLE payment_category_groups (
                id INTEGER PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                code VARCHAR(20) UNIQUE,
                color VARCHAR(7),
                emoji VARCHAR(10),
                is_active BOOLEAN,
                created_at DATETIME
            )
        """))
        connection.execute(text("""
            CREATE TABLE payment_categories (
                id INTEGER PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                group_id INTEGER,
                description TEXT,
                created_at DATETIME
            )
        """))
        for table_name in (
            "payments",
            "employment_relations",
            "assignments",
            "tasks",
        ):
            connection.execute(text(f"CREATE TABLE {table_name} (id INTEGER PRIMARY KEY)"))

        connection.execute(text(
            "INSERT INTO users (id, username, password_hash, full_name, status) "
            "VALUES (7, 'legacy-admin', 'hash', 'Legacy Admin', 'active')"
        ))
        connection.execute(text("INSERT INTO roles (id, name) VALUES (1, 'admin')"))
        connection.execute(text("INSERT INTO user_roles (user_id, role_id) VALUES (7, 1)"))
        connection.execute(text(
            "INSERT INTO payment_category_groups (id, name, code) "
            "VALUES (2, 'Food', 'food')"
        ))
        connection.execute(text(
            "INSERT INTO payment_categories (id, name, group_id) VALUES (3, 'Groceries', 2)"
        ))
        connection.execute(text("INSERT INTO payments (id) VALUES (4)"))

        Base.metadata.create_all(bind=connection)
        upgrade_workspace_schema(connection)

        workspace = connection.execute(text(
            "SELECT id, owner_id FROM workspaces WHERE name = 'Legacy workspace'"
        )).one()
        assert workspace.owner_id == 7
        member = connection.execute(text(
            "SELECT role FROM workspace_members WHERE workspace_id = :workspace_id AND user_id = 7"
        ), {"workspace_id": workspace.id}).scalar_one()
        assert member == "admin"
        assert connection.execute(text(
            "SELECT workspace_id FROM payments WHERE id = 4"
        )).scalar_one() == workspace.id

        # A second team can use the same category names after migration.
        connection.execute(text(
            "INSERT INTO workspaces (name, owner_id, default_currency) VALUES ('Second', 7, 'USD')"
        ))
        second_workspace_id = connection.execute(text(
            "SELECT id FROM workspaces WHERE name = 'Second'"
        )).scalar_one()
        connection.execute(text(
            "INSERT INTO payment_category_groups "
            "(id, name, code, workspace_id) VALUES (8, 'Food', 'food', :workspace_id)"
        ), {"workspace_id": second_workspace_id})

        assert "workspace_id" in {
            column["name"] for column in inspect(connection).get_columns("payment_categories")
        }

    engine.dispose()


def test_existing_workspace_schema_drops_legacy_global_category_group_uniques():
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        Base.metadata.tables["workspaces"].create(connection)
        connection.execute(text(
            "INSERT INTO workspaces (id, name, default_currency) VALUES "
            "(1, 'Legacy workspace', 'UAH'), (2, 'Second workspace', 'UAH')"
        ))
        connection.execute(text("""
            CREATE TABLE payment_category_groups (
                id INTEGER PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                code VARCHAR(20),
                color VARCHAR(7) NOT NULL,
                emoji VARCHAR(10) NOT NULL,
                is_active BOOLEAN NOT NULL,
                created_at DATETIME,
                workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
                UNIQUE (name),
                UNIQUE (code),
                UNIQUE (workspace_id, name),
                UNIQUE (workspace_id, code)
            )
        """))
        connection.execute(text(
            "INSERT INTO payment_category_groups "
            "(id, name, code, color, emoji, is_active, workspace_id) "
            "VALUES (1, 'Salary', 'salary', '#11998e', '💵', 1, 1)"
        ))
        Base.metadata.create_all(bind=connection)

        upgrade_workspace_schema(connection)

        connection.execute(text(
            "INSERT INTO payment_category_groups "
            "(name, code, color, emoji, is_active, workspace_id) "
            "VALUES ('Salary', 'salary', '#11998e', '💵', 1, 2)"
        ))
        with pytest.raises(IntegrityError):
            connection.execute(text(
                "INSERT INTO payment_category_groups "
                "(name, code, color, emoji, is_active, workspace_id) "
                "VALUES ('Second salary', 'salary', '#11998e', '💵', 1, 2)"
            ))

        # Migration remains safe to run on subsequent API startups.
        upgrade_workspace_schema(connection)
        assert len(inspect(connection).get_unique_constraints(
            "payment_category_groups"
        )) >= 2

    engine.dispose()
