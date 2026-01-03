"""
Базовые тесты для User модели и RBAC
"""
import pytest
from database.models import User, Role, Permission, RoleType


class TestUserModel:
    """Тесты для модели User"""
    
    def test_user_creation(self):
        """Пользователь создаётся с правильными полями"""
        user = User(
            username="test_user",
            password_hash="hash123",
            full_name="Test User"
        )
        assert user.username == "test_user"
        assert user.full_name == "Test User"
    
    def test_role_creation(self):
        """Роль создаётся с правильными полями"""
        role = Role(
            name="test_role",
            type=RoleType.AUTH,
            description="Test role"
        )
        assert role.name == "test_role"
        assert role.type == RoleType.AUTH
    
    def test_permission_creation(self):
        """Permission создаётся с правильными полями"""
        perm = Permission(
            name="test_permission",
            description="Test permission"
        )
        assert perm.name == "test_permission"


class TestUserRoles:
    """Тесты для ролей пользователя (без БД)"""
    
    def test_user_roles_list(self):
        """Пользователь имеет список ролей"""
        user = User(username="test", password_hash="hash", full_name="Test")
        assert hasattr(user, "roles")
    
    def test_role_permissions_list(self):
        """Роль имеет список permissions"""
        role = Role(name="test", type=RoleType.AUTH)
        assert hasattr(role, "permissions")


class TestRBACProperties:
    """Тесты для RBAC свойств модели User"""
    
    def test_is_admin_property_exists(self):
        """Свойство is_admin существует"""
        user = User(username="test", password_hash="hash", full_name="Test")
        assert hasattr(user, "is_admin")
    
    def test_is_employer_property_exists(self):
        """Свойство is_employer существует"""
        user = User(username="test", password_hash="hash", full_name="Test")
        assert hasattr(user, "is_employer")
    
    def test_is_worker_property_exists(self):
        """Свойство is_worker существует"""
        user = User(username="test", password_hash="hash", full_name="Test")
        assert hasattr(user, "is_worker")
    
    def test_has_permission_method_exists(self):
        """Метод has_permission существует"""
        user = User(username="test", password_hash="hash", full_name="Test")
        assert hasattr(user, "has_permission")
        assert callable(user.has_permission)
    
    def test_has_role_method_exists(self):
        """Метод has_role существует"""
        user = User(username="test", password_hash="hash", full_name="Test")
        assert hasattr(user, "has_role")
        assert callable(user.has_role)
