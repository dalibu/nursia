# Nursia

Expense tracking service for household spending management with multi-currency support.

## Features

- **REST API** with FastAPI for expense management
- **OAuth Authentication** with JWT tokens
- **Database** with migrations (Alembic + SQLite)
- **Telegram Bot** for mobile access
- **Web Interface** (desktop and mobile responsive)
- **Multi-currency Support** (UAH, EUR, USD, RUB)
- **Expense Categories** and recipient management
- **Detailed Reports** with filtering by period and currency
- **CRUD Operations** for expenses (create, read, update, delete)

## Quick Start with Docker

```bash
# Start all services
docker-compose up -d

# Create admin user
docker-compose exec api python scripts/create_admin.py

# Access the application
# Web UI: http://localhost:8000/app
# Mobile UI: http://localhost:8000/mobile
# API Docs: http://localhost:8000/docs
```

## Manual Installation

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Database Setup
```bash
# Apply migrations
cd database && alembic upgrade head

# Initialize expense categories
python scripts/init_categories.py

# Initialize system settings
python scripts/init_settings.py
```

### 3. Create Admin User
```bash
python scripts/create_admin.py
```

### 4. Start Services
```bash
# REST API
python scripts/run_api.py

# Telegram Bot
python bot/main.py
```

## API Endpoints

### Authentication
- `POST /auth/login` - User login

### Expense Categories
- `GET /expenses/categories` - List categories
- `POST /expenses/categories` - Create category (admin only)

### Expenses
- `GET /expenses/` - List expenses with filtering
- `POST /expenses/` - Create expense
- `PUT /expenses/{id}` - Update expense
- `DELETE /expenses/{id}` - Delete expense
- `GET /expenses/reports` - Generate reports

### Recipients
- `GET /recipients/` - List recipients (users and organizations)
- `POST /recipients/` - Create recipient (admin only)

### Currencies
- `GET /currencies/` - Get available currencies and settings

### System Settings
- `GET /settings/` - List system settings (admin only)
- `PUT /settings/{key}` - Update setting (admin only)

## Testing

```bash
# Run all tests
python scripts/run_tests.py

# Run with coverage
python scripts/run_tests.py --coverage
```

## Project Structure

```
nursia/
├── api/                    # REST API
│   ├── auth/              # OAuth authentication
│   ├── routers/           # API endpoints
│   ├── schemas/           # Pydantic models
│   └── main.py            # FastAPI application
├── bot/                   # Telegram bot
│   ├── handlers/          # Message handlers
│   └── main.py            # Bot application
├── database/              # Database layer
│   ├── migrations/        # Alembic migrations
│   ├── alembic.ini        # Migration config
│   ├── models.py          # SQLAlchemy models
│   └── core.py            # Database connection
├── web/                   # Web interfaces
│   └── templates/         # HTML templates
├── scripts/               # Utility scripts
│   ├── deploy.py          # Deployment script
│   ├── run_api.py         # API server launcher
│   └── run_tests.py       # Test runner
├── tests/                 # Unit tests
│   └── pytest.ini         # Test configuration
├── config/                # Configuration
│   └── settings.py        # Application settings
├── data/                  # Database storage
│   └── nursia.db          # SQLite database
├── docker-compose.yml     # Docker services
├── Dockerfile             # Container definition
└── requirements.txt       # Python dependencies
```

## Configuration

Create `.env` file in the project root:

```env
TELEGRAM_TOKEN=your_bot_token_here
ADMIN_IDS=[123456789]
DB_URL=sqlite+aiosqlite:///./data/nursia.db
```

## License

MIT License
