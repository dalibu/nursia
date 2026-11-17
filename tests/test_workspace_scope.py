import pytest
from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from api.routers.assignments import stop_work_session
from api.routers.payments import create_payment, get_payment_reports
from api.schemas.payment import PaymentCreate
from database.models import (
    Assignment,
    Base,
    Payment,
    PaymentCategory,
    PaymentCategoryGroup,
    Task,
    User,
    Workspace,
)


@pytest.mark.asyncio
async def test_workspace_scope_filters_reads_and_rejects_cross_workspace_writes():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        session.add_all([
            Workspace(id=1, name="First"),
            Workspace(id=2, name="Second"),
        ])
        await session.flush()
        session.add_all([
            PaymentCategoryGroup(name="Food", code="food", workspace_id=1),
            PaymentCategoryGroup(name="Food", code="food", workspace_id=2),
        ])
        await session.commit()

    async with session_factory() as session:
        session.sync_session.info["workspace_id"] = 1
        groups = (await session.execute(select(PaymentCategoryGroup))).scalars().all()
        assert [(group.name, group.workspace_id) for group in groups] == [("Food", 1)]

        session.add(PaymentCategoryGroup(
            name="Travel",
            code="travel",
            workspace_id=2,
        ))
        with pytest.raises(PermissionError, match="another workspace"):
            await session.flush()
        await session.rollback()

    await engine.dispose()


def test_workspace_role_controls_report_permission():
    admin = User(username="workspace-admin", password_hash="hash")
    admin.workspace_role = "admin"
    worker = User(username="workspace-worker", password_hash="hash")
    worker.workspace_role = "worker"

    assert admin.has_permission("view_all_reports")
    assert not worker.has_permission("view_all_reports")


@pytest.mark.asyncio
async def test_payment_rejects_user_from_another_workspace(db_session):
    db_session.add(Workspace(id=2, name="Other workspace"))
    outsider = User(
        username="other-workspace-user",
        full_name="Other User",
        password_hash="hash",
        status="active",
    )
    group = PaymentCategoryGroup(name="Bills", code="bills", workspace_id=1)
    db_session.add_all([outsider, group])
    await db_session.flush()
    category = PaymentCategory(
        name="Utilities",
        group_id=group.id,
        workspace_id=1,
    )
    db_session.add(category)
    await db_session.flush()

    admin = User(
        id=99,
        username="workspace-admin",
        full_name="Workspace Admin",
        password_hash="hash",
        status="active",
    )
    admin.active_workspace_id = 1

    with pytest.raises(HTTPException) as error:
        await create_payment(
            PaymentCreate(
                category_id=category.id,
                amount=10,
                currency="UAH",
                payment_date=datetime.now(timezone.utc),
                payer_id=outsider.id,
            ),
            db_session,
            admin,
        )

    assert error.value.status_code == 400
    assert error.value.detail == "User is not a workspace member"


@pytest.mark.asyncio
async def test_worker_payment_report_only_includes_their_payments(db_session):
    worker = User(
        username="report-worker",
        full_name="Report Worker",
        password_hash="hash",
        status="active",
    )
    payer = User(
        username="report-payer",
        full_name="Report Payer",
        password_hash="hash",
        status="active",
    )
    unrelated_user = User(
        username="unrelated-user",
        full_name="Unrelated User",
        password_hash="hash",
        status="active",
    )
    group = PaymentCategoryGroup(
        name="Salary",
        code="salary",
        workspace_id=1,
    )
    db_session.add_all([worker, payer, unrelated_user, group])
    await db_session.flush()
    category = PaymentCategory(
        name="Wages",
        group_id=group.id,
        workspace_id=1,
    )
    db_session.add(category)
    await db_session.flush()

    now = datetime.now(timezone.utc)
    worker_payment = Payment(
        payer_id=payer.id,
        recipient_id=worker.id,
        category_id=category.id,
        amount=100,
        currency="UAH",
        payment_date=now,
        workspace_id=1,
    )
    unrelated_payment = Payment(
        payer_id=payer.id,
        recipient_id=unrelated_user.id,
        category_id=category.id,
        amount=200,
        currency="UAH",
        payment_date=now,
        workspace_id=1,
    )
    db_session.add_all([worker_payment, unrelated_payment])
    await db_session.flush()

    worker.workspace_role = "worker"
    worker.active_workspace_id = 1
    report = await get_payment_reports(
        period="day",
        start_date=now,
        end_date=now,
        db=db_session,
        current_user=worker,
    )

    assert [payment["id"] for payment in report["payments"]] == [worker_payment.id]


@pytest.mark.asyncio
async def test_worker_cannot_stop_another_members_work_session(db_session):
    owner = User(
        username="session-owner",
        full_name="Session Owner",
        password_hash="hash",
        status="active",
    )
    worker = User(
        username="other-worker",
        full_name="Other Worker",
        password_hash="hash",
        status="active",
    )
    db_session.add_all([owner, worker])
    await db_session.flush()
    assignment = Assignment(user_id=owner.id, workspace_id=1)
    db_session.add(assignment)
    await db_session.flush()
    task = Task(
        assignment_id=assignment.id,
        start_time=datetime.now(timezone.utc),
        task_type="work",
        workspace_id=1,
    )
    db_session.add(task)
    await db_session.flush()

    worker.workspace_role = "worker"
    worker.active_workspace_id = 1
    with pytest.raises(HTTPException) as error:
        await stop_work_session(task.id, db_session, worker)

    assert error.value.status_code == 403
