# Nursia - Payment Tracking Service

## Project Purpose
Nursia is a comprehensive household payment tracking service designed for multi-currency financial management. It provides a complete solution for families and individuals to monitor, categorize, and analyze their spending patterns across different currencies.

## Key Features

### Core Functionality
- **Multi-currency Support**: Track payments in UAH, EUR and USD
- **Payment Management**: Full CRUD operations for payment tracking
- **Category System**: Organized payment categorization with admin controls
- **Contributor Management**: Track payments to contributors
- **Detailed Reporting**: Generate filtered reports by period and currency

### User Interfaces
- **REST API**: FastAPI-based backend with comprehensive endpoints
- **React Frontend**: Modern SPA with Material-UI components
- **Telegram Bot**: Mobile-friendly bot interface for quick payment entry
- **Web Interface**: Full-featured web application for desktop use

### Security & Authentication
- **OAuth Authentication**: JWT token-based security system
- **Role-based Access**: Admin and user permission levels
- **Rate Limiting**: Protection against API abuse
- **Secure Registration**: User registration with approval workflow

### Technical Capabilities
- **Database Management**: SQLite with Alembic migrations
- **Containerization**: Docker Compose for easy deployment
- **Testing Suite**: Comprehensive test coverage with pytest
- **Configuration Management**: Environment-based settings

## Target Users

### Primary Users
- **Households**: Families tracking shared payments and budgets
- **Individuals**: Personal finance management across multiple currencies
- **Small Groups**: Shared payment tracking for roommates or partners

### Use Cases
- **Daily Payment Tracking**: Quick entry via Telegram bot or web interface
- **Budget Analysis**: Detailed reports and spending pattern analysis
- **Multi-currency Management**: International families or frequent travelers
- **Payment Categorization**: Organized spending by categories and contributors
- **Financial Reporting**: Period-based analysis and export capabilities

## Value Proposition
Nursia eliminates the complexity of multi-currency payment tracking by providing a unified platform that works across web, mobile (Telegram), and API interfaces. It's designed for users who need more than simple payment tracking - offering detailed categorization, contributor management, and comprehensive reporting in a self-hosted solution.