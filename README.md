# Nursia

Payment tracking service for household spending management with multi-currency support.

## Features

- **REST API** with FastAPI for payment management
- **OAuth Authentication** with JWT tokens
- **Database** with migrations (Alembic + SQLite)
- **Telegram Bot** for mobile access
- **React Frontend** (SPA with Material-UI)
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

### Registration protection
Configure a Cloudflare Turnstile widget in `.env` before enabling registration:

```env
TURNSTILE_SITE_KEY=your_site_key
TURNSTILE_SECRET_KEY=your_secret_key
```

Keep the secret key private. Registration is disabled until both keys are configured and is limited to 5 attempts per IP per hour. New accounts are active with the `worker` role; the username is generated from the user's name.

#### Local Testing with Cloudflare Turnstile
For local development (`localhost`) and automated testing, use Cloudflare's official dummy keys instead of production keys:

| Key Type | Test Key | Behavior |
| :--- | :--- | :--- |
| **Site Key (Visible)** | `1x00000000000000000000AA` | Always passes |
| **Site Key (Visible)** | `2x00000000000000000000AB` | Always blocks |
| **Site Key (Invisible)** | `1x00000000000000000000BB` | Always passes |
| **Site Key (Force)** | `3x00000000000000000000FF` | Forces an interactive challenge |
| **Secret Key** | `1x0000000000000000000000000000000AA` | Always returns `success: true` |
| **Secret Key** | `2x0000000000000000000000000000000AA` | Always returns `success: false` |
| **Secret Key** | `3x0000000000000000000000000000000AA` | Yields `timeout-or-duplicate` error |

> **Note:** Test site keys generate dummy tokens that will fail validation if paired with a production secret key. Always switch both keys together.

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

* **Application URL:** `https://duckdns.org`

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

# React Frontend (in a separate terminal)
cd frontend && npm start

# Telegram Bot
python bot/main.py
```

## API Endpoints

### Authentication
All protected endpoints require a valid JWT token passed in the header: `Authorization: Bearer <token>`.

- `POST /auth/register` - Register a new user account (requires valid Turnstile token)
- `POST /auth/login` - User login (returns JWT access token)

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

```text
nursia/
├── frontend/              # React application
│   ├── public/            # Static files
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── pages/         # Application pages
│   │   ├── services/      # API clients
│   │   ├── App.js         # Main component
│   │   └── index.js       # Entry point
│   └── package.json       # NPM dependencies
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

Create a `.env` file in the project root (or copy `.env.example`):

```env
# Core & Database
DB_URL=sqlite+aiosqlite:///./data/nursia.db
DOMAIN_NAME=localhost

# JWT Authentication
JWT_SECRET_KEY=your_generated_secret_key_here
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

# Telegram Bot
TELEGRAM_TOKEN=your_bot_token_here
ADMIN_IDS=

# Cloudflare Turnstile (use dummy keys for local dev)
TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

#### Generating a JWT Secret Key
Never use a weak or default secret key in production. Generate a cryptographically strong 256-bit key using Python or OpenSSL:

```bash
# Using Python
python -c "import secrets; print(secrets.token_hex(32))"

# Using OpenSSL
openssl rand -hex 32
```

## License

MIT License
