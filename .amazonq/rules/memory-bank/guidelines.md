# Nursia Development Guidelines

## Code Quality Standards

### Core Programming Principles
- **DRY Principle**: Always follow the "Don't Repeat Yourself" principle - eliminate code duplication by extracting common functionality into reusable functions, classes, or modules

### Python Backend Standards
- **Type Annotations**: Use comprehensive type hints with `Mapped` for SQLAlchemy models and `Optional` for nullable fields
- **Async/Await**: Consistent async patterns with `AsyncSession` for database operations
- **Path Management**: Use `sys.path.append(str(Path(__file__).parent.parent))` for module imports
- **Error Handling**: Wrap database operations in try-catch blocks with specific exception types
- **Docstrings**: Use triple-quoted docstrings for function documentation

### React Frontend Standards
- **Functional Components**: Use React hooks (`useState`, `useEffect`) over class components
- **Material-UI Integration**: Consistent use of MUI components with `sx` prop for styling
- **State Management**: Local state with hooks, avoid prop drilling through multiple levels
- **Event Handlers**: Prefix handler functions with `handle` (e.g., `handleFilterChange`, `handleDeleteClick`)
- **Component Organization**: Separate concerns with dedicated components for forms and complex UI elements

### Database Model Patterns
- **SQLAlchemy 2.0 Style**: Use `Mapped` type annotations and `mapped_column()` for all fields
- **Relationships**: Define bidirectional relationships with `back_populates`
- **Timestamps**: Include `created_at` and `updated_at` with `server_default=func.now()`
- **Enums**: Use string-based enums inheriting from `str, Enum`
- **Primary Keys**: Use auto-incrementing integer primary keys with `primary_key=True`

## Structural Conventions

### File Organization
- **Router Structure**: Organize API endpoints by domain (payments, auth, users) in separate router files
- **Schema Separation**: Keep Pydantic schemas in dedicated `schemas/` directory
- **Middleware Layering**: Separate security, logging, and CORS middleware in `middleware/` directory
- **Component Hierarchy**: React components in `components/` for reusable elements, `pages/` for route components

### Naming Conventions
- **Database Tables**: Use snake_case for table names (e.g., `payment_categories`, `user_status`)
- **API Endpoints**: RESTful naming with plural nouns (e.g., `/payments/`, `/categories`)
- **React Components**: PascalCase for component names (e.g., `PaymentsPage`, `PaymentForm`)
- **Variables**: camelCase in JavaScript, snake_case in Python
- **Constants**: UPPER_SNAKE_CASE for configuration values

### Import Organization
```python
# Standard library imports first
import sys
from pathlib import Path
from datetime import datetime, timezone

# Third-party imports
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

# Local imports last
from database.core import get_db
from api.schemas.payment import PaymentCreate
```

## API Design Patterns

### FastAPI Router Structure
- **Dependency Injection**: Use `Depends()` for database sessions and authentication
- **Response Models**: Define Pydantic response models for consistent API responses
- **Query Parameters**: Use `Query()` with validation for filtering and pagination
- **Error Handling**: Return structured HTTP exceptions with descriptive messages

### Authentication & Authorization
- **Role-Based Access**: Separate `get_current_user` and `get_admin_user` dependencies
- **JWT Tokens**: Use OAuth2 with JWT for stateless authentication
- **Permission Checks**: Implement role-based filtering in database queries
- **Access Control**: Apply `@access_control` decorator for bot handlers

### Database Operations
```python
# Standard query pattern
result = await db.execute(select(Model).options(joinedload(Model.relationship)))
items = result.scalars().all()

# Update pattern with refresh
for field, value in data.items():
    setattr(db_item, field, value)
await db.commit()
await db.refresh(db_item)
```

## Frontend Development Patterns

### React Component Structure
- **State Initialization**: Initialize complex state objects with default values
- **Effect Dependencies**: Properly manage `useEffect` dependencies to avoid infinite loops
- **Event Handling**: Use arrow functions for inline handlers, named functions for complex logic
- **Conditional Rendering**: Use logical AND (`&&`) for conditional elements, ternary for alternatives

### Material-UI Usage
- **Consistent Styling**: Use `sx` prop for component-specific styles
- **Theme Integration**: Leverage MUI theme colors and spacing
- **Responsive Design**: Use MUI breakpoints and flexible layouts
- **Icon Integration**: Import specific icons from `@mui/icons-material`

### Data Management
```javascript
// API call pattern
const loadData = async () => {
  try {
    const [dataRes, categoriesRes] = await Promise.all([
      api.getData(),
      api.getCategories()
    ]);
    setData(dataRes.data);
    setCategories(categoriesRes.data);
  } catch (error) {
    console.error('Failed to load data:', error);
  }
};
```

## Security & Performance Patterns

### Security Implementation
- **Password Hashing**: Use bcrypt with proper salt rounds
- **Input Validation**: Validate all inputs with Pydantic schemas
- **SQL Injection Prevention**: Use SQLAlchemy ORM queries, avoid raw SQL
- **CORS Configuration**: Restrict origins in production environments
- **Rate Limiting**: Implement rate limiting for bot endpoints

### Performance Optimization
- **Database Queries**: Use `joinedload()` for eager loading of relationships
- **Pagination**: Implement offset/limit pagination for large datasets
- **Caching**: Cache frequently accessed data like categories and currencies
- **Async Operations**: Use async/await consistently throughout the application

### Error Handling Patterns
```python
# Database error handling
try:
    async with AsyncSessionLocal() as session:
        await operation(session)
except SQLAlchemyError as e:
    logger.error(f"Database error: {e}")
    raise HTTPException(status_code=500, detail="Database operation failed")
```

## Testing & Quality Assurance

### Test Organization
- **Test Structure**: Mirror application structure in test directory
- **Fixtures**: Use pytest fixtures for database setup and teardown
- **Async Testing**: Use `pytest-asyncio` for testing async functions
- **Coverage**: Maintain high test coverage with `pytest-cov`

### Code Quality Tools
- **Type Checking**: Use mypy for static type checking
- **Linting**: Follow PEP 8 standards for Python code
- **Documentation**: Document complex business logic and API endpoints
- **Version Control**: Use meaningful commit messages and branch naming
- **Git Commits**: Keep commit messages under 100 characters for readability

## Configuration Management

### Environment Variables
- **Settings Pattern**: Use Pydantic Settings for configuration management
- **Environment Separation**: Separate development, testing, and production configs
- **Secret Management**: Never commit secrets, use environment variables
- **Default Values**: Provide sensible defaults for optional configuration

### Deployment Patterns
- **Docker Integration**: Use multi-stage builds for production images
- **Database Migrations**: Use Alembic for version-controlled schema changes
- **Static Files**: Serve React build files through FastAPI static file handling
- **Health Checks**: Implement health check endpoints for monitoring