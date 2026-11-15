# Nursia

Payment tracking service for household spending management with multi-currency support.

## Features

- **REST API** with FastAPI for payment management
- **OAuth Authentication** with JWT tokens
- **Database** with migrations (Alembic + SQLite)
- **Telegram Bot** for mobile access
- **React Frontend** (SPA с Material-UI)
- **Multi-currency Support** (UAH, EUR, USD)
- **Payment Categories** management
- **Detailed Reports** with filtering by period and currency
- **CRUD Operations** for payments (create, read, update, delete)

---

## 🐳 Running with Docker (Development & Production)

### 1. Local Development
By default, `docker-compose.yml` is configured for local development with direct port access to the React frontend and FastAPI backend:

```bash
cp .env.example .env
docker compose up -d --build
docker compose exec api python scripts/create_admin.py
```

* **Frontend (SPA):** http://localhost:3000
* **Backend API (Swagger UI):** http://localhost:8000/docs

### 2. Server Deployment with HTTPS (Production)
For production environments (e.g., Oracle Cloud), the project uses **Caddy** as a reverse proxy. Caddy automatically provisions and renews Let's Encrypt SSL certificates and routes traffic to `/api` (including `wss://` WebSocket connections) and the frontend.

1. Set your domain name in the `.env` file:
   ```env
   DOMAIN_NAME=your-domain.duckdns.org
   ```

2. Start the services using the production override file:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
   docker compose exec api python scripts/create_admin.py
   ```

* **Application URL:** `https://your-domain.duckdns.org`

## Manual Installation

### 1. Install Dependencies
```bash
# Backend
pip install -r requirements.txt

# Frontend
cd frontend && npm install
```

### 2. Database Setup
```bash
# Apply migrations
cd database && alembic upgrade head

# Initialize payment categories
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

# React Frontend (в отдельном терминале)
cd frontend && npm start

# Telegram Bot
python bot/main.py
```

## API Endpoints

### Authentication
- `POST /auth/login` - User login

### Payment Categories
- `GET /payments/categories` - List categories
- `POST /payments/categories` - Create category (admin only)

### Payments
- `GET /payments/` - List payments with filtering
- `POST /payments/` - Create payment
- `PUT /payments/{id}` - Update payment
- `DELETE /payments/{id}` - Delete payment
- `GET /payments/reports` - Generate reports

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
├── frontend/              # React приложение
│   ├── public/            # Статические файлы
│   ├── src/
│   │   ├── components/    # React компоненты
│   │   ├── pages/         # Страницы приложения
│   │   ├── services/      # API клиенты
│   │   ├── App.js         # Главный компонент
│   │   └── index.js       # Точка входа
│   └── package.json       # NPM зависимости
├── api/                   # REST API
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
