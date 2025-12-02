# Nursia Project Structure

## Directory Organization

### Core Application Layers

#### `/api/` - REST API Backend
- **`auth/`**: OAuth authentication system with JWT tokens
- **`middleware/`**: Security, logging, and request processing middleware
- **`routers/`**: FastAPI endpoint definitions organized by domain
- **`schemas/`**: Pydantic models for request/response validation
- **`main.py`**: FastAPI application entry point

#### `/database/` - Data Layer
- **`migrations/`**: Alembic database migration files
- **`models.py`**: SQLAlchemy ORM models
- **`core.py`**: Database connection and session management
- **`crud.py`**: Database operation abstractions

#### `/frontend/` - React SPA
- **`src/components/`**: Reusable React components
- **`src/pages/`**: Application page components
- **`src/services/`**: API client and service layer
- **`src/hooks/`**: Custom React hooks
- **`public/`**: Static assets and HTML template

#### `/bot/` - Telegram Bot
- **`handlers/`**: Message and command handlers
- **`keyboards.py`**: Telegram inline keyboards
- **`middleware.py`**: Bot-specific middleware
- **`rate_limiter.py`**: Bot rate limiting

### Supporting Infrastructure

#### `/config/` - Configuration Management
- **`settings.py`**: Application configuration and environment variables

#### `/scripts/` - Utility Scripts
- Database initialization and migration scripts
- Admin user creation utilities
- Deployment and build automation
- Development server launchers

#### `/tests/` - Testing Suite
- Unit tests for all application components
- Integration tests for API endpoints
- Test configuration and fixtures

#### `/utils/` - Shared Utilities
- Password hashing and validation
- Settings management helpers
- Timezone handling utilities

#### `/web/` - Static Web Assets
- **`templates/`**: HTML templates for web interface
- **`static/`**: Static files and assets

#### `/data/` - Data Storage
- SQLite database files
- Application data persistence

## Core Components & Relationships

### Authentication Flow
```
User Request → API Middleware → OAuth Validation → JWT Token → Protected Routes
```

### Data Flow Architecture
```
Frontend/Bot → API Routers → Database CRUD → SQLAlchemy Models → SQLite
```

### Multi-Interface Design
```
React SPA ──┐
            ├── FastAPI Backend ── Database Layer
Telegram Bot ─┘
```

## Architectural Patterns

### Layered Architecture
- **Presentation Layer**: React frontend and Telegram bot
- **API Layer**: FastAPI routers and middleware
- **Business Logic**: Pydantic schemas and validation
- **Data Access**: SQLAlchemy ORM and CRUD operations
- **Persistence**: SQLite database with Alembic migrations

### Domain-Driven Organization
- **Expenses**: Core expense tracking functionality
- **Authentication**: User management and security
- **Recipients**: Payment recipient management
- **Categories**: Expense categorization system
- **Currencies**: Multi-currency support
- **Settings**: System configuration management

### Configuration Management
- Environment-based configuration with `.env` files
- Docker Compose for containerized deployment
- Separate development and production settings

### Testing Strategy
- Unit tests for individual components
- Integration tests for API endpoints
- Pytest-based testing framework
- Test fixtures and configuration isolation

## Key Design Decisions

### Database Strategy
- SQLite for simplicity and portability
- Alembic for version-controlled migrations
- SQLAlchemy ORM for database abstraction

### API Design
- RESTful endpoints with FastAPI
- Pydantic for request/response validation
- JWT tokens for stateless authentication

### Frontend Architecture
- React SPA with Material-UI components
- Service layer for API communication
- Component-based organization

### Bot Integration
- Telegram Bot API for mobile access
- Shared backend with web interface
- Rate limiting for bot protection