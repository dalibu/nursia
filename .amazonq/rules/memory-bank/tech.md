# Nursia Technology Stack

## Programming Languages & Versions

### Backend (Python)
- **Python**: 3.9+ (with backports for timezone support)
- **FastAPI**: 0.122.0+ for REST API framework
- **SQLAlchemy**: 2.0.0+ for ORM and database operations
- **Pydantic**: 2.12.0+ for data validation and settings

### Frontend (JavaScript)
- **React**: 18.2.0 for UI framework
- **Node.js**: Required for React development
- **Material-UI**: 5.11.0 for component library
- **React Router**: 6.8.0 for client-side routing

### Database
- **SQLite**: Primary database with aiosqlite async driver
- **Alembic**: 1.12.0+ for database migrations

## Core Dependencies

### Backend Framework
```
fastapi>=0.122.0          # Web framework
uvicorn[standard]>=0.38.0  # ASGI server
python-multipart>=0.0.6   # Form data handling
```

### Database & ORM
```
sqlalchemy>=2.0.0         # ORM framework
aiosqlite>=0.19.0         # Async SQLite driver
alembic>=1.12.0           # Database migrations
```

### Authentication & Security
```
python-jose[cryptography]>=3.3.0  # JWT token handling
passlib>=1.7.4                    # Password hashing
bcrypt>=4.0.0                     # Password encryption
```

### Bot Framework
```
python-telegram-bot[all]>=20.0    # Telegram Bot API
```

### Testing Framework
```
pytest>=9.0.0            # Test framework
pytest-asyncio>=1.3.0    # Async test support
pytest-cov>=4.1.0        # Coverage reporting
pytest-mock>=3.15.0      # Mocking utilities
httpx>=0.25.0            # HTTP client for testing
```

### Utilities
```
python-dotenv>=1.0.0     # Environment variable loading
pytz>=2023.3             # Timezone handling
tzdata>=2023.3           # Timezone data
```

### Frontend Dependencies
```
react: ^18.2.0                    # Core React library
react-dom: ^18.2.0               # React DOM rendering
react-router-dom: ^6.8.0         # Client-side routing
axios: ^1.3.0                    # HTTP client
@mui/material: ^5.11.0           # Material-UI components
@mui/icons-material: ^5.11.0     # Material-UI icons
@emotion/react: ^11.10.0         # CSS-in-JS styling
@emotion/styled: ^11.10.0        # Styled components
crypto-js: ^4.1.1                # Cryptographic utilities
```

## Build Systems & Tools

### Conda Environment Setup
```bash
# Create conda environment
conda create -n nursia python=3.9

# Activate environment
conda activate nursia

# All operations must be performed in nursia environment
```

### Backend Development
```bash
# Activate conda environment (required for all operations)
conda activate nursia

# Install dependencies
pip install -r requirements.txt

# Database setup
cd database && alembic upgrade head

# Run development server
python scripts/run_api.py

# Run tests
python scripts/run_tests.py
```

### Frontend Development
```bash
# Install dependencies
cd frontend && npm install

# Start development server
npm start

# Build for production
npm run build

# Run tests
npm test
```

### Docker Development
```bash
# Start all services
docker-compose up -d

# Build and restart
docker-compose up --build

# View logs
docker-compose logs -f
```

## Development Commands

### Database Management
```bash
# Activate conda environment first
conda activate nursia

# Create new migration
cd database && alembic revision --autogenerate -m "description"

# Apply migrations
cd database && alembic upgrade head

# Initialize data
python scripts/init_categories.py
python scripts/init_currencies.py
python scripts/init_settings.py
```

### User Management
```bash
# Activate conda environment first
conda activate nursia

# Create admin user
python scripts/create_admin.py

# Reset admin password
python scripts/reset_admin_password.py
```

### Testing & Quality
```bash
# Activate conda environment first
conda activate nursia

# Run all tests
python scripts/run_tests.py

# Run with coverage
python scripts/run_tests.py --coverage

# Run specific test file
pytest tests/test_api.py -v
```

### Deployment
```bash
# Activate conda environment first
conda activate nursia

# Deploy application
python scripts/deploy.py

# Build frontend for production
python scripts/build_frontend.py
```

## Configuration Management

### Environment Variables (.env)
```env
TELEGRAM_TOKEN=your_bot_token_here
ADMIN_IDS=[123456789]
DB_URL=sqlite+aiosqlite:///./data/nursia.db
SECRET_KEY=your_secret_key_here
```

### Docker Configuration
- **docker-compose.yml**: Multi-service orchestration
- **Dockerfile**: Container definition for the application
- **Frontend proxy**: Configured to proxy API requests to backend

### Development vs Production
- Development: SQLite database, hot reload, debug mode
- Production: Containerized deployment, optimized builds, security hardening

## IDE & Development Environment

### Recommended Setup
- **Conda Environment**: All Python dependencies installed in `nursia` conda environment
- **Python 3.9+**: Managed through conda environment
- **Node.js 16+**: For frontend development
- **Docker & Docker Compose**: For containerized development
- **IDE Configuration**: Configure IDE to use conda `nursia` environment

### Code Quality Tools
- pytest for testing with async support
- Coverage reporting with pytest-cov
- Environment-based configuration management
- Alembic for database version control